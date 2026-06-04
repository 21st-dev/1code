import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"
import { projects } from "../src/main/lib/db/schema"
import { listAgentJobs } from "../src/main/lib/headless/job-store"
import {
  createAgentSchedule,
  deleteAgentSchedule,
  evaluateDueAgentSchedules,
  listAgentScheduleRuns,
  listAgentSchedules,
  pauseAgentSchedule,
  resumeAgentSchedule,
  runAgentScheduleNow,
} from "../src/main/lib/headless/schedules"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function withTempProject<T>(callback: (paths: {
  root: string
  projectPath: string
  cwd: string
}) => T): T {
  const root = mkdtempSync(join(tmpdir(), "locus-schedules-"))
  const projectPath = join(root, "project")
  const cwd = join(projectPath, "workspace")
  mkdirSync(cwd, { recursive: true })
  try {
    return callback({ root, projectPath, cwd })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function seedProject(db: ReturnType<typeof createAgentJobTestDb>, path: string) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path,
    })
    .run()
}

describe("headless schedules", () => {
  test("creates schedules under registered projects and redacts prompt metadata", () => {
    withTempProject(({ projectPath, cwd }) => {
      const db = createAgentJobTestDb()
      seedProject(db, projectPath)
      const now = new Date("2026-06-03T01:00:00.000Z")
      const secret = "sk-abcdefghijklmnopqrstuvwxyz123456"

      const schedule = createAgentSchedule(db, {
        name: " Nightly check ",
        runtime: "claude-code",
        mode: "agent",
        cwd,
        prompt: `Review with ${secret}`,
        intervalSeconds: 60,
        now,
      })

      expect(schedule.name).toBe("Nightly check")
      expect(schedule.status).toBe("enabled")
      expect(schedule.projectId).toBe("project-1")
      expect(schedule.promptPreview).not.toContain(secret)
      expect(schedule.inputJson).not.toContain(secret)
      expect(schedule.nextRunAt?.toISOString()).toBe(
        "2026-06-03T01:01:00.000Z",
      )
      expect(listAgentSchedules(db)).toHaveLength(1)
    })
  })

  test("rejects unregistered cwd and symlink escapes", () => {
    withTempProject(({ root, projectPath }) => {
      const db = createAgentJobTestDb()
      seedProject(db, projectPath)
      const outside = join(root, "outside")
      mkdirSync(outside)
      const link = join(projectPath, "escape")
      symlinkSync(outside, link, "dir")

      expect(() =>
        createAgentSchedule(db, {
          name: "Outside",
          runtime: "codex",
          mode: "agent",
          cwd: outside,
          prompt: "No",
          intervalSeconds: 60,
        }),
      ).toThrow("registered project")

      expect(() =>
        createAgentSchedule(db, {
          name: "Symlink",
          runtime: "codex",
          mode: "agent",
          cwd: link,
          prompt: "No",
          intervalSeconds: 60,
        }),
      ).toThrow("registered project")
    })
  })

  test("run now creates a schedule job and audit run without moving next run", () => {
    withTempProject(({ projectPath, cwd }) => {
      const db = createAgentJobTestDb()
      seedProject(db, projectPath)
      const schedule = createAgentSchedule(db, {
        name: "Manual",
        runtime: "codex",
        mode: "plan",
        cwd,
        prompt: "Inspect",
        intervalSeconds: 300,
        nextRunAt: new Date("2026-06-03T02:00:00.000Z"),
        now: new Date("2026-06-03T01:00:00.000Z"),
      })

      const fired = runAgentScheduleNow(
        db,
        schedule.id,
        new Date("2026-06-03T01:05:00.000Z"),
      )

      expect(fired.job.source).toBe("schedule")
      expect(fired.job.status).toBe("queued")
      expect(fired.job.projectId).toBe("project-1")
      expect(fired.run.trigger).toBe("manual")
      expect(fired.schedule.lastJobId).toBe(fired.job.id)
      expect(fired.schedule.nextRunAt?.toISOString()).toBe(
        "2026-06-03T02:00:00.000Z",
      )
      expect(listAgentScheduleRuns(db, schedule.id)).toHaveLength(1)
      expect(listAgentJobs(db, { source: "schedule" })).toHaveLength(1)
    })
  })

  test("due evaluation fires enabled schedules once and advances next run", () => {
    withTempProject(({ projectPath, cwd }) => {
      const db = createAgentJobTestDb()
      seedProject(db, projectPath)
      const schedule = createAgentSchedule(db, {
        name: "Due",
        runtime: "claude-code",
        mode: "agent",
        cwd,
        prompt: "Run due work",
        intervalSeconds: 60,
        nextRunAt: new Date("2026-06-03T01:00:00.000Z"),
        now: new Date("2026-06-03T00:00:00.000Z"),
      })

      const fired = evaluateDueAgentSchedules(db, {
        now: new Date("2026-06-03T01:05:00.000Z"),
      })

      expect(fired).toHaveLength(1)
      expect(fired[0].job.source).toBe("schedule")
      expect(fired[0].run.scheduledFor?.toISOString()).toBe(
        "2026-06-03T01:00:00.000Z",
      )
      expect(fired[0].schedule.nextRunAt?.toISOString()).toBe(
        "2026-06-03T01:06:00.000Z",
      )
      expect(
        evaluateDueAgentSchedules(db, {
          now: new Date("2026-06-03T01:05:00.000Z"),
        }),
      ).toHaveLength(0)
      expect(listAgentScheduleRuns(db, schedule.id)).toHaveLength(1)
    })
  })

  test("pause, resume, and delete control due firing", () => {
    withTempProject(({ projectPath, cwd }) => {
      const db = createAgentJobTestDb()
      seedProject(db, projectPath)
      const schedule = createAgentSchedule(db, {
        name: "Control",
        runtime: "codex",
        mode: "agent",
        cwd,
        prompt: "Control",
        intervalSeconds: 60,
        nextRunAt: new Date("2026-06-03T01:00:00.000Z"),
        now: new Date("2026-06-03T00:00:00.000Z"),
      })

      expect(pauseAgentSchedule(db, schedule.id).status).toBe("paused")
      expect(
        evaluateDueAgentSchedules(db, {
          now: new Date("2026-06-03T01:05:00.000Z"),
        }),
      ).toHaveLength(0)

      const resumed = resumeAgentSchedule(
        db,
        schedule.id,
        new Date("2026-06-03T01:05:00.000Z"),
      )
      expect(resumed.status).toBe("enabled")
      expect(resumed.nextRunAt?.toISOString()).toBe("2026-06-03T01:06:00.000Z")

      const deleted = deleteAgentSchedule(
        db,
        schedule.id,
        new Date("2026-06-03T01:06:00.000Z"),
      )
      expect(deleted.status).toBe("disabled")
      expect(listAgentSchedules(db)).toHaveLength(0)
      expect(listAgentSchedules(db, { includeDisabled: true })).toHaveLength(1)
    })
  })

  test("due evaluation disables invalid project paths before creating jobs", () => {
    withTempProject(({ projectPath, cwd }) => {
      const db = createAgentJobTestDb()
      seedProject(db, projectPath)
      const schedule = createAgentSchedule(db, {
        name: "Deleted project",
        runtime: "claude-code",
        mode: "agent",
        cwd,
        prompt: "Run",
        intervalSeconds: 60,
        nextRunAt: new Date("2026-06-03T01:00:00.000Z"),
        now: new Date("2026-06-03T00:00:00.000Z"),
      })
      rmSync(projectPath, { recursive: true, force: true })

      expect(
        evaluateDueAgentSchedules(db, {
          now: new Date("2026-06-03T01:05:00.000Z"),
        }),
      ).toHaveLength(0)
      expect(listAgentJobs(db, { source: "schedule" })).toHaveLength(0)
      expect(listAgentSchedules(db, { includeDisabled: true })[0].id).toBe(
        schedule.id,
      )
      expect(listAgentSchedules(db, { includeDisabled: true })[0].status).toBe(
        "disabled",
      )
    })
  })
})
