use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub hunks: Vec<Hunk>,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    pub stats: DiffStats,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct HighlightSpan {
    pub start: u32,
    pub end: u32,
    pub scope: String,
}

#[tauri::command]
pub fn get_file_diff(
    repo_root: String,
    base_sha: String,
    head_sha: String,
    file_path: String,
    ignore_whitespace: bool,
) -> Result<FileDiff, String> {
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

    let diff_content = String::from_utf8_lossy(&output.stdout);
    let content_hash = compute_hash(&diff_content);

    // Parse the diff output
    let (hunks, stats) = parse_diff(&diff_content);

    Ok(FileDiff {
        path: file_path,
        hunks,
        content_hash,
        stats,
    })
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

fn parse_diff(diff: &str) -> (Vec<Hunk>, DiffStats) {
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
            let (line_type, content) = if line.starts_with('+') && !line.starts_with("+++") {
                total_additions += 1;
                let ln = new_line_num;
                new_line_num += 1;
                ("added".to_string(), line[1..].to_string(), None, Some(ln))
            } else if line.starts_with('-') && !line.starts_with("---") {
                total_deletions += 1;
                let ln = old_line_num;
                old_line_num += 1;
                ("deleted".to_string(), line[1..].to_string(), Some(ln), None)
            } else if line.starts_with(' ') || line.is_empty() {
                let old_ln = old_line_num;
                let new_ln = new_line_num;
                old_line_num += 1;
                new_line_num += 1;
                let content = if line.is_empty() { "" } else { &line[1..] };
                (
                    "context".to_string(),
                    content.to_string(),
                    Some(old_ln),
                    Some(new_ln),
                )
            } else {
                continue; // Skip diff metadata lines
            };

            let (line_type, content, old_num, new_num) =
                (line_type, content.0, content.1, content.2);

            hunk.lines.push(DiffLine {
                line_type,
                content,
                old_line_num: old_num,
                new_line_num: new_num,
                highlights: Vec::new(), // TODO: Add Tree-sitter highlighting
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
    let re_pattern = r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@";

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
