import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { DesktopRunPreflightResult } from "../src/main/lib/agent-runtime/preflight"
import { createQwenDesktopRunRequest } from "../src/main/lib/qwen/desktop-run-request"

describe("Qwen desktop run request", () => {
  test("builds a Qwen-only desktop request from shared preflight and permission owners", () => {
    const preflight = {
      kind: "project",
      cwd: "/tmp/qwen-project",
      chat: { id: "chat-1" },
      subChat: { id: "sub-1" },
      project: { id: "project-1" },
    } as DesktopRunPreflightResult
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "qwen-code",
      mode: "agent",
    })
    const traceEvents: unknown[] = []
    const request = createQwenDesktopRunRequest({
      runId: "run-1",
      jobId: "job-1",
      mode: "agent",
      preflight,
      prompt: "Review this repo.",
      permissionPolicy,
      signal: new AbortController().signal,
      emitTrace: (event) => traceEvents.push(event),
    })

    expect(request.context).toMatchObject({
      runtimeId: "qwen-code",
      source: "desktop",
      executionProfile: "interactive",
      workspaceKind: "project",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/tmp/qwen-project",
    })
    expect(request.providerBinding).toMatchObject({
      model: "qwen-code",
      modelSource: "runtime-managed",
      authMode: "runtime-managed",
    })
    expect(request.providerBinding.diagnostics?.[0]).toMatchObject({
      id: "permission-policy-1",
      status: "ready",
    })
    expect(request.permissionPolicy.runtimeMapping).toMatchObject({
      runtime: "qwen-code",
      adapterSource: "qwen-acp-client",
    })
    expect(request.attachments).toEqual([])
    expect(request.mcp).toEqual({
      status: "ready",
      serverNames: [],
      blockers: [],
    })
    request.trace.emit({} as any)
    expect(traceEvents).toHaveLength(1)
  })
})
