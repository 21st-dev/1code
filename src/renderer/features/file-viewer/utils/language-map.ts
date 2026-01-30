/**
 * Map file extensions to Monaco Editor language IDs
 * Monaco uses slightly different language IDs than Shiki in some cases
 */

// Extension to Monaco language ID mapping
const extensionToMonacoLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".mts": "typescript",
  ".cts": "typescript",

  // Web
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".vue": "html", // Monaco doesn't have Vue, use HTML
  ".svelte": "html", // Monaco doesn't have Svelte, use HTML

  // Data formats
  ".json": "json",
  ".jsonc": "json",
  ".json5": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "ini", // Monaco uses 'ini' for TOML-like formats
  ".xml": "xml",
  ".svg": "xml",

  // Markdown
  ".md": "markdown",
  ".mdx": "markdown",
  ".markdown": "markdown",

  // Python
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",

  // Ruby
  ".rb": "ruby",
  ".rake": "ruby",
  ".gemspec": "ruby",

  // Go
  ".go": "go",
  ".mod": "go", // go.mod

  // Rust
  ".rs": "rust",

  // Java/Kotlin
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",

  // Swift
  ".swift": "swift",

  // C/C++
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".hh": "cpp",

  // C#
  ".cs": "csharp",

  // PHP
  ".php": "php",
  ".phtml": "php",

  // SQL
  ".sql": "sql",

  // Shell
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ps1": "powershell",
  ".psm1": "powershell",

  // GraphQL
  ".graphql": "graphql",
  ".gql": "graphql",

  // Docker
  ".dockerfile": "dockerfile",

  // Config files
  ".ini": "ini",
  ".conf": "ini",
  ".cfg": "ini",
  ".properties": "ini",

  // Lua
  ".lua": "lua",

  // R
  ".r": "r",
  ".R": "r",

  // Perl
  ".pl": "perl",
  ".pm": "perl",

  // Clojure
  ".clj": "clojure",
  ".cljs": "clojure",
  ".cljc": "clojure",
  ".edn": "clojure",

  // Elixir/Erlang
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",

  // Haskell
  ".hs": "haskell",

  // Scala
  ".scala": "scala",
  ".sc": "scala",

  // F#
  ".fs": "fsharp",
  ".fsx": "fsharp",

  // Objective-C
  ".m": "objective-c",
  ".mm": "objective-c",

  // Dart
  ".dart": "dart",

  // Plain text / config
  ".txt": "plaintext",
  ".log": "plaintext",
  ".gitignore": "plaintext",
  ".gitattributes": "plaintext",
  ".env": "plaintext",
  ".env.local": "plaintext",
  ".env.development": "plaintext",
  ".env.production": "plaintext",
  ".editorconfig": "ini",
  ".prettierrc": "json",
  ".eslintrc": "json",
  ".babelrc": "json",

  // Diff/Patch
  ".diff": "plaintext",
  ".patch": "plaintext",
}

// Special filename mappings (no extension or special names)
const filenameToMonacoLanguage: Record<string, string> = {
  "dockerfile": "dockerfile",
  "Dockerfile": "dockerfile",
  "makefile": "makefile",
  "Makefile": "makefile",
  "GNUmakefile": "makefile",
  "CMakeLists.txt": "cmake",
  "Gemfile": "ruby",
  "Rakefile": "ruby",
  "Vagrantfile": "ruby",
  "Podfile": "ruby",
  ".gitignore": "plaintext",
  ".gitattributes": "plaintext",
  ".dockerignore": "plaintext",
  ".npmignore": "plaintext",
  ".prettierignore": "plaintext",
  ".eslintignore": "plaintext",
  "package.json": "json",
  "tsconfig.json": "json",
  "jsconfig.json": "json",
  ".prettierrc": "json",
  ".eslintrc": "json",
  ".babelrc": "json",
}

/**
 * Get Monaco Editor language ID from file path
 */
export function getMonacoLanguage(filePath: string): string {
  // Get filename from path
  const filename = filePath.split("/").pop() || filePath

  // Check special filenames first
  if (filenameToMonacoLanguage[filename]) {
    return filenameToMonacoLanguage[filename]
  }

  // Check extension
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || ""
  if (extensionToMonacoLanguage[ext]) {
    return extensionToMonacoLanguage[ext]
  }

  return "plaintext"
}

/**
 * Check if a file is a data file (should open in Data Viewer instead)
 */
export function isDataFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0] || ""
  const dataExtensions = [
    ".csv",
    ".tsv",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".parquet",
    ".pq",
    ".xlsx",
    ".xls",
    ".arrow",
    ".feather",
    ".ipc",
  ]
  return dataExtensions.includes(ext)
}

/**
 * File viewer type - determines which viewer component to use
 */
export type FileViewerType = "code" | "image" | "markdown" | "pdf" | "html" | "unsupported"

/**
 * Image file extensions
 */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp"]

/**
 * Binary/unsupported file extensions
 */
const UNSUPPORTED_EXTENSIONS = [".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".zip", ".tar", ".gz", ".7z", ".rar"]

/**
 * Get the appropriate viewer type for a file
 */
export function getFileViewerType(filePath: string): FileViewerType {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0] || ""

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return "image"
  }
  if (UNSUPPORTED_EXTENSIONS.includes(ext)) {
    return "unsupported"
  }
  if ([".md", ".mdx", ".markdown"].includes(ext)) {
    return "markdown"
  }
  if (ext === ".pdf") {
    return "pdf"
  }
  if (ext === ".html" || ext === ".htm") {
    return "html"
  }
  return "code"
}

/**
 * Check if a file is an image
 */
export function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0] || ""
  return IMAGE_EXTENSIONS.includes(ext)
}
