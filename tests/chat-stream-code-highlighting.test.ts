import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(__dirname, "..")

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf-8")
}

describe("chat stream code highlighting", () => {
  test("defers Shiki while a code block is still streaming", () => {
    const source = read("src/renderer/components/chat-markdown-renderer.tsx")
    const codeBlockSection = source.slice(
      source.indexOf("function CodeBlock"),
      source.indexOf("type MarkdownSize"),
    )

    expect(codeBlockSection).toContain("isStreaming = false")
    expect(codeBlockSection).toContain("if (!shouldHighlight || isStreaming)")
    expect(codeBlockSection).toContain("setHighlightedHtml(null)")
    expect(codeBlockSection).toContain(
      "highlightCode(children, language, themeId)",
    )
    expect(
      codeBlockSection.indexOf("if (!shouldHighlight || isStreaming)"),
    ).toBeLessThan(codeBlockSection.indexOf("const highlight = async"))
    expect(codeBlockSection).toContain(
      "[children, language, themeId, shouldHighlight, isStreaming]",
    )
  })

  test("propagates streaming state to only the active memoized markdown block", () => {
    const markdown = read("src/renderer/components/chat-markdown-renderer.tsx")
    const memoizedTextPart = read(
      "src/renderer/features/agents/main/memoized-text-part.tsx",
    )
    const isolatedTextPart = read(
      "src/renderer/features/agents/main/isolated-text-part.tsx",
    )

    expect(
      markdown.match(
        /createCodeComponent\(codeTheme, size, styles, isStreaming\)/g,
      )?.length,
    ).toBeGreaterThanOrEqual(2)
    expect(markdown).toContain(
      "isStreaming={isStreaming && index === blocks.length - 1}",
    )
    expect(memoizedTextPart).toContain("isStreaming={isStreaming}")
    expect(isolatedTextPart).toContain("isStreaming={isTextStreaming}")
  })
})
