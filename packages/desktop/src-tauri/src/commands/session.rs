use chrono::Utc;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager};

/// Information about the last opened session, persisted to app data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LastSession {
    #[serde(rename = "repoPath")]
    pub repo_path: String,
    #[serde(rename = "baseRef")]
    pub base_ref: Option<String>,
    #[serde(rename = "savedAt")]
    pub saved_at: String,
}

#[tauri::command]
pub fn get_session_arg() -> Option<String> {
    // Get command line args, look for session file path
    // Usage: revi-desktop /path/to/session.json
    // or: revi-desktop --session /path/to/session.json
    let args: Vec<String> = env::args().collect();

    for (i, arg) in args.iter().enumerate() {
        if arg == "--session" {
            return args.get(i + 1).cloned();
        }
        // Check if arg is a .json file path (positional arg)
        if arg.ends_with(".json") && i > 0 {
            return Some(arg.clone());
        }
    }

    None
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewManifest {
    pub version: u32,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "repoRoot")]
    pub repo_root: String,
    pub base: RefInfo,
    pub head: RefInfo,
    pub worktree: Option<WorktreeInfo>,
    pub files: Vec<FileEntry>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "comparisonMode")]
    pub comparison_mode: Option<ComparisonMode>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefInfo {
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    #[serde(rename = "renamedFrom")]
    pub renamed_from: Option<String>,
    pub binary: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PersistedState {
    pub version: u32,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "baseSha")]
    pub base_sha: String,
    #[serde(rename = "headSha")]
    pub head_sha: String,
    pub files: std::collections::HashMap<String, FileState>,
    pub ui: UiState,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileState {
    pub viewed: bool,
    #[serde(rename = "lastViewedSha")]
    pub last_viewed_sha: String,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "diffStats")]
    pub diff_stats: DiffStats,
    #[serde(rename = "collapseState")]
    pub collapse_state: CollapseState,
    #[serde(rename = "scrollPosition")]
    pub scroll_position: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollapseState {
    pub file: bool,
    pub hunks: Vec<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UiState {
    pub mode: String,
    #[serde(rename = "sidebarWidth")]
    pub sidebar_width: u32,
    #[serde(rename = "sidebarVisible")]
    pub sidebar_visible: bool,
}

/// Comparison mode for review sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ComparisonMode {
    /// HEAD vs Working Tree (staged + unstaged + untracked)
    Uncommitted,
    /// merge-base(baseBranch)..HEAD
    Branch {
        #[serde(rename = "baseBranch")]
        base_branch: String,
    },
    /// Custom ref comparison
    Custom {
        #[serde(rename = "baseRef")]
        base_ref: String,
        #[serde(rename = "headRef")]
        head_ref: String,
    },
}

/// Information about a git commit
#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub sha: String,
    #[serde(rename = "shortSha")]
    pub short_sha: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[tauri::command]
pub fn load_session(path: String) -> Result<ReviewManifest, String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read session file: {}", e))?;

    let manifest: ReviewManifest = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session file: {}", e))?;

    Ok(manifest)
}

