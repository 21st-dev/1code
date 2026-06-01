import { describe, expect, mock, test } from "bun:test"
import type {
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk"
import { join } from "node:path"
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
  installCodexAcpPermissionHandler,
  isCodexPlanModeBlockedTool,
  normalizeCodexPermissionTool,
} = await import("../src/main/lib/codex/acp-permission")
const { validateAgentScopeContract } = await import("../src/main/lib/agent-guard")

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
    expect(buildCodexAcpPermissionResponse(permissionOptions, "allow")).toEqual({
      outcome: { outcome: "selected", optionId: "approved" },
    })
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

  test("installs the handler through the current ACP model client seam", async () => {
    let connected = false
    let installedHandler: ((params: RequestPermissionRequest) => Promise<RequestPermissionResponse>) | null =
      null
    const model = {
      async connectClient() {
        connected = true
      },
      client: {
        setPermissionRequestHandler(
          handler: (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>,
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
