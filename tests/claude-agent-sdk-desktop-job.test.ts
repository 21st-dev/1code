import { describe, expect, test } from "bun:test"
import { createClaudeAgentSdkDesktopJob } from "../src/main/lib/claude/agent-sdk-desktop-job"

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
})