#[tauri::command]
pub fn save_review_state(repo_root: String, state: PersistedState) -> Result<(), String> {
    let state_dir = Path::new(&repo_root).join(".revi").join("state");
    fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Failed to create state directory: {}", e))?;

    let file_name = format!("{}..{}.json", state.base_sha, state.head_sha);
    let state_path = state_dir.join(file_name);

    let content = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;

    fs::write(&state_path, content).map_err(|e| format!("Failed to write state file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn load_review_state(
    repo_root: String,
    base_sha: String,
    head_sha: String,
) -> Result<Option<PersistedState>, String> {
    let file_name = format!("{}..{}.json", base_sha, head_sha);
    let state_path = Path::new(&repo_root)
        .join(".revi")
        .join("state")
        .join(file_name);

    if !state_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&state_path).map_err(|e| format!("Failed to read state file: {}", e))?;

    let state: PersistedState =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse state file: {}", e))?;

    Ok(Some(state))
}

/// Input for recovery: a file from the new manifest with its stats
#[derive(Debug, Deserialize)]
pub struct FileWithStats {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

/// Result of recovering a single file's review state
#[derive(Debug, Serialize)]
pub struct FileRecoveryResult {
    pub viewed: bool,
    #[serde(rename = "changedSinceViewed")]
    pub changed_since_viewed: bool,
    #[serde(rename = "oldStats")]
    pub old_stats: DiffStats,
    #[serde(rename = "newStats")]
    pub new_stats: DiffStats,
    #[serde(rename = "scrollPosition")]
    pub scroll_position: u32,
    #[serde(rename = "collapseState")]
    pub collapse_state: CollapseState,
}

/// Result of fuzzy state recovery
#[derive(Debug, Serialize)]
pub struct RecoveredState {
    pub files: HashMap<String, FileRecoveryResult>,
    #[serde(rename = "recoveredFrom")]
    pub recovered_from: String,
}

/// Recover review state when exact SHA match fails.
/// Scans .revi/state/ for the most recent state file, then compares
/// diff stats to determine which files' viewed status can be preserved.
#[tauri::command]
pub fn recover_state(
    repo_root: String,
    base_sha: String,
    head_sha: String,
    new_files: Vec<FileWithStats>,
) -> Result<Option<RecoveredState>, String> {
    let state_dir = Path::new(&repo_root).join(".revi").join("state");
    if !state_dir.exists() {
        return Ok(None);
    }

    // Don't recover from the exact match (that's handled by load_review_state)
    let exact_name = format!("{}..{}.json", base_sha, head_sha);

    // Find the most recent state file by modification time
    let mut best_entry: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    let entries =
        fs::read_dir(&state_dir).map_err(|e| format!("Failed to read state dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if path.file_name().and_then(|n| n.to_str()) == Some(&exact_name) {
            continue;
        }
        if let Ok(metadata) = path.metadata() {
            if let Ok(modified) = metadata.modified() {
                if best_entry.is_none() || modified > best_entry.as_ref().unwrap().0 {
                    best_entry = Some((modified, path));
                }
            }
        }
    }

    let state_path = match best_entry {
        Some((_, path)) => path,
        None => return Ok(None),
    };

    let file_name = state_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let content =
        fs::read_to_string(&state_path).map_err(|e| format!("Failed to read state: {}", e))?;
    let old_state: PersistedState =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse state: {}", e))?;

    // Build lookup from new manifest
    let new_files_map: HashMap<&str, &FileWithStats> =
        new_files.iter().map(|f| (f.path.as_str(), f)).collect();

    let mut recovered_files = HashMap::new();

    for (path, old_file) in &old_state.files {
        if let Some(new_file) = new_files_map.get(path.as_str()) {
            // Use diff stats as a heuristic: if additions+deletions match, content likely unchanged
            let stats_match = old_file.diff_stats.additions == new_file.additions
                && old_file.diff_stats.deletions == new_file.deletions;

            recovered_files.insert(
                path.clone(),
                FileRecoveryResult {
                    viewed: if stats_match { old_file.viewed } else { false },
                    changed_since_viewed: old_file.viewed && !stats_match,
                    old_stats: DiffStats {
                        additions: old_file.diff_stats.additions,
                        deletions: old_file.diff_stats.deletions,
                    },
                    new_stats: DiffStats {
                        additions: new_file.additions,
                        deletions: new_file.deletions,
                    },
                    scroll_position: old_file.scroll_position,
                    collapse_state: CollapseState {
                        file: old_file.collapse_state.file,
                        hunks: old_file.collapse_state.hunks.clone(),
                    },
                },
            );
        }
    }

    if recovered_files.is_empty() {
        return Ok(None);
    }

    Ok(Some(RecoveredState {
        files: recovered_files,
        recovered_from: file_name,
    }))
}

/// Create a new review session from a repository path
/// This is used when the app is launched directly and the user picks a folder
#[tauri::command]
pub fn create_session_from_repo(
    repo_path: String,
    base_ref: Option<String>,
    mode: Option<ComparisonMode>,
) -> Result<ReviewManifest, String> {
    // Verify it's a git repository
    let repo_root = get_repo_root(&repo_path)?;

    // Get current branch (for display purposes)
    let current_branch = get_current_branch(&repo_root);

    // If mode is explicitly provided, use it
    if let Some(comparison_mode) = mode {
        return create_session_with_mode(&repo_root, comparison_mode, current_branch);
    }

    // Auto-detect mode: check if there are uncommitted changes
    let has_uncommitted = has_uncommitted_changes(&repo_root)?;

    if has_uncommitted {
        // Show uncommitted changes: HEAD vs working tree
        create_session_with_mode(&repo_root, ComparisonMode::Uncommitted, current_branch)
    } else {
        // No uncommitted changes - fall back to comparing commits (branch mode)
        // Use provided base_ref or auto-detect
        let base_branch = base_ref.unwrap_or_else(|| detect_default_base_branch(&repo_root));
        create_session_with_mode(
            &repo_root,
            ComparisonMode::Branch {
                base_branch: base_branch,
            },
            current_branch,
        )
    }
}

/// Create a session with an explicit comparison mode
fn create_session_with_mode(
    repo_root: &str,
    mode: ComparisonMode,
    current_branch: Option<String>,
) -> Result<ReviewManifest, String> {
    let (base, head, files, comparison_mode) = match &mode {
        ComparisonMode::Uncommitted => {
            let base = get_ref_info(repo_root, "HEAD")?;
            let head = RefInfo {
                ref_name: "Working Tree".to_string(),
                sha: "WORKING_TREE".to_string(),
            };
            let files = get_uncommitted_files(repo_root)?;
            (base, head, files, mode)
        }
        ComparisonMode::Branch { base_branch } => {
            // Get merge-base with the specified branch
            let base = match get_merge_base(repo_root, base_branch) {
                Ok(merge_base_sha) => RefInfo {
                    ref_name: base_branch.clone(),
                    sha: merge_base_sha,
                },
                Err(_) => {
                    // Fallback: try to resolve the branch directly
                    get_ref_info(repo_root, base_branch)?
                }
            };
            let head = get_ref_info(repo_root, "HEAD")?;
            let files = get_changed_files(repo_root, &base.sha, &head.sha)?;
            (base, head, files, mode)
        }
        ComparisonMode::Custom { base_ref, head_ref } => {
            let base = get_ref_info(repo_root, base_ref)?;
            let head = get_ref_info(repo_root, head_ref)?;
            let files = get_changed_files(repo_root, &base.sha, &head.sha)?;
            (base, head, files, mode)
        }
    };

    // Generate session ID
    let session_id = nanoid!(12);

    // Create manifest
    let manifest = ReviewManifest {
        version: 1,
        session_id: session_id.clone(),
        repo_root: repo_root.to_string(),
        base,
        head,
        worktree: current_branch.map(|branch| WorktreeInfo {
            path: repo_root.to_string(),
            branch,
        }),
        files,
        created_at: Utc::now().to_rfc3339(),
        comparison_mode: Some(comparison_mode),
    };

    // Write manifest to .revi/sessions/
    write_manifest(repo_root, &session_id, &manifest)?;

    Ok(manifest)
}

/// Detect the default base branch (main, master, or fallback)
fn detect_default_base_branch(repo_root: &str) -> String {
    for branch in &["main", "master", "origin/main", "origin/master"] {
        if get_merge_base(repo_root, branch).is_ok() {
            return branch.to_string();
        }
    }
    // Fallback
    "HEAD~10".to_string()
}

fn get_repo_root(path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err("Not a git repository".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn get_current_branch(repo_root: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_root)
        .output()
        .ok()?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if branch != "HEAD" {
            return Some(branch);
        }
    }
    None
}

/// Check if there are any uncommitted changes (staged or unstaged)
fn has_uncommitted_changes(repo_root: &str) -> Result<bool, String> {
    // Check for any changes: staged, unstaged, or untracked
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to check git status: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get git status".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // If there's any output, there are uncommitted changes
    Ok(!stdout.trim().is_empty())
}

/// Parse a rename path that may use `{prefix/old => new}/suffix` format or plain `old => new`.
/// Returns `(new_path, Some(old_path))`.
fn parse_rename_path(path: &str) -> (String, Option<String>) {
    // Handle {prefix/old => new}/suffix format
    if let (Some(brace_start), Some(brace_end)) = (path.find('{'), path.find('}')) {
        let prefix = &path[..brace_start];
        let suffix = &path[brace_end + 1..];
        let inner = &path[brace_start + 1..brace_end];
        if let Some((old_part, new_part)) = inner.split_once(" => ") {
            let old_path = format!("{}{}{}", prefix, old_part, suffix);
            let new_path = format!("{}{}{}", prefix, new_part, suffix);
            return (new_path, Some(old_path));
        }
    }
    // Handle plain old => new format
    if let Some((old, new)) = path.split_once(" => ") {
        return (new.to_string(), Some(old.to_string()));
    }
    (path.to_string(), None)
}

/// Build a HashMap of path -> status letter from `git diff --name-status` output.
fn parse_name_status(output: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for line in output.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.is_empty() {
            continue;
        }
        let status_letter = parts[0].chars().next().unwrap_or('M');
        let status = match status_letter {
            'A' => "added",
            'D' => "deleted",
            'M' => "modified",
            'R' => "renamed",
            'C' => "copied",
            _ => "modified",
        };
        // For renames/copies the new path is the last column
        let path = parts.last().unwrap_or(&"");
        map.insert(path.to_string(), status.to_string());
    }
    map
}

fn is_binary_file(path: &Path) -> bool {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return false,
    };

    let mut buffer = [0u8; 8192];
    let read_count = match file.read(&mut buffer) {
        Ok(count) => count,
        Err(_) => return false,
    };

    let sample = &buffer[..read_count];
    sample.contains(&0) || std::str::from_utf8(sample).is_err()
}

