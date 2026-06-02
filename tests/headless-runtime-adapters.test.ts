import { describe, expect, mock, test } from "bun:test"

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath() {
      return process.cwd()
    },
  },
}))

const { __testClaudeCodeHeadless } = await import(
  "../src/main/lib/headless/adapters/claude-code"
)
const { __testCodexHeadless } = await import(
  "../src/main/lib/headless/adapters/codex"
)

const baseRequest = {
  jobId: "job_123",
  runtime: "claude-code" as const,
  cwd: "/tmp/project",
  mode: "agent" as const,
  prompt: "Do the smallest useful thing",
  signal: new AbortController().signal,
}

describe("headless runtime adapters", () => {
  test("Claude adapter uses non-interactive print mode and plan permissions", () => {
    const args = __testClaudeCodeHeadless.buildClaudeArgs({
      ...baseRequest,
      mode: "plan",
    })
    expect(args).toContain("-p")
    expect(args).toContain("--no-session-persistence")
    expect(args).toContain("--permission-mode")
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("plan")
    expect(args.at(-1)).toBe(baseRequest.prompt)
  })

  test("Claude adapter uses acceptEdits for basic agent runs", () => {
    const args = __testClaudeCodeHeadless.buildClaudeArgs(baseRequest)
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("acceptEdits")
  })

  test("Codex adapter maps plan to read-only and agent to workspace-write", () => {
    const planArgs = __testCodexHeadless.buildCodexArgs({
      ...baseRequest,
      runtime: "codex",
      mode: "plan",
    })
    expect(planArgs.slice(0, 2)).toEqual(["exec", "--cd"])
    expect(planArgs[planArgs.indexOf("--sandbox") + 1]).toBe("read-only")
    expect(planArgs).not.toContain("--ask-for-approval")

    const agentArgs = __testCodexHeadless.buildCodexArgs({
      ...baseRequest,
      runtime: "codex",
      mode: "agent",
    })
    expect(agentArgs[agentArgs.indexOf("--sandbox") + 1]).toBe(
      "workspace-write",
    )
  })

  test("Codex adapter drops the non-TTY stdin notice but keeps real stderr", () => {
    expect(
      __testCodexHeadless.filterCodexStderr(
        "Reading additional input from stdin...\nreal warning\n",
      ),
    ).toBe("real warning\n")
    expect(__testCodexHeadless.filterCodexStderr("real warning\n")).toBe(
      "real warning\n",
    )
  })
})
