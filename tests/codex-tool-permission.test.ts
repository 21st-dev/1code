import { describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk"
import {
  getCodexAppServerPermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import type { AgentGuardEvent } from "../src/shared/agent-scope-contracts"

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return join(process.cwd(), ".tmp-test-user-data")
    },
    isPackaged: false,
  },
}))

const {
  buildCodexAcpPermissionResponse,
  createCodexAcpPermissionHandler,
  decideCodexAcpToolPermission,
  installCodexAcpPermissionHandler,
  isCodexPlanModeBlockedTool,
  normalizeCodexDynamicPermissionTool,
  normalizeCodexPermissionTool,
} = await import("../src/main/lib/codex/tool-permission")
const { validateAgentScopeContract } = await import(
  "../src/main/lib/agent-guard"
)

const permissionOptions: PermissionOption[] = [
  { optionId: "approved", kind: "allow_once", name: "Yes, proceed" },
  { optionId: "abort", kind: "reject_once", name: "No" },
]

function permissionRequest(
  overrides: Partial<RequestPermissionRequest["toolCall"]>,
): RequestPermissionRequest {
  return {
    sessionId: "session-1",
    options: permissionOptions,
    toolCall: {
      toolCallId: "tool-1",
      title: "Run echo ok",
      kind: "execute",
      rawInput: {
        command: ["/bin/zsh", "-lc", "echo ok"],
      },
      ...overrides,
    },
  }
}

