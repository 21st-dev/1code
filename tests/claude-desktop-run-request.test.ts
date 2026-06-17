import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"
import {
  createClaudeDesktopProviderBinding,
  createClaudeDesktopRunRequest,
  createClaudeDesktopRunRequestFromRuntimeStartup,
  resolveClaudeDesktopRunResumeSessionId,
} from "../src/main/lib/claude/desktop-run-request"

describe("Claude desktop run request", () => {
  test("creates provider binding metadata for profile, app-managed, and runtime-managed auth", () => {
    expect(
      createClaudeDesktopProviderBinding({
        customConfig: {
          model: "profile-model",
          baseUrl: "https://gateway.example/v1",
        },
        requestedModel: "request-model",
        modelSource: "provider:profile-1",
        selectedProviderProfileId: "profile-1",
      }),
    ).toEqual({
      model: "profile-model",
      modelSource: "provider:profile-1",
      providerProfileId: "profile-1",
      gatewayEndpoint: "https://gateway.example/v1",
      authMode: "provider-profile",
    })

    expect(
      createClaudeDesktopProviderBinding({
        customConfig: {
          model: "custom-model",
          baseUrl: "http://127.0.0.1:11434/v1",
        },
        requestedModel: "request-model",
        modelSource: "custom-provider",
      }),
    ).toMatchObject({
      model: "custom-model",
      providerProfileId: null,
      authMode: "app-managed",
    })

    expect(
      createClaudeDesktopProviderBinding({
        customConfig: null,
        requestedModel: "request-model",
        modelSource: "request",
      }),
    ).toEqual({
      model: "request-model",
      modelSource: "request",
      providerProfileId: null,
      gatewayEndpoint: null,
      authMode: "runtime-managed",
    })
  })

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
        kind: "project",
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
      source: "desktop",
      workspaceKind: "project",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    })
    expect(request.requestedCapabilities).toEqual([])
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
            "Observed agent mode permits ordinary runtime actions, records tool decisions, and blocks catastrophic actions when runtime hooks are available.",
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

  test("resolves resume session metadata from requested and existing sessions", () => {
    expect(
      resolveClaudeDesktopRunResumeSessionId({
        requestedSessionId: "requested-session",
        existingSessionId: "existing-session",
      }),
    ).toBe("requested-session")

    expect(
      resolveClaudeDesktopRunResumeSessionId({
        requestedSessionId: "",
        existingSessionId: "existing-session",
      }),
    ).toBe("existing-session")

    expect(resolveClaudeDesktopRunResumeSessionId({})).toBeUndefined()
  })

  test("creates DesktopRunRequest from runtime startup metadata", () => {
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "plan",
    })
    const abortController = new AbortController()

    const request = createClaudeDesktopRunRequestFromRuntimeStartup({
      runId: "run-1",
      streamId: "stream-1",
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
      customConfig: {
        model: "profile-model",
        baseUrl: "http://127.0.0.1:1234/v1",
      },
      requestedModel: "request-model",
      modelSource: "provider-profile:profile-1",
      selectedProviderProfileId: "profile-1",
      signal: abortController.signal,
      requestedSessionId: "",
      existingSessionId: "existing-session",
      emitTrace: () => {},
    })

    expect(request.providerBinding).toMatchObject({
      model: "profile-model",
      modelSource: "provider-profile:profile-1",
      providerProfileId: "profile-1",
      gatewayEndpoint: "http://127.0.0.1:1234/v1",
      authMode: "provider-profile",
    })
    expect(request.session).toEqual({
      resumeSessionId: "existing-session",
      parentSessionId: "",
    })
  })
})
