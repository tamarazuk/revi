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

/// Screen bounds for clamping window dimensions and position
#[derive(Debug, Clone, Copy)]
struct ScreenBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl ScreenBounds {
    /// Get screen bounds from the primary monitor, or return None if unavailable
    fn from_app(app: &AppHandle) -> Option<Self> {
        // Try to get any webview window to query monitor info
        // (monitors are queried via windows in Tauri)
        let window = app.webview_windows().into_values().next()?;
        let monitor = window.primary_monitor().ok()??;
        let size = monitor.size();
        let position = monitor.position();
        let scale = monitor.scale_factor();

        Some(ScreenBounds {
            x: position.x as f64,
            y: position.y as f64,
            width: size.width as f64 / scale,
            height: size.height as f64 / scale,
        })
    }

    /// Clamp dimensions to fit within screen bounds (with some margin for window chrome)
    fn clamp_size(&self, width: f64, height: f64) -> (f64, f64) {
        // Leave some margin for window decorations and dock/taskbar
        let max_w = (self.width - 50.0).max(MIN_WIDTH);
        let max_h = (self.height - 100.0).max(MIN_HEIGHT);

        let w = width.clamp(MIN_WIDTH, max_w);
        let h = height.clamp(MIN_HEIGHT, max_h);
        (w, h)
    }

    /// Clamp position so the window is visible on screen
    /// Returns adjusted (x, y) or None if position should be auto (centered)
    fn clamp_position(&self, x: f64, y: f64, width: f64, height: f64) -> Option<(f64, f64)> {
        // Window is considered off-screen if less than 100px is visible
        let min_visible = 100.0;

        // Check if window would be reasonably visible
        let visible_x = x + width > self.x + min_visible && x < self.x + self.width - min_visible;
        let visible_y = y + height > self.y + min_visible && y < self.y + self.height - min_visible;

        if !visible_x || !visible_y {
            // Window is off-screen, let the system position it
            return None;
        }

        // Clamp to keep window on screen
        let clamped_x = x.clamp(self.x, (self.x + self.width - width).max(self.x));
        let clamped_y = y.clamp(self.y, (self.y + self.height - height).max(self.y));

        Some((clamped_x, clamped_y))
    }
}

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

/// Sanitize dimensions and clamp to screen bounds
fn sanitize_dimensions_for_screen(
    width: Option<f64>,
    height: Option<f64>,
    screen: Option<ScreenBounds>,
) -> (f64, f64) {
    let (w, h) = sanitize_dimensions(width, height);
    match screen {
        Some(bounds) => bounds.clamp_size(w, h),
        None => (w.min(DEFAULT_WIDTH), h.min(DEFAULT_HEIGHT)), // Conservative fallback
    }
}

/// Sanitize position for screen bounds
/// Returns Some((x, y)) if position is valid, None if window should use default positioning
fn sanitize_position_for_screen(
    x: Option<f64>,
    y: Option<f64>,
    width: f64,
    height: f64,
    screen: Option<ScreenBounds>,
) -> Option<(f64, f64)> {
    let (px, py) = (x?, y?);

    match screen {
        Some(bounds) => bounds.clamp_position(px, py, width, height),
        None => None, // No screen info, let system position the window
    }
}

/// Check if a dimension value is within valid bounds (for write-path validation)
pub fn is_valid_dimension(value: f64, min: f64, max: f64) -> bool {
    value >= min && value <= max && value.is_finite()
}

/// Check if width is within valid bounds
pub fn is_valid_width(width: f64) -> bool {
    is_valid_dimension(width, MIN_WIDTH, MAX_WIDTH)
}

