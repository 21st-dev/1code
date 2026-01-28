/**
 * Shared parsing utility for detecting and splitting fenced code blocks
 * in user message text. Used by both the paste handler and the editor
 * for inline code block rendering.
 */

export interface TextSegment {
  type: "text"
  content: string
}

export interface CodeBlockSegment {
  type: "code"
  content: string
  language: string
}

export type MessageSegment = TextSegment | CodeBlockSegment

/**
 * Quick check for whether text contains any fenced code blocks.
 * Requires a newline after the opening fence and before the closing fence
 * to avoid false positives on inline triple backticks.
 */
export function hasCodeBlocks(text: string): boolean {
  return /```[^\n]*\n[\s\S]*?\n```/.test(text)
}

/**
 * Parse text into alternating segments of plain text and fenced code blocks.
 *
 * Only matches triple-backtick fenced code blocks:
 *   ```language
 *   code here
 *   ```
 *
 * Unclosed blocks are treated as plain text.
 * The language identifier after ``` is captured (empty string if none).
 */
export function parseCodeBlocks(text: string): MessageSegment[] {
  const segments: MessageSegment[] = []

  // Match: ``` followed by optional language identifier, then newline,
  // then content (non-greedy), then newline followed by closing ```
  // Language identifier allows alphanumeric, hyphens, plus, hash (e.g., c++, c#, objective-c)
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)\n```/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before this code block
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      })
    }

    // Add the code block
    segments.push({
      type: "code",
      language: (match[1] || "").trim(),
      content: match[2],
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after last code block
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex),
    })
  }

  // If no segments were created, return the whole text as a single text segment
  if (segments.length === 0) {
    segments.push({ type: "text", content: text })
  }

  return segments
}

export interface CodeDetectionResult {
  isCode: boolean
  language: string
}

/**
 * Try to identify a specific programming language from text content.
 * Returns a Shiki-compatible language ID or empty string if unknown.
 * These are high-confidence patterns — any match means the text is definitely code.
 */
export function detectLanguage(text: string): string {
  // PHP
  if (/^<\?php/m.test(text)) return "php"
  if (/\$\w+->/.test(text) && /;\s*$/m.test(text)) return "php"
  if (
    /(?:public|private|protected)\s+function\s+\w+\s*\(/.test(text) &&
    /\$\w+/.test(text)
  )
    return "php"

  // TypeScript / JavaScript
  if (/^import\s+(?:.*\s+from\s+['"]|[{*])/m.test(text))
    return /<\w/.test(text) ? "tsx" : "typescript"
  if (/^export\s+(?:default|function|class|const|type|interface|enum)\s/m.test(text))
    return "typescript"

  // Python
  if (/^(?:def|class)\s+\w+[^:]*:\s*$/m.test(text)) return "python"
  if (/^from\s+\S+\s+import\s/m.test(text)) return "python"

  // Java
  if (/^import\s+java\./m.test(text) || /^package\s+[\w.]+;/m.test(text)) return "java"
  if (/^public\s+class\s+\w+/m.test(text) && /;\s*$/m.test(text)) return "java"

  // C#
  if (/^using\s+System/m.test(text) || /^using\s+\w+(\.\w+)+;/m.test(text)) return "csharp"

  // Ruby
  if (/^require\s+['"]/.test(text) || /^require_relative\s+['"]/.test(text)) return "ruby"
  if (/^\s*def\s+\w+/m.test(text) && /^\s*end\s*$/m.test(text)) return "ruby"

  // Swift
  if (/^import\s+(?:Foundation|UIKit|SwiftUI)\b/m.test(text)) return "swift"

  // Kotlin
  if (/^fun\s+\w+\s*\(/m.test(text) && /:\s*\w+/m.test(text)) return "kotlin"
  if (/^data\s+class\s+\w+/m.test(text)) return "kotlin"

  // Go
  if (/^package\s+\w+/m.test(text) && /^func\s/m.test(text)) return "go"

  // Rust
  if (/^(?:pub\s+)?fn\s+\w+/m.test(text) || /^use\s+\w+::/m.test(text)) return "rust"

  // C/C++
  if (/^#include\s+[<"]/m.test(text)) return "cpp"

  // SQL
  if (
    /^\s*(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\s/im.test(
      text,
    )
  )
    return "sql"

  // Shell
  if (/^#!/.test(text)) return "bash"

  // HTML
  if (/^<!DOCTYPE|^<html/im.test(text)) return "html"

  // XML
  if (/^<\?xml\s/m.test(text)) return "xml"

  // JSON
  if (/^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text.trim())) {
    try {
      JSON.parse(text.trim())
      return "json"
    } catch {
      /* not valid JSON */
    }
  }

  // YAML (3+ key: value lines, no code punctuation)
  const yamlLines = text
    .split("\n")
    .filter((l) => l.trim())
    .filter((l) => /^\s*[\w.-]+:\s/.test(l))
  if (yamlLines.length >= 3 && !/[;{}()]/.test(text)) return "yaml"

  // CSS
  if (/^[.#@]\w[^{]*\{/m.test(text) && /:\s*.+;/m.test(text)) return "css"

  // Dockerfile
  if (
    /^FROM\s+\S+/m.test(text) &&
    /^(?:RUN|COPY|CMD|ENTRYPOINT|WORKDIR|ENV|EXPOSE)\s/m.test(text)
  )
    return "dockerfile"

  return ""
}

/**
 * Structural analysis: detect whether text has the shape of code
 * regardless of what language it's written in.
 *
 * Checks indentation patterns, special character density, line-ending
 * punctuation, and absence of prose-like sentence structure.
 */
function hasCodeStructure(text: string, nonEmpty: string[]): boolean {
  let score = 0

  // 1. Consistent indentation — 30%+ of non-empty lines start with 2+ spaces or tab
  const indented = nonEmpty.filter((l) => /^[\t ]{2,}/.test(l))
  if (indented.length >= nonEmpty.length * 0.3) score += 2

  // 2. Code-like line endings — 30%+ end with ; { } ) ,
  const codeEndings = nonEmpty.filter((l) => /[;{},)]\s*$/.test(l.trim()))
  if (codeEndings.length >= nonEmpty.length * 0.3) score += 2

  // 3. Special character density > 5% of total characters
  const specials = (text.match(/[{}[\]();=<>!&|+\-*/%^~]/g) || []).length
  if (specials / text.length > 0.05) score += 2

  // 4. Lacks prose — few lines look like natural-language sentences
  const prose = nonEmpty.filter((l) => /^[A-Z][^;{}()\[\]]*[.!?]\s*$/.test(l.trim()))
  if (prose.length <= nonEmpty.length * 0.15) score += 1

  // 5. Balanced delimiters (roughly equal opens and closes)
  const opens = (text.match(/[({[]/g) || []).length
  const closes = (text.match(/[)}\]]/g) || []).length
  if (
    opens >= 2 &&
    closes >= 2 &&
    Math.abs(opens - closes) <= Math.max(opens, closes) * 0.5
  )
    score += 1

  // Need 5+ (out of 8 possible) to classify as code
  return score >= 5
}

/**
 * Detect whether pasted text is code.
 *
 * Uses a two-pass approach:
 *  1. Language-specific patterns — high confidence, also identifies language
 *  2. Structural analysis — catches any language without explicit patterns
 *
 * For the structural fallback the language is left empty (Shiki uses plaintext).
 */
export function looksLikeCode(text: string): CodeDetectionResult {
  // Skip detection for very short or very large text
  if (text.length > 10_000 || text.length < 10) return { isCode: false, language: "" }

  const lines = text.split("\n")
  if (lines.length < 3) return { isCode: false, language: "" }

  const trimmed = text.trim()
  const nonEmpty = lines.filter((l) => l.trim())
  if (nonEmpty.length < 2) return { isCode: false, language: "" }

  // Pass 1: language-specific patterns (strong signal → definitely code)
  const language = detectLanguage(trimmed)
  if (language) return { isCode: true, language }

  // Pass 2: structural analysis (language-agnostic)
  if (hasCodeStructure(trimmed, nonEmpty)) {
    return { isCode: true, language: "" }
  }

  return { isCode: false, language: "" }
}
