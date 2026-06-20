import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"

function runEvidenceGate(scriptPath: string) {
  return spawnSync("node", [scriptPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
}

describe("OpenSpec proof evidence gates", () => {
  test("Settings IA manual smoke evidence gate stays enforced", () => {
    const result = runEvidenceGate(
      "scripts/check-settings-ia-smoke-evidence.mjs",
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("[settings-ia-smoke] evidence status:")
    expect(result.stdout).toContain("[settings-ia-smoke] task 5.6:")
  })

  test("MCP registry runtime proof evidence gate stays enforced", () => {
    const result = runEvidenceGate(
      "scripts/check-mcp-registry-proof-evidence.mjs",
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("[mcp-registry-proof] evidence status:")
    expect(result.stdout).toContain("claude-agent-sdk-mcp-observability")
    expect(result.stdout).toContain("claude-registry-real-run")
  })
})
