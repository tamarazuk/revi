use lru::LruCache;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::num::NonZeroUsize;
use std::process::Command;
use std::sync::Mutex;

use super::highlight::{detect_language_from_path, highlight_line, HighlightSpan};

/// LRU cache for computed diffs
/// Key: "{repo_root}:{base_sha}:{head_sha}:{file_path}:{ignore_whitespace}"
/// Capacity: 100 files (typical large PR size)
static DIFF_CACHE: Lazy<Mutex<LruCache<String, FileDiff>>> =
    Lazy::new(|| Mutex::new(LruCache::new(NonZeroUsize::new(100).unwrap())));

/// Generate cache key for a diff request
fn cache_key(
    repo_root: &str,
    base_sha: &str,
    head_sha: &str,
    file_path: &str,
    ignore_whitespace: bool,
) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        repo_root, base_sha, head_sha, file_path, ignore_whitespace
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub hunks: Vec<Hunk>,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hunk {
    pub header: String,
    #[serde(rename = "oldStart")]
    pub old_start: u32,
    #[serde(rename = "oldLines")]
    pub old_lines: u32,
    #[serde(rename = "newStart")]
    pub new_start: u32,
    #[serde(rename = "newLines")]
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: String,
    pub content: String,
    #[serde(rename = "oldLineNum")]
    pub old_line_num: Option<u32>,
    #[serde(rename = "newLineNum")]
    pub new_line_num: Option<u32>,
    pub highlights: Vec<HighlightSpan>,
}

#[tauri::command]
pub fn get_file_diff(
    repo_root: String,
    base_sha: String,
    head_sha: String,
    file_path: String,
    ignore_whitespace: bool,
) -> Result<FileDiff, String> {
    // Don't cache working tree diffs (they change frequently)
    let is_working_tree = head_sha == "WORKING_TREE";

    // Check cache first (only for commit-to-commit diffs)
    let key = cache_key(
        &repo_root,
        &base_sha,
        &head_sha,
        &file_path,
        ignore_whitespace,
    );
    if !is_working_tree {
        let mut cache = DIFF_CACHE.lock().unwrap();
        if let Some(cached) = cache.get(&key) {
            return Ok(cached.clone());
        }
    }

    // Build git diff command based on whether we're comparing to working tree
    let diff_content = if is_working_tree {
        // Compare base commit to working tree
        let mut args = vec!["diff", &base_sha, "--", &file_path];
        if ignore_whitespace {
            args.insert(1, "-w");
        }

        let output = Command::new("git")
            .args(&args)
            .current_dir(&repo_root)
            .output()
            .map_err(|e| format!("Failed to execute git diff: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git diff failed: {}", stderr));
        }

        String::from_utf8_lossy(&output.stdout).into_owned()
    } else {
        // Compare two commits
        let mut args = vec![
            "diff".to_string(),
            format!("{}...{}", base_sha, head_sha),
            "--".to_string(),
            file_path.clone(),
        ];

        if ignore_whitespace {
            args.insert(1, "-w".to_string());
        }

        let output = Command::new("git")
            .args(&args)
            .current_dir(&repo_root)
            .output()
            .map_err(|e| format!("Failed to execute git diff: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git diff failed: {}", stderr));
        }

        String::from_utf8_lossy(&output.stdout).into_owned()
    };

    let content_hash = compute_hash(&diff_content);

    // Detect language for syntax highlighting
    let language = detect_language_from_path(&file_path);

    // Get file content for syntax highlighting context
    let head_content = if is_working_tree {
        // Read current file from working tree
        get_file_from_working_tree(&repo_root, &file_path).ok()
    } else {
        get_file_at_ref(&repo_root, &head_sha, &file_path).ok()
    };

    // Get file content at base for deleted lines
    let base_content = get_file_at_ref(&repo_root, &base_sha, &file_path).ok();

    // Parse the diff output with highlighting
    let (hunks, stats) = parse_diff_with_highlights(
        &diff_content,
        &language,
        head_content.as_deref(),
        base_content.as_deref(),
    );

    let diff = FileDiff {
        path: file_path,
        hunks,
        content_hash,
        stats,
    };

    // Store in cache (only for commit-to-commit diffs)
    if !is_working_tree {
        let mut cache = DIFF_CACHE.lock().unwrap();
        cache.put(key, diff.clone());
    }

    Ok(diff)
}

/// Invalidate cache entries for a specific repository
/// Called when repository changes are detected
#[tauri::command]
pub fn invalidate_diff_cache(repo_root: String) {
    let mut cache = DIFF_CACHE.lock().unwrap();
    // Collect keys to remove (can't modify while iterating)
    let keys_to_remove: Vec<String> = cache
        .iter()
        .filter(|(k, _)| k.starts_with(&repo_root))
        .map(|(k, _)| k.clone())
        .collect();

    for key in keys_to_remove {
        cache.pop(&key);
    }
}

