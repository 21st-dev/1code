import { describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"
import { projects } from "../src/main/lib/db/schema"
import { createCodexAppServerHeadlessTaskRunner } from "../src/main/lib/headless/adapters/codex-app-server"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"
import { LOCAL_JOB_API_VERSION } from "../src/shared/local-job-api"

const appServerRuns: DesktopRunRequest[] = []

const {
  createLocalJobApiJob,
  getLocalJobApiEvents,
  toLocalJobApiResultEnvelope,
  writeLocalJobApiFinalArtifacts,
  writeLocalJobApiInitialArtifacts,
} = await import("../src/main/lib/headless/local-job-api")
const { appendAgentJobEvent, listAgentJobEvents } = await import(
  "../src/main/lib/headless/job-store"
)
const { runPersistedAgentJob } = await import(
  "../src/main/lib/headless/job-runner"
)
const { assertLocalJobApiCreateRequest } = await import(
  "../src/shared/local-job-api"
)

const fakeAppServerRunner = createCodexAppServerHeadlessTaskRunner({
  createDesktopAdapter: () => ({
    metadata: {
      runtimeId: "codex",
      source: "codex-app-server",
      label: "Codex app-server adapter",
      temporaryFallback: false,
    },
    async run(request: DesktopRunRequest) {
      appServerRuns.push(request)
      request.trace.emit(
        createRunEvent({
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          runtimeId: "codex",
          sequence: 1,
          type: "status",
          payload: {
            status: "desktop_runtime_adapter_started",
            adapterSource: "codex-app-server",
          },
        }),
      )
      request.trace.emit(
        createRunEvent({
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          runtimeId: "codex",
          sequence: 2,
          type: "assistant_delta",
          payload: { text: "app-server local job response" },
        }),
      )
      request.trace.emit(
        createRunEvent({
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          runtimeId: "codex",
          sequence: 3,
          type: "usage_update",
          payload: {
            inputTokens: 5,
            outputTokens: 7,
            totalTokens: 12,
          },
        }),
      )
      request.trace.emit(
        createRunEvent({
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          runtimeId: "codex",
          sequence: 4,
          type: "completed",
          payload: { status: "succeeded" },
        }),
      )
      return {
        status: "succeeded",
        sessionId: "app-server-session-1",
        usage: {
          inputTokens: 5,
          outputTokens: 7,
          totalTokens: 12,
        },
      }
    },
  }),
})

function seedProject(db: ReturnType<typeof createAgentJobTestDb>, path: string) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Policy Grant Project",
      path,
    })
    .run()
}

describe("Local Job API Codex app-server profile", () => {
  test("runs only when policy-grant profile is explicit and persists replay artifacts", async () => {
    appServerRuns.length = 0
    const db = createAgentJobTestDb()
    const projectRoot = realpathSync(mkdtempSync(join(tmpdir(), "locus-app-server-")))
    try {
      const packageDir = join(projectRoot, "package")
      mkdirSync(packageDir)
      seedProject(db, projectRoot)
      const request = assertLocalJobApiCreateRequest({
        apiVersion: LOCAL_JOB_API_VERSION,
        consumer: {
          id: "docs-workbench",
          runExternalId: "app-server-001",
        },
        project: {
          cwd: packageDir,
        },
        runtime: {
          id: "codex",
          executionProfile: "policy-grant",
          policyGrant: {
            scopes: ["workspace:file-write"],
          },
        },
        mode: "agent",
        prompt: {
          text: "Use the gated app-server adapter.",
        },
        artifacts: {
          baseDir: join(packageDir, ".locus", "runs"),
          writePolicy: "metadata-only",
        },
      })
      const prepared = createLocalJobApiJob(db, request, "test")
      const initialArtifacts = writeLocalJobApiInitialArtifacts({
        runDir: prepared.runDir,
        request: prepared.request,
        job: prepared.job,
        events: listAgentJobEvents(db, prepared.job.id),
      })
      appendAgentJobEvent(db, {
        jobId: prepared.job.id,
        type: "artifact_created",
        payload: { artifacts: initialArtifacts },
      })

      const result = await runPersistedAgentJob({
        db,
        jobId: prepared.job.id,
        runner: fakeAppServerRunner,
      })
      const finalArtifacts = writeLocalJobApiFinalArtifacts({
        runDir: prepared.runDir,
        job: result.job,
        events: listAgentJobEvents(db, result.job.id),
      })
      const apiEvents = getLocalJobApiEvents(db, prepared.job.id)
      const resultEnvelope = toLocalJobApiResultEnvelope(
        result.job,
        finalArtifacts,
      )

      expect(appServerRuns).toHaveLength(1)
      expect(appServerRuns[0].context.cwd).toBe(packageDir)
      expect(appServerRuns[0].permissionPolicy.runtimeMapping).toMatchObject({
        runtime: "codex",
        adapterSource: "codex-app-server",
        approvalGateFailure: "fail-closed",
      })
      expect(result.job).toMatchObject({
        status: "succeeded",
        runtime: "codex",
        source: "api",
        exitCode: 0,
      })
      expect(resultEnvelope.result).toMatchObject({
        adapterSource: "codex-app-server",
        sessionId: "app-server-session-1",
      })
      expect(apiEvents.map((event) => event.type)).toEqual([
        "job_created",
        "artifact_created",
        "job_started",
        "status",
        "assistant_delta",
        "status",
        "completed",
      ])
      expect(apiEvents[3].payload).toMatchObject({
        status: "desktop_runtime_adapter_started",
        adapterSource: "codex-app-server",
      })
      expect(apiEvents[4].payload).toEqual({
        text: "app-server local job response",
      })
      expect(prepared.runDir).toBeTruthy()
      expect(existsSync(join(prepared.runDir!, "request.json"))).toBe(true)
      expect(existsSync(join(prepared.runDir!, "events.jsonl"))).toBe(true)
      expect(existsSync(join(prepared.runDir!, "result.json"))).toBe(true)
      expect(
        readFileSync(join(prepared.runDir!, "result.json"), "utf-8"),
      ).toContain("codex-app-server")
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
