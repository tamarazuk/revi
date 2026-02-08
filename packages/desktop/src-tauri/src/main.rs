// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{session, git};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            session::load_session,
            session::save_review_state,
            session::load_review_state,
            git::get_file_diff,
            git::compute_content_hash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
