use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::ShellExt;
use serde::Serialize;
use std::fs;
use std::path::Path;

// ---------------------------------------------------------------------------
// Editor command template parsing (task 9a)
// ---------------------------------------------------------------------------

/// Check whether a command string contains template placeholders.
fn has_placeholders(cmd: &str) -> bool {
    cmd.contains("{file}")
        || cmd.contains("{line}")
        || cmd.contains("$FILE")
        || cmd.contains("$LINE")
}

/// Split a command string into tokens, respecting double-quoted segments.
///
/// `"code --reuse-window" -g {file}` → `["code --reuse-window", "-g", "{file}"]`
///
/// Inside double quotes, whitespace is preserved and quotes are stripped.
/// Single quotes are treated as literal characters (not delimiters).
fn shell_split(input: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in input.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                // Don't push the quote character itself
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => {
                current.push(ch);
            }
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/// Substitute placeholders in a single token.
///
/// Handles both `{file}` / `{line}` and `$FILE` / `$LINE` styles.
///
/// When `line` is `None`:
///   - Tokens that consist *only* of a line placeholder (e.g. `+{line}`, `{line}`)
///     are dropped entirely (returns `None`).
///   - Inline line references like `{file}:{line}` have the `:{line}` / `:$LINE`
///     suffix stripped so `code -g path` works without a trailing colon.
fn substitute_token(token: &str, file: &str, line: Option<u32>) -> Option<String> {
    let line_str = line.map(|l| l.to_string()).unwrap_or_default();

    // If the token is *only* a line placeholder (possibly with a prefix like `+`),
    // and no line was provided, drop the entire token.
    if line.is_none() {
        let stripped = token
            .trim_start_matches('+')
            .trim_start_matches('-');
        if stripped == "{line}" || stripped == "$LINE" {
            return None;
        }
    }

    let mut result = token.to_string();

    // Replace file placeholders
    result = result.replace("{file}", file);
    result = result.replace("$FILE", file);

    // Replace line placeholders
    if line.is_some() {
        result = result.replace("{line}", &line_str);
        result = result.replace("$LINE", &line_str);
    } else {
        // Strip `:{line}` / `:$LINE` patterns (e.g. `{file}:{line}` → `path`)
        result = result.replace(":{line}", "");
        result = result.replace(":$LINE", "");
        // Also strip standalone references that survived
        result = result.replace("{line}", "");
        result = result.replace("$LINE", "");
    }

    Some(result)
}

/// Parse an editor command template into `(program, args)`.
///
/// Supports templates like:
///   - `code -g {file}:{line}`
///   - `vim +{line} {file}`
///   - `subl $FILE:$LINE`
///   - `"my editor" --open {file}`
///
/// Returns `Err` if the resulting command is empty.
fn parse_editor_template(
    template: &str,
    file: &str,
    line: Option<u32>,
) -> Result<(String, Vec<String>), String> {
    let tokens = shell_split(template);
    if tokens.is_empty() {
        return Err("Empty editor command".to_string());
    }

    let mut args: Vec<String> = Vec::new();

    for token in &tokens {
        if let Some(substituted) = substitute_token(token, file, line) {
            args.push(substituted);
        }
        // else: token was dropped (line placeholder with no line number)
    }

    if args.is_empty() {
        return Err("Editor command resolved to empty after substitution".to_string());
    }

    let program = args.remove(0);
    Ok((program, args))
}

/// Build `(program, args)` for a plain editor command that does NOT contain
/// template placeholders. Uses editor-name heuristics (VS Code, Vim, etc.).
fn build_heuristic_args(
    editor_cmd: &str,
    file: &str,
    line: Option<u32>,
) -> Result<(String, Vec<String>), String> {
    let parts = shell_split(editor_cmd);
    if parts.is_empty() {
        return Err("Empty editor command".to_string());
    }

    let program = parts[0].clone();
    let mut args: Vec<String> = parts[1..].to_vec();

    let file_arg = if let Some(line_num) = line {
        if program.contains("code") || program.contains("subl") {
            // VS Code / Sublime: file:line with -g flag
            if !args.contains(&"-g".to_string()) {
                args.push("-g".to_string());
            }
            format!("{}:{}", file, line_num)
        } else if program.contains("vim") || program.contains("nvim") || program.contains("vi") {
            args.push(format!("+{}", line_num));
            file.to_string()
        } else if program.contains("emacs") {
            args.push(format!("+{}", line_num));
            file.to_string()
        } else {
            file.to_string()
        }
    } else {
        file.to_string()
    };
    args.push(file_arg);

    Ok((program, args))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct BinaryPreview {
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: usize,
    pub bytes: Vec<u8>,
}

const MAX_PREVIEW_BYTES: usize = 10 * 1024 * 1024;

fn detect_mime_type(file_path: &str) -> Option<&'static str> {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())?;

    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

fn read_file_from_working_tree(repo_root: &str, file_path: &str) -> Result<Vec<u8>, String> {
    let root = Path::new(repo_root)
        .canonicalize()
        .map_err(|e| format!("Failed to resolve repository root: {}", e))?;
    let full_path = root.join(file_path);

    let canon = full_path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve file path: {}", e))?;

    if !canon.starts_with(&root) {
        return Err("Path escapes repository root".to_string());
    }

    fs::read(canon).map_err(|e| format!("Failed to read file: {}", e))
}

fn read_file_from_git_ref(repo_root: &str, git_ref: &str, file_path: &str) -> Result<Vec<u8>, String> {
    let spec = format!("{}:{}", git_ref, file_path);
    let output = std::process::Command::new("git")
        .args(["show", &spec])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to read file from git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("File not available at ref: {}", stderr.trim()));
    }

    Ok(output.stdout)
}

