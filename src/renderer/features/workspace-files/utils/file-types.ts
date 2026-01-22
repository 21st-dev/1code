/**
 * Check if a filename is a code file that should be syntax highlighted
 */
export function isCodeFile(filename: string): boolean {
  const codeExtensions = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".rb",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".php",
    ".swift",
    ".kt",
    ".scala",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".r",
    ".lua",
    ".vim",
    ".dockerfile",
    ".makefile",
  ]
  return codeExtensions.some((ext) => filename.toLowerCase().endsWith(ext))
}

/**
 * Get language identifier for syntax highlighting from file path
 */
export function getLanguageFromPath(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase()
  if (!ext) return "plaintext"

  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    r: "r",
    lua: "lua",
    vim: "vim",
    md: "markdown",
    dockerfile: "dockerfile",
    makefile: "makefile",
  }

  return languageMap[ext] || "plaintext"
}

/**
 * Determine file type for rendering
 */
export function getFileType(filename: string): "markdown" | "code" | "text" {
  if (filename.endsWith(".md")) {
    return "markdown"
  }
  if (isCodeFile(filename)) {
    return "code"
  }
  return "text"
}
