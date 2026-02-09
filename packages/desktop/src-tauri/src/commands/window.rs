use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

// Reasonable bounds for window dimensions to prevent corrupted state
const MIN_WIDTH: f64 = 800.0;
const MAX_WIDTH: f64 = 8000.0;
const MIN_HEIGHT: f64 = 600.0;
const MAX_HEIGHT: f64 = 5000.0;
const DEFAULT_WIDTH: f64 = 1400.0;
const DEFAULT_HEIGHT: f64 = 900.0;

/// Clamp dimensions to reasonable bounds, returning defaults if invalid
fn sanitize_dimensions(width: Option<f64>, height: Option<f64>) -> (f64, f64) {
    let w = width
        .filter(|&v| v >= MIN_WIDTH && v <= MAX_WIDTH)
        .unwrap_or(DEFAULT_WIDTH);
    let h = height
        .filter(|&v| v >= MIN_HEIGHT && v <= MAX_HEIGHT)
        .unwrap_or(DEFAULT_HEIGHT);
    (w, h)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub label: String,
    #[serde(rename = "repoPath")]
    pub repo_path: Option<String>,
    #[serde(rename = "baseRef")]
    pub base_ref: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PersistedWindowStates {
    pub windows: Vec<WindowInfo>,
}

pub struct WindowManager {
    pub windows: Mutex<HashMap<String, WindowInfo>>,
    counter: AtomicU32,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            counter: AtomicU32::new(1),
        }
    }

    pub fn set_counter_min(&self, min: u32) {
        self.counter.fetch_max(min, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn create_window(app: AppHandle) -> Result<String, String> {
    let manager = app.state::<WindowManager>();
    let n = manager.counter.fetch_add(1, Ordering::SeqCst);
    let label = format!("revi-{}", n);

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title("Revi")
        .inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    let manager = app.state::<WindowManager>();
    let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
    windows.insert(
        label.clone(),
        WindowInfo {
            label: label.clone(),
            repo_path: None,
            base_ref: None,
            x: None,
            y: None,
            width: Some(DEFAULT_WIDTH),
            height: Some(DEFAULT_HEIGHT),
        },
    );

    Ok(label)
}

#[tauri::command]
pub fn register_window_session(
    app: AppHandle,
    window_label: String,
    repo_path: Option<String>,
    base_ref: Option<String>,
) -> Result<(), String> {
    let manager = app.state::<WindowManager>();
    let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());

    let entry = windows
        .entry(window_label.clone())
        .or_insert_with(|| WindowInfo {
            label: window_label,
            repo_path: None,
            base_ref: None,
            x: None,
            y: None,
            width: None,
            height: None,
        });

    entry.repo_path = repo_path;
    entry.base_ref = base_ref;

    Ok(())
}

#[tauri::command]
pub fn save_window_states(app: AppHandle) -> Result<(), String> {
    persist_states_sync(&app)
}

#[tauri::command]
pub fn load_window_states(app: AppHandle) -> Result<Option<PersistedWindowStates>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let states_path = app_data_dir.join("window-states.json");

    if !states_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&states_path)
        .map_err(|e| format!("Failed to read window states: {}", e))?;

    let states: PersistedWindowStates = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse window states: {}", e))?;

    Ok(Some(states))
}

#[tauri::command]
pub fn get_window_session(
    app: AppHandle,
    window_label: String,
) -> Result<Option<WindowInfo>, String> {
    let manager = app.state::<WindowManager>();
    let windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
    Ok(windows.get(&window_label).cloned())
}

/// Persist current window states to disk. Called from event handlers.
pub fn persist_states_sync(app: &AppHandle) -> Result<(), String> {
    let manager = app.state::<WindowManager>();
    let windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());

    let states = PersistedWindowStates {
        windows: windows.values().cloned().collect(),
    };

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let states_path = app_data_dir.join("window-states.json");
    let content = serde_json::to_string_pretty(&states)
        .map_err(|e| format!("Failed to serialize window states: {}", e))?;

    fs::write(&states_path, content)
        .map_err(|e| format!("Failed to write window states: {}", e))?;

    Ok(())
}

/// Restore windows from persisted state. Called during app setup.
pub fn restore_windows(app: &AppHandle) {
    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };

    let states_path = app_data_dir.join("window-states.json");
    let content = match fs::read_to_string(&states_path) {
        Ok(c) => c,
        Err(_) => {
            // No saved state — register the default "main" window so legacy flow works
            let manager = app.state::<WindowManager>();
            let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
            windows.insert(
                "main".to_string(),
                WindowInfo {
                    label: "main".to_string(),
                    repo_path: None,
                    base_ref: None,
                    x: None,
                    y: None,
                    width: None,
                    height: None,
                },
            );
            return;
        }
    };

    let states: PersistedWindowStates = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return,
    };

    let manager = app.state::<WindowManager>();

    // Parse existing labels to set counter above max
    let mut max_counter: u32 = 0;
    for info in &states.windows {
        if let Some(num_str) = info.label.strip_prefix("revi-") {
            if let Ok(n) = num_str.parse::<u32>() {
                if n > max_counter {
                    max_counter = n;
                }
            }
        }
    }
    manager.set_counter_min(max_counter + 1);

    for info in &states.windows {
        // Sanitize dimensions to prevent corrupted state from breaking rendering
        let (w, h) = sanitize_dimensions(info.width, info.height);

        if info.label == "main" {
            // Main window is already created by tauri.conf.json — just register session info
            // and restore position/size
            if let Some(win) = app.get_webview_window("main") {
                if let (Some(x), Some(y)) = (info.x, info.y) {
                    let _ = win
                        .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                }
                let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
            }

            let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
            windows.insert("main".to_string(), info.clone());
        } else {
            // Create additional windows
            let mut builder = WebviewWindowBuilder::new(app, &info.label, WebviewUrl::default())
                .title("Revi")
                .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
                .inner_size(w, h)
                .resizable(true);

            if let (Some(x), Some(y)) = (info.x, info.y) {
                builder = builder.position(x, y);
            }

            if builder.build().is_ok() {
                let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                windows.insert(info.label.clone(), info.clone());
            }
        }
    }
}
