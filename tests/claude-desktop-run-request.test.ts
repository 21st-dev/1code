import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"
import { createClaudeDesktopRunRequest } from "../src/main/lib/claude/desktop-run-request"

describe("Claude desktop run request", () => {
  test("maps verified route inputs into the shared DesktopRunRequest contract", () => {
    const emitted: any[] = []
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    })
    const abortController = new AbortController()

    const request = createClaudeDesktopRunRequest({
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
        providerProfileId: "profile-1",
        gatewayEndpoint: "http://127.0.0.1:1234/v1",
        authMode: "provider-profile",
      },
      images: [
        {
          attachmentId: "image-1",
          localRef: "local-image",
          mediaType: "image/png",
          filename: "screen.png",
          sizeBytes: 123,
        },
      ],
      longTextAttachments: [
        {
          attachmentId: "text-1",
          localRef: "local-text",
          filename: "notes.txt",
          byteLength: 456,
        },
      ],
      signal: abortController.signal,
      resumeSessionId: "session-1",
      parentSessionId: "parent-1",
      emitTrace: (event) => emitted.push(event),
    })

    expect(request.identity).toEqual({
      runId: "run-1",
      streamId: "stream-1",
      jobId: "job-1",
    })
    expect(request.context).toMatchObject({
      runtimeId: "claude-code",
      mode: "agent",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    })
    expect(request.providerBinding).toMatchObject({
      model: "claude-sonnet-4",
      modelSource: "request",
      providerProfileId: "profile-1",
      gatewayEndpoint: "http://127.0.0.1:1234/v1",
      authMode: "provider-profile",
      diagnostics: [
        {
          id: "permission-policy-1",
          status: "ready",
          message:
            "Agent mode permits runtime side effects according to the selected runtime capability state.",
        },
      ],
    })
    expect(request.mcp).toEqual({
      status: "skipped",
      serverNames: [],
      blockers: [],
    })
    expect(request.attachments).toEqual([
      {
        kind: "image",
        attachmentId: "image-1",
        localRef: "local-image",
        mediaType: "image/png",
        filename: "screen.png",
        byteLength: 123,
      },
      {
        kind: "long-text",
        attachmentId: "text-1",
        localRef: "local-text",
        filename: "notes.txt",
        byteLength: 456,
      },
    ])
    expect(request.session).toEqual({
      resumeSessionId: "session-1",
      parentSessionId: "parent-1",
    })
    expect(request.signal).toBe(abortController.signal)

    const event = createRunEvent({
      runId: "run-1",
      jobId: "job-1",
      runtimeId: "claude-code",
      sequence: 1,
      type: "started",
      createdAt: "2026-06-07T00:00:00.000Z",
      payload: { message: "started" },
    })
    request.trace.emit(event)
    expect(emitted).toEqual([event])
  })
})
