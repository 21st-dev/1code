import { describe, expect, test } from "bun:test"
import {
  getClaudePermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import { createClaudeDesktopRunRequest } from "../src/main/lib/claude/desktop-run-request"
import { prepareClaudeAgentSdkDesktopRuntimeQuery } from "../src/main/lib/claude/agent-sdk-runtime-query"

function createRequest() {
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
    signal: new AbortController().signal,
    emitTrace: () => {},
  })
}

describe("Claude Agent SDK desktop runtime query startup", () => {
  test("prepares MCP servers, prompt context, and SDK query options together", async () => {
    const request = createRequest()
    const permissionPolicy = request.permissionPolicy
    const rawServers = {
      github: { type: "http", url: "https://mcp.example.com" },
    } as any
    const refreshedServers = {
      github: { type: "http", url: "https://mcp.example.com", headers: {} },
    } as any
    const refreshCalls: unknown[][] = []

    const result = await prepareClaudeAgentSdkDesktopRuntimeQuery({
      request,
      prompt: "inspect",
      existingMessages: [],
      rawMcpServers: rawServers,
      env: { PATH: "/bin" },
      permission: getClaudePermissionMapping(permissionPolicy),
      isUsingOllama: false,
      permissionPolicy,
      guardedContract: null,
      guardEvents: [],
      emit: () => {},
      subChatId: "sub-1",
      pendingToolApprovals: new Map(),
      parts: [],
      stderrLines: [],
      shouldForkResume: false,
      forkResumeAtUuid: null,
      resumeAtUuid: null,
      resolvedModel: "claude-sonnet-4",
      maxThinkingTokens: 1024,
      projectPath: "/project",
      cwd: "/repo",
      ensureTokensFresh: async (...args) => {
        refreshCalls.push(args)
        return refreshedServers
      },
      readAgentsMd: async () => ({
        path: "/repo/AGENTS.md",
        content: "Use repo rules.",
      }),
      log: () => {},
      getClaudeBinaryPath: () => "/owned/claude",
    })

    expect(refreshCalls).toEqual([[rawServers, "/project"]])
    expect(result.mcpServers).toBe(refreshedServers)
    expect(result.promptContext.prompt).toBe("inspect")
    expect(result.promptContext.systemPrompt).toMatchObject({
      type: "preset",
      preset: "claude_code",
    })
    expect(
      "append" in result.promptContext.systemPrompt
        ? result.promptContext.systemPrompt.append
        : "",
    ).toContain("Use repo rules.")
    expect(result.queryOptions.prompt).toBe("inspect")
    expect(result.queryOptions.options.mcpServers).toBe(refreshedServers)
    expect(result.queryOptions.options.model).toBe("claude-sonnet-4")
    expect(result.queryOptions.options.maxThinkingTokens).toBe(1024)
    expect(result.queryOptions.options.pathToClaudeCodeExecutable).toBe(
      "/owned/claude",
    )
  })

  test("defaults pending tool approvals through the runtime query owner", async () => {
    const request = createRequest()
    const permissionPolicy = request.permissionPolicy
    const approvalStore = new Map()
    const emitted: any[] = []

    const result = await prepareClaudeAgentSdkDesktopRuntimeQuery({
      request,
      prompt: "inspect",
      existingMessages: [],
      env: { PATH: "/bin" },
      permission: getClaudePermissionMapping(permissionPolicy),
      isUsingOllama: false,
      permissionPolicy,
      guardedContract: null,
      guardEvents: [],
      emit: (chunk) => {
        emitted.push(chunk)
      },
      subChatId: "sub-1",
      parts: [],
      stderrLines: [],
      shouldForkResume: false,
      forkResumeAtUuid: null,
      resumeAtUuid: null,
      resolvedModel: "claude-sonnet-4",
      maxThinkingTokens: 1024,
      projectPath: "/project",
      cwd: "/repo",
      ensureTokensFresh: async (servers) => servers,
      getPendingToolApprovals: () => approvalStore as any,
      readAgentsMd: async () => null,
      log: () => {},
      getClaudeBinaryPath: () => "/owned/claude",
    })

    const canUseTool = result.queryOptions.options.canUseTool!
    const decision = canUseTool(
      "AskUserQuestion",
      { questions: ["Proceed?"] },
      { toolUseID: "tool-1" } as any,
    )

    expect(approvalStore.has("tool-1")).toBe(true)
    approvalStore.get("tool-1")?.resolve({
      approved: false,
      message: "No",
    })
    await expect(decision).resolves.toEqual({
      behavior: "deny",
      message: "No",
    })
    expect(emitted).toEqual([
      {
        type: "ask-user-question",
        toolUseId: "tool-1",
        questions: ["Proceed?"],
      },
      {
        type: "ask-user-question-result",
        toolUseId: "tool-1",
        result: "No",
      },
    ])
  })
})
