import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import {
  createClaudeAgentSdkDesktopJob,
  createClaudeAgentSdkDesktopRunStartup,
} from "../src/main/lib/claude/agent-sdk-desktop-job"

describe("Claude Agent SDK desktop job setup", () => {
  test("creates a Claude desktop job and matching stream event mapper", () => {
    const db = {} as any
    const registrations: any[] = []
    const mapperInputs: any[] = []
    const cancel = () => {}

    const setup = createClaudeAgentSdkDesktopJob({
      db,
      mode: "agent",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
      prompt: "hello",
      runId: "run-1",
      cancel,
      dependencies: {
        createAndRegisterDesktopChatAgentJob: (dbArg, input) => {
          registrations.push({ db: dbArg, input })
          return {
            job: { id: "job-1" },
            workerId: "worker-1",
            cwd: input.cwd,
          } as any
        },
        createDesktopStreamEventMapper: (input) => {
          mapperInputs.push(input)
          return { map: () => [] }
        },
      },
    })

    expect(setup.jobId).toBe("job-1")
    expect(setup.handle.workerId).toBe("worker-1")
    expect(registrations).toEqual([
      {
        db,
        input: {
          runtime: "claude-code",
          mode: "agent",
          chatId: "chat-1",
          subChatId: "sub-1",
          cwd: "/repo",
          prompt: "hello",
          runId: "run-1",
          cancel,
        },
      },
    ])
    expect(mapperInputs).toEqual([
      {
        runtimeId: "claude-code",
        runId: "run-1",
        jobId: "job-1",
      },
    ])
  })

  test("creates desktop job and DesktopRunRequest as one startup unit", () => {
    const db = {} as any
    const cancel = () => {}
    const emitted: any[] = []
    const abortController = new AbortController()
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    })

    const startup = createClaudeAgentSdkDesktopRunStartup({
      db,
      mode: "agent",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
      prompt: "hello",
      runId: "run-1",
      cancel,
      streamId: "stream-1",
      preflight: {
        cwd: "/repo",
        chat: { id: "chat-1", projectId: "project-1" },
        subChat: { id: "sub-1", chatId: "chat-1" },
        project: { id: "project-1", path: "/repo" },
      } as any,
      permissionPolicy,
      customConfig: {
        model: "profile-model",
        baseUrl: "https://provider.example.com",
      },
      requestedModel: "request-model",
      modelSource: "provider:profile-1",
      selectedProviderProfileId: "profile-1",
      signal: abortController.signal,
      requestedSessionId: "session-1",
      existingSessionId: "session-0",
      emitTrace: (event) => emitted.push(event),
      dependencies: {
        createAndRegisterDesktopChatAgentJob: (_dbArg, input) =>
          ({
            job: { id: "job-1" },
            workerId: "worker-1",
            cwd: input.cwd,
          }) as any,
        createDesktopStreamEventMapper: () => ({ map: () => [] }),
      },
    })

    expect(startup.desktopJob.jobId).toBe("job-1")
    expect(startup.resumeSessionId).toBe("session-1")
    expect(startup.desktopRunRequest.identity).toEqual({
      runId: "run-1",
      streamId: "stream-1",
      jobId: "job-1",
    })
    expect(startup.desktopRunRequest.context).toMatchObject({
      runtimeId: "claude-code",
      mode: "agent",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    })
    expect(startup.desktopRunRequest.providerBinding).toMatchObject({
      model: "profile-model",
      modelSource: "provider:profile-1",
      providerProfileId: "profile-1",
      gatewayEndpoint: "https://provider.example.com",
      authMode: "provider-profile",
    })
    expect(startup.desktopRunRequest.session).toEqual({
      resumeSessionId: "session-1",
      parentSessionId: "session-1",
    })
    expect(startup.desktopRunRequest.trace.emit).toBeDefined()
    expect(emitted).toEqual([])
  })
})
