use notify::event::{CreateKind, ModifyKind, RemoveKind};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Change event emitted to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeEvent {
    #[serde(rename = "type")]
    pub event_type: String, // "file_changed" | "ref_changed"
    #[serde(rename = "repoRoot")]
    pub repo_root: String, // Which repo this change is for
    pub paths: Option<Vec<String>>,
    #[serde(rename = "newHeadSha")]
    pub new_head_sha: Option<String>,
}

/// Manages file watchers for repositories
pub struct WatcherManager {
    /// Map of repo_root -> watcher instance
    watchers: Mutex<HashMap<String, WatcherState>>,
}

struct WatcherState {
    _watcher: RecommendedWatcher,
}

impl WatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

/// Directory prefixes to completely ignore (and all their contents)
const IGNORED_DIRS: &[&str] = &[
    ".revi",
    ".git", // Ignore .git internals (HEAD and refs/ are allowlisted separately)
    "node_modules",
    ".next",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    ".idea",    // JetBrains IDE
    ".vscode",  // VS Code workspace (not user settings)
    ".turbo",   // Turborepo cache
    ".cache",   // Generic cache
    "coverage", // Test coverage
];

/// File patterns to ignore (checked against filename, not full path)
const IGNORED_FILES: &[&str] = &[
    ".DS_Store", // macOS
    "Thumbs.db", // Windows
];

/// File suffixes to ignore
const IGNORED_SUFFIXES: &[&str] = &[
    ".swp",  // Vim swap
    ".swo",  // Vim swap
    "~",     // Backup files
    ".tmp",  // Temp files
    ".temp", // Temp files
    ".log",  // Log files
    ".lock", // Lock files (package-lock.json changes are usually intentional though)
];

/// File prefixes to ignore
/// NOTE: We don't ignore all dotfiles because tracked files like .gitignore,
/// .eslintrc, etc. are legitimate code changes that should trigger refresh.
const IGNORED_PREFIXES: &[&str] = &[
    "#", // Emacs auto-save
];

/// Git ref paths we selectively allow through the .git/ ignore rule.
/// Changes to these indicate branch switches, commits, rebases, etc.
fn is_git_ref_path(relative_path: &str) -> bool {
    if relative_path == ".git/HEAD" {
        return true;
    }

    relative_path.starts_with(".git/refs/") && !relative_path.ends_with(".lock")
}

/// Read the current HEAD SHA for a repository via `git rev-parse HEAD`
fn read_head_sha(repo_root: &Path) -> Option<String> {
    std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(repo_root)
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
        })
}

/// Check if a path should be ignored
fn should_ignore(path: &Path, repo_root: &Path) -> bool {
    let relative = match path.strip_prefix(repo_root) {
        Ok(p) => p,
        Err(_) => return true, // Outside repo = ignore
    };

    let path_str = relative.to_string_lossy();

    // Allow specific git ref paths through before the IGNORED_DIRS check
    if is_git_ref_path(&path_str) {
        return false;
    }

    // Check if path starts with or contains an ignored directory
    // Must match full directory component, not just prefix (e.g., ".git/" not ".gitignore")
    for ignored_dir in IGNORED_DIRS {
        let dir_with_slash = format!("{}/", ignored_dir);
        if path_str.starts_with(&dir_with_slash)
            || path_str.contains(&format!("/{}", dir_with_slash))
            || path_str == *ignored_dir
        {
            return true;
        }
    }

    // Check filename
    if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
        // Exact filename matches
        for ignored_file in IGNORED_FILES {
            if filename == *ignored_file {
                return true;
            }
        }

        // Prefix matches (hidden files, emacs autosave)
        for prefix in IGNORED_PREFIXES {
            if filename.starts_with(prefix) {
                return true;
            }
        }

        // Suffix matches (swap files, temp files)
        for suffix in IGNORED_SUFFIXES {
            if filename.ends_with(suffix) {
                return true;
            }
        }
    }

    false
}

/// Check if an event kind represents an actual content change
fn is_content_change(kind: &EventKind) -> bool {
    match kind {
        // File/directory created
        EventKind::Create(CreateKind::File) => true,
        EventKind::Create(CreateKind::Any) => true,

        // File content modified (NOT metadata like permissions/timestamps)
        EventKind::Modify(ModifyKind::Data(_)) => true,

        // File renamed
        EventKind::Modify(ModifyKind::Name(_)) => true,

        // On macOS (FSEvents), modifications often come as Modify::Any
        // because the backend can't distinguish data vs metadata changes.
        // We accept these since our path filtering is strict enough.
        EventKind::Modify(ModifyKind::Any) => true,

        // File/directory removed
        EventKind::Remove(RemoveKind::File) => true,
        EventKind::Remove(RemoveKind::Any) => true,

        // Ignore:
        // - Modify::Metadata (permissions, timestamps - when distinguishable)
        // - Access events
        // - Other events
        _ => false,
    }
}

