import { describe, expect, test } from "bun:test"
import { runProcessAgentTask } from "../src/main/lib/headless/process-runner"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
} from "../src/main/lib/headless/agent-runtime-contract"
import type { AgentJobEventType } from "../src/shared/agent-jobs"

function createObserver(options: { cancelAfterHeartbeat?: boolean } = {}) {
  const events: Array<{ type: AgentJobEventType; payload: unknown }> = []
  let heartbeatCount = 0
  const observer: AgentRuntimeObserver = {
    appendEvent(type, payload) {
      events.push({ type, payload })
      return {
        id: `event_${events.length}`,
        jobId: "job_123",
        sequence: events.length,
        type,
        payloadJson: JSON.stringify(payload ?? {}),
        createdAt: new Date(),
      }
    },
    heartbeat() {
      heartbeatCount += 1
      return {
        id: "job_123",
        retryOfJobId: null,
        attempt: 1,
        source: "cli",
        runtime: "codex",
        status: "running",
        mode: "agent",
        cwd: process.cwd(),
        projectId: null,
        chatId: null,
        subChatId: null,
        promptPreview: null,
        inputJson: null,
        createdAt: new Date(),
        startedAt: new Date(),
        finishedAt: null,
        exitCode: null,
        errorCode: null,
        errorMessage: null,
        resultJson: null,
        createdByVersion: null,
        workerId: "worker",
        workerPid: process.pid,
        workerStartedAt: new Date(),
        heartbeatAt: new Date(),
        cancelRequestedAt: options.cancelAfterHeartbeat ? new Date() : null,
        cancelRequestedBy: options.cancelAfterHeartbeat ? "test" : null,
      }
    },
    isCancelRequested() {
      return options.cancelAfterHeartbeat && heartbeatCount > 0
    },
  }
  return { observer, events }
}

function request(signal: AbortSignal): AgentRuntimeRunRequest {
  return {
    jobId: "job_123",
    runtime: "codex",
    cwd: process.cwd(),
    mode: "agent",
    prompt: "test",
    signal,
  }
}

describe("headless process runner", () => {
  test("captures stdout and stderr as normalized events", async () => {
    const controller = new AbortController()
    const { observer, events } = createObserver()
    const result = await runProcessAgentTask({
      request: request(controller.signal),
      observer,
      executable: process.execPath,
      args: [
        "-e",
        "console.log('hello from stdout'); console.error('warn from stderr')",
      ],
      label: "node",
    })

    expect(result.status).toBe("succeeded")
    expect(result.result).toMatchObject({
      finalMessage: "hello from stdout",
      stdout: "hello from stdout",
      stderr: "warn from stderr",
    })
    expect(events.map((event) => event.type)).toContain("command_started")
    expect(events.map((event) => event.type)).toContain("assistant_delta")
    expect(events.map((event) => event.type)).toContain("command_output")
    expect(events.map((event) => event.type)).toContain("command_finished")
  })

  test("cancels a running child process when the signal aborts", async () => {
    const controller = new AbortController()
    const { observer } = createObserver()
    const promise = runProcessAgentTask({
      request: request(controller.signal),
      observer,
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10_000)"],
      label: "node",
    })
    setTimeout(() => controller.abort(), 50)

    const result = await promise
    expect(result.status).toBe("canceled")
    expect(result.errorCode).toBe("job_canceled")
  })

  test("classifies login failures as runtime auth requirements", async () => {
    const controller = new AbortController()
    const { observer } = createObserver()
    const result = await runProcessAgentTask({
      request: request(controller.signal),
      observer,
      executable: process.execPath,
      args: ["-e", "console.log('Not logged in · Please run /login'); process.exit(1)"],
      label: "Claude Code",
    })

    expect(result.status).toBe("failed")
    expect(result.errorCode).toBe("runtime_auth_required")
    expect(result.errorMessage).toBe("Claude Code authentication is required.")
  })
})