/// Clear entire diff cache
#[tauri::command]
pub fn clear_diff_cache() {
    let mut cache = DIFF_CACHE.lock().unwrap();
    cache.clear();
}

#[tauri::command]
pub fn compute_content_hash(content: String) -> String {
    compute_hash(&content)
}

fn compute_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Get file content at a specific git ref
fn get_file_at_ref(repo_root: &str, ref_name: &str, file_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", ref_name, file_path)])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get file at ref: {}", e))?;

    if !output.status.success() {
        return Err("File not found at ref".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Get file content from the working tree
fn get_file_from_working_tree(repo_root: &str, file_path: &str) -> Result<String, String> {
    let full_path = std::path::Path::new(repo_root).join(file_path);
    std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file from working tree: {}", e))
}

/// Parse diff with syntax highlighting applied to each line
fn parse_diff_with_highlights(
    diff: &str,
    language: &str,
    head_content: Option<&str>,
    base_content: Option<&str>,
) -> (Vec<Hunk>, DiffStats) {
    // Build line lookup tables for efficient highlighting
    let head_lines: Vec<&str> = head_content
        .map(|c| c.lines().collect())
        .unwrap_or_default();
    let base_lines: Vec<&str> = base_content
        .map(|c| c.lines().collect())
        .unwrap_or_default();

    let mut hunks = Vec::new();
    let mut current_hunk: Option<Hunk> = None;
    let mut old_line_num: u32 = 0;
    let mut new_line_num: u32 = 0;
    let mut total_additions: u32 = 0;
    let mut total_deletions: u32 = 0;

    for line in diff.lines() {
        if line.starts_with("@@") {
            // Save previous hunk if exists
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }

            // Parse hunk header: @@ -start,count +start,count @@
            if let Some((old_start, old_lines, new_start, new_lines)) = parse_hunk_header(line) {
                old_line_num = old_start;
                new_line_num = new_start;

                current_hunk = Some(Hunk {
                    header: line.to_string(),
                    old_start,
                    old_lines,
                    new_start,
                    new_lines,
                    lines: Vec::new(),
                });
            }
        } else if let Some(ref mut hunk) = current_hunk {
            let (line_type, content, old_num, new_num, source_line) =
                if line.starts_with('+') && !line.starts_with("+++") {
                    total_additions += 1;
                    let ln = new_line_num;
                    new_line_num += 1;
                    let content = &line[1..];
                    // For added lines, get the actual source line for proper highlighting
                    let source = head_lines
                        .get(ln.saturating_sub(1) as usize)
                        .copied()
                        .unwrap_or(content);
                    (
                        "added".to_string(),
                        content.to_string(),
                        None,
                        Some(ln),
                        source.to_string(),
                    )
                } else if line.starts_with('-') && !line.starts_with("---") {
                    total_deletions += 1;
                    let ln = old_line_num;
                    old_line_num += 1;
                    let content = &line[1..];
                    // For deleted lines, get from base content
                    let source = base_lines
                        .get(ln.saturating_sub(1) as usize)
                        .copied()
                        .unwrap_or(content);
                    (
                        "deleted".to_string(),
                        content.to_string(),
                        Some(ln),
                        None,
                        source.to_string(),
                    )
                } else if line.starts_with(' ') || line.is_empty() {
                    let old_ln = old_line_num;
                    let new_ln = new_line_num;
                    old_line_num += 1;
                    new_line_num += 1;
                    let content = if line.is_empty() { "" } else { &line[1..] };
                    // For context lines, prefer head content
                    let source = head_lines
                        .get(new_ln.saturating_sub(1) as usize)
                        .copied()
                        .unwrap_or(content);
                    (
                        "context".to_string(),
                        content.to_string(),
                        Some(old_ln),
                        Some(new_ln),
                        source.to_string(),
                    )
                } else {
                    continue; // Skip diff metadata lines
                };

            // Apply syntax highlighting to the line
            let highlights = highlight_line(&source_line, language);

            hunk.lines.push(DiffLine {
                line_type,
                content,
                old_line_num: old_num,
                new_line_num: new_num,
                highlights,
            });
        }
    }

    // Don't forget the last hunk
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    (
        hunks,
        DiffStats {
            additions: total_additions,
            deletions: total_deletions,
        },
    )
}

fn parse_hunk_header(line: &str) -> Option<(u32, u32, u32, u32)> {
    // Format: @@ -old_start,old_count +new_start,new_count @@ optional context
    // Simple manual parsing since we don't have regex crate
    let parts: Vec<&str> = line.split(' ').collect();
    if parts.len() < 3 {
        return None;
    }

    let old_part = parts[1].trim_start_matches('-');
    let new_part = parts[2].trim_start_matches('+');

    let (old_start, old_lines) = parse_range(old_part)?;
    let (new_start, new_lines) = parse_range(new_part)?;

    Some((old_start, old_lines, new_start, new_lines))
}

fn parse_range(range: &str) -> Option<(u32, u32)> {
    if let Some((start, count)) = range.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((range.parse().ok()?, 1))
    }
}
