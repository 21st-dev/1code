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

  test("shows CLI jobs in Agent Workbench without replacing chat tasks", () => {
    const source = read("src/renderer/features/agents/workbench/agent-workbench.tsx")
    expect(source).toContain("HeadlessJobCard")
    expect(source).toContain("trpc.agentJobs.list.useQuery")
    expect(source).toContain("trpc.agentJobs.cancel.useMutation")
    expect(source).toContain("trpc.agentJobs.retry.useMutation")
    expect(source).toContain("HeadlessJobLogsDialog")
    expect(source).toContain("trpc.agentWorkbench.listTasks.useQuery")
  })

  test("counts and filters CLI jobs alongside workbench tasks", () => {
    const source = read("src/renderer/features/agents/workbench/agent-workbench.tsx")
    expect(source).toContain("matchesHeadlessJobFilter")
    expect(source).toContain("getHeadlessJobCounts")
    expect(source).toContain("mergeWorkbenchCounts")
    expect(source).toContain("visibleHeadlessJobs")
    expect(source).toContain("getWorkbenchFilterCount(counts, item)")
    expect(source).not.toContain("tasks.length === 0 && headlessJobs.length === 0")
  })

  test("adds English and Chinese job labels", () => {
    const dictionary = read("src/renderer/lib/i18n/dictionaries.ts")
    for (const key of [
      "workbench.headlessJobs",
      "workbench.jobStatus.running",
      "workbench.jobStatus.succeeded",
      "workbench.jobStatus.interrupted",
      "workbench.cancelJob",
      "workbench.retryJob",
    ]) {
      expect(dictionary).toContain(`"${key}"`)
    }
  })
})
