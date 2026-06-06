import { describe, expect, test } from "bun:test"
import {
  createDesktopRunContextFromPreflight,
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
    const request = {
      identity: { runId: "run-1", jobId: "job-1" },
      context: {
        runtimeId: "codex",
        mode: "plan",
        projectId: "project-1",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project",
      },
      prompt: "Plan the change",
      permissionPolicy: resolveDesktopPermissionPolicy({
        runtimeId: "codex",
        mode: "plan",
      }),
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
    expect(emitted).toEqual([event])
  })
})
