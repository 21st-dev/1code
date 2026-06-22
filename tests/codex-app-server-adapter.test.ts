import { describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ValidatedAgentScopeContract } from "../src/main/lib/agent-guard"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import {
  type DesktopPermissionPolicy,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import { createCodexAppServerAdapter } from "../src/main/lib/codex/app-server-adapter"
import type {
  CodexAppServerClientNotificationMethod,
  CodexAppServerClientRequestMethod,
  CodexAppServerTransport,
  CodexAppServerTransportNotification,
  CodexAppServerTransportServerRequest,
} from "../src/main/lib/codex/app-server-transport"

function createRequest(
  permissionPolicy = resolveDesktopPermissionPolicy({
    runtimeId: "codex",
    mode: "plan",
  }),
  overrides: Partial<DesktopRunRequest> = {},
): DesktopRunRequest {
  return {
    identity: { runId: "run-app-server", jobId: "job-app-server" },
    context: {
      runtimeId: "codex",
      mode: "plan",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    },
    prompt: "hello",
    permissionPolicy,
    providerBinding: overrides.providerBinding ?? {
      authMode: "runtime-managed",
    },
    mcp: {
      status: "skipped",
      serverNames: [],
      blockers: [],
    },
    attachments: [],
    trace: overrides.trace ?? { emit: () => {} },
    signal: overrides.signal ?? new AbortController().signal,
    session: {},
    ...overrides,
  }
}

class FakeCodexAppServerTransport implements CodexAppServerTransport {
  requests: Array<{ method: string; params: unknown }> = []
  notifications: Array<{ method: string; params?: unknown }> = []
  closed = false
  notificationHandler:
    | ((notification: CodexAppServerTransportNotification) => void)
    | null = null
  serverRequestHandler:
    | ((
        request: CodexAppServerTransportServerRequest,
      ) => unknown | Promise<unknown>)
    | null = null
  onTurnStart?: () => void | Promise<void>
  currentThreadId = "thread-1"
  currentSessionId = "session-1"

  async request(
    method: CodexAppServerClientRequestMethod,
    params: unknown,
  ): Promise<unknown> {
    this.requests.push({ method, params })
    if (method === "initialize") {
      return {
        userAgent: "codex-test",
        codexHome: "/tmp/codex-home",
        platformFamily: "unix",
        platformOs: "macos",
      }
    }
    if (method === "thread/start") {
      this.currentThreadId = "thread-1"
      this.currentSessionId = "session-1"
      this.emitNotification({
        method: "thread/started",
        params: {
          thread: {
            id: this.currentThreadId,
            sessionId: this.currentSessionId,
            modelProvider: "locus_profile",
          },
        },
      })
      return {
        thread: { id: this.currentThreadId, sessionId: this.currentSessionId },
      }
    }
    if (method === "thread/resume") {
      this.currentThreadId = (params as any).threadId
      this.currentSessionId = this.currentThreadId
      return {
        thread: { id: this.currentThreadId, sessionId: this.currentSessionId },
      }
    }
    if (method === "mcpServerStatus/list") {
      return {
        data: [
          {
            name: "smoke-mcp",
            authStatus: "unsupported",
            resourceTemplates: [],
            resources: [],
            tools: {
              smoke_echo: {
                name: "smoke_echo",
                description: "Smoke echo tool",
                inputSchema: { type: "object" },
              },
            },
          },
        ],
        nextCursor: null,
      }
    }
    if (method === "turn/start") {
      this.emitNotification({
        method: "turn/started",
        params: {
          threadId: this.currentThreadId,
          turn: { id: "turn-1", status: "inProgress", error: null },
        },
      })
      await this.onTurnStart?.()
      this.emitNotification({
        method: "item/agentMessage/delta",
        params: {
          threadId: this.currentThreadId,
          turnId: "turn-1",
          itemId: "item-1",
          delta: "hello from app-server",
        },
      })
      this.emitNotification({
        method: "thread/tokenUsage/updated",
        params: {
          threadId: this.currentThreadId,
          turnId: "turn-1",
          tokenUsage: {
            last: {
              inputTokens: 3,
              cachedInputTokens: 0,
              outputTokens: 4,
              reasoningOutputTokens: 0,
              totalTokens: 7,
            },
            total: {
              inputTokens: 3,
              cachedInputTokens: 0,
              outputTokens: 4,
              reasoningOutputTokens: 0,
              totalTokens: 7,
            },
            modelContextWindow: 128000,
          },
        },
      })
      this.emitNotification({
        method: "turn/completed",
        params: {
          threadId: this.currentThreadId,
          turn: { id: "turn-1", status: "completed", error: null },
        },
      })
      return { turn: { id: "turn-1" } }
    }
    if (method === "turn/interrupt") {
      return {}
    }
    throw new Error(`unexpected method ${method}`)
  }

  notify(
    method: CodexAppServerClientNotificationMethod,
    params?: unknown,
  ): void {
    this.notifications.push({ method, params })
  }

  onNotification(
    handler: (notification: CodexAppServerTransportNotification) => void,
  ): () => void {
    this.notificationHandler = handler
    return () => {
      this.notificationHandler = null
    }
  }

  onServerRequest(
    handler: (
      request: CodexAppServerTransportServerRequest,
    ) => unknown | Promise<unknown>,
  ): () => void {
    this.serverRequestHandler = handler
    return () => {
      this.serverRequestHandler = null
    }
  }

  emitNotification(notification: CodexAppServerTransportNotification) {
    this.notificationHandler?.(notification)
  }

  close(): Promise<void> {
    this.closed = true
    return Promise.resolve()
  }
}

function appServerPolicy(
  mode: "plan" | "agent" = "plan",
  hasScopeContract = false,
) {
  return resolveDesktopPermissionPolicy({
    runtimeId: "codex",
    mode,
    hasScopeContract,
    codexAdapterSource: "codex-app-server",
  })
}

function nonAppServerPolicy(): DesktopPermissionPolicy {
  const policy = appServerPolicy()
  return {
    ...policy,
    runtimeMapping: {
      ...policy.runtimeMapping,
      adapterSource: "legacy-desktop",
    },
  } as unknown as DesktopPermissionPolicy
}

function agentContext() {
  return {
    runtimeId: "codex" as const,
    mode: "agent" as const,
    projectId: "project-1",
    chatId: "chat-1",
    subChatId: "sub-1",
    cwd: "/repo",
  }
}

function guardedContract(cwd = "/repo"): ValidatedAgentScopeContract {
  return {
    id: "contract-1",
    version: 1,
    status: "approved",
    createdAt: "2026-06-12T00:00:00.000Z",
    approvedAt: "2026-06-12T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-app-server",
    cwd,
    editableScope: [{ path: "src", kind: "directory" }],
    readOnlyEvidence: [],
    successChecks: [{ command: "bun test" }],
    blockedPaths: [],
    expansions: [],
  }
}

function createPendingHarness() {
  const chunks: Record<string, any>[] = []
  const pending = new Map<string, { resolve: (approval: any) => void }>()
  return {
    chunks,
    pending,
    adapterInput: {
      emit: (chunk: Record<string, unknown>) => chunks.push(chunk),
      registerPendingQuestion: (
        toolUseId: string,
        question: { resolve: (approval: any) => void },
      ) => {
        pending.set(toolUseId, question)
      },
      unregisterPendingQuestion: (toolUseId: string) => {
        pending.delete(toolUseId)
      },
    },
    approveLatest() {
      const askChunk = chunks.findLast(
        (chunk) => chunk.type === "ask-user-question",
      )
      expect(askChunk).toBeTruthy()
      pending.get(askChunk!.toolUseId)?.resolve({
        approved: true,
        updatedInput: { answers: { Approve: "Approve" } },
      })
      return askChunk!
    },
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("Codex app-server adapter", () => {
  test("declares app-server metadata without marking it as temporary fallback", () => {
    expect(createCodexAppServerAdapter().metadata).toMatchObject({
      runtimeId: "codex",
      source: "codex-app-server",
      label: "Codex app-server adapter",
      temporaryFallback: false,
      fallbackReason: null,
    })
  })

  test("is disabled by default behind an explicit gate", async () => {
    await expect(
      createCodexAppServerAdapter().run(createRequest()),
    ).rejects.toThrow(
      "Codex app-server adapter is behind an explicit gate and is not enabled.",
    )
  })

  test("fails closed when permission policy is not app-server mapping", async () => {
    await expect(
      createCodexAppServerAdapter({ enabled: true }).run(
        createRequest(nonAppServerPolicy()),
      ),
    ).rejects.toThrow(
      "Codex app-server permission policy mapping is not available; refusing app-server startup.",
    )
  })

  test("accepts only the shared app-server permission mapping before transport startup", async () => {
    const transport = new FakeCodexAppServerTransport()
    const events: unknown[] = []

    const result = await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy(), {
        trace: { emit: (event) => events.push(event) },
      }),
    )

    expect(result).toMatchObject({
      status: "succeeded",
      sessionId: "session-1",
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    })
    expect(transport.requests.map((request) => request.method)).toEqual([
      "initialize",
      "thread/start",
      "mcpServerStatus/list",
      "turn/start",
    ])
    expect(transport.notifications).toEqual([{ method: "initialized" }])
    expect(transport.closed).toBe(true)
    expect(events.map((event: any) => event.type)).toContain("assistant_delta")
    expect(events.map((event: any) => event.type)).toContain("usage_update")
    expect(events.map((event: any) => event.type)).toContain("completed")
  })

  test("sends prepared Locus Agent prompt context to turn/start", async () => {
    const transport = new FakeCodexAppServerTransport()

    const result = await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      prepareRuntimePrompt: async ({ prompt }) => ({
        prompt: `prepared:${prompt}`,
        appAgentMentions: ["reviewer"],
        resolvedAppAgents: [],
        missingAppAgents: [],
      }),
    }).run(
      createRequest(appServerPolicy(), {
        prompt: "@[agent:reviewer] hello",
      }),
    )

    const turnStart = transport.requests.find(
      (request) => request.method === "turn/start",
    )
    const input = (
      turnStart?.params as
        | { input: Array<{ type: string; text: string; text_elements: [] }> }
        | undefined
    )?.input

    expect(result.status).toBe("succeeded")
    expect(input?.[0]).toMatchObject({
      type: "text",
      text: "prepared:@[agent:reviewer] hello",
      text_elements: [],
    })
  })

  test("resumes an existing app-server thread through thread/resume", async () => {
    const transport = new FakeCodexAppServerTransport()
    const chunks: Record<string, unknown>[] = []

    const result = await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      emit: (chunk) => chunks.push(chunk),
    }).run(
      createRequest(appServerPolicy(), {
        session: {
          resumeSessionId: "thread-resume-1",
          parentSessionId: "thread-resume-1",
        },
      }),
    )

    expect(result).toMatchObject({
      status: "succeeded",
      sessionId: "thread-resume-1",
    })
    expect(transport.requests.map((request) => request.method)).toEqual([
      "initialize",
      "thread/resume",
      "mcpServerStatus/list",
      "turn/start",
    ])
    expect(
      transport.requests.find((request) => request.method === "thread/resume")
        ?.params,
    ).toMatchObject({
      threadId: "thread-resume-1",
      cwd: "/repo",
      approvalPolicy: "on-request",
    })
    expect(
      transport.requests.find((request) => request.method === "turn/start")
        ?.params,
    ).toMatchObject({
      threadId: "thread-resume-1",
    })
    expect(chunks.find((chunk) => chunk.type === "session-init")).toMatchObject(
      {
        threadId: "thread-resume-1",
        sessionId: "thread-resume-1",
        adapterSource: "codex-app-server",
      },
    )
  })

  test("queries app-server MCP status and emits non-empty readiness summary", async () => {
    const transport = new FakeCodexAppServerTransport()
    const chunks: Record<string, unknown>[] = []

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      emit: (chunk) => chunks.push(chunk),
    }).run(
      createRequest(appServerPolicy(), {
        mcp: {
          status: "ready",
          serverNames: ["smoke-mcp"],
          blockers: [],
        },
      }),
    )

    expect(transport.requests.map((request) => request.method)).toContain(
      "mcpServerStatus/list",
    )
    expect(
      transport.requests.find(
        (request) => request.method === "mcpServerStatus/list",
      )?.params,
    ).toEqual({ detail: "toolsAndAuthOnly" })
    expect(
      chunks.find((chunk) => chunk.type === "runtime-status"),
    ).toMatchObject({
      ok: true,
      blocker: {
        component: "mcp",
        status: "ready",
      },
      mcp: {
        serverCount: 1,
        readyServerCount: 1,
        serverNames: ["smoke-mcp"],
        authStatuses: ["unsupported"],
        toolNamesByServer: {
          "smoke-mcp": ["smoke_echo"],
        },
      },
    })
  })

  test("maps guarded app-server runs to untrusted native approval policy", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
      }),
    )

    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )
    const turnStart = transport.requests.find(
      (request) => request.method === "turn/start",
    )

    expect((threadStart?.params as any).approvalPolicy).toBe("untrusted")
    expect((turnStart?.params as any).approvalPolicy).toBe("untrusted")
    expect((threadStart?.params as any).sandbox).toBe("workspace-write")
    expect((turnStart?.params as any).sandboxPolicy).toMatchObject({
      type: "workspaceWrite",
      writableRoots: ["/repo"],
    })
  })

  test("exposes controlled edit dynamic tool only for gated direct guarded runs", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      experimentalApi: true,
      controlledEditEnabled: true,
      guardedContract: guardedContract(),
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
      }),
    )

    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )
    expect((threadStart?.params as any).dynamicTools).toEqual([
      expect.objectContaining({
        namespace: "locus_edit",
        name: "propose_file_edit",
      }),
    ])
    expect((threadStart?.params as any).developerInstructions).toContain(
      "structured file-editing tools",
    )
  })

  test("does not expose controlled edit dynamic tool without experimental app-server capability", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      controlledEditEnabled: true,
      guardedContract: guardedContract(),
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
      }),
    )

    const initialize = transport.requests.find(
      (request) => request.method === "initialize",
    )
    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )

    expect((initialize?.params as any).capabilities.experimentalApi).toBe(false)
    expect((threadStart?.params as any).dynamicTools).toBeUndefined()
  })

  test("exposes controlled edit dynamic tool on provider-profile gateway runs", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      experimentalApi: true,
      controlledEditEnabled: true,
      providerGatewayToken: "gateway-token-selected",
      guardedContract: guardedContract(),
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
        providerBinding: {
          authMode: "provider-profile",
          providerProfileId: "profile-1",
          gatewayEndpoint:
            "http://127.0.0.1:4321/profile/profile-1/responses/v1",
          model: "deepseek-chat",
        },
      }),
    )

    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )
    expect((threadStart?.params as any).dynamicTools).toEqual([
      expect.objectContaining({
        namespace: "locus_edit",
        name: "propose_file_edit",
      }),
    ])
    expect((threadStart?.params as any).developerInstructions).toContain(
      "structured file-editing tools",
    )
  })

  test("keeps non-guarded app-server agent runs on on-request native approval policy", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy("agent"), {
        context: agentContext(),
      }),
    )

    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )
    const turnStart = transport.requests.find(
      (request) => request.method === "turn/start",
    )

    expect((threadStart?.params as any).approvalPolicy).toBe("on-request")
    expect((turnStart?.params as any).approvalPolicy).toBe("on-request")
  })

  test("rejects raw renderer secrets before app-server transport startup", async () => {
    const request = createRequest(appServerPolicy()) as DesktopRunRequest & {
      customEnv?: Record<string, string>
    }
    request.customEnv = { OPENAI_API_KEY: "sk-raw-renderer-key" }

    await expect(
      createCodexAppServerAdapter({ enabled: true }).run(request),
    ).rejects.toThrow(
      "Secret-bearing Codex app-server renderer input is not allowed: request.customEnv.",
    )
  })

  test("passes provider-profile config through app-server client config without exposing gateway token", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      providerGatewayToken: "gateway-token-selected",
      createTransport: ({ providerBinding }) => {
        expect(providerBinding.runtimeEnv).toMatchObject({
          LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "gateway-token-selected",
        })
        expect(JSON.stringify(providerBinding.client)).not.toContain(
          "gateway-token-selected",
        )
        return transport
      },
    }).run(
      createRequest(appServerPolicy(), {
        providerBinding: {
          authMode: "provider-profile",
          providerProfileId: "profile-1",
          gatewayEndpoint:
            "http://127.0.0.1:4321/profile/profile-1/responses/v1",
          model: "deepseek-chat",
        },
      }),
    )

    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )
    expect(threadStart?.params).toMatchObject({
      model: "deepseek-chat",
      modelProvider: "locus_profile",
      config: {
        "model_providers.locus_profile.env_key":
          "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
      },
    })
    expect(JSON.stringify(threadStart?.params)).not.toContain(
      "gateway-token-selected",
    )
  })

  test("scrubs app-server selected secret env from Codex shell snapshots before and after run", async () => {
    const codexHome = mkdtempSync(
      join(tmpdir(), "locus-app-server-codex-home-"),
    )
    try {
      const snapshotDir = join(codexHome, "shell_snapshots")
      mkdirSync(snapshotDir, { recursive: true })
      const staleSnapshot = join(snapshotDir, "stale.sh")
      const runtimeSnapshot = join(snapshotDir, "runtime.sh")
      writeFileSync(
        staleSnapshot,
        "export LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN=gateway-token-selected\n",
      )
      const transport = new FakeCodexAppServerTransport()
      transport.onTurnStart = () => {
        writeFileSync(
          runtimeSnapshot,
          [
            "export LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN=gateway-token-selected",
            "printf gateway-token-selected",
          ].join("\n"),
        )
      }

      await createCodexAppServerAdapter({
        enabled: true,
        providerGatewayToken: "gateway-token-selected",
        processEnv: {
          CODEX_HOME: codexHome,
          HOME: "/Users/example",
          PATH: "/usr/bin",
        },
        createTransport: ({ providerBinding }) => {
          expect(providerBinding.runtimeEnv).toMatchObject({
            CODEX_HOME: codexHome,
            LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "gateway-token-selected",
          })
          expect(readFileSync(staleSnapshot, "utf8")).not.toContain(
            "gateway-token-selected",
          )
          return transport
        },
      }).run(
        createRequest(appServerPolicy(), {
          providerBinding: {
            authMode: "provider-profile",
            providerProfileId: "profile-1",
            gatewayEndpoint:
              "http://127.0.0.1:4321/profile/profile-1/responses/v1",
            model: "deepseek-chat",
          },
        }),
      )

      const stale = readFileSync(staleSnapshot, "utf8")
      const runtime = readFileSync(runtimeSnapshot, "utf8")
      expect(stale).not.toContain("LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN")
      expect(stale).not.toContain("gateway-token-selected")
      expect(runtime).not.toContain("LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN")
      expect(runtime).not.toContain("gateway-token-selected")
    } finally {
      rmSync(codexHome, { recursive: true, force: true })
    }
  })

  test("scrubs app-managed Codex API key snapshots before and after run", async () => {
    const codexHome = mkdtempSync(
      join(tmpdir(), "locus-app-server-codex-home-"),
    )
    try {
      const snapshotDir = join(codexHome, "shell_snapshots")
      mkdirSync(snapshotDir, { recursive: true })
      const staleSnapshot = join(snapshotDir, "stale-api-key.sh")
      const runtimeSnapshot = join(snapshotDir, "runtime-api-key.sh")
      writeFileSync(
        staleSnapshot,
        "export CODEX_API_KEY=sk-app-managed-selected\n",
      )
      const transport = new FakeCodexAppServerTransport()
      transport.onTurnStart = () => {
        writeFileSync(
          runtimeSnapshot,
          [
            "export CODEX_API_KEY=sk-app-managed-selected",
            "printf sk-app-managed-selected",
          ].join("\n"),
        )
      }

      await createCodexAppServerAdapter({
        enabled: true,
        appManagedApiKey: "sk-app-managed-selected",
        processEnv: {
          CODEX_HOME: codexHome,
          HOME: "/Users/example",
          PATH: "/usr/bin",
        },
        createTransport: ({ providerBinding }) => {
          expect(providerBinding.runtimeEnv).toMatchObject({
            CODEX_HOME: codexHome,
            CODEX_API_KEY: "sk-app-managed-selected",
          })
          expect(readFileSync(staleSnapshot, "utf8")).not.toContain(
            "sk-app-managed-selected",
          )
          return transport
        },
      }).run(
        createRequest(appServerPolicy(), {
          providerBinding: {
            authMode: "app-managed",
            model: "gpt-5-codex",
          },
        }),
      )

      const stale = readFileSync(staleSnapshot, "utf8")
      const runtime = readFileSync(runtimeSnapshot, "utf8")
      expect(stale).not.toContain("CODEX_API_KEY")
      expect(stale).not.toContain("sk-app-managed-selected")
      expect(runtime).not.toContain("CODEX_API_KEY")
      expect(runtime).not.toContain("sk-app-managed-selected")
    } finally {
      rmSync(codexHome, { recursive: true, force: true })
    }
  })

  test("applies app-server experimental API and config overrides only when explicitly enabled", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      experimentalApi: true,
      configOverrides: {
        "features.apply_patch_freeform": true,
        "tools.apply_patch.enabled": true,
      },
      createTransport: () => transport,
    }).run(createRequest(appServerPolicy()))

    const initialize = transport.requests.find(
      (request) => request.method === "initialize",
    )
    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )

    expect(initialize?.params).toMatchObject({
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    })
    expect(threadStart?.params).toMatchObject({
      config: {
        "features.apply_patch_freeform": true,
        "tools.apply_patch.enabled": true,
      },
    })
  })

  test("applies Codex plugin config overrides after ordinary app-server config", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      configOverrides: {
        "features.apply_patch_freeform": true,
        "plugins.figma@openai-curated.enabled": true,
      },
      pluginConfigOverrides: {
        "plugins.figma@openai-curated.enabled": false,
        "plugins.github@openai-curated.enabled": true,
      },
      createTransport: () => transport,
    }).run(createRequest(appServerPolicy()))

    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )

    expect(threadStart?.params).toMatchObject({
      config: {
        "features.apply_patch_freeform": true,
        "plugins.figma@openai-curated.enabled": false,
        "plugins.github@openai-curated.enabled": true,
      },
    })
  })

  test("uses isolated plugin home env and staged plugin config for app-server startup", async () => {
    const transport = new FakeCodexAppServerTransport()
    const prepareCalls: unknown[] = []

    await createCodexAppServerAdapter({
      enabled: true,
      configOverrides: {
        "features.apply_patch_freeform": true,
      },
      pluginConfig: {
        config: {
          "plugins.figma@openai-curated.enabled": true,
        },
        entries: [
          {
            pluginId: "figma@openai-curated",
            pluginSource: "openai-curated:figma@7118aaa3",
            enabled: true,
            pluginPath:
              "/global/.codex/plugins/cache/openai-curated/figma/7118aaa3",
            cacheCoordinates: {
              marketplace: "openai-curated",
              name: "figma",
              version: "7118aaa3",
            },
            nativeActivationPolicy: {
              status: "allowed",
              canActivateNative: true,
              identityStatus: "reviewed",
              reasons: [],
            },
          },
        ],
      },
      preparePluginHome: async (input) => {
        prepareCalls.push(input)
        return {
          codexHome: "/isolated/codex-home/sub-1",
          runtimeEnv: {
            ...input.runtimeEnv,
            CODEX_HOME: "/isolated/codex-home/sub-1",
          },
          pluginConfigOverrides: {
            "plugins.figma@openai-curated.enabled": true,
            "plugins.github@openai-curated.enabled": false,
          },
          stagedEntries: [
            {
              pluginId: "figma@openai-curated",
              pluginSource: "openai-curated:figma@7118aaa3",
              sourcePath:
                "/global/.codex/plugins/cache/openai-curated/figma/7118aaa3",
              stagedPath:
                "/isolated/codex-home/sub-1/plugins/cache/openai-curated/figma/7118aaa3",
            },
          ],
          blockedEntries: [],
        }
      },
      createTransport: ({ providerBinding }) => {
        expect(providerBinding.runtimeEnv.CODEX_HOME).toBe(
          "/isolated/codex-home/sub-1",
        )
        return transport
      },
    }).run(
      createRequest(appServerPolicy(), {
        mcpSessionServers: [
          {
            name: "locus_edit",
            type: "stdio",
            command: "/usr/bin/node",
            args: ["server.js"],
            env: [{ name: "TOKEN", value: "secret" }],
          },
        ],
      }),
    )

    expect(prepareCalls).toHaveLength(1)
    expect(prepareCalls[0]).toMatchObject({
      pluginConfig: {
        config: {
          "plugins.figma@openai-curated.enabled": true,
        },
      },
      mcpServers: [
        {
          name: "locus_edit",
          type: "stdio",
          command: "/usr/bin/node",
          args: ["server.js"],
          env: [{ name: "TOKEN", value: "secret" }],
        },
      ],
    })
    const threadStart = transport.requests.find(
      (request) => request.method === "thread/start",
    )
    expect(threadStart?.params).toMatchObject({
      config: {
        "features.apply_patch_freeform": true,
        "plugins.figma@openai-curated.enabled": true,
        "plugins.github@openai-curated.enabled": false,
      },
    })
  })

  test("passes allowlisted CODEX_HOME to app-server without inheriting host secrets", async () => {
    const transport = new FakeCodexAppServerTransport()

    await createCodexAppServerAdapter({
      enabled: true,
      processEnv: {
        PATH: "/usr/bin",
        CODEX_HOME: "/tmp/locus-codex-home",
        OPENAI_API_KEY: "stale-openai-key",
        GITHUB_TOKEN: "stale-github-token",
      },
      createTransport: ({ providerBinding }) => {
        expect(providerBinding.runtimeEnv).toMatchObject({
          PATH: "/usr/bin",
          CODEX_HOME: "/tmp/locus-codex-home",
        })
        expect(providerBinding.runtimeEnv).not.toHaveProperty("OPENAI_API_KEY")
        expect(providerBinding.runtimeEnv).not.toHaveProperty("GITHUB_TOKEN")
        return transport
      },
    }).run(createRequest(appServerPolicy()))
  })

  test("sends turn interrupt when the desktop run is canceled after turn start", async () => {
    const transport = new FakeCodexAppServerTransport()
    const controller = new AbortController()
    transport.onTurnStart = () => controller.abort()

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy(), {
        signal: controller.signal,
      }),
    )

    expect(
      transport.requests.some(
        (request) =>
          request.method === "turn/interrupt" &&
          (request.params as any).threadId === "thread-1" &&
          (request.params as any).turnId === "turn-1",
      ),
    ).toBe(true)
  })

  test("denies app-server side-effect server requests by default", async () => {
    const transport = new FakeCodexAppServerTransport()
    transport.onTurnStart = async () => {
      const response = await transport.serverRequestHandler?.({
        id: "approval-1",
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-approval",
          startedAtMs: Date.now(),
          command: "rm -rf .",
        },
      })
      expect(response).toEqual({ decision: "decline" })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
    }).run(createRequest(appServerPolicy()))
  })

  test("bridges app-server user-input requests through shared pending question owner", async () => {
    const transport = new FakeCodexAppServerTransport()
    const { chunks, pending, adapterInput } = createPendingHarness()

    transport.onTurnStart = async () => {
      const responsePromise = transport.serverRequestHandler?.({
        id: "question-1",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-question",
          questions: [
            {
              id: "q-confirm",
              header: "Confirm",
              question: "Proceed?",
              isOther: false,
              isSecret: false,
              options: [{ label: "Yes", description: "" }],
            },
          ],
        },
      })

      const askChunk = chunks.find(
        (chunk) => chunk.type === "ask-user-question",
      )
      expect(askChunk).toMatchObject({
        type: "ask-user-question",
        toolUseId: "codex-app-server-user-input-question-1",
        questions: [{ question: "Proceed?" }],
      })
      pending.get(askChunk!.toolUseId)?.resolve({
        approved: true,
        updatedInput: { answers: { "Proceed?": "Yes" } },
      })

      await expect(responsePromise).resolves.toEqual({
        answers: { "q-confirm": { answers: ["Yes"] } },
      })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      ...adapterInput,
    }).run(createRequest(appServerPolicy()))

    expect(pending.size).toBe(0)
    expect(chunks.map((chunk) => chunk.type)).toContain(
      "ask-user-question-result",
    )
  })

  test("bridges guarded file approval grant through shared pending question owner", async () => {
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    transport.onTurnStart = async () => {
      const responsePromise = transport.serverRequestHandler?.({
        id: "file-1",
        method: "item/fileChange/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-file",
          startedAtMs: Date.now(),
          grantRoot: "src/app.ts",
        },
      })
      const askChunk = harness.approveLatest()
      expect(askChunk.toolUseId).toContain("file-approval")
      await expect(responsePromise).resolves.toEqual({ decision: "accept" })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      guardedContract: guardedContract(),
      ...harness.adapterInput,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
      }),
    )

    expect(harness.pending.size).toBe(0)
    expect(harness.chunks.map((chunk) => chunk.type)).toContain("guard-event")
    expect(harness.chunks.map((chunk) => chunk.type)).toContain(
      "ask-user-question-result",
    )
  })

  test("applies approved controlled edit dynamic tool calls from the main process", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const responsePromise = transport.serverRequestHandler?.({
          id: "dynamic-tool-1",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-1",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "create",
              path: "src/generated.txt",
              content: "created by controlled edit\n",
            },
          },
        })
        const diffChunk = harness.chunks.find(
          (chunk) => chunk.type === "file-change-diff",
        )
        expect(diffChunk).toMatchObject({
          path: "src/generated.txt",
          operation: "create",
        })
        const askChunk = harness.approveLatest()
        expect(askChunk.toolUseId).toContain("controlled-edit-approval")
        await expect(responsePromise).resolves.toMatchObject({
          success: true,
        })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(readFileSync(join(cwd, "src/generated.txt"), "utf8")).toBe(
        "created by controlled edit\n",
      )
      expect(harness.chunks.map((chunk) => chunk.type)).toContain(
        "file-change-delta",
      )
      expect(harness.chunks.map((chunk) => chunk.type)).toContain("guard-event")
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("fails closed for controlled edit dynamic tool calls outside guarded scope", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const response = await transport.serverRequestHandler?.({
          id: "dynamic-tool-out-of-scope",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-out-of-scope",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "create",
              path: "docs/out-of-scope.txt",
              content: "should not write\n",
            },
          },
        })
        expect(response).toMatchObject({
          success: false,
        })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(existsSync(join(cwd, "docs/out-of-scope.txt"))).toBe(false)
      expect(harness.chunks.map((chunk) => chunk.type)).toContain("guard-event")
      expect(harness.chunks.map((chunk) => chunk.type)).not.toContain(
        "ask-user-question",
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("does not write controlled edits when the user denies approval", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const responsePromise = transport.serverRequestHandler?.({
          id: "dynamic-tool-deny",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-deny",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "create",
              path: "src/denied.txt",
              content: "should not write\n",
            },
          },
        })
        const askChunk = harness.chunks.find(
          (chunk) => chunk.type === "ask-user-question",
        )
        expect(askChunk).toBeTruthy()
        harness.pending.get(askChunk!.toolUseId)?.resolve({
          approved: true,
          updatedInput: { answers: { "Apply edit": "Deny" } },
        })
        await expect(responsePromise).resolves.toMatchObject({
          success: false,
        })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(existsSync(join(cwd, "src/denied.txt"))).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("fails closed for malformed controlled edit tool calls before approval", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const response = await transport.serverRequestHandler?.({
          id: "dynamic-tool-malformed",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-malformed",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "create",
              path: "src/malformed.txt",
            },
          },
        })
        expect(response).toMatchObject({ success: false })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(harness.chunks.map((chunk) => chunk.type)).not.toContain(
        "ask-user-question",
      )
      expect(existsSync(join(cwd, "src/malformed.txt"))).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("fails closed for stale controlled edit replacements before approval", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    mkdirSync(join(cwd, "src"), { recursive: true })
    writeFileSync(join(cwd, "src/stale.txt"), "current\n", "utf8")
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const response = await transport.serverRequestHandler?.({
          id: "dynamic-tool-stale",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-stale",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "replace",
              path: "src/stale.txt",
              expected_previous_content: "old\n",
              content: "new\n",
            },
          },
        })
        expect(response).toMatchObject({ success: false })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(readFileSync(join(cwd, "src/stale.txt"), "utf8")).toBe("current\n")
      expect(harness.chunks.map((chunk) => chunk.type)).not.toContain(
        "ask-user-question",
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("fails closed if a controlled edit target changes during approval", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    mkdirSync(join(cwd, "src"), { recursive: true })
    writeFileSync(join(cwd, "src/race.txt"), "original\n", "utf8")
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const responsePromise = transport.serverRequestHandler?.({
          id: "dynamic-tool-stale-apply",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-stale-apply",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "replace",
              path: "src/race.txt",
              expected_previous_content: "original\n",
              content: "new\n",
            },
          },
        })
        const askChunk = harness.chunks.find(
          (chunk) => chunk.type === "ask-user-question",
        )
        expect(askChunk).toBeTruthy()
        writeFileSync(join(cwd, "src/race.txt"), "changed elsewhere\n", "utf8")
        harness.approveLatest()
        await expect(responsePromise).resolves.toMatchObject({
          success: false,
          contentItems: [
            {
              text: expect.stringContaining("changed before approval"),
            },
          ],
        })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(readFileSync(join(cwd, "src/race.txt"), "utf8")).toBe(
        "changed elsewhere\n",
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("times out controlled edit approvals without writing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "locus-controlled-edit-"))
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    try {
      transport.onTurnStart = async () => {
        const responsePromise = transport.serverRequestHandler?.({
          id: "dynamic-tool-timeout",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "controlled-edit-timeout",
            namespace: "locus_edit",
            tool: "propose_file_edit",
            arguments: {
              operation: "create",
              path: "src/timeout.txt",
              content: "should not write\n",
            },
          },
        })
        await sleep(20)
        await expect(responsePromise).resolves.toMatchObject({
          success: false,
        })
      }

      await createCodexAppServerAdapter({
        enabled: true,
        experimentalApi: true,
        controlledEditEnabled: true,
        createTransport: () => transport,
        guardedContract: guardedContract(cwd),
        userInputTimeoutMs: 5,
        ...harness.adapterInput,
      }).run(
        createRequest(appServerPolicy("agent", true), {
          context: { ...agentContext(), cwd },
        }),
      )

      expect(existsSync(join(cwd, "src/timeout.txt"))).toBe(false)
      expect(harness.chunks.map((chunk) => chunk.type)).toContain(
        "ask-user-question-timeout",
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test("bridges guarded permission approval grant through app-server permission profile response", async () => {
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()
    const permissions = {
      network: null,
      fileSystem: {
        read: null,
        write: ["/repo/src/new.ts"],
      },
    }

    transport.onTurnStart = async () => {
      const responsePromise = transport.serverRequestHandler?.({
        id: "permissions-1",
        method: "item/permissions/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-permissions",
          startedAtMs: Date.now(),
          cwd: "/repo",
          reason: "Allow write under src",
          permissions,
        },
      })
      const askChunk = harness.approveLatest()
      expect(askChunk.toolUseId).toContain("permissions-approval")
      await expect(responsePromise).resolves.toEqual({
        permissions,
        scope: "turn",
        strictAutoReview: true,
      })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      guardedContract: guardedContract(),
      ...harness.adapterInput,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
      }),
    )
  })

  test("fails closed for app-server network permission expansions", async () => {
    const transport = new FakeCodexAppServerTransport()
    transport.onTurnStart = async () => {
      const response = await transport.serverRequestHandler?.({
        id: "network-permissions-1",
        method: "item/permissions/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-network",
          startedAtMs: Date.now(),
          cwd: "/repo",
          reason: "Need network",
          permissions: {
            network: { enabled: true },
            fileSystem: null,
          },
        },
      })
      expect(response).toEqual({
        permissions: {},
        scope: "turn",
        strictAutoReview: true,
      })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
    }).run(
      createRequest(appServerPolicy("agent"), {
        context: agentContext(),
      }),
    )
  })

  test("redacts app-server approval prompt text before renderer emission", async () => {
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    transport.onTurnStart = async () => {
      const responsePromise = transport.serverRequestHandler?.({
        id: "redacted-command-1",
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-redacted-command",
          startedAtMs: Date.now(),
          command:
            "printf 'Authorization: Bearer app-server-secret-token access_token=oauth-secret-token'",
        },
      })
      const askChunk = harness.approveLatest()
      const prompt = JSON.stringify(askChunk.questions)
      expect(prompt).toContain("Authorization: <redacted>")
      expect(prompt).toContain("access_token=<redacted>")
      expect(prompt).not.toContain("app-server-secret-token")
      expect(prompt).not.toContain("oauth-secret-token")
      await expect(responsePromise).resolves.toEqual({ decision: "accept" })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      ...harness.adapterInput,
    }).run(
      createRequest(appServerPolicy("agent"), {
        context: agentContext(),
      }),
    )
  })

  test("bridges legacy exec approval grant through legacy app-server response shape", async () => {
    const transport = new FakeCodexAppServerTransport()
    const harness = createPendingHarness()

    transport.onTurnStart = async () => {
      const responsePromise = transport.serverRequestHandler?.({
        id: "legacy-exec-1",
        method: "execCommandApproval",
        params: {
          conversationId: "thread-1",
          callId: "legacy-call-1",
          approvalId: "legacy-approval-1",
          command: ["bun", "test"],
          cwd: "/repo",
          reason: null,
          parsedCmd: [],
        },
      })
      const askChunk = harness.approveLatest()
      expect(askChunk.toolUseId).toContain("legacy-command-approval")
      await expect(responsePromise).resolves.toEqual({ decision: "approved" })
    }

    await createCodexAppServerAdapter({
      enabled: true,
      createTransport: () => transport,
      guardedContract: guardedContract(),
      ...harness.adapterInput,
    }).run(
      createRequest(appServerPolicy("agent", true), {
        context: agentContext(),
      }),
    )
  })
})