describe("Codex ACP permission enforcement", () => {
  test("selects reject options for denied permission requests", () => {
    expect(buildCodexAcpPermissionResponse(permissionOptions, "deny")).toEqual({
      outcome: { outcome: "selected", optionId: "abort" },
    })
    expect(buildCodexAcpPermissionResponse(permissionOptions, "allow")).toEqual(
      {
        outcome: { outcome: "selected", optionId: "approved" },
      },
    )
  })

  test("normalizes ACP execute requests into guarded Bash input", () => {
    const tool = normalizeCodexPermissionTool(
      permissionRequest({
        title: "printf %s denied-by-locus > permission-smoke.txt",
        kind: "execute",
        rawInput: {
          command: [
            "/bin/zsh",
            "-lc",
            "printf %s denied-by-locus > permission-smoke.txt",
          ],
        },
      }).toolCall,
    )

    expect(tool).toMatchObject({
      toolName: "Bash",
      kind: "execute",
      toolInput: {
        command: "printf %s denied-by-locus > permission-smoke.txt",
      },
    })
    expect(isCodexPlanModeBlockedTool(tool)).toBe(true)
  })

  test("denies plan-mode edit and execute permission requests before execution", async () => {
    const handler = createCodexAcpPermissionHandler({ mode: "plan" })

    const response = await handler(
      permissionRequest({
        title: "Edit src/main.ts",
        kind: "edit",
        rawInput: { path: "src/main.ts" },
      }),
    )

    expect(response).toEqual({
      outcome: { outcome: "selected", optionId: "abort" },
    })
  })

  test("assistant policy allows web fetch and denies file or unknown tools", async () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
      workspaceKind: "folderless",
    })
    const permission = getCodexAppServerPermissionMapping(policy)
    const handler = createCodexAcpPermissionHandler({
      mode: "agent",
      controlLevel: permission.controlLevel,
      observedToolPolicy: permission.observedToolPolicy,
    })

    await expect(
      handler(
        permissionRequest({
          title: "Fetch https://example.com",
          kind: "fetch",
          rawInput: { url: "https://example.com" },
        }),
      ),
    ).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "approved" },
    })

    await expect(
      handler(
        permissionRequest({
          title: "Grep src",
          kind: "search",
          rawInput: { path: "src", pattern: "secret" },
        }),
      ),
    ).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "abort" },
    })

    expect(
      decideCodexAcpToolPermission({
        tool: {
          toolUseId: "unknown-1",
          toolName: "futureSideEffect",
          toolInput: {},
          kind: null,
          title: "futureSideEffect",
        },
        mode: "agent",
        controlLevel: permission.controlLevel,
        observedToolPolicy: permission.observedToolPolicy,
      }),
    ).toMatchObject({
      decision: "deny",
      message: expect.stringContaining("only web search and web fetch"),
    })
  })

  test("maps guarded out-of-scope writes to scope expansion events", async () => {
    const contract = await validateAgentScopeContract(
      {
        id: "contract-1",
        version: 1,
        status: "approved",
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        source: "manual",
        chatId: "chat-1",
        subChatId: "subchat-1",
        runId: "run-1",
        cwd: process.cwd(),
        editableScope: [
          { path: "src/main/lib/trpc/routers/codex.ts", kind: "file" },
        ],
        readOnlyEvidence: [],
        successChecks: [],
        blockedPaths: [],
        expansions: [],
      },
      {
        cwd: process.cwd(),
        chatId: "chat-1",
        subChatId: "subchat-1",
        runId: "run-1",
        requireRegisteredWorktree: false,
        isSymlinkEscaping: async () => false,
      },
    )
    const events: AgentGuardEvent[] = []
    const handler = createCodexAcpPermissionHandler({
      mode: "agent",
      contract,
      onGuardEvent: (event) => events.push(event),
    })

    const response = await handler(
      permissionRequest({
        title: "Edit src/main/lib/trpc/routers/claude.ts",
        kind: "edit",
        rawInput: { path: "src/main/lib/trpc/routers/claude.ts" },
      }),
    )

    expect(response).toEqual({
      outcome: { outcome: "selected", optionId: "abort" },
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: "scope-expansion-request",
      toolName: "Edit",
      path: "src/main/lib/trpc/routers/claude.ts",
    })
  })

  test("observes Agent-mode permission requests and blocks catastrophic actions", async () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
    })
    const permission = getCodexAppServerPermissionMapping(policy)
    const observed: any[] = []
    const handler = createCodexAcpPermissionHandler({
      mode: "agent",
      controlLevel: permission.controlLevel,
      observedToolPolicy: permission.observedToolPolicy,
      onObservedToolDecision: (event) => observed.push(event),
    })

    const webFetchResponse = await handler(
      permissionRequest({
        title: "Fetch https://example.com",
        kind: "fetch",
        rawInput: { url: "https://example.com" },
      }),
    )
    const sensitiveWriteResponse = await handler(
      permissionRequest({
        title: "Write .env",
        kind: "edit",
        rawInput: { path: ".env" },
      }),
    )

    expect(webFetchResponse).toEqual({
      outcome: { outcome: "selected", optionId: "approved" },
    })
    expect(sensitiveWriteResponse).toEqual({
      outcome: { outcome: "selected", optionId: "abort" },
    })
    expect(observed).toHaveLength(2)
    expect(observed[0]).toMatchObject({
      controlLevel: "observe",
      decision: "allow",
      risk: {
        toolName: "WebFetch",
        riskLevel: "high",
        catastrophic: false,
      },
    })
    expect(observed[0].risk.riskCategories).toContain("network-egress")
    expect(observed[1]).toMatchObject({
      controlLevel: "observe",
      decision: "deny",
      risk: {
        toolName: "Write",
        riskLevel: "catastrophic",
        catastrophic: true,
      },
    })
    expect(observed[1].risk.riskCategories).toContain("sensitive-path")
  })

  test("normalizes dynamic ACP edit tool input and denies observed .env writes", () => {
    const policy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "agent",
    })
    const permission = getCodexAppServerPermissionMapping(policy)
    const tool = normalizeCodexDynamicPermissionTool({
      toolCallId: "dynamic-1",
      toolName: "acp.acp_provider_agent_dynamic_tool",
      input: {
        toolCallId: "codex-tool-1",
        toolName: `Edit ${join(process.cwd(), ".env")}`,
        args: {
          changes: {
            [join(process.cwd(), ".env")]: {
              type: "add",
              content: "SECRET_TOKEN=should-not-land",
            },
          },
          auto_approved: true,
        },
      },
    })

    expect(tool).toMatchObject({
      toolUseId: "codex-tool-1",
      toolName: "Edit",
      toolInput: {
        file_path: join(process.cwd(), ".env"),
        path: join(process.cwd(), ".env"),
      },
    })

    const decision = decideCodexAcpToolPermission({
      tool: tool!,
      mode: "agent",
      controlLevel: permission.controlLevel,
      observedToolPolicy: permission.observedToolPolicy,
    })

    expect(decision).toMatchObject({
      decision: "deny",
      observed: {
        controlLevel: "observe",
        decision: "deny",
        risk: {
          toolName: "Edit",
          riskLevel: "catastrophic",
          catastrophic: true,
        },
      },
    })
    expect(decision.observed?.risk.riskCategories).toContain("sensitive-path")
  })

  test("installs the handler through the current ACP model client seam", async () => {
    let connected = false
    let installedHandler:
      | ((
          params: RequestPermissionRequest,
        ) => Promise<RequestPermissionResponse>)
      | null = null
    const model = {
      async connectClient() {
        connected = true
      },
      client: {
        setPermissionRequestHandler(
          handler: (
            params: RequestPermissionRequest,
          ) => Promise<RequestPermissionResponse>,
        ) {
          installedHandler = handler
        },
      },
    }

    const result = await installCodexAcpPermissionHandler({
      model,
      handler: createCodexAcpPermissionHandler({ mode: "plan" }),
    })

    expect(result).toEqual({ ok: true })
    expect(connected).toBe(true)
    expect(typeof installedHandler).toBe("function")
  })
})
