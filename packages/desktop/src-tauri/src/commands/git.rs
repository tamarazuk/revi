use lru::LruCache;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use similar::{Algorithm, ChangeTag, TextDiff};
use std::num::NonZeroUsize;
use std::process::Command;
use std::sync::Mutex;

use super::highlight::{
    detect_language_from_path, highlight_file_lines, highlight_line, HighlightSpan,
};

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
        let mut cache = DIFF_CACHE.lock().unwrap_or_else(|e| e.into_inner());
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

    // Check if this is a new file (no base content and empty diff but head content exists)
    let (hunks, stats, content_hash) =
        if diff_content.trim().is_empty() && base_content.is_none() && head_content.is_some() {
            // New file: generate synthetic diff showing all lines as additions
            let file_content = head_content.as_deref().unwrap();
            let content_hash = compute_hash(file_content);
            let (hunks, stats) = generate_new_file_diff(file_content, &language);
            (hunks, stats, content_hash)
        } else if diff_content.trim().is_empty() && head_content.is_none() && base_content.is_some()
        {
            // Deleted file: generate synthetic diff showing all lines as deletions
            let file_content = base_content.as_deref().unwrap();
            let content_hash = compute_hash(file_content);
            let (hunks, stats) = generate_deleted_file_diff(file_content, &language);
            (hunks, stats, content_hash)
        } else {
            // Normal diff: parse the git diff output
            let content_hash = compute_hash(&diff_content);
            let (hunks, stats) = parse_diff_with_highlights(
                &diff_content,
                &language,
                head_content.as_deref(),
                base_content.as_deref(),
            );
            (hunks, stats, content_hash)
        };

    let diff = FileDiff {
        path: file_path,
        hunks,
        content_hash,
        stats,
    };

    // Store in cache (only for commit-to-commit diffs)
    if !is_working_tree {
        let mut cache = DIFF_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        cache.put(key, diff.clone());
    }

    Ok(diff)
}

/// Invalidate cache entries for a specific repository
/// Called when repository changes are detected
#[tauri::command]
pub fn invalidate_diff_cache(repo_root: String) {
    let mut cache = DIFF_CACHE.lock().unwrap_or_else(|e| e.into_inner());
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
    let mut cache = DIFF_CACHE.lock().unwrap_or_else(|e| e.into_inner());
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
    let root = std::path::Path::new(repo_root)
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize repo root: {}", e))?;
    let full_path = root
        .join(file_path)
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize file path: {}", e))?;
    if !full_path.starts_with(&root) {
        return Err("Path escapes the repository root".to_string());
    }
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
    // Pre-compute highlights for entire files (gives Tree-sitter full context)
    let head_highlights: Vec<Vec<HighlightSpan>> = head_content
        .map(|c| highlight_file_lines(c, language))
        .unwrap_or_default();
    let base_highlights: Vec<Vec<HighlightSpan>> = base_content
        .map(|c| highlight_file_lines(c, language))
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
            let (line_type, content, old_num, new_num, highlights) =
                if line.starts_with('+') && !line.starts_with("+++") {
                    total_additions += 1;
                    let ln = new_line_num;
                    new_line_num += 1;
                    let content = &line[1..];
                    // Look up pre-computed highlights for this line
                    let hl = head_highlights
                        .get(ln.saturating_sub(1) as usize)
                        .cloned()
                        .unwrap_or_else(|| highlight_line(content, language));
                    ("added".to_string(), content.to_string(), None, Some(ln), hl)
                } else if line.starts_with('-') && !line.starts_with("---") {
                    total_deletions += 1;
                    let ln = old_line_num;
                    old_line_num += 1;
                    let content = &line[1..];
                    // Look up pre-computed highlights from base content
                    let hl = base_highlights
                        .get(ln.saturating_sub(1) as usize)
                        .cloned()
                        .unwrap_or_else(|| highlight_line(content, language));
                    (
                        "deleted".to_string(),
                        content.to_string(),
                        Some(ln),
                        None,
                        hl,
                    )
                } else if line.starts_with(' ') || line.is_empty() {
                    let old_ln = old_line_num;
                    let new_ln = new_line_num;
                    old_line_num += 1;
                    new_line_num += 1;
                    let content = if line.is_empty() { "" } else { &line[1..] };
                    // For context lines, prefer head highlights
                    let hl = head_highlights
                        .get(new_ln.saturating_sub(1) as usize)
                        .cloned()
                        .unwrap_or_else(|| highlight_line(content, language));
                    (
                        "context".to_string(),
                        content.to_string(),
                        Some(old_ln),
                        Some(new_ln),
                        hl,
                    )
                } else {
                    continue; // Skip diff metadata lines
                };

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

    apply_word_level_highlights(&mut hunks);

    (
        hunks,
        DiffStats {
            additions: total_additions,
            deletions: total_deletions,
        },
    )
}

