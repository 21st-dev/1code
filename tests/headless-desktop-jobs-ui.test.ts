import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const repoRoot = join(__dirname, "..")

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf-8")
}

describe("headless desktop jobs UI", () => {
    test("exposes a dedicated agent jobs router", () => {
      const routerIndex = read("src/main/lib/trpc/routers/index.ts")
      const routerSource = read("src/main/lib/trpc/routers/agent-jobs.ts")
      expect(routerIndex).toContain("agentJobs: agentJobsRouter")
    expect(routerSource).toContain("serializeAgentJob")
    expect(routerSource).toContain('source: sourceSchema.default("cli")')
      expect(routerSource).not.toContain("inputJson")
    })

    test("exposes a dedicated agent schedules router", () => {
      const routerIndex = read("src/main/lib/trpc/routers/index.ts")
      const routerSource = read("src/main/lib/trpc/routers/agent-schedules.ts")
      expect(routerIndex).toContain("agentSchedules: agentSchedulesRouter")
      expect(routerSource).toContain("listAgentSchedules")
      expect(routerSource).toContain("runAgentScheduleNow")
      expect(routerSource).toContain("serializeAgentSchedule")
      expect(routerSource).not.toContain("inputJson")
    })

  test("runs stale job recovery during desktop startup", () => {
    const source = read("src/main/index.ts")
    const startupSection = source.slice(
      source.indexOf("// Initialize database"),
      source.indexOf("// Create main window"),
    )

    expect(startupSection).toContain("const db = initDatabase()")
    expect(startupSection).toContain("recoverStaleAgentJobs(db)")
  })

  test("shows local jobs in Agent Workbench without replacing chat tasks", () => {
    const source = read("src/renderer/features/agents/workbench/agent-workbench.tsx")
    expect(source).toContain("HeadlessJobCard")
    expect(source).toContain("trpc.agentJobs.list.useQuery")
      expect(source).toContain('source: "desktop"')
      expect(source).toContain('source: "cli"')
      expect(source).toContain('source: "daemon"')
      expect(source).toContain('source: "schedule"')
      expect(source).toContain('source: "protocol"')
      expect(source).toContain('source: "api"')
      expect(source).toContain("trpc.agentSchedules.list.useQuery")
      expect(source).toContain("ScheduleCard")
      expect(source).toContain("trpc.agentJobs.cancel.useMutation")
      expect(source).toContain("trpc.agentJobs.retry.useMutation")
      expect(source).toContain("trpc.agentSchedules.runNow.useMutation")
      expect(source).toContain("trpc.agentSchedules.pause.useMutation")
      expect(source).toContain("trpc.agentSchedules.resume.useMutation")
      expect(source).toContain("trpc.agentSchedules.delete.useMutation")
      expect(source).toContain("HeadlessJobLogsDialog")
      expect(source).toContain("JOB_EVENT_LABEL_KEYS")
      expect(source).toContain("getSemanticPayload(event)")
      expect(source).toContain('t("workbench.rawPayload")')
      expect(source).toContain("trpc.agentWorkbench.listTasks.useQuery")
    })

  test("counts and filters local jobs alongside workbench tasks", () => {
    const source = read("src/renderer/features/agents/workbench/agent-workbench.tsx")
    expect(source).toContain("matchesHeadlessJobFilter")
    expect(source).toContain("getHeadlessJobCounts")
    expect(source).toContain("mergeWorkbenchCounts")
      expect(source).toContain("visibleHeadlessJobs")
      expect(source).toContain("schedules.length === 0")
      expect(source).toContain("getWorkbenchFilterCount(counts, item)")
      expect(source).toContain('job.source !== "desktop"')
      expect(source).toContain('job.source !== "api"')
      expect(source).not.toContain("tasks.length === 0 && headlessJobs.length === 0")
  })

  test("shows Local Job API metadata in Agent Workbench without raw request payloads", () => {
    const source = read("src/renderer/features/agents/workbench/agent-workbench.tsx")
    expect(source).toContain("HeadlessJobApiMetadata")
    expect(source).toContain('job.source === "api"')
    expect(source).toContain("apiConsumerId")
    expect(source).toContain("apiConsumerRunId")
    expect(source).toContain("artifactManifestPath")
    expect(source).toContain("artifactBaseDir")
    expect(source).toContain('t("workbench.apiConsumer")')
    expect(source).toContain('t("workbench.apiExternalRun")')
    expect(source).toContain('t("workbench.apiArtifacts")')
    expect(source).not.toContain("inputJson")
  })

  test("adds English and Chinese run labels", () => {
    const dictionary = read("src/renderer/lib/i18n/dictionaries.ts")
    for (const key of [
      "workbench.headlessJobs",
      "workbench.jobSource.desktop",
      "workbench.rawPayload",
      "workbench.event.assistantDelta",
      "workbench.event.guardDecision",
      "workbench.event.mcpNeedsAuth",
      "workbench.event.completed",
      "workbench.jobSource.cli",
        "workbench.jobSource.daemon",
        "workbench.jobSource.schedule",
        "workbench.jobSource.protocol",
        "workbench.jobSource.api",
        "workbench.apiConsumer",
        "workbench.apiExternalRun",
        "workbench.apiArtifacts",
        "workbench.schedules",
        "workbench.runScheduleNow",
        "workbench.pauseSchedule",
        "workbench.resumeSchedule",
        "workbench.deleteSchedule",
        "workbench.jobStatus.running",
      "workbench.jobStatus.succeeded",
      "workbench.jobStatus.interrupted",
      "workbench.cancelJob",
      "workbench.retryJob",
    ]) {
      expect(dictionary).toContain(`"${key}"`)
    }
  })

  test("counts active desktop, CLI, daemon, schedule, protocol, and API runs in the sidebar badge", () => {
      const source = read("src/renderer/features/sidebar/agents-sidebar.tsx")
      expect(source).toContain('source: "desktop"')
      expect(source).toContain('source: "cli"')
      expect(source).toContain('source: "daemon"')
      expect(source).toContain('source: "schedule"')
      expect(source).toContain('source: "protocol"')
      expect(source).toContain('source: "api"')
      expect(source).toContain("activeJobCount")
    expect(source).toContain('job.status === "queued" || job.status === "running"')
  })
})
