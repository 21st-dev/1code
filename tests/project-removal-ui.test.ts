import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { en, zhCN } from "../src/renderer/lib/i18n/dictionaries"

const projectsTabSource = readFileSync(
  join(
    process.cwd(),
    "src/renderer/components/dialogs/settings-tabs/agents-project-worktree-tab.tsx",
  ),
  "utf8",
)

function sourceBetween(start: string, end: string): string {
  const startIndex = projectsTabSource.indexOf(start)
  const endIndex = projectsTabSource.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return projectsTabSource.slice(startIndex, endIndex)
}

describe("project removal settings UI", () => {
  test("keeps removed projects in a separate history and recovery surface", () => {
    expect(projectsTabSource).toContain("trpc.projects.listRemoved.useQuery")
    expect(projectsTabSource).toContain("RemovedProjectDetail")
    expect(projectsTabSource).toContain("settings.projects.removedProjects")
    expect(projectsTabSource).toContain("settings.projects.activeProjects")
    expect(projectsTabSource).toContain('kind: "removed"')
    expect(projectsTabSource).toContain('kind: "active"')
  })

  test("keeps delete-history out of the active project detail", () => {
    const activeDetail = sourceBetween(
      "function ProjectDetail",
      "function RemovedProjectDetail",
    )
    const removedDetail = sourceBetween(
      "function RemovedProjectDetail",
      "// --- Main Two-Panel Component ---",
    )

    expect(activeDetail).toContain("trpc.projects.delete.useMutation")
    expect(activeDetail).not.toContain("trpc.projects.deleteHistory")
    expect(removedDetail).toContain("trpc.projects.restore.useMutation")
    expect(removedDetail).toContain("trpc.projects.deleteHistory.useMutation")
    expect(removedDetail).toContain("settings.projects.restoreProject")
    expect(removedDetail).toContain("settings.projects.deleteProjectHistory")
  })

  test("localizes distinct remove, restore, and delete-history copy", () => {
    for (const key of [
      "settings.projects.removeProjectConfirmWithCounts",
      "settings.projects.removedProjects",
      "settings.projects.restoreProject",
      "settings.projects.deleteProjectHistory",
      "settings.projects.deleteProjectHistoryConfirmWithCounts",
      "settings.projects.deleteProjectHistoryBlockedByJobs",
      "settings.projects.toast.historyDeleted",
    ] as const) {
      expect(en[key]).toBeTruthy()
      expect(zhCN[key]).toBeTruthy()
    }

    expect(en["settings.projects.removeProjectConfirmWithCounts"]).toContain(
      "are kept",
    )
    expect(
      en["settings.projects.deleteProjectHistoryConfirmWithCounts"],
    ).toContain("permanently deletes")
    expect(
      zhCN["settings.projects.deleteProjectHistoryConfirmWithCounts"],
    ).toContain("永久删除")
  })
})
