import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type {
  AgentRuntimePermissionPolicySummary,
  AgentRuntimePersistedObserver,
  AgentRuntimeProviderReference,
  AgentRuntimeRunRequestBase,
  AgentRuntimeTraceObserver,
} from "../src/main/lib/agent-runtime/run-contract"
import { createCodexDesktopRunRequest } from "../src/main/lib/codex/desktop-run-request"
import {
  createAgentRuntimeRunRequest,
  type AgentRuntimeObserver,
  type AgentRuntimeRunContext,
  type AgentRuntimeRunIdentity,
} from "../src/main/lib/headless/agent-runtime-contract"
import type {
  DesktopRunContext,
  DesktopRunIdentity,
  DesktopRunProviderBinding,
} from "../src/main/lib/agent-runtime/desktop-run-request"
import type { DesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"

describe("runtime run contract", () => {
  test("desktop request extends the shared base and keeps desktop context", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "plan",
    })
    const emitted: unknown[] = []
    const request = createCodexDesktopRunRequest({
      runId: "run-1",
      jobId: "job-1",
      mode: "plan",
      preflight: {
        cwd: "/repo",
        chat: { id: "chat-1", projectId: "project-1" },
        subChat: { id: "sub-chat-1", chatId: "chat-1" },
        project: { id: "project-1", path: "/repo" },
      } as any,
      prompt: "Plan the change",
      permissionPolicy,
      providerBinding: {
        model: "gpt-5/high",
        modelSource: "request",
        providerProfileId: "profile-1",
        authMode: "provider-profile",
      },
      mcpServers: [{ name: "filesystem" }],
      signal: new AbortController().signal,
      emitTrace: (event) => emitted.push(event),
    })

    const shared:
      AgentRuntimeRunRequestBase<
        DesktopRunIdentity,
        DesktopRunContext,
        DesktopPermissionPolicy,
        DesktopRunProviderBinding
      > = request
    const trace: AgentRuntimeTraceObserver = request.trace

    trace.emit({ type: "status" })

    expect(shared.identity).toMatchObject({ runId: "run-1", jobId: "job-1" })
    expect(shared.context).toMatchObject({
      runtimeId: "codex",
      mode: "plan",
      source: "desktop",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/repo",
    })
    expect(shared.requestedCapabilities).toEqual(["planMode"])
    expect(request.mcp).toMatchObject({
      status: "ready",
      serverNames: ["filesystem"],
    })
    expect(request.providerBinding).not.toHaveProperty("apiKey")
    expect(request.providerBinding).not.toHaveProperty("headers")
    expect(emitted).toEqual([{ type: "status" }])
  })

  test("headless request extends the shared base without desktop fields", () => {
    const request = createAgentRuntimeRunRequest({
      jobId: "job-1",
      runtime: "codex",
      cwd: "/repo",
      mode: "agent",
      source: "api",
      prompt: "Run from the Local Job API",
      signal: new AbortController().signal,
      apiConsumerId: "consumer-1",
      apiConsumerRunId: "external-run-1",
      artifactBaseDir: "/artifacts/run-1",
      artifactManifestPath: "/artifacts/run-1/artifacts.json",
    })

    const shared:
      AgentRuntimeRunRequestBase<
        AgentRuntimeRunIdentity,
        AgentRuntimeRunContext,
        AgentRuntimePermissionPolicySummary,
        AgentRuntimeProviderReference | null
      > = request

    expect(shared.identity).toEqual({ jobId: "job-1", attempt: undefined })
    expect(shared.context).toMatchObject({
      runtimeId: "codex",
      mode: "agent",
      source: "api",
      cwd: "/repo",
      apiConsumerId: "consumer-1",
      apiConsumerRunId: "external-run-1",
      artifactBaseDir: "/artifacts/run-1",
    })
    expect(shared.requestedCapabilities).toEqual([])
    expect(shared.permissionPolicy).toMatchObject({
      kind: "headless-batch",
      interaction: "none",
      enforcement: "batch-adapter-capability-gate",
    })
    expect(shared.providerBinding).toBeNull()
    expect("chatId" in request.context).toBe(false)
    expect("subChatId" in request.context).toBe(false)
    expect("mcp" in request).toBe(false)
    expect("attachments" in request).toBe(false)
    expect("trace" in request).toBe(false)
  })

  test("headless observer conforms to the shared persisted observer shape", () => {
    const observer: AgentRuntimeObserver = {
      appendEvent(type, payload) {
        return {
          id: "event-1",
          jobId: "job-1",
          sequence: 1,
          type,
          payloadJson: JSON.stringify(payload ?? {}),
          createdAt: new Date("2026-06-15T00:00:00.000Z"),
        } as any
      },
      heartbeat() {
        return { id: "job-1", status: "running" } as any
      },
      isCancelRequested() {
        return false
      },
    }
    const persisted: AgentRuntimePersistedObserver = observer

    const event = persisted.appendEvent("status", { ok: true })

    expect(event).toMatchObject({
      jobId: "job-1",
      type: "status",
      payloadJson: '{"ok":true}',
    })
    expect(persisted.isCancelRequested()).toBe(false)
  })
})