/// Check if height is within valid bounds
pub fn is_valid_height(height: f64) -> bool {
    is_valid_dimension(height, MIN_HEIGHT, MAX_HEIGHT)
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

/// Find a window that has the given repo open (excluding the current window)
#[tauri::command]
pub fn find_window_by_repo(
    app: AppHandle,
    repo_path: String,
    exclude_label: Option<String>,
) -> Result<Option<String>, String> {
    let manager = app.state::<WindowManager>();
    let windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());

    for (label, info) in windows.iter() {
        // Skip the excluded window (usually the current one)
        if let Some(ref exclude) = exclude_label {
            if label == exclude {
                continue;
            }
        }

        // Check if this window has the same repo
        if let Some(ref path) = info.repo_path {
            if path == &repo_path {
                return Ok(Some(label.clone()));
            }
        }
    }

    Ok(None)
}

/// Focus a window by label and optionally close another window
#[tauri::command]
pub fn focus_window_and_close(
    app: AppHandle,
    focus_label: String,
    close_label: Option<String>,
) -> Result<(), String> {
    // Focus the target window
    if let Some(window) = app.get_webview_window(&focus_label) {
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
    } else {
        return Err(format!("Window '{}' not found", focus_label));
    }

    // Close the other window if specified
    if let Some(ref label) = close_label {
        if let Some(window) = app.get_webview_window(label) {
            // Remove from manager first
            let manager = app.state::<WindowManager>();
            {
                let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                windows.remove(label);
            }

            // Close the window
            let _ = window.close();

            // Persist updated state
            let _ = persist_states_sync(&app);
        }
    }

    Ok(())
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

    // Get screen bounds once (will be None until first window is available)
    // We'll query again after main window is set up
    let mut screen_bounds: Option<ScreenBounds> = None;

    for info in &states.windows {
        if info.label == "main" {
            // Main window is already created by tauri.conf.json — just register session info
            // and restore position/size
            if let Some(win) = app.get_webview_window("main") {
                // Now we can get screen bounds from the main window
                if screen_bounds.is_none() {
                    screen_bounds = win.primary_monitor().ok().flatten().map(|monitor| {
                        let size = monitor.size();
                        let position = monitor.position();
                        let scale = monitor.scale_factor();
                        ScreenBounds {
                            x: position.x as f64,
                            y: position.y as f64,
                            width: size.width as f64 / scale,
                            height: size.height as f64 / scale,
                        }
                    });
                }

                // Sanitize dimensions with screen awareness
                let (w, h) = sanitize_dimensions_for_screen(info.width, info.height, screen_bounds);

                // Sanitize position - may return None if off-screen
                let position = sanitize_position_for_screen(info.x, info.y, w, h, screen_bounds);

                // Apply size first, then position
                let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));

                if let Some((x, y)) = position {
                    let _ = win
                        .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                } else {
                    // Center the window if position was invalid/off-screen
                    let _ = win.center();
                }
            }

            let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
            windows.insert("main".to_string(), info.clone());
        } else {
            // Get screen bounds if we don't have them yet (from main window)
            if screen_bounds.is_none() {
                screen_bounds = ScreenBounds::from_app(app);
            }

            // Sanitize dimensions with screen awareness
            let (w, h) = sanitize_dimensions_for_screen(info.width, info.height, screen_bounds);

            // Sanitize position
            let position = sanitize_position_for_screen(info.x, info.y, w, h, screen_bounds);

            // Create additional windows
            let mut builder = WebviewWindowBuilder::new(app, &info.label, WebviewUrl::default())
                .title("Revi")
                .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
                .inner_size(w, h)
                .resizable(true);

            if let Some((x, y)) = position {
                builder = builder.position(x, y);
            }
            // If position is None, window will be auto-positioned by the system

            if builder.build().is_ok() {
                let mut windows = manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                windows.insert(info.label.clone(), info.clone());
            }
        }
    }
}

