import { describe, expect, test } from "bun:test"
import {
  createDesktopRunContextFromPreflight,
  createDesktopRunMcpReadiness,
  type DesktopRunRequest,
  getDesktopRunRequestedCapabilities,
  withDesktopRunAttempt,
  withDesktopRunMcpReadiness,
} from "../src/main/lib/agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { DesktopRunPreflightResult } from "../src/main/lib/agent-runtime/preflight"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"

describe("desktop run request contract", () => {
  test("creates desktop context from verified preflight", () => {
    const context = createDesktopRunContextFromPreflight(
      "claude-code",
      "agent",
      {
        kind: "project",
        cwd: "/tmp/project",
        project: { id: "project-1" },
        chat: { id: "chat-1" },
        subChat: { id: "sub-chat-1" },
      } as DesktopRunPreflightResult,
    )

    expect(context).toEqual({
      runtimeId: "claude-code",
      mode: "agent",
      source: "desktop",
      executionProfile: "interactive",
      workspaceKind: "project",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project",
    })
  })

  test("creates folderless desktop context with explicit null project", () => {
    const context = createDesktopRunContextFromPreflight(
      "claude-code",
      "agent",
      {
        kind: "folderless",
        cwd: "/tmp/locus-scratch",
        project: null,
        chat: { id: "quick-chat-1" },
        subChat: { id: "quick-sub-chat-1" },
      } as DesktopRunPreflightResult,
    )

    expect(context).toEqual({
      runtimeId: "claude-code",
      mode: "agent",
      source: "desktop",
      executionProfile: "interactive",
      workspaceKind: "folderless",
      projectId: null,
      chatId: "quick-chat-1",
      subChatId: "quick-sub-chat-1",
      cwd: "/tmp/locus-scratch",
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
        workspaceKind: "project",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Plan the change",
      requestedCapabilities:
        getDesktopRunRequestedCapabilities(permissionPolicy),
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

  test("folderless assistant requests declare quick-chat capability only", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "plan",
      workspaceKind: "folderless",
      hasScopeContract: true,
    })

    expect(permissionPolicy.controlLevel).toBe("assistant")
    expect(getDesktopRunRequestedCapabilities(permissionPolicy)).toEqual([
      "quickChatAssistant",
    ])
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
        workspaceKind: "project",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Inspect MCP",
      requestedCapabilities:
        getDesktopRunRequestedCapabilities(permissionPolicy),
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
        workspaceKind: "project",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Retry safely",
      requestedCapabilities:
        getDesktopRunRequestedCapabilities(permissionPolicy),
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
