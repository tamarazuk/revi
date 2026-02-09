use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tree_sitter::Language;
use tree_sitter_highlight::{HighlightConfiguration, HighlightEvent, Highlighter};

/// Highlight span returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightSpan {
    pub start: u32,
    pub end: u32,
    pub scope: String,
}

/// Language info for highlighting
#[derive(Debug, Clone)]
pub struct LanguageInfo {
    pub name: &'static str,
    pub extensions: &'static [&'static str],
}

/// All supported languages with their extensions
const LANGUAGES: &[LanguageInfo] = &[
    LanguageInfo {
        name: "typescript",
        extensions: &["ts", "tsx", "mts", "cts"],
    },
    LanguageInfo {
        name: "javascript",
        extensions: &["js", "jsx", "mjs", "cjs"],
    },
    LanguageInfo {
        name: "rust",
        extensions: &["rs"],
    },
    LanguageInfo {
        name: "python",
        extensions: &["py", "pyi", "pyw"],
    },
    LanguageInfo {
        name: "go",
        extensions: &["go"],
    },
    LanguageInfo {
        name: "json",
        extensions: &["json", "jsonc"],
    },
    LanguageInfo {
        name: "css",
        extensions: &["css"],
    },
    LanguageInfo {
        name: "html",
        extensions: &["html", "htm"],
    },
    LanguageInfo {
        name: "markdown",
        extensions: &["md", "markdown"],
    },
    LanguageInfo {
        name: "toml",
        extensions: &["toml"],
    },
    LanguageInfo {
        name: "yaml",
        extensions: &["yaml", "yml"],
    },
    LanguageInfo {
        name: "bash",
        extensions: &["sh", "bash", "zsh"],
    },
];

/// Standard highlight names that Tree-sitter uses
/// These map to CSS classes like "hl-keyword", "hl-string", etc.
const HIGHLIGHT_NAMES: &[&str] = &[
    "attribute",
    "comment",
    "constant",
    "constant.builtin",
    "constructor",
    "embedded",
    "escape",
    "function",
    "function.builtin",
    "function.macro",
    "keyword",
    "label",
    "namespace",
    "number",
    "operator",
    "property",
    "punctuation",
    "punctuation.bracket",
    "punctuation.delimiter",
    "punctuation.special",
    "string",
    "string.special",
    "tag",
    "type",
    "type.builtin",
    "variable",
    "variable.builtin",
    "variable.parameter",
];

/// Cached highlight configurations per language
/// Since HighlightConfiguration doesn't implement Clone, we store them in a HashMap
/// and return references or create new ones as needed
static CONFIGS: Lazy<Mutex<HashMap<String, HighlightConfiguration>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Detect language from file path extension
#[tauri::command]
pub fn detect_language(file_path: String) -> String {
    detect_language_from_path(&file_path)
}

/// Internal language detection function
pub fn detect_language_from_path(file_path: &str) -> String {
    let path = Path::new(file_path);
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");

    // Special handling for .d.ts files
    if file_path.ends_with(".d.ts") {
        return "typescript".to_string();
    }

    for lang in LANGUAGES {
        if lang.extensions.contains(&extension) {
            return lang.name.to_string();
        }
    }

    // Check filename for special cases
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    match filename.to_lowercase().as_str() {
        "dockerfile" => "bash".to_string(),
        "makefile" => "bash".to_string(),
        ".bashrc" | ".zshrc" | ".bash_profile" => "bash".to_string(),
        _ => "text".to_string(),
    }
}

