import { describe, expect, test } from "bun:test"
import {
  createDesktopRunMcpReadiness,
  createDesktopRunContextFromPreflight,
  getDesktopRunRequestedCapabilities,
  withDesktopRunAttempt,
  withDesktopRunMcpReadiness,
  type DesktopRunRequest,
} from "../src/main/lib/agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"

describe("desktop run request contract", () => {
  test("creates desktop context from verified preflight", () => {
    const context = createDesktopRunContextFromPreflight(
      "claude-code",
      "agent",
      {
        cwd: "/tmp/project",
        project: { id: "project-1" },
        chat: { id: "chat-1" },
        subChat: { id: "sub-chat-1" },
      } as any,
    )

    expect(context).toEqual({
      runtimeId: "claude-code",
      mode: "agent",
      source: "desktop",
      executionProfile: "interactive",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project",
    })
  })

  test("request shape excludes renderer secrets and carries policy plus trace", () => {
    const event = createRunEvent({
      runId: "run-1",
      runtimeId: "codex",
      sequence: 1,
      type: "status",
      payload: { status: "ready" },
    })
    const emitted: unknown[] = []
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "plan",
    })
    const request = {
      identity: { runId: "run-1", jobId: "job-1" },
      context: {
        runtimeId: "codex",
        mode: "plan",
        source: "desktop",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Plan the change",
      requestedCapabilities: getDesktopRunRequestedCapabilities(permissionPolicy),
      permissionPolicy,
      providerBinding: {
        model: "gpt-codex",
        providerProfileId: "profile-1",
        authMode: "provider-profile",
      },
      mcp: { status: "ready", serverNames: [], blockers: [] },
      attachments: [],
      trace: { emit: (nextEvent) => emitted.push(nextEvent) },
      signal: new AbortController().signal,
      session: {},
    } satisfies DesktopRunRequest

    request.trace.emit(event)

    expect(request.providerBinding).not.toHaveProperty("apiKey")
    expect(request.providerBinding).not.toHaveProperty("headers")
    expect(request.requestedCapabilities).toEqual(["planMode"])
    expect(emitted).toEqual([event])
  })

  test("adds sorted MCP readiness to a desktop request without mutating it", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    })
    const request = {
      identity: { runId: "run-1", jobId: "job-1" },
      context: {
        runtimeId: "claude-code",
        mode: "agent",
        source: "desktop",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Inspect MCP",
      requestedCapabilities: getDesktopRunRequestedCapabilities(permissionPolicy),
      permissionPolicy,
      providerBinding: {},
      mcp: { status: "skipped", serverNames: [], blockers: [] },
      attachments: [],
      trace: { emit: () => {} },
      signal: new AbortController().signal,
      session: {},
    } satisfies DesktopRunRequest

    const readiness = createDesktopRunMcpReadiness({
      status: "ready",
      serverNames: ["zeta", "github"],
    })
    const updated = withDesktopRunMcpReadiness(request, readiness)

    expect(readiness).toEqual({
      status: "ready",
      serverNames: ["github", "zeta"],
      blockers: [],
    })
    expect(updated).not.toBe(request)
    expect(updated.mcp).toEqual(readiness)
    expect(request.mcp).toEqual({
      status: "skipped",
      serverNames: [],
      blockers: [],
    })
  })

  test("adds adapter attempt identity without mutating the base request", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    })
    const request = {
      identity: { runId: "run-1", jobId: "job-1" },
      context: {
        runtimeId: "claude-code",
        mode: "agent",
        source: "desktop",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Retry safely",
      requestedCapabilities: getDesktopRunRequestedCapabilities(permissionPolicy),
      permissionPolicy,
      providerBinding: {},
      mcp: { status: "skipped", serverNames: [], blockers: [] },
      attachments: [],
      trace: { emit: () => {} },
      signal: new AbortController().signal,
      session: {},
    } satisfies DesktopRunRequest

    const attemptRequest = withDesktopRunAttempt(request, 2)

    expect(attemptRequest).not.toBe(request)
    expect(attemptRequest.identity).toEqual({
      runId: "run-1",
      jobId: "job-1",
      attempt: 2,
    })
    expect(request.identity).toEqual({ runId: "run-1", jobId: "job-1" })
  })
})