#[tauri::command]
pub async fn get_binary_preview(
    repo_root: String,
    base_sha: String,
    head_sha: String,
    file_path: String,
    file_status: String,
) -> Result<BinaryPreview, String> {
    let mime_type = detect_mime_type(&file_path)
        .ok_or_else(|| "Preview not supported for this file type".to_string())?
        .to_string();

    let bytes = if head_sha == "WORKING_TREE" {
        if file_status == "deleted" {
            read_file_from_git_ref(&repo_root, &base_sha, &file_path)?
        } else {
            read_file_from_working_tree(&repo_root, &file_path)?
        }
    } else if file_status == "deleted" {
        read_file_from_git_ref(&repo_root, &base_sha, &file_path)?
    } else {
        read_file_from_git_ref(&repo_root, &head_sha, &file_path)?
    };

    if bytes.len() > MAX_PREVIEW_BYTES {
        return Err("Preview disabled for files larger than 10 MB".to_string());
    }

    Ok(BinaryPreview {
        mime_type,
        size_bytes: bytes.len(),
        bytes,
    })
}

/// Open a file in the user's editor.
///
/// Resolution order:
///   1. `editor_command` argument (from `.revi/config.json` — passed by frontend)
///   2. `$VISUAL` environment variable
///   3. `$EDITOR` environment variable
///   4. Platform default (`open -t` on macOS, `xdg-open` on Linux, `start` on Windows)
///
/// If the resolved command contains `{file}` / `{line}` / `$FILE` / `$LINE`
/// placeholders, it is parsed as a template. Otherwise, editor-name heuristics
/// are used to add line-number arguments for common editors.
#[tauri::command]
pub async fn open_in_editor(
    app: AppHandle,
    file_path: String,
    line: Option<u32>,
    editor_command: Option<String>,
) -> Result<(), String> {
    // Resolve the editor command string
    let editor = editor_command
        .or_else(|| std::env::var("VISUAL").ok())
        .or_else(|| std::env::var("EDITOR").ok());

    match editor {
        Some(cmd) => {
            let (program, args) = if has_placeholders(&cmd) {
                parse_editor_template(&cmd, &file_path, line)?
            } else {
                build_heuristic_args(&cmd, &file_path, line)?
            };

            app.shell()
                .command(&program)
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to open editor: {}", e))?;
        }
        None => {
            // No editor configured — fall back to platform default
            #[cfg(target_os = "macos")]
            {
                app.shell()
                    .command("open")
                    .args(["-t", &file_path])
                    .spawn()
                    .map_err(|e| format!("Failed to open file: {}", e))?;
            }
            #[cfg(target_os = "windows")]
            {
                app.shell()
                    .command("cmd")
                    .args(["/C", "start", "", &file_path])
                    .spawn()
                    .map_err(|e| format!("Failed to open file: {}", e))?;
            }
            #[cfg(target_os = "linux")]
            {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- shell_split ---------------------------------------------------------

    #[test]
    fn shell_split_simple() {
        assert_eq!(shell_split("code -g file.txt"), vec!["code", "-g", "file.txt"]);
    }

    #[test]
    fn shell_split_quoted() {
        assert_eq!(
            shell_split(r#""my editor" --flag value"#),
            vec!["my editor", "--flag", "value"]
        );
    }

    #[test]
    fn shell_split_empty() {
        assert!(shell_split("").is_empty());
        assert!(shell_split("   ").is_empty());
    }

    #[test]
    fn shell_split_extra_whitespace() {
        assert_eq!(shell_split("  code   -g   file  "), vec!["code", "-g", "file"]);
    }

    #[test]
    fn shell_split_tabs() {
        assert_eq!(shell_split("code\t-g\tfile"), vec!["code", "-g", "file"]);
    }

    // -- has_placeholders ----------------------------------------------------

    #[test]
    fn has_placeholders_true() {
        assert!(has_placeholders("code -g {file}:{line}"));
        assert!(has_placeholders("vim +$LINE $FILE"));
        assert!(has_placeholders("subl {file}"));
    }

    #[test]
    fn has_placeholders_false() {
        assert!(!has_placeholders("code"));
        assert!(!has_placeholders("vim -u NONE"));
    }

    // -- parse_editor_template -----------------------------------------------

    #[test]
    fn template_vscode_with_line() {
        let (prog, args) =
            parse_editor_template("code -g {file}:{line}", "/tmp/a.rs", Some(42)).unwrap();
        assert_eq!(prog, "code");
        assert_eq!(args, vec!["-g", "/tmp/a.rs:42"]);
    }

    #[test]
    fn template_vscode_without_line() {
        let (prog, args) =
            parse_editor_template("code -g {file}:{line}", "/tmp/a.rs", None).unwrap();
        assert_eq!(prog, "code");
        assert_eq!(args, vec!["-g", "/tmp/a.rs"]);
    }

    #[test]
    fn template_vim_with_line() {
        let (prog, args) =
            parse_editor_template("vim +{line} {file}", "/tmp/a.rs", Some(10)).unwrap();
        assert_eq!(prog, "vim");
        assert_eq!(args, vec!["+10", "/tmp/a.rs"]);
    }

    #[test]
    fn template_vim_without_line() {
        // +{line} should be dropped entirely when no line provided
        let (prog, args) =
            parse_editor_template("vim +{line} {file}", "/tmp/a.rs", None).unwrap();
        assert_eq!(prog, "vim");
        assert_eq!(args, vec!["/tmp/a.rs"]);
    }

    #[test]
    fn template_dollar_style() {
        let (prog, args) =
            parse_editor_template("subl $FILE:$LINE", "/tmp/b.py", Some(7)).unwrap();
        assert_eq!(prog, "subl");
        assert_eq!(args, vec!["/tmp/b.py:7"]);
    }

    #[test]
    fn template_dollar_style_no_line() {
        let (prog, args) =
            parse_editor_template("subl $FILE:$LINE", "/tmp/b.py", None).unwrap();
        assert_eq!(prog, "subl");
        assert_eq!(args, vec!["/tmp/b.py"]);
    }

    #[test]
    fn template_quoted_program() {
        let (prog, args) = parse_editor_template(
            r#""my editor" --open {file}"#,
            "/tmp/c.ts",
            None,
        )
        .unwrap();
        assert_eq!(prog, "my editor");
        assert_eq!(args, vec!["--open", "/tmp/c.ts"]);
    }

    #[test]
    fn template_empty_errors() {
        assert!(parse_editor_template("", "/tmp/a.rs", None).is_err());
        assert!(parse_editor_template("   ", "/tmp/a.rs", None).is_err());
    }

    // -- build_heuristic_args ------------------------------------------------

    #[test]
    fn heuristic_code_with_line() {
        let (prog, args) = build_heuristic_args("code", "/tmp/a.rs", Some(5)).unwrap();
        assert_eq!(prog, "code");
        assert_eq!(args, vec!["-g", "/tmp/a.rs:5"]);
    }

    #[test]
    fn heuristic_code_no_line() {
        let (prog, args) = build_heuristic_args("code", "/tmp/a.rs", None).unwrap();
        assert_eq!(prog, "code");
        assert_eq!(args, vec!["/tmp/a.rs"]);
    }

    #[test]
    fn heuristic_vim_with_line() {
        let (prog, args) = build_heuristic_args("nvim", "/tmp/a.rs", Some(20)).unwrap();
        assert_eq!(prog, "nvim");
        assert_eq!(args, vec!["+20", "/tmp/a.rs"]);
    }

    #[test]
    fn heuristic_emacs_with_line() {
        let (prog, args) = build_heuristic_args("emacs", "/tmp/a.rs", Some(3)).unwrap();
        assert_eq!(prog, "emacs");
        assert_eq!(args, vec!["+3", "/tmp/a.rs"]);
    }

    #[test]
    fn heuristic_unknown_editor() {
        let (prog, args) = build_heuristic_args("nano", "/tmp/a.rs", Some(10)).unwrap();
        assert_eq!(prog, "nano");
        // Unknown editor: just gets the file, no line arg
        assert_eq!(args, vec!["/tmp/a.rs"]);
    }

    #[test]
    fn heuristic_with_existing_flags() {
        let (prog, args) =
            build_heuristic_args("code --reuse-window", "/tmp/a.rs", Some(5)).unwrap();
        assert_eq!(prog, "code");
        assert_eq!(args, vec!["--reuse-window", "-g", "/tmp/a.rs:5"]);
    }

    #[test]
    fn heuristic_code_already_has_dash_g() {
        let (prog, args) =
            build_heuristic_args("code -g", "/tmp/a.rs", Some(5)).unwrap();
        assert_eq!(prog, "code");
        // Should not duplicate -g
        assert_eq!(args, vec!["-g", "/tmp/a.rs:5"]);
    }
}