/// Get language and query info for a language name
fn get_language_info(
    language: &str,
) -> Option<(Language, &'static str, &'static str, &'static str)> {
    match language {
        "typescript" => Some((
            tree_sitter_typescript::LANGUAGE_TSX.into(),
            tree_sitter_typescript::HIGHLIGHTS_QUERY,
            "",
            tree_sitter_typescript::LOCALS_QUERY,
        )),
        "javascript" => Some((
            tree_sitter_javascript::LANGUAGE.into(),
            tree_sitter_javascript::HIGHLIGHT_QUERY,
            tree_sitter_javascript::INJECTIONS_QUERY,
            tree_sitter_javascript::LOCALS_QUERY,
        )),
        "rust" => Some((
            tree_sitter_rust::LANGUAGE.into(),
            tree_sitter_rust::HIGHLIGHTS_QUERY,
            tree_sitter_rust::INJECTIONS_QUERY,
            "",
        )),
        "python" => Some((
            tree_sitter_python::LANGUAGE.into(),
            tree_sitter_python::HIGHLIGHTS_QUERY,
            "",
            "",
        )),
        "go" => Some((
            tree_sitter_go::LANGUAGE.into(),
            tree_sitter_go::HIGHLIGHTS_QUERY,
            "",
            "",
        )),
        "json" => Some((
            tree_sitter_json::LANGUAGE.into(),
            tree_sitter_json::HIGHLIGHTS_QUERY,
            "",
            "",
        )),
        "css" => Some((
            tree_sitter_css::LANGUAGE.into(),
            tree_sitter_css::HIGHLIGHTS_QUERY,
            "",
            "",
        )),
        "html" => Some((
            tree_sitter_html::LANGUAGE.into(),
            tree_sitter_html::HIGHLIGHTS_QUERY,
            tree_sitter_html::INJECTIONS_QUERY,
            "",
        )),
        "markdown" => Some((
            tree_sitter_md::LANGUAGE.into(),
            tree_sitter_md::HIGHLIGHT_QUERY_BLOCK,
            tree_sitter_md::INJECTION_QUERY_BLOCK,
            "",
        )),
        // TOML support disabled due to version incompatibility
        // tree-sitter-toml 0.20 uses older API incompatible with tree-sitter 0.24
        "toml" => None,
        "yaml" => Some((
            tree_sitter_yaml::LANGUAGE.into(),
            tree_sitter_yaml::HIGHLIGHTS_QUERY,
            "",
            "",
        )),
        "bash" => Some((
            tree_sitter_bash::LANGUAGE.into(),
            tree_sitter_bash::HIGHLIGHT_QUERY,
            "",
            "",
        )),
        _ => None,
    }
}

/// Ensure a highlight configuration exists for the given language
fn ensure_config(language: &str) -> bool {
    let mut configs = CONFIGS.lock().unwrap_or_else(|e| e.into_inner());

    if configs.contains_key(language) {
        return true;
    }

    if let Some((lang, highlights, injections, locals)) = get_language_info(language) {
        if let Ok(mut config) =
            HighlightConfiguration::new(lang, language, highlights, injections, locals)
        {
            config.configure(HIGHLIGHT_NAMES);
            configs.insert(language.to_string(), config);
            return true;
        }
    }

    false
}

/// Highlight code and return spans
#[tauri::command]
pub fn highlight_code(content: String, language: String) -> Result<Vec<HighlightSpan>, String> {
    highlight_code_internal(&content, &language)
}

/// Internal highlighting function for reuse
pub fn highlight_code_internal(
    content: &str,
    language: &str,
) -> Result<Vec<HighlightSpan>, String> {
    // Ensure config exists
    if !ensure_config(language) {
        return Ok(Vec::new()); // Return empty for unsupported languages
    }

    let configs = CONFIGS.lock().unwrap_or_else(|e| e.into_inner());
    let config = match configs.get(language) {
        Some(c) => c,
        None => return Ok(Vec::new()),
    };

    let mut highlighter = Highlighter::new();
    let source = content.as_bytes();

    let highlights = highlighter
        .highlight(config, source, None, |_| None)
        .map_err(|e| format!("Highlight error: {:?}", e))?;

    let mut spans: Vec<HighlightSpan> = Vec::new();
    let mut highlight_stack: Vec<usize> = Vec::new();

    for event in highlights {
        match event.map_err(|e| format!("Highlight event error: {:?}", e))? {
            HighlightEvent::Source { start, end } => {
                if let Some(&highlight_idx) = highlight_stack.last() {
                    if highlight_idx < HIGHLIGHT_NAMES.len() {
                        spans.push(HighlightSpan {
                            start: start as u32,
                            end: end as u32,
                            scope: HIGHLIGHT_NAMES[highlight_idx].to_string(),
                        });
                    }
                }
            }
            HighlightEvent::HighlightStart(highlight) => {
                highlight_stack.push(highlight.0);
            }
            HighlightEvent::HighlightEnd => {
                highlight_stack.pop();
            }
        }
    }

    Ok(spans)
}

