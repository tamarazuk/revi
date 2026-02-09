use chrono::Utc;
use nanoid::nanoid;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
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

/// Create a new review session from a repository path
/// This is used when the app is launched directly and the user picks a folder
#[tauri::command]
pub fn create_session_from_repo(
    repo_path: String,
    base_ref: Option<String>,
) -> Result<ReviewManifest, String> {
    // Verify it's a git repository
    let repo_root = get_repo_root(&repo_path)?;

    // Get current branch (for display purposes)
    let current_branch = get_current_branch(&repo_root);

    // First, check if there are uncommitted changes
    let has_uncommitted = has_uncommitted_changes(&repo_root)?;

    if has_uncommitted {
        // Show uncommitted changes: HEAD vs working tree
        let base = get_ref_info(&repo_root, "HEAD")?;

        // Use a special marker for working tree
        let head = RefInfo {
            ref_name: "Working Tree".to_string(),
            sha: "WORKING_TREE".to_string(),
        };

        // Get uncommitted file changes
        let files = get_uncommitted_files(&repo_root)?;

        // Generate session ID
        let session_id = nanoid!(12);

        // Create manifest
        let manifest = ReviewManifest {
            version: 1,
            session_id: session_id.clone(),
            repo_root: repo_root.clone(),
            base,
            head,
            worktree: None,
            files,
            created_at: Utc::now().to_rfc3339(),
        };

        // Write manifest to .revi/sessions/
        write_manifest(&repo_root, &session_id, &manifest)?;

        return Ok(manifest);
    }

    // No uncommitted changes - fall back to comparing commits
    // Resolve base ref (use provided, or find merge-base with main/master)
    let base = resolve_base_ref(&repo_root, base_ref)?;

    // Get HEAD info
    let head = get_ref_info(&repo_root, "HEAD")?;

    // Get changed files between commits
    let files = get_changed_files(&repo_root, &base.sha, &head.sha)?;

    // Generate session ID
    let session_id = nanoid!(12);

    // Create manifest
    let manifest = ReviewManifest {
        version: 1,
        session_id: session_id.clone(),
        repo_root: repo_root.clone(),
        base,
        head,
        worktree: current_branch.map(|branch| WorktreeInfo {
            path: repo_root.clone(),
            branch,
        }),
        files,
        created_at: Utc::now().to_rfc3339(),
    };

    // Write manifest to .revi/sessions/
    write_manifest(&repo_root, &session_id, &manifest)?;

    Ok(manifest)
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

/// Get list of uncommitted files (staged + unstaged + untracked)
fn get_uncommitted_files(repo_root: &str) -> Result<Vec<FileEntry>, String> {
    // Get diff stats for tracked files (both staged and unstaged) against HEAD
    let diff_output = Command::new("git")
        .args(["diff", "HEAD", "--numstat", "--find-renames"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

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

        // Check for renames
        let (path, renamed_from, status) = if path_part.contains(" => ") {
            let rename_parts: Vec<&str> = path_part.split(" => ").collect();
            (
                rename_parts[1].to_string(),
                Some(rename_parts[0].to_string()),
                "renamed".to_string(),
            )
        } else {
            let status = if additions > 0 && deletions == 0 {
                "added"
            } else if additions == 0 && deletions > 0 {
                "deleted"
            } else {
                "modified"
            };
            (path_part.to_string(), None, status.to_string())
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
            binary: false,
        });
    }

    Ok(files)
}

fn resolve_base_ref(repo_root: &str, base_ref: Option<String>) -> Result<RefInfo, String> {
    // If base_ref is provided, use it
    if let Some(ref_name) = base_ref {
        return get_ref_info(repo_root, &ref_name);
    }

    // Try to find merge-base with main or master
    for default_branch in &["main", "master", "origin/main", "origin/master"] {
        if let Ok(merge_base) = get_merge_base(repo_root, default_branch) {
            return Ok(RefInfo {
                ref_name: merge_base.clone(),
                sha: merge_base,
            });
        }
    }

    // Fallback: use HEAD~10 or first commit if not enough history
    let output = Command::new("git")
        .args(["rev-list", "--count", "HEAD"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to count commits: {}", e))?;

    let count: u32 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .unwrap_or(1);

    let base_ref = if count > 10 { "HEAD~10" } else { "HEAD~1" };
    get_ref_info(repo_root, base_ref)
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
    let output = Command::new("git")
        .args([
            "diff",
            "--numstat",
            "--find-renames",
            &format!("{}...{}", base_sha, head_sha),
        ])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get changed files".to_string());
    }

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

        // Check for renames (path contains " => " or uses {old => new} format)
        let (path, renamed_from, status) = if path_part.contains(" => ") {
            let rename_parts: Vec<&str> = path_part.split(" => ").collect();
            (
                rename_parts[1].to_string(),
                Some(rename_parts[0].to_string()),
                "renamed".to_string(),
            )
        } else {
            // Determine status based on file existence
            let status = if additions > 0 && deletions == 0 {
                "added"
            } else if additions == 0 && deletions > 0 {
                "deleted"
            } else {
                "modified"
            };
            (path_part.to_string(), None, status.to_string())
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
