import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Codex ACP prompt owner", () => {
  test("owns App Agent, long text, and guarded prompt assembly outside the route", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const codexPrompt = readFileSync("src/main/lib/codex/prompt.ts", "utf8")

    expect(codexRouter).toContain("prepareCodexAcpPrompt")
    expect(codexRouter).not.toContain("preparePromptWithAppAgents")
    expect(codexRouter).not.toContain("prependLongTextAttachmentPromptBlocks")
    expect(codexRouter).not.toContain("buildGuardedRunPromptBlock")
    expect(codexPrompt).toContain("preparePromptWithAppAgents(prompt)")
    expect(codexPrompt).toContain("prependLongTextAttachmentPromptBlocks")
    expect(codexPrompt).toContain("buildGuardedRunPromptBlock(guardedContract)")
  })
})