/// Highlight a single line of code
/// Returns spans with positions relative to the line start
pub fn highlight_line(line: &str, language: &str) -> Vec<HighlightSpan> {
    highlight_code_internal(line, language).unwrap_or_default()
}

/// Pre-compute highlights for an entire file and return a line-indexed lookup
/// Each entry is a Vec of spans with positions relative to that line's start
pub fn highlight_file_lines(content: &str, language: &str) -> Vec<Vec<HighlightSpan>> {
    // Get all spans for the full file
    let all_spans = highlight_code_internal(content, language).unwrap_or_default();

    if all_spans.is_empty() {
        return Vec::new();
    }

    // Build line offset table: line_offsets[i] = byte offset where line i starts
    let mut line_offsets: Vec<u32> = vec![0];
    for (i, ch) in content.char_indices() {
        if ch == '\n' {
            line_offsets.push((i + 1) as u32);
        }
    }

    let num_lines = line_offsets.len();
    let mut result: Vec<Vec<HighlightSpan>> = vec![Vec::new(); num_lines];

    // Distribute spans to their respective lines
    for span in all_spans {
        // Find which line this span starts on using binary search
        let line_idx = match line_offsets.binary_search(&span.start) {
            Ok(idx) => idx,                    // Exact match - span starts at beginning of line
            Err(idx) => idx.saturating_sub(1), // Span starts somewhere in the previous line
        };

        if line_idx >= num_lines {
            continue;
        }

        let line_start = line_offsets[line_idx];

        // Calculate the end of this line (either next line's start - 1, or end of content)
        let line_end = if line_idx + 1 < line_offsets.len() {
            line_offsets[line_idx + 1]
        } else {
            content.len() as u32
        };

        // Clamp span to this line and convert to line-relative offsets
        let span_start_in_line = span.start.saturating_sub(line_start);
        let span_end_in_line = span.end.min(line_end).saturating_sub(line_start);

        // Only add if the span has content on this line
        if span_start_in_line < span_end_in_line {
            result[line_idx].push(HighlightSpan {
                start: span_start_in_line,
                end: span_end_in_line,
                scope: span.scope.clone(),
            });
        }

        // If span crosses to next line(s), we'd need to split it
        // For now, most tokens don't span multiple lines, so this is fine
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_detection() {
        assert_eq!(detect_language_from_path("src/main.ts"), "typescript");
        assert_eq!(detect_language_from_path("src/app.tsx"), "typescript");
        assert_eq!(detect_language_from_path("lib/utils.js"), "javascript");
        assert_eq!(detect_language_from_path("src/main.rs"), "rust");
        assert_eq!(detect_language_from_path("app.py"), "python");
        assert_eq!(detect_language_from_path("main.go"), "go");
        assert_eq!(detect_language_from_path("config.json"), "json");
        assert_eq!(detect_language_from_path("styles.css"), "css");
        assert_eq!(detect_language_from_path("index.html"), "html");
        assert_eq!(detect_language_from_path("README.md"), "markdown");
        assert_eq!(detect_language_from_path("Cargo.toml"), "toml");
        assert_eq!(detect_language_from_path("config.yaml"), "yaml");
        assert_eq!(detect_language_from_path("script.sh"), "bash");
        assert_eq!(detect_language_from_path("types.d.ts"), "typescript");
        assert_eq!(detect_language_from_path("unknown.xyz"), "text");
    }
}
