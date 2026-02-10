// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{file_ops, git, highlight, session, watcher, window};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    let app = tauri::Builder::default()
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
            session::recover_state,
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
            window::find_window_by_repo,
            window::focus_window_and_close,
            file_ops::open_in_editor,
            file_ops::copy_to_clipboard,
            file_ops::get_binary_preview,
            watcher::start_watching,
            watcher::stop_watching,
        ])
        .setup(|app| {
            // Build the File menu
            let new_window = MenuItemBuilder::with_id("new_window", "New Window")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("Quit Revi"))?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_window)
                .separator()
                .item(&quit)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle: &tauri::AppHandle, event| {
                if event.id().0.as_str() == "new_window" {
                    let _ = window::create_window(app_handle.clone());
                }
            });

            window::restore_windows(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            let label = window.label().to_string();

            match event {
                WindowEvent::Moved(position) => {
                    let manager = app.state::<window::WindowManager>();
                    let mut windows =
                        manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(info) = windows.get_mut(&label) {
                        info.x = Some(position.x as f64);
                        info.y = Some(position.y as f64);
                    }
                }
                WindowEvent::Resized(size) => {
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
                WindowEvent::CloseRequested { .. } => {
                    let _ = window::persist_states_sync(app);
                }
                WindowEvent::Destroyed => {
                    let manager = app.state::<window::WindowManager>();
                    let mut windows =
                        manager.windows.lock().unwrap_or_else(|e| e.into_inner());
                    windows.remove(&label);
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run app with custom event handling for macOS lifecycle
    app.run(|app_handle, event| {
        match event {
            // On macOS, prevent app from quitting when all windows are closed
            #[cfg(target_os = "macos")]
            RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            // Handle dock icon click on macOS when no windows are open
            RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    let _ = window::create_window(app_handle.clone());
                }
            }
            _ => {}
        }
    });
}
