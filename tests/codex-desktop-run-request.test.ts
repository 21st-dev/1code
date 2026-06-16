import { describe, expect, test } from "bun:test"
import { createCodexDesktopRunRequest } from "../src/main/lib/codex/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"

describe("Codex desktop run request", () => {
  test("maps verified route inputs into the shared DesktopRunRequest contract", () => {
    const emitted: any[] = []
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode: "plan",
    })
    const abortController = new AbortController()

    const request = createCodexDesktopRunRequest({
      runId: "run-1",
      jobId: "job-1",
      mode: "plan",
      preflight: {
        kind: "project",
        cwd: "/repo",
        chat: { id: "chat-1", projectId: "project-1" },
        subChat: { id: "sub-1", chatId: "chat-1" },
        project: { id: "project-1", path: "/repo" },
      } as any,
      prompt: "hello",
      permissionPolicy,
      providerBinding: {
        model: "gpt-5/high",
        modelSource: "request",
        providerProfileId: "profile-1",
        gatewayEndpoint: "http://127.0.0.1:1234/v1",
        authMode: "provider-profile",
      },
      mcpServers: [{ name: "filesystem" }],
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

    expect(request.identity).toEqual({ runId: "run-1", jobId: "job-1" })
    expect(request.context).toMatchObject({
      runtimeId: "codex",
      mode: "plan",
      source: "desktop",
      workspaceKind: "project",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    })
    expect(request.requestedCapabilities).toEqual(["planMode"])
    expect(request.providerBinding).toMatchObject({
      model: "gpt-5/high",
      modelSource: "request",
      providerProfileId: "profile-1",
      gatewayEndpoint: "http://127.0.0.1:1234/v1",
      authMode: "provider-profile",
      diagnostics: [
        {
          id: "permission-policy-1",
          status: "ready",
          message:
            "Plan mode denies project/workspace side effects; Locus may still persist local app state.",
        },
      ],
    })
    expect(request.mcp).toEqual({
      status: "ready",
      serverNames: ["filesystem"],
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
      runtimeId: "codex",
      sequence: 1,
      type: "started",
      createdAt: "2026-06-07T00:00:00.000Z",
      payload: { message: "started" },
    })
    request.trace.emit(event)
    expect(emitted).toEqual([event])
  })
})