/// Get list of uncommitted files (staged + unstaged + untracked)
fn get_uncommitted_files(repo_root: &str) -> Result<Vec<FileEntry>, String> {
    // Get diff stats for tracked files (both staged and unstaged) against HEAD
    let diff_output = Command::new("git")
        .args(["diff", "HEAD", "--numstat", "--find-renames"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    // Get name-status for accurate status detection
    let name_status_output = Command::new("git")
        .args(["diff", "HEAD", "--name-status", "--find-renames"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get name-status: {}", e))?;
    let name_status_map = parse_name_status(&String::from_utf8_lossy(&name_status_output.stdout));

    let mut files = Vec::new();
    let stdout = String::from_utf8_lossy(&diff_output.stdout);

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }

        let additions: u32 = parts[0].parse().unwrap_or(0);
        let deletions: u32 = parts[1].parse().unwrap_or(0);
        let path_part = parts[2];

        // Check for binary files (- - indicates binary)
        let binary = parts[0] == "-" && parts[1] == "-";

        // Check for renames using the shared helper
        let (path, renamed_from) = parse_rename_path(path_part);
        let status = if renamed_from.is_some() {
            "renamed".to_string()
        } else {
            name_status_map
                .get(&path)
                .cloned()
                .unwrap_or_else(|| "modified".to_string())
        };

        files.push(FileEntry {
            path,
            status,
            additions,
            deletions,
            renamed_from,
            binary,
        });
    }

    // Also get untracked files
    let untracked_output = Command::new("git")
        .args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get untracked files: {}", e))?;

    let untracked_stdout = String::from_utf8_lossy(&untracked_output.stdout);
    for line in untracked_stdout.lines() {
        if line.is_empty() {
            continue;
        }

        // Count lines in untracked file for additions count
        let file_path = Path::new(repo_root).join(line);
        let binary = is_binary_file(&file_path);
        let additions = if let Ok(content) = fs::read_to_string(&file_path) {
            content.lines().count() as u32
        } else {
            0
        };

        files.push(FileEntry {
            path: line.to_string(),
            status: "added".to_string(),
            additions,
            deletions: 0,
            renamed_from: None,
            binary,
        });
    }

    Ok(files)
}

fn get_merge_base(repo_root: &str, branch: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["merge-base", "HEAD", branch])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get merge-base: {}", e))?;

    if !output.status.success() {
        return Err("No merge-base found".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn get_ref_info(repo_root: &str, ref_name: &str) -> Result<RefInfo, String> {
    let output = Command::new("git")
        .args(["rev-parse", ref_name])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to resolve ref: {}", e))?;

    if !output.status.success() {
        return Err(format!("Unknown ref: {}", ref_name));
    }

    let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(RefInfo {
        ref_name: ref_name.to_string(),
        sha,
    })
}

fn get_changed_files(
    repo_root: &str,
    base_sha: &str,
    head_sha: &str,
) -> Result<Vec<FileEntry>, String> {
    let diff_range = format!("{}...{}", base_sha, head_sha);

    let output = Command::new("git")
        .args(["diff", "--numstat", "--find-renames", &diff_range])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get changed files".to_string());
    }

    // Get name-status for accurate status detection
    let name_status_output = Command::new("git")
        .args(["diff", "--name-status", "--find-renames", &diff_range])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get name-status: {}", e))?;
    let name_status_map = parse_name_status(&String::from_utf8_lossy(&name_status_output.stdout));

    let mut files = Vec::new();
    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }

        let additions: u32 = parts[0].parse().unwrap_or(0);
        let deletions: u32 = parts[1].parse().unwrap_or(0);
        let path_part = parts[2];

        // Check for binary files (- - indicates binary)
        let binary = parts[0] == "-" && parts[1] == "-";

        // Check for renames using the shared helper
        let (path, renamed_from) = parse_rename_path(path_part);
        let status = if renamed_from.is_some() {
            "renamed".to_string()
        } else {
            name_status_map
                .get(&path)
                .cloned()
                .unwrap_or_else(|| "modified".to_string())
        };

        files.push(FileEntry {
            path,
            status,
            additions,
            deletions,
            renamed_from,
            binary,
        });
    }

    Ok(files)
}

fn write_manifest(
    repo_root: &str,
    session_id: &str,
    manifest: &ReviewManifest,
) -> Result<(), String> {
    let sessions_dir = Path::new(repo_root).join(".revi").join("sessions");
    fs::create_dir_all(&sessions_dir)
        .map_err(|e| format!("Failed to create sessions directory: {}", e))?;

    let manifest_path = sessions_dir.join(format!("{}.json", session_id));
    let content = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;

    fs::write(&manifest_path, content).map_err(|e| format!("Failed to write manifest: {}", e))?;

    // Ensure .revi is in .gitignore
    ensure_gitignore(repo_root);

    Ok(())
}

fn ensure_gitignore(repo_root: &str) {
    let gitignore_path = Path::new(repo_root).join(".gitignore");

    if let Ok(content) = fs::read_to_string(&gitignore_path) {
        if content.contains(".revi") {
            return; // Already ignored
        }
    }

    // Append .revi/ to .gitignore
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore_path)
        .ok();

    if let Some(ref mut f) = file {
        use std::io::Write;
        let _ = writeln!(f, "\n# Revi local review data\n.revi/");
    }
}

