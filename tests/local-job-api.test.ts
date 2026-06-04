import { describe, expect, test } from "bun:test"
import {
  AGENT_JOB_EVENT_TYPES,
  AGENT_JOB_SOURCES,
} from "../src/shared/agent-jobs"
import {
  LOCAL_JOB_API_VERSION,
  validateLocalJobApiCreateRequest,
} from "../src/shared/local-job-api"
import { createAgentJob, getAgentJob } from "../src/main/lib/headless/job-store"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

describe("Local Job API v1 shared contract", () => {
  test("normalizes a generic local-package create request", () => {
    const request = validateLocalJobApiCreateRequest({
      apiVersion: LOCAL_JOB_API_VERSION,
      consumer: {
        id: "docs-workbench",
        runExternalId: "package-review-001",
      },
      project: {
        cwd: process.cwd(),
      },
      runtime: {
        id: "claude",
        requiredCapabilities: ["planMode"],
      },
      mode: "plan",
      prompt: {
        text: "Review this local package.",
      },
      input: {
        contract: "example.local-package.v1",
        packageDir: `${process.cwd()}/fixtures/local-package`,
      },
      artifacts: {
        baseDir: `${process.cwd()}/fixtures/local-package/.locus/runs`,
        writePolicy: "proposal-only",
      },
    })

    expect(request).toMatchObject({
      ok: true,
      request: {
        apiVersion: LOCAL_JOB_API_VERSION,
        consumer: {
          id: "docs-workbench",
          runExternalId: "package-review-001",
        },
        runtime: {
          id: "claude-code",
          requiredCapabilities: ["planMode"],
        },
        mode: "plan",
        artifacts: {
          writePolicy: "proposal-only",
        },
      },
    })
  })

  test("rejects secret-like request fields and values", () => {
    const request = validateLocalJobApiCreateRequest({
      apiVersion: LOCAL_JOB_API_VERSION,
      consumer: { id: "docs-workbench" },
      project: { cwd: process.cwd() },
      runtime: { id: "codex" },
      mode: "plan",
      prompt: { text: "Review this package." },
      input: {
        contract: "example.local-package.v1",
        authorization: "Bearer secret-token-value",
      },
    })

    expect(request.ok).toBe(false)
    if (!request.ok) {
      expect(request.errors.join("\n")).toContain(
        "input.authorization is not accepted",
      )
    }
  })

  test("does not echo unsupported selector values in validation errors", () => {
    const secretLike = "sk-abcdefghijklmnopqrstuvwxyz123456"
    const request = validateLocalJobApiCreateRequest({
      apiVersion: LOCAL_JOB_API_VERSION,
      consumer: { id: "docs-workbench" },
      project: { cwd: process.cwd() },
      runtime: {
        id: secretLike,
        requiredCapabilities: [secretLike],
      },
      mode: secretLike,
      prompt: { text: "Review this package." },
      artifacts: {
        writePolicy: secretLike,
      },
    })

    expect(request.ok).toBe(false)
    if (!request.ok) {
      const message = request.errors.join("\n")
      expect(message).toContain("Unsupported runtime.id")
      expect(message).toContain("Unsupported required capability")
      expect(message).toContain("Unsupported mode")
      expect(message).toContain("Unsupported artifacts.writePolicy")
      expect(message).not.toContain(secretLike)
    }
  })

  test("declares API source and artifact event type", () => {
    expect(AGENT_JOB_SOURCES).toContain("api")
    expect(AGENT_JOB_EVENT_TYPES).toContain("artifact_created")
  })

  test("persists sanitized API metadata on local jobs", () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "api",
      runtime: "codex",
      mode: "plan",
      cwd: process.cwd(),
      prompt: "Create a proposal only.",
      input: {
        prompt: "Create a proposal only.",
        consumer: { id: "docs-workbench" },
      },
      apiConsumerId: "docs-workbench",
      apiConsumerRunId: "package-review-001",
      artifactBaseDir: `${process.cwd()}/.tmp/locus-runs`,
      artifactManifestPath: `${process.cwd()}/.tmp/locus-runs/${Date.now()}/artifacts.json`,
    })

    expect(getAgentJob(db, job.id)).toMatchObject({
      source: "api",
      apiConsumerId: "docs-workbench",
      apiConsumerRunId: "package-review-001",
      artifactBaseDir: `${process.cwd()}/.tmp/locus-runs`,
    })
  })
})
