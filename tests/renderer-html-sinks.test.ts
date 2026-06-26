import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const repoRoot = join(__dirname, "..")
const rendererRoot = join(repoRoot, "src/renderer")

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf-8")
}

function walkFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath))
    } else if (/\.(ts|tsx|html)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

describe("renderer HTML insertion sinks", () => {
  test("keeps dangerouslySetInnerHTML limited to reviewed sinks", () => {
    const reviewedSinks = new Set([
      "src/renderer/components/chat-markdown-renderer.tsx",
      "src/renderer/components/mermaid-block.tsx",
      "src/renderer/features/agents/ui/agent-edit-tool.tsx",
      "src/renderer/features/agents/ui/agent-mcp-tool-call.tsx",
      "src/renderer/features/agents/ui/message-json-display.tsx",
    ])

    const actual = walkFiles(rendererRoot)
      .map((file) => relative(repoRoot, file))
      .filter((file) => read(file).includes("dangerouslySetInnerHTML"))
      .sort()

    expect(actual).toEqual([...reviewedSinks].sort())
  })

  test("requires Mermaid SVG sanitization before insertion", () => {
    const source = read("src/renderer/components/mermaid-block.tsx")

    expect(source).toContain("securityLevel: MERMAID_SECURITY_LEVEL")
    expect(source).toContain("const sanitizedSvg = sanitizeMermaidSvg(svg)")
    expect(source).toContain("mermaidCache.set(cacheKey, sanitizedSvg)")
    expect(source).toContain('setRenderState({ status: "success", svg: sanitizedSvg })')
  })

  test("documents remaining Shiki-backed HTML sinks", () => {
    for (const file of [
      "src/renderer/components/chat-markdown-renderer.tsx",
      "src/renderer/features/agents/ui/agent-edit-tool.tsx",
      "src/renderer/features/agents/ui/agent-mcp-tool-call.tsx",
      "src/renderer/features/agents/ui/message-json-display.tsx",
    ]) {
      const source = read(file)
      expect(source).toContain("highlightCode(")
    }

    const highlighter = read("src/renderer/lib/themes/shiki-theme-loader.ts")
    expect(highlighter).toContain("highlighter.codeToHtml(code")
    expect(highlighter).toContain("lang,")
    expect(highlighter).toContain(': "plaintext"')
  })
})
