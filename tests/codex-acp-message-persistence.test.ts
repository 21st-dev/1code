import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Codex ACP message persistence owner", () => {
  test("owns assistant cleanup, usage merge, guarded audit, and persistence ordering", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const persistence = readFileSync(
      "src/main/lib/codex/acp-message-persistence.ts",
      "utf8",
    )

    expect(codexRouter).toContain("persistCodexAcpResponseMessage")
    expect(codexRouter).not.toContain("cleanAssistantMessageForPersistence")
    expect(persistence).toContain("cleanCodexAssistantMessageForPersistence")
    expect(persistence).toContain("normalizeCodexAssistantMessage")
    expect(persistence).toContain("buildGuardedRunAudit")
    expect(persistence).toContain("captureGuardedGitStatus")
    expect(persistence).toContain("persistMessages(messagesForStream)")
    expect(persistence).toContain("messagesForStream.slice(0, -1)")
  })
})