/// Save the last opened session to app data directory
#[tauri::command]
pub fn save_last_session(
    app: AppHandle,
    repo_path: String,
    base_ref: Option<String>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let last_session = LastSession {
        repo_path,
        base_ref,
        saved_at: Utc::now().to_rfc3339(),
    };

    let session_path = app_data_dir.join("last-session.json");
    let content = serde_json::to_string_pretty(&last_session)
        .map_err(|e| format!("Failed to serialize last session: {}", e))?;

    fs::write(&session_path, content)
        .map_err(|e| format!("Failed to write last session: {}", e))?;

    Ok(())
}

/// Load the last opened session from app data directory
#[tauri::command]
pub fn load_last_session(app: AppHandle) -> Result<Option<LastSession>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let session_path = app_data_dir.join("last-session.json");

    if !session_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&session_path)
        .map_err(|e| format!("Failed to read last session: {}", e))?;

    let last_session: LastSession = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse last session: {}", e))?;

    // Verify the repo still exists
    let repo_path = Path::new(&last_session.repo_path);
    if !repo_path.exists() {
        // Repo no longer exists, clear the saved session
        let _ = fs::remove_file(&session_path);
        return Ok(None);
    }

    // Verify it's still a git repo
    if get_repo_root(&last_session.repo_path).is_err() {
        let _ = fs::remove_file(&session_path);
        return Ok(None);
    }

    Ok(Some(last_session))
}