/// Start watching a repository for changes
#[tauri::command]
pub fn start_watching(app_handle: AppHandle, repo_root: String) -> Result<(), String> {
    let manager = app_handle.state::<WatcherManager>();
    let mut watchers = manager.watchers.lock().map_err(|e| e.to_string())?;

    // Already watching this repo
    if watchers.contains_key(&repo_root) {
        return Ok(());
    }

    let repo_path = PathBuf::from(&repo_root);
    let repo_root_clone = repo_root.clone();
    let app_handle_clone = app_handle.clone();

    // Debounce: collect events over this window before emitting
    let debounce_duration = Duration::from_millis(500);
    let last_emit = std::sync::Arc::new(Mutex::new(Instant::now() - debounce_duration));
    let last_head_sha = std::sync::Arc::new(Mutex::new(read_head_sha(&repo_path)));

    // Track if we have pending changes (for coalescing rapid events)
    let pending_change = std::sync::Arc::new(Mutex::new(false));

    let pending_clone = pending_change.clone();
    let last_emit_clone = last_emit.clone();
    let last_head_sha_clone = last_head_sha.clone();
    let repo_path_clone = repo_path.clone();

    let watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                handle_event(
                    event,
                    &repo_path_clone,
                    &app_handle_clone,
                    &last_emit_clone,
                    &last_head_sha_clone,
                    &pending_clone,
                    debounce_duration,
                );
            }
        },
        Config::default().with_poll_interval(Duration::from_secs(2)), // Poll less frequently
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    let mut watcher = watcher;
    watcher
        .watch(Path::new(&repo_root), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    watchers.insert(repo_root_clone, WatcherState { _watcher: watcher });

    Ok(())
}

/// Stop watching a repository
#[tauri::command]
pub fn stop_watching(app_handle: AppHandle, repo_root: String) -> Result<(), String> {
    let manager = app_handle.state::<WatcherManager>();
    let mut watchers = manager.watchers.lock().map_err(|e| e.to_string())?;

    // Remove watcher - it will be dropped and stop watching
    watchers.remove(&repo_root);

    Ok(())
}

/// Handle a file system event
fn handle_event(
    event: Event,
    repo_root: &Path,
    app_handle: &AppHandle,
    last_emit: &std::sync::Arc<Mutex<Instant>>,
    last_head_sha: &std::sync::Arc<Mutex<Option<String>>>,
    pending_change: &std::sync::Arc<Mutex<bool>>,
    debounce_duration: Duration,
) {
    // Only process actual content changes
    if !is_content_change(&event.kind) {
        return;
    }

    // Filter paths - must have at least one relevant path
    let relevant_paths: Vec<PathBuf> = event
        .paths
        .iter()
        .filter(|p| !should_ignore(p, repo_root))
        .cloned()
        .collect();

    if relevant_paths.is_empty() {
        return;
    }

    // Partition into git ref paths vs regular file paths
    let has_ref_change = relevant_paths.iter().any(|p| {
        p.strip_prefix(repo_root)
            .ok()
            .map(|rel| is_git_ref_path(&rel.to_string_lossy()))
            .unwrap_or(false)
    });

    let file_paths: Vec<PathBuf> = relevant_paths
        .iter()
        .filter(|p| {
            p.strip_prefix(repo_root)
                .ok()
                .map(|rel| !is_git_ref_path(&rel.to_string_lossy()))
                .unwrap_or(true)
        })
        .cloned()
        .collect();

    // Mark that we have a pending change
    {
        let mut pending = pending_change.lock().unwrap();
        *pending = true;
    }

    // Check debounce timing
    let now = Instant::now();
    let should_emit = {
        let last = last_emit.lock().unwrap();
        now.duration_since(*last) >= debounce_duration
    };

    if !should_emit {
        return;
    }

    // Check if there's actually a pending change to emit
    let has_pending = {
        let mut pending = pending_change.lock().unwrap();
        let had_pending = *pending;
        *pending = false;
        had_pending
    };

    if !has_pending {
        return;
    }

    // Update last emit time
    {
        let mut last = last_emit.lock().unwrap();
        *last = now;
    }

    // Emit ref_changed if git refs were modified (branch switch, commit, rebase)
    if has_ref_change {
        let new_head_sha = read_head_sha(repo_root);
        let should_emit_ref_change = {
            let mut previous_head_sha = last_head_sha.lock().unwrap();
            let changed = *previous_head_sha != new_head_sha;
            if changed {
                *previous_head_sha = new_head_sha.clone();
            }
            changed
        };

        if should_emit_ref_change {
            let ref_event = ChangeEvent {
                event_type: "ref_changed".to_string(),
                repo_root: repo_root.to_string_lossy().to_string(),
                paths: None,
                new_head_sha,
            };
            let _ = app_handle.emit("repo-changed", ref_event);
        }
    }

    // Emit file_changed if regular files were modified
    if !file_paths.is_empty() {
        let paths: Vec<String> = file_paths
            .iter()
            .filter_map(|p| p.strip_prefix(repo_root).ok())
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        let change_event = ChangeEvent {
            event_type: "file_changed".to_string(),
            repo_root: repo_root.to_string_lossy().to_string(),
            paths: Some(paths),
            new_head_sha: None,
        };
        let _ = app_handle.emit("repo-changed", change_event);
    }
}
