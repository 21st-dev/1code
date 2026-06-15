import { describe, expect, test } from "bun:test"
import {
  createAgentJob,
  listAgentJobEvents,
} from "../src/main/lib/headless/job-store"
import { getLocalJobApiEvents } from "../src/main/lib/headless/local-job-api"
import { runPersistedAgentJob } from "../src/main/lib/headless/job-runner"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

const SECRET = "sk-abcdefghijklmnopqrstuvwxyz123456"

function parsePayload(event: { payloadJson: string }) {
  return JSON.parse(event.payloadJson || "{}")
}

describe("headless runtime event bridge", () => {
  test("persists headless job events through redacted RunEvent payloads without exposing RunEvent internals", async () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "api",
      runtime: "codex",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: "Run through the bridge",
      apiConsumerId: "docs-workbench",
    })

    await runPersistedAgentJob({
      db,
      jobId: job.id,
      runner: async (_request, observer) => {
        observer.appendEvent("status", {
          status: "runtime_selected",
          authorization: `Bearer ${SECRET}`,
        })
        observer.appendEvent("assistant_delta", {
          text: `hello ${SECRET}`,
        })
        observer.appendEvent("command_started", {
          label: "node",
          args: ["-e", `console.log('access_token=${SECRET}')`],
        })
        observer.appendEvent("command_output", {
          stream: "stderr",
          text: `warn bearer ${SECRET}`,
        })
        observer.appendEvent("error", {
          errorCode: "runtime_auth_required",
          errorMessage: `failed with access_token=${SECRET}`,
        })
        return {
          status: "failed",
          exitCode: 1,
          errorCode: "runtime_auth_required",
          errorMessage: `failed with ${SECRET}`,
          result: {
            stderr: `Bearer ${SECRET}`,
          },
        }
      },
    })

    const events = listAgentJobEvents(db, job.id)
    const payloads = events.map(parsePayload)
    const persistedJson = payloads.map((payload) => JSON.stringify(payload)).join("\n")

    expect(events.map((event) => event.type)).toEqual([
      "job_created",
      "job_started",
      "status",
      "assistant_delta",
      "command_started",
      "command_output",
      "error",
      "completed",
    ])
    expect(payloads[3]).toEqual({ text: "hello <redacted>" })
    expect(payloads[3]).not.toHaveProperty("runId")
    expect(payloads[3]).not.toHaveProperty("runEventSequence")
    expect(payloads[4]).toMatchObject({
      label: "node",
      args: ["-e", expect.stringContaining("access_token=")],
    })
    expect(JSON.stringify(payloads[4])).not.toContain(SECRET)
    expect(payloads[7]).toMatchObject({
      status: "failed",
      exitCode: 4,
      errorCode: "runtime_auth_required",
      result: {
        stderr: "Bearer <redacted>",
      },
    })
    expect(persistedJson).not.toContain(SECRET)
    expect(persistedJson).not.toContain("Bearer sk-")
  })

  test("keeps Local Job API v1 events readable after bridge redaction", async () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "api",
      runtime: "claude-code",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: "Run through Local Job API",
      apiConsumerId: "docs-workbench",
    })

    await runPersistedAgentJob({
      db,
      jobId: job.id,
      runner: async (_request, observer) => {
        observer.appendEvent("status", { status: "runtime_selected" })
        observer.appendEvent("assistant_delta", { text: "hello" })
        observer.appendEvent("command_started", {
          label: "node",
          args: ["-e", "console.error('warn')"],
        })
        observer.appendEvent("command_output", {
          stream: "stderr",
          text: "warn",
        })
        observer.appendEvent("error", {
          errorCode: "runtime_warning",
          errorMessage: "warning",
        })
        return {
          status: "failed",
          exitCode: 1,
          errorCode: "runtime_warning",
          errorMessage: "warning",
        }
      },
    })

    const apiEvents = getLocalJobApiEvents(db, job.id)
    const assistant = apiEvents.find((event) => event.type === "assistant_delta")
    const statusEvents = apiEvents.filter((event) => event.type === "status")
    const commandStarted = statusEvents.find(
      (event) => (event.payload as { label?: string }).label === "node",
    )
    const commandOutput = statusEvents.find(
      (event) => (event.payload as { stream?: string }).stream === "stderr",
    )
    const error = apiEvents.find((event) => event.type === "error")
    const completed = apiEvents.find((event) => event.type === "completed")

    expect(apiEvents.map((event) => event.type)).toEqual([
      "job_created",
      "job_started",
      "status",
      "assistant_delta",
      "status",
      "status",
      "error",
      "completed",
    ])
    expect(assistant?.payload).toEqual({ text: "hello" })
    expect(commandStarted?.payload).toEqual({
      label: "node",
      args: ["-e", "console.error('warn')"],
    })
    expect(commandOutput?.payload).toEqual({
      stream: "stderr",
      text: "warn",
    })
    expect(error?.payload).toEqual({
      errorCode: "runtime_warning",
      errorMessage: "warning",
    })
    expect(completed?.payload).toMatchObject({
      status: "failed",
      exitCode: 1,
      errorCode: "runtime_warning",
    })
  })
})