/// Clear the last session (used when user wants to pick a different project)
#[tauri::command]
pub fn clear_last_session(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let session_path = app_data_dir.join("last-session.json");

    if session_path.exists() {
        fs::remove_file(&session_path)
            .map_err(|e| format!("Failed to clear last session: {}", e))?;
    }

    Ok(())
}

/// List all local and remote branches in the repository
#[tauri::command]
pub fn list_branches(repo_root: String) -> Result<Vec<String>, String> {
    // Get all local branches
    let local_output = Command::new("git")
        .args(["branch", "--format=%(refname:short)"])
        .current_dir(&repo_root)
        .output()
        .map_err(|e| format!("Failed to list local branches: {}", e))?;

    let mut branches: Vec<String> = Vec::new();

    if local_output.status.success() {
        let stdout = String::from_utf8_lossy(&local_output.stdout);
        for line in stdout.lines() {
            let branch = line.trim();
            if !branch.is_empty() {
                branches.push(branch.to_string());
            }
        }
    }

    // Get remote branches (without remote/ prefix for common ones)
    let remote_output = Command::new("git")
        .args(["branch", "-r", "--format=%(refname:short)"])
        .current_dir(&repo_root)
        .output()
        .map_err(|e| format!("Failed to list remote branches: {}", e))?;

    if remote_output.status.success() {
        let stdout = String::from_utf8_lossy(&remote_output.stdout);
        for line in stdout.lines() {
            let branch = line.trim();
            // Skip HEAD pointer and add remote branches
            if !branch.is_empty() && !branch.ends_with("/HEAD") {
                // Only add if not already present as local branch
                if !branches.contains(&branch.to_string()) {
                    branches.push(branch.to_string());
                }
            }
        }
    }

    // Sort: local branches first (no /), then remote branches, alphabetically within each group
    branches.sort_by(|a, b| {
        let a_is_remote = a.contains('/');
        let b_is_remote = b.contains('/');
        if a_is_remote != b_is_remote {
            // Local branches first
            a_is_remote.cmp(&b_is_remote)
        } else {
            a.cmp(b)
        }
    });

    Ok(branches)
}

/// List recent commits in the repository
#[tauri::command]
pub fn list_recent_commits(repo_root: String, count: u32) -> Result<Vec<CommitInfo>, String> {
    let output = Command::new("git")
        .args([
            "log",
            &format!("-{}", count),
            "--format=%H%n%h%n%s%n%an%n%aI%n---",
        ])
        .current_dir(&repo_root)
        .output()
        .map_err(|e| format!("Failed to list commits: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get commit history".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    // Parse commits - each commit is 5 lines followed by "---"
    let lines: Vec<&str> = stdout.lines().collect();
    let mut i = 0;

    while i + 4 < lines.len() {
        let sha = lines[i].trim().to_string();
        let short_sha = lines[i + 1].trim().to_string();
        let message = lines[i + 2].trim().to_string();
        let author = lines[i + 3].trim().to_string();
        let date = lines[i + 4].trim().to_string();

        commits.push(CommitInfo {
            sha,
            short_sha,
            message,
            author,
            date,
        });

        // Skip to next commit (5 data lines + 1 separator)
        i += 6;
    }

    Ok(commits)
}
