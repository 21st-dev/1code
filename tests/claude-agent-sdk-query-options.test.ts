import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk"
import { validateAgentScopeContract } from "../src/main/lib/agent-guard"
import {
  getClaudeAssistantSdkDisallowedTools,
  getClaudePermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import type { DesktopRunPreflightResult } from "../src/main/lib/agent-runtime/preflight"
import {
  createClaudeAgentSdkDesktopRuntimeQueryOptions,
  createClaudeAgentSdkQueryOptions,
  createClaudeAgentSdkRuntimeQueryOptions,
  createClaudeAgentSdkStderrHandler,
  prepareClaudeAgentSdkMcpServers,
  resolveClaudeAgentSdkResumeOptions,
} from "../src/main/lib/claude/agent-sdk-query-options"
import { createClaudeDesktopRunRequest } from "../src/main/lib/claude/desktop-run-request"
import type { AgentScopeContract } from "../src/shared/agent-scope-contracts"

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

const cwd = join(process.cwd(), "example-project")

function baseScopeContract(): AgentScopeContract {
  return {
    id: "contract-1",
    version: 1,
    status: "approved",
    createdAt: "2026-06-07T00:00:00.000Z",
    approvedAt: "2026-06-07T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    cwd,
    projectPath: cwd,
    editableScope: [{ path: "src/app.ts", kind: "file" }],
    readOnlyEvidence: [{ path: "tests/app.test.ts", kind: "file" }],
    successChecks: [{ command: "bun test tests/app.test.ts" }],
    blockedPaths: [],
    expansions: [],
  }
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

  test("prepares SDK MCP servers for Ollama and token refresh", async () => {
    const logs: unknown[][] = []
    const servers = {
      github: { type: "http", url: "https://mcp.example.com" },
    } as any
    const refreshCalls: unknown[][] = []

    await expect(
      prepareClaudeAgentSdkMcpServers({
        mcpServers: servers,
        isUsingOllama: true,
        cwd: "/repo",
        ensureTokensFresh: async (...args) => {
          refreshCalls.push(args)
          return servers
        },
        log: (...args) => logs.push(args),
      }),
    ).resolves.toBeUndefined()
    expect(refreshCalls).toEqual([])
    expect(logs).toEqual([
      ["[Ollama] Skipping MCP servers to speed up initialization"],
    ])

    await expect(
      prepareClaudeAgentSdkMcpServers({
        mcpServers: servers,
        isUsingOllama: false,
        projectPath: "/project",
        cwd: "/repo",
        ensureTokensFresh: async (...args) => {
          refreshCalls.push(args)
          return { refreshed: servers } as any
        },
      }),
    ).resolves.toEqual({ refreshed: servers })
    expect(refreshCalls).toEqual([[servers, "/project"]])
  })

  test("resolves SDK resume options for fork, rollback, and Ollama mode", () => {
    expect(
      resolveClaudeAgentSdkResumeOptions({
        isUsingOllama: false,
        shouldForkResume: true,
        forkResumeAtUuid: "fork-uuid",
        resumeAtUuid: "resume-uuid",
      }),
    ).toEqual({
      resumeSessionAt: "fork-uuid",
      forkSession: true,
    })

    expect(
      resolveClaudeAgentSdkResumeOptions({
        isUsingOllama: false,
        shouldForkResume: false,
        forkResumeAtUuid: null,
        resumeAtUuid: "resume-uuid",
      }),
    ).toEqual({
      resumeSessionAt: "resume-uuid",
      forkSession: false,
    })

    expect(
      resolveClaudeAgentSdkResumeOptions({
        isUsingOllama: true,
        shouldForkResume: true,
        forkResumeAtUuid: "fork-uuid",
        resumeAtUuid: "resume-uuid",
      }),
    ).toEqual({
      resumeSessionAt: null,
      forkSession: false,
    })
  })

  test("builds runtime query options with owned tool, stderr, binary, and resume wiring", async () => {
    const sourceController = new AbortController()
    const request = createRequest({
      signal: sourceController.signal,
      resumeSessionId: "session-1",
    })
    const stderrLines: string[] = []
    const emitted: unknown[] = []
    const guardEvents: unknown[] = []

    const queryParams = createClaudeAgentSdkRuntimeQueryOptions({
      request,
      prompt: "hello",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      env: { PATH: "/bin" },
      permission: getClaudePermissionMapping(request.permissionPolicy),
      mcpServers: {},
      isUsingOllama: false,
      permissionHandler: {
        permissionPolicy: request.permissionPolicy,
        guardedContract: null,
        getGuardedContract: () => undefined,
        recordGuardEvent: (event) => {
          guardEvents.push(event)
        },
        emit: (chunk) => {
          emitted.push(chunk)
        },
        subChatId: "sub-1",
        pendingToolApprovals: new Map(),
        parts: [],
      },
      stderrLines,
      shouldForkResume: true,
      forkResumeAtUuid: "fork-uuid",
      resumeAtUuid: "resume-uuid",
      model: "claude-sonnet-4",
      maxThinkingTokens: 2048,
      getClaudeBinaryPath: () => "/owned/claude",
    })

    expect(queryParams.options.pathToClaudeCodeExecutable).toBe("/owned/claude")
    expect(queryParams.options.resume).toBe("session-1")
    expect(queryParams.options.resumeSessionAt).toBe("fork-uuid")
    expect(queryParams.options.forkSession).toBe(true)
    expect(queryParams.options.model).toBe("claude-sonnet-4")
    expect(queryParams.options.maxThinkingTokens).toBe(2048)

    expect(typeof queryParams.options.stderr).toBe("function")
    expect(stderrLines).toEqual([])
    await expect(
      queryParams.options.canUseTool?.(
        "Read",
        { file_path: "/repo/README.md" },
        { toolUseID: "tool-1" } as any,
      ),
    ).resolves.toEqual({
      behavior: "allow",
      updatedInput: { file_path: "/repo/README.md" },
    })
    expect(emitted).toEqual([
      expect.objectContaining({
        type: "observed-tool-decision",
        controlLevel: "observe",
        decision: "allow",
        risk: expect.objectContaining({
          toolName: "Read",
          toolUseId: "tool-1",
          category: "read",
          riskLevel: "low",
          riskCategories: ["read"],
          catastrophic: false,
          recommendedDecision: "allow",
        }),
      }),
    ])
    expect(guardEvents).toEqual([])

    const preToolUseHook = queryParams.options.hooks?.PreToolUse?.[0]?.hooks[0]
    expect(typeof preToolUseHook).toBe("function")
    await expect(
      preToolUseHook?.(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: {
            file_path: "/repo/.env",
            content: "LOCUS_SMOKE_SHOULD_NOT_EXIST=1",
          },
          tool_use_id: "tool-2",
        } as any,
        "tool-2",
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining(
          "Observed mode blocked Write",
        ),
      },
    })
    expect(emitted[1]).toMatchObject({
      type: "observed-tool-decision",
      controlLevel: "observe",
      decision: "deny",
      risk: {
        toolName: "Write",
        toolUseId: "tool-2",
        category: "write",
        riskLevel: "catastrophic",
        catastrophic: true,
      },
    })
  })

  test("builds desktop runtime query options with owned guard event recording", async () => {
    const sourceController = new AbortController()
    const request = createRequest({
      signal: sourceController.signal,
      resumeSessionId: "session-1",
    })
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
      hasScopeContract: true,
    })
    const guardedContract = await validateAgentScopeContract(
      baseScopeContract(),
      {
        cwd,
        projectPath: cwd,
        chatId: "chat-1",
        subChatId: "sub-1",
        runId: "run-1",
        requireRegisteredWorktree: false,
      },
    )
    const guardEvents: any[] = []
    const emitted: any[] = []

    const queryParams = createClaudeAgentSdkDesktopRuntimeQueryOptions({
      request,
      prompt: "hello",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      env: { PATH: "/bin" },
      permission: getClaudePermissionMapping(permissionPolicy),
      mcpServers: {},
      isUsingOllama: false,
      permissionPolicy,
      guardedContract,
      getGuardedContract: () => guardedContract,
      guardEvents,
      emit: (chunk) => {
        emitted.push(chunk)
      },
      subChatId: "sub-1",
      pendingToolApprovals: new Map(),
      parts: [],
      stderrLines: [],
      shouldForkResume: false,
      forkResumeAtUuid: null,
      resumeAtUuid: null,
      model: "claude-sonnet-4",
      maxThinkingTokens: null,
      getClaudeBinaryPath: () => "/owned/claude",
    })

    expect(queryParams.options.pathToClaudeCodeExecutable).toBe("/owned/claude")
    const editToolOptions: Parameters<CanUseTool>[2] = {
      signal: new AbortController().signal,
      toolUseID: "tool-1",
    }
    await expect(
      queryParams.options.canUseTool?.(
        "Edit",
        { file_path: "src/app.ts" },
        editToolOptions,
      ),
    ).resolves.toMatchObject({ behavior: "allow" })
    expect(guardEvents).toHaveLength(1)
    expect(guardEvents[0]).toMatchObject({ type: "allowed" })
    expect(emitted).toEqual([
      {
        type: "guard-event",
        event: guardEvents[0],
      },
    ])

    const preToolUseHook = queryParams.options.hooks?.PreToolUse?.[0]?.hooks[0]
    expect(typeof preToolUseHook).toBe("function")
    await expect(
      preToolUseHook?.(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Edit",
          tool_input: { file_path: "tests/app.test.ts" },
          tool_use_id: "tool-2",
        } as any,
        "tool-2",
        { signal: new AbortController().signal },
      ),
    ).resolves.toMatchObject({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    })
    expect(guardEvents).toHaveLength(2)
    expect(guardEvents[1]).toMatchObject({
      type: "scope-expansion-request",
      toolName: "Edit",
      toolUseId: "tool-2",
    })
  })

  test("maps run request and runtime controls into SDK query params", () => {
    const sourceController = new AbortController()
    const request = createRequest({
      signal: sourceController.signal,
      resumeSessionId: "session-1",
    })
    const permission = getClaudePermissionMapping(request.permissionPolicy)
    const canUseTool = async () => ({ behavior: "allow" as const })
    const hooks = {
      PreToolUse: [{ hooks: [async () => ({ continue: true })] }],
    } as any
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
      hooks,
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
    expect(queryParams.options.disallowedTools).toBeUndefined()
    expect(queryParams.options.includePartialMessages).toBe(true)
    expect(queryParams.options.settingSources).toEqual(["project", "user"])
    expect(queryParams.options.canUseTool).toBe(canUseTool)
    expect(queryParams.options.hooks).toBe(hooks)
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

  test("passes assistant SDK disallowed tools before relying on hook callbacks", () => {
    const sourceController = new AbortController()
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "plan",
      workspaceKind: "folderless",
    })
    const request = createClaudeDesktopRunRequest({
      runId: "run-assistant",
      streamId: "stream-assistant",
      jobId: "job-assistant",
      mode: "plan",
      preflight: {
        cwd: process.cwd(),
        chat: { id: "chat-assistant", projectId: null },
        subChat: { id: "sub-assistant", chatId: "chat-assistant" },
        project: null,
      } as DesktopRunPreflightResult,
      prompt: "hello",
      permissionPolicy,
      providerBinding: {
        model: "claude-sonnet-4",
        modelSource: "request",
        providerProfileId: null,
        gatewayEndpoint: null,
        authMode: "runtime-managed",
      },
      signal: sourceController.signal,
      resumeSessionId: null,
      parentSessionId: null,
      emitTrace: () => {},
    })
    const canUseTool = async () => ({ behavior: "allow" as const })

    const queryParams = createClaudeAgentSdkQueryOptions({
      request,
      prompt: "hello",
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      env: {},
      permission: getClaudePermissionMapping(permissionPolicy),
      mcpServers: {},
      isUsingOllama: false,
      canUseTool,
      stderr: () => {},
      pathToClaudeCodeExecutable: "/bin/claude",
      resumeSessionAt: null,
      forkSession: false,
      model: null,
      maxThinkingTokens: null,
    })

    expect(queryParams.options.permissionMode).toBe("plan")
    expect(queryParams.options.canUseTool).toBe(canUseTool)
    expect(queryParams.options.disallowedTools).toEqual(
      getClaudeAssistantSdkDisallowedTools(),
    )
    expect(queryParams.options.disallowedTools).toEqual(
      expect.arrayContaining([
        "Read",
        "Grep",
        "Glob",
        "LS",
        "Bash",
        "Write",
        "Edit",
        "MultiEdit",
        "NotebookRead",
        "NotebookEdit",
        "Task",
        "TodoRead",
        "TodoWrite",
        "ExitPlanMode",
      ]),
    )
    expect(queryParams.options.disallowedTools).not.toContain("WebSearch")
    expect(queryParams.options.disallowedTools).not.toContain("WebFetch")
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
