use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

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