fn apply_word_level_highlights(hunks: &mut [Hunk]) {
    for hunk in hunks.iter_mut() {
        let mut i = 0usize;

        while i < hunk.lines.len() {
            if hunk.lines[i].line_type != "deleted" {
                i += 1;
                continue;
            }

            let deleted_start = i;
            while i < hunk.lines.len() && hunk.lines[i].line_type == "deleted" {
                i += 1;
            }
            let deleted_end = i;

            let added_start = i;
            while i < hunk.lines.len() && hunk.lines[i].line_type == "added" {
                i += 1;
            }
            let added_end = i;

            if added_start == added_end {
                continue;
            }

            let pair_count = (deleted_end - deleted_start).max(added_end - added_start);

            for offset in 0..pair_count {
                let deleted_idx = deleted_start + offset;
                let added_idx = added_start + offset;

                if deleted_idx >= deleted_end || added_idx >= added_end {
                    continue;
                }

                let (left, right) = hunk.lines.split_at_mut(added_idx);
                let deleted_line = &mut left[deleted_idx];
                let added_line = &mut right[0];

                let (deleted_ranges, added_ranges) =
                    compute_word_change_ranges(&deleted_line.content, &added_line.content);

                if !deleted_ranges.is_empty() {
                    deleted_line.highlights = merge_word_highlights(
                        &deleted_line.content,
                        &deleted_line.highlights,
                        &deleted_ranges,
                        "word-deleted",
                    );
                }

                if !added_ranges.is_empty() {
                    added_line.highlights = merge_word_highlights(
                        &added_line.content,
                        &added_line.highlights,
                        &added_ranges,
                        "word-added",
                    );
                }
            }
        }
    }
}

fn compute_word_change_ranges(
    old_line: &str,
    new_line: &str,
) -> (Vec<(usize, usize)>, Vec<(usize, usize)>) {
    let diff = TextDiff::configure()
        .algorithm(Algorithm::Myers)
        .diff_words(old_line, new_line);

    let mut old_ranges = Vec::new();
    let mut new_ranges = Vec::new();
    let mut old_pos = 0usize;
    let mut new_pos = 0usize;

    for change in diff.iter_all_changes() {
        let len = change.value().len();
        match change.tag() {
            ChangeTag::Delete => {
                if len > 0 {
                    old_ranges.push((old_pos, old_pos + len));
                }
                old_pos += len;
            }
            ChangeTag::Insert => {
                if len > 0 {
                    new_ranges.push((new_pos, new_pos + len));
                }
                new_pos += len;
            }
            ChangeTag::Equal => {
                old_pos += len;
                new_pos += len;
            }
        }
    }

    (merge_ranges(old_ranges), merge_ranges(new_ranges))
}

fn merge_ranges(mut ranges: Vec<(usize, usize)>) -> Vec<(usize, usize)> {
    if ranges.is_empty() {
        return ranges;
    }

    ranges.sort_by_key(|(start, _)| *start);
    let mut merged = Vec::new();
    let mut current = ranges[0];

    for (start, end) in ranges.into_iter().skip(1) {
        if start <= current.1 {
            current.1 = current.1.max(end);
        } else {
            merged.push(current);
            current = (start, end);
        }
    }

    merged.push(current);
    merged
}

