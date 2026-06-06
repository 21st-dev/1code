import { describe, expect, test } from "bun:test"
import {
  getClaudePermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import {
  createClaudeAgentSdkQueryOptions,
  createClaudeAgentSdkStderrHandler,
} from "../src/main/lib/claude/agent-sdk-query-options"
import { createClaudeDesktopRunRequest } from "../src/main/lib/claude/desktop-run-request"

function createRequest(options: {
  signal: AbortSignal
  resumeSessionId?: string | null
}) {
  const permissionPolicy = resolveDesktopPermissionPolicy({
    runtimeId: "claude-code",
    mode: "agent",
  })

  return createClaudeDesktopRunRequest({
    runId: "run-1",
    streamId: "stream-1",
    jobId: "job-1",
    mode: "agent",
    preflight: {
      cwd: "/repo",
      chat: { id: "chat-1", projectId: "project-1" },
      subChat: { id: "sub-1", chatId: "chat-1" },
      project: { id: "project-1", path: "/repo" },
    } as any,
    prompt: "hello",
    permissionPolicy,
    providerBinding: {
      model: "claude-sonnet-4",
      modelSource: "request",
      providerProfileId: null,
      gatewayEndpoint: null,
      authMode: "runtime-managed",
    },
    signal: options.signal,
    resumeSessionId: options.resumeSessionId,
    parentSessionId: null,
    emitTrace: () => {},
  })
}

describe("Claude Agent SDK query options", () => {
  test("captures stderr lines with runtime-specific diagnostics", () => {
    const stderrLines: string[] = []
    const errors: unknown[][] = []

    const handler = createClaudeAgentSdkStderrHandler({
      stderrLines,
      isUsingOllama: true,
      error: (...args) => {
        errors.push(args)
      },
    })
    handler("ollama warning")

    const claudeHandler = createClaudeAgentSdkStderrHandler({
      stderrLines,
      isUsingOllama: false,
      error: (...args) => {
        errors.push(args)
      },
    })
    claudeHandler("claude warning")

    expect(stderrLines).toEqual(["ollama warning", "claude warning"])
    expect(errors).toEqual([
      ["[Ollama stderr]", "ollama warning"],
      ["[claude stderr]", "claude warning"],
    ])
  })

  test("maps run request and runtime controls into SDK query params", () => {
    const sourceController = new AbortController()
    const request = createRequest({
      signal: sourceController.signal,
      resumeSessionId: "session-1",
    })
    const permission = getClaudePermissionMapping(request.permissionPolicy)
    const canUseTool = async () => ({ behavior: "allow" as const })
    const stderr = () => {}
    const mcpServers = {
      filesystem: {
        type: "stdio",
        command: "node",
        args: ["server.js"],
      },
    } as any

    const queryParams = createClaudeAgentSdkQueryOptions({
      request,
      prompt: "hello",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      env: { PATH: "/bin" },
      permission,
      mcpServers,
      isUsingOllama: false,
      canUseTool,
      stderr,
      pathToClaudeCodeExecutable: "/bin/claude",
      resumeSessionAt: "uuid-1",
      forkSession: true,
      model: "claude-sonnet-4",
      maxThinkingTokens: 1024,
    })

    expect(queryParams.prompt).toBe("hello")
    expect(queryParams.options.cwd).toBe("/repo")
    expect(queryParams.options.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
    })
    expect(queryParams.options.env).toEqual({ PATH: "/bin" })
    expect(queryParams.options.mcpServers).toBe(mcpServers)
    expect(queryParams.options.permissionMode).toBe("bypassPermissions")
    expect(queryParams.options.allowDangerouslySkipPermissions).toBe(true)
    expect(queryParams.options.includePartialMessages).toBe(true)
    expect(queryParams.options.settingSources).toEqual(["project", "user"])
    expect(queryParams.options.canUseTool).toBe(canUseTool)
    expect(queryParams.options.stderr).toBe(stderr)
    expect(queryParams.options.pathToClaudeCodeExecutable).toBe("/bin/claude")
    expect(queryParams.options.resume).toBe("session-1")
    expect(queryParams.options.resumeSessionAt).toBe("uuid-1")
    expect(queryParams.options.forkSession).toBe(true)
    expect(queryParams.options.continue).toBeUndefined()
    expect(queryParams.options.model).toBe("claude-sonnet-4")
    expect(queryParams.options.maxThinkingTokens).toBe(1024)

    sourceController.abort()
    expect(queryParams.options.abortController?.signal.aborted).toBe(true)
  })

  test("uses continue mode and skips project/user setting sources for Ollama", () => {
    const sourceController = new AbortController()
    const request = createRequest({
      signal: sourceController.signal,
      resumeSessionId: null,
    })

    const queryParams = createClaudeAgentSdkQueryOptions({
      request,
      prompt: "hello",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      env: {},
      permission: getClaudePermissionMapping(request.permissionPolicy),
      mcpServers: {},
      isUsingOllama: true,
      canUseTool: async () => ({ behavior: "allow" as const }),
      stderr: () => {},
      pathToClaudeCodeExecutable: "/bin/claude",
      resumeSessionAt: null,
      forkSession: false,
      model: null,
      maxThinkingTokens: null,
    })

    expect(queryParams.options.continue).toBe(true)
    expect(queryParams.options.resume).toBeUndefined()
    expect(queryParams.options.mcpServers).toBeUndefined()
    expect(queryParams.options.settingSources).toBeUndefined()
    expect(queryParams.options.model).toBeUndefined()
    expect(queryParams.options.maxThinkingTokens).toBeUndefined()
  })
})
