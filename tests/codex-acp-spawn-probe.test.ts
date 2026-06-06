import { describe, expect, test } from "bun:test"
import {
  previewCodexProcessOutput,
  probeCodexAcpSpawn,
  stripCodexAnsi,
} from "../src/main/lib/codex/acp-spawn-probe"

describe("Codex ACP spawn probe", () => {
  test("strips terminal control sequences and compacts previews", () => {
    expect(stripCodexAnsi("\u001B[31mred\u001B[0m")).toBe("red")
    expect(previewCodexProcessOutput("  \u001B[31mhello\u001B[0m\n\nworld  ")).toBe(
      "hello world",
    )
    expect(previewCodexProcessOutput("x".repeat(300))).toHaveLength(240)
  })

  test("fails closed when ACP path is unavailable", async () => {
    await expect(probeCodexAcpSpawn(null)).resolves.toMatchObject({
      ok: false,
      exitCode: null,
      signal: null,
      error: "Codex ACP runtime path could not be resolved.",
      stdoutPreview: "",
      stderrPreview: "",
    })
  })
})