fn merge_word_highlights(
    content: &str,
    syntax_spans: &[HighlightSpan],
    word_ranges: &[(usize, usize)],
    word_scope: &str,
) -> Vec<HighlightSpan> {
    let len = content.len();
    if len == 0 {
        return Vec::new();
    }

    let mut syntax_by_byte: Vec<Option<&str>> = vec![None; len];
    for span in syntax_spans {
        let start = (span.start as usize).min(len);
        let end = (span.end as usize).min(len);
        if start >= end {
            continue;
        }

        for slot in syntax_by_byte.iter_mut().take(end).skip(start) {
            *slot = Some(span.scope.as_str());
        }
    }

    let mut word_mask = vec![false; len];
    for (start, end) in word_ranges {
        let start = (*start).min(len);
        let end = (*end).min(len);
        if start >= end {
            continue;
        }

        for slot in word_mask.iter_mut().take(end).skip(start) {
            *slot = true;
        }
    }

    let mut merged = Vec::new();
    let mut idx = 0usize;

    while idx < len {
        let scope = if word_mask[idx] {
            Some(word_scope)
        } else {
            syntax_by_byte[idx]
        };

        let Some(scope) = scope else {
            idx += 1;
            continue;
        };

        let start = idx;
        idx += 1;

        while idx < len {
            let next_scope = if word_mask[idx] {
                Some(word_scope)
            } else {
                syntax_by_byte[idx]
            };

            if next_scope != Some(scope) {
                break;
            }

            idx += 1;
        }

        merged.push(HighlightSpan {
            start: start as u32,
            end: idx as u32,
            scope: scope.to_string(),
        });
    }

    merged
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

/// Generate a synthetic diff for a new file (all lines as additions)
fn generate_new_file_diff(content: &str, language: &str) -> (Vec<Hunk>, DiffStats) {
    let lines: Vec<&str> = content.lines().collect();
    let line_count = lines.len() as u32;

    if line_count == 0 {
        return (
            Vec::new(),
            DiffStats {
                additions: 0,
                deletions: 0,
            },
        );
    }

    // Pre-compute highlights for entire file
    let file_highlights = highlight_file_lines(content, language);

    let mut diff_lines = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        let line_num = (i + 1) as u32;
        let highlights = file_highlights
            .get(i)
            .cloned()
            .unwrap_or_else(|| highlight_line(line, language));
        diff_lines.push(DiffLine {
            line_type: "added".to_string(),
            content: line.to_string(),
            old_line_num: None,
            new_line_num: Some(line_num),
            highlights,
        });
    }

    let hunk = Hunk {
        header: format!("@@ -0,0 +1,{} @@ New file", line_count),
        old_start: 0,
        old_lines: 0,
        new_start: 1,
        new_lines: line_count,
        lines: diff_lines,
    };

    (
        vec![hunk],
        DiffStats {
            additions: line_count,
            deletions: 0,
        },
    )
}

/// Generate a synthetic diff for a deleted file (all lines as deletions)
fn generate_deleted_file_diff(content: &str, language: &str) -> (Vec<Hunk>, DiffStats) {
    let lines: Vec<&str> = content.lines().collect();
    let line_count = lines.len() as u32;

    if line_count == 0 {
        return (
            Vec::new(),
            DiffStats {
                additions: 0,
                deletions: 0,
            },
        );
    }

    // Pre-compute highlights for entire file
    let file_highlights = highlight_file_lines(content, language);

    let mut diff_lines = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        let line_num = (i + 1) as u32;
        let highlights = file_highlights
            .get(i)
            .cloned()
            .unwrap_or_else(|| highlight_line(line, language));
        diff_lines.push(DiffLine {
            line_type: "deleted".to_string(),
            content: line.to_string(),
            old_line_num: Some(line_num),
            new_line_num: None,
            highlights,
        });
    }

    let hunk = Hunk {
        header: format!("@@ -1,{} +0,0 @@ Deleted file", line_count),
        old_start: 1,
        old_lines: line_count,
        new_start: 0,
        new_lines: 0,
        lines: diff_lines,
    };

    (
        vec![hunk],
        DiffStats {
            additions: 0,
            deletions: line_count,
        },
    )
}
