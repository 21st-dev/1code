import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("Codex CLI runner owner", () => {
  test("owns bundled CLI spawn, ANSI cleanup, and checked error handling", () => {
    const codexRouter = readFileSync(
      "src/main/lib/trpc/routers/codex.ts",
      "utf8",
    )
    const cliRunner = readFileSync("src/main/lib/codex/cli-runner.ts", "utf8")

    expect(codexRouter).toContain("../../codex/cli-runner")
    expect(codexRouter).not.toContain("async function runCodexCli")
    expect(codexRouter).not.toContain("async function runCodexCliChecked")
    expect(cliRunner).toContain("resolveBundledCodexCliPath")
    expect(cliRunner).toContain("spawn(codexCliPath, args")
    expect(cliRunner).toContain("stripCodexAnsi(stdout)")
    expect(cliRunner).toContain("Codex command failed with exit code")
  })
})