/// Sanitize a single dimension value, returning None if out of bounds
pub fn sanitize_dimension(value: f64, min: f64, max: f64) -> Option<f64> {
    if is_valid_dimension(value, min, max) {
        Some(value)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_dimensions_returns_defaults_for_none() {
        assert_eq!(
            sanitize_dimensions(None, None),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
    }

    #[test]
    fn sanitize_dimensions_accepts_valid_values() {
        assert_eq!(
            sanitize_dimensions(Some(1200.0), Some(800.0)),
            (1200.0, 800.0)
        );
        assert_eq!(
            sanitize_dimensions(Some(MIN_WIDTH), Some(MIN_HEIGHT)),
            (MIN_WIDTH, MIN_HEIGHT)
        );
        assert_eq!(
            sanitize_dimensions(Some(MAX_WIDTH), Some(MAX_HEIGHT)),
            (MAX_WIDTH, MAX_HEIGHT)
        );
    }

    #[test]
    fn sanitize_dimensions_clamps_values_below_minimum() {
        assert_eq!(
            sanitize_dimensions(Some(100.0), Some(100.0)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
        assert_eq!(
            sanitize_dimensions(Some(799.0), Some(599.0)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
    }

    #[test]
    fn sanitize_dimensions_clamps_values_above_maximum() {
        assert_eq!(
            sanitize_dimensions(Some(200000.0), Some(900.0)),
            (DEFAULT_WIDTH, 900.0)
        );
        assert_eq!(
            sanitize_dimensions(Some(1400.0), Some(10000.0)),
            (1400.0, DEFAULT_HEIGHT)
        );
        assert_eq!(
            sanitize_dimensions(Some(9000.0), Some(6000.0)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
    }

    #[test]
    fn sanitize_dimensions_handles_mixed_valid_invalid() {
        // Valid width, invalid height
        assert_eq!(
            sanitize_dimensions(Some(1400.0), Some(100.0)),
            (1400.0, DEFAULT_HEIGHT)
        );
        // Invalid width, valid height
        assert_eq!(
            sanitize_dimensions(Some(100.0), Some(800.0)),
            (DEFAULT_WIDTH, 800.0)
        );
    }

    #[test]
    fn sanitize_dimensions_handles_edge_cases() {
        // Negative values
        assert_eq!(
            sanitize_dimensions(Some(-100.0), Some(-100.0)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
        // Zero
        assert_eq!(
            sanitize_dimensions(Some(0.0), Some(0.0)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
        // NaN and infinity would fail the >= check, so they become defaults
        assert_eq!(
            sanitize_dimensions(Some(f64::NAN), Some(f64::NAN)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
        assert_eq!(
            sanitize_dimensions(Some(f64::INFINITY), Some(f64::INFINITY)),
            (DEFAULT_WIDTH, DEFAULT_HEIGHT)
        );
    }

    #[test]
    fn is_valid_width_checks_bounds() {
        assert!(is_valid_width(1000.0));
        assert!(is_valid_width(MIN_WIDTH));
        assert!(is_valid_width(MAX_WIDTH));
        assert!(!is_valid_width(100.0));
        assert!(!is_valid_width(10000.0));
        assert!(!is_valid_width(f64::NAN));
        assert!(!is_valid_width(f64::INFINITY));
    }

    #[test]
    fn is_valid_height_checks_bounds() {
        assert!(is_valid_height(800.0));
        assert!(is_valid_height(MIN_HEIGHT));
        assert!(is_valid_height(MAX_HEIGHT));
        assert!(!is_valid_height(100.0));
        assert!(!is_valid_height(6000.0));
        assert!(!is_valid_height(f64::NAN));
        assert!(!is_valid_height(f64::INFINITY));
    }

    #[test]
    fn sanitize_dimension_single_value() {
        assert_eq!(
            sanitize_dimension(1000.0, MIN_WIDTH, MAX_WIDTH),
            Some(1000.0)
        );
        assert_eq!(sanitize_dimension(100.0, MIN_WIDTH, MAX_WIDTH), None);
        assert_eq!(sanitize_dimension(10000.0, MIN_WIDTH, MAX_WIDTH), None);
    }
}
