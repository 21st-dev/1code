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
const { buildClaudeEnv, clearClaudeEnvCache } = await import(
  "../src/main/lib/claude/env"
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

  test("Claude env strips inherited Anthropic auth unless explicit provider env is supplied", () => {
    const previous = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    }
    try {
      process.env.ANTHROPIC_API_KEY = "stale-api-key"
      process.env.ANTHROPIC_AUTH_TOKEN = "stale-auth-token"
      process.env.ANTHROPIC_BASE_URL = "https://stale.example.com?token=secret"
      clearClaudeEnvCache()

      const inherited = buildClaudeEnv()
      expect(inherited.ANTHROPIC_API_KEY).toBeUndefined()
      expect(inherited.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
      expect(inherited.ANTHROPIC_BASE_URL).toBeUndefined()

      const explicit = buildClaudeEnv({
        customEnv: {
          ANTHROPIC_AUTH_TOKEN: "provider-token",
          ANTHROPIC_BASE_URL: "https://provider.example.com",
        },
      })
      expect(explicit.ANTHROPIC_AUTH_TOKEN).toBe("provider-token")
      expect(explicit.ANTHROPIC_BASE_URL).toBe("https://provider.example.com")
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
      clearClaudeEnvCache()
    }
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

  test("Codex adapter only forwards non-secret environment variables", () => {
    const env = __testCodexHeadless.buildCodexEnv(
      { ...baseRequest, runtime: "codex" },
      {
        PATH: "/usr/bin",
        SAFE_FLAG: "1",
        OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz123456",
        CODEX_API_KEY: "codex-secret",
        GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz123456",
      },
      {
        SHELL_SAFE: "ok",
        ANTHROPIC_AUTH_TOKEN: "anthropic-secret",
      },
    )

    expect(env.PATH).toBe("/usr/bin")
    expect(env.SAFE_FLAG).toBe("1")
    expect(env.SHELL_SAFE).toBe("ok")
    expect(env.LOCUS_HEADLESS_JOB_ID).toBe("job_123")
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CODEX_API_KEY).toBeUndefined()
    expect(env.GITHUB_TOKEN).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
  })
})
