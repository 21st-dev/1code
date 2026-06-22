import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Codex app-server prompt owner", () => {
  test("owns long text prompt assembly outside the route", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const codexAppServerAdapter = readFileSync(
      "src/main/lib/codex/app-server-adapter.ts",
      "utf8",
    )
    const codexAppServerAttachments = readFileSync(
      "src/main/lib/codex/app-server-attachments.ts",
      "utf8",
    )

    expect(codexAppServerAdapter).toContain(
      "prepareCodexAppServerPromptWithLongText",
    )
    expect(codexRouter).not.toContain("prepareCodexAppServerPromptWithLongText")
    expect(codexRouter).not.toContain("preparePromptWithAppAgents")
    expect(codexRouter).not.toContain("prependLongTextAttachmentPromptBlocks")
    expect(codexRouter).not.toContain("buildGuardedRunPromptBlock")
    expect(codexAppServerAttachments).toContain(
      "prependLongTextAttachmentPromptBlocks",
    )
  })
})
