import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

function runEvidenceGate(scriptPath: string) {
  return spawnSync("node", [scriptPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
}

function read(path: string): string {
  return readFileSync(path, "utf8")
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

  test("Settings IA gate keeps runbook and task-state safeguards", () => {
    const source = read("scripts/check-settings-ia-smoke-evidence.mjs")

    expect(source).toContain('join(changeDir, "manual-smoke-runbook.md")')
    expect(source).toContain("requiredRunbookMarkers")
    expect(source).toContain(
      "Do not check task 5.6 from source inspection alone.",
    )
    expect(source).toContain("task56Checked && notPassed.length > 0")
    expect(source).toContain("!task56Checked && notPassed.length === 0")
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

  test("MCP registry gate keeps runbook, secret, and task-state safeguards", () => {
    const source = read("scripts/check-mcp-registry-proof-evidence.mjs")

    expect(source).toContain('join(changeDir, "runtime-proof-runbook.md")')
    expect(source).toContain("requiredRunbookMarkers")
    expect(source).toContain("assertNoSecretLikeValues(evidencePath, evidence)")
    expect(source).toContain("assertNoSecretLikeValues(runbookPath, runbook)")
    expect(source).toContain("taskIsChecked(tasks, taskId)")
    expect(source).toContain('checked && status !== "passed"')
    expect(source).toContain('!checked && status === "passed"')
  })
})
