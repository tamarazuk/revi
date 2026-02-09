// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{file_ops, git, highlight, session, watcher, window};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(window::WindowManager::new())
        .manage(watcher::WatcherManager::new())
        .invoke_handler(tauri::generate_handler![
            session::get_session_arg,
            session::load_session,
            session::save_review_state,
            session::load_review_state,
            session::create_session_from_repo,
            session::save_last_session,
            session::load_last_session,
            session::clear_last_session,
            session::list_branches,
            session::list_recent_commits,
            git::get_file_diff,
            git::compute_content_hash,
            git::invalidate_diff_cache,
            git::clear_diff_cache,
            highlight::highlight_code,
            highlight::detect_language,
            window::create_window,
            window::register_window_session,
            window::save_window_states,
            window::load_window_states,
            window::get_window_session,
            file_ops::open_in_editor,
            file_ops::copy_to_clipboard,
            watcher::start_watching,
            watcher::stop_watching,
        ])
        .setup(|app| {
            window::restore_windows(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            let label = window.label().to_string();

            match event {
                tauri::WindowEvent::Moved(position) => {
                    let manager = app.state::<window::WindowManager>();
                    let mut windows =
                        manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(info) = windows.get_mut(&label) {
                        info.x = Some(position.x as f64);
                        info.y = Some(position.y as f64);
                    }
                }
                tauri::WindowEvent::Resized(size) => {
                    let width = size.width as f64;
                    let height = size.height as f64;

                    // Only store valid dimensions to prevent corrupted state
                    if window::is_valid_width(width) && window::is_valid_height(height) {
                        let manager = app.state::<window::WindowManager>();
                        let mut windows =
                            manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                        if let Some(info) = windows.get_mut(&label) {
                            info.width = Some(width);
                            info.height = Some(height);
                        }
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    let _ = window::persist_states_sync(app);
                }
                tauri::WindowEvent::Destroyed => {
                    let manager = app.state::<window::WindowManager>();
                    let mut windows =
                        manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                    windows.remove(&label);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
