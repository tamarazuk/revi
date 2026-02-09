// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{git, highlight, session};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            session::get_session_arg,
            session::load_session,
            session::save_review_state,
            session::load_review_state,
            session::create_session_from_repo,
            git::get_file_diff,
            git::compute_content_hash,
            git::invalidate_diff_cache,
            git::clear_diff_cache,
            highlight::highlight_code,
            highlight::detect_language,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
