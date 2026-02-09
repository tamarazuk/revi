use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::ShellExt;

/// Open a file in the system's default editor or a specified editor.
/// If no editor is specified, uses the system default (via `open` on macOS).
#[tauri::command]
pub async fn open_in_editor(
    app: AppHandle,
    file_path: String,
    line: Option<u32>,
) -> Result<(), String> {
    // Try to detect the user's preferred editor from common environment variables
    let editor = std::env::var("VISUAL")
        .or_else(|_| std::env::var("EDITOR"))
        .ok();

    match editor {
        Some(editor_cmd) => {
            // Parse editor command and build args
            // Common patterns: "code", "code -g", "vim", "nvim"
            let parts: Vec<&str> = editor_cmd.split_whitespace().collect();
            if parts.is_empty() {
                return Err("Empty editor command".to_string());
            }

            let program = parts[0];
            let mut args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();

            // Handle line number for common editors
            let file_arg = if let Some(line_num) = line {
                // VS Code, Sublime use file:line format with -g flag
                if program.contains("code") || program.contains("subl") {
                    format!("{}:{}", file_path, line_num)
                } else if program.contains("vim") || program.contains("nvim") {
                    // Vim uses +line file
                    args.push(format!("+{}", line_num));
                    file_path.clone()
                } else {
                    // Default: just the file path
                    file_path.clone()
                }
            } else {
                file_path.clone()
            };
            args.push(file_arg);

            app.shell()
                .command(program)
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to open editor: {}", e))?;
        }
        None => {
            // No editor set, use system default via `open` command
            #[cfg(target_os = "macos")]
            {
                // On macOS, use 'open -t' to open in default text editor
                app.shell()
                    .command("open")
                    .args(["-t", &file_path])
                    .spawn()
                    .map_err(|e| format!("Failed to open file: {}", e))?;
            }
            #[cfg(target_os = "windows")]
            {
                // On Windows, use 'start' to open with default app
                app.shell()
                    .command("cmd")
                    .args(["/C", "start", "", &file_path])
                    .spawn()
                    .map_err(|e| format!("Failed to open file: {}", e))?;
            }
            #[cfg(target_os = "linux")]
            {
                // On Linux, use 'xdg-open'
                app.shell()
                    .command("xdg-open")
                    .args([&file_path])
                    .spawn()
                    .map_err(|e| format!("Failed to open file: {}", e))?;
            }
        }
    }

    Ok(())
}

/// Copy text content to the system clipboard.
#[tauri::command]
pub async fn copy_to_clipboard(app: AppHandle, content: String) -> Result<(), String> {
    app.clipboard()
        .write_text(&content)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))
}
