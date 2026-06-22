import { describe, expect, test } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { createAgentJob } from "../src/main/lib/headless/job-store"
import {
  getProjectRegistrationForCwd,
  getRegisteredProjectForCwdOrThrow,
  registerProjectForPath,
  unregisterProjectForPath,
} from "../src/main/lib/projects/registry"
import { LOCAL_JOB_API_PROJECT_NOT_REGISTERED } from "../src/shared/local-job-api"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function withTempDir<T>(
  callback: (root: string) => T | Promise<T>,
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "locus-project-registry-"))
  return Promise.resolve(callback(root)).finally(() => {
    rmSync(root, { recursive: true, force: true })
  })
}

describe("project registry", () => {
  test("registers canonical paths and dedupes aliases", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const projectPath = join(root, "project")
      const aliasPath = join(root, "project-link")
      mkdirSync(projectPath)
      symlinkSync(projectPath, aliasPath, "dir")

      const registered = await registerProjectForPath({
        db,
        path: aliasPath,
        name: "Alias Project",
        gitInfo: {
          remoteUrl: "https://github.com/example/repo.git",
          provider: "github",
          owner: "example",
          repo: "repo",
        },
      })
      const duplicate = await registerProjectForPath({
        db,
        path: projectPath,
        name: "Duplicate Name",
      })

      expect(duplicate.created).toBe(false)
      expect(duplicate.project.id).toBe(registered.project.id)
      expect(duplicate.project.name).toBe("Alias Project")
      expect(duplicate.project.path).toBe(realpathSync(projectPath))
      expect(duplicate.project.gitRemoteUrl).toBe(
        "https://github.com/example/repo.git",
      )
      expect(db.select().from(projects).all()).toHaveLength(1)
    })
  })

  test("keeps git metadata best-effort and refreshes existing rows when requested", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const projectPath = join(root, "project")
      mkdirSync(projectPath)

      const registered = await registerProjectForPath({
        db,
        path: projectPath,
        gitInfoProvider: async () => {
          throw new Error("git unavailable")
        },
      })
      expect(registered.project.gitRemoteUrl).toBeNull()

      const refreshed = await registerProjectForPath({
        db,
        path: projectPath,
        refreshExistingGitInfo: true,
        gitInfo: {
          remoteUrl: "git@github.com:example/refreshed.git",
          provider: "github",
          owner: "example",
          repo: "refreshed",
        },
      })

      expect(refreshed.created).toBe(false)
      expect(refreshed.project.id).toBe(registered.project.id)
      expect(refreshed.project.gitRemoteUrl).toBe(
        "git@github.com:example/refreshed.git",
      )
      expect(refreshed.project.gitRepo).toBe("refreshed")
    })
  })

  test("reports cwd membership without mutating registration state", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const projectPath = join(root, "project")
      const cwd = join(projectPath, "workspace")
      const outside = join(root, "outside")
      mkdirSync(cwd, { recursive: true })
      mkdirSync(outside)
      const registered = await registerProjectForPath({
        db,
        path: projectPath,
      })

      expect(
        getProjectRegistrationForCwd({
          db,
          cwd,
        }),
      ).toMatchObject({
        registered: true,
        cwd: realpathSync(cwd),
        project: {
          id: registered.project.id,
        },
      })

      expect(
        getProjectRegistrationForCwd({
          db,
          cwd: outside,
        }),
      ).toMatchObject({
        registered: false,
        cwd: realpathSync(outside),
        project: null,
      })
      expect(db.select().from(projects).all()).toHaveLength(1)

      expect(() =>
        getRegisteredProjectForCwdOrThrow({
          db,
          cwd: outside,
          label: "API run cwd",
        }),
      ).toThrow("registered project")
      try {
        getRegisteredProjectForCwdOrThrow({
          db,
          cwd: outside,
          label: "API run cwd",
        })
      } catch (error) {
        expect((error as { code?: string }).code).toBe(
          LOCAL_JOB_API_PROJECT_NOT_REGISTERED,
        )
      }
    })
  })

  test("unregister refuses active jobs unless forced", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const projectPath = join(root, "project")
      mkdirSync(projectPath)
      const registered = await registerProjectForPath({
        db,
        path: projectPath,
      })
      createAgentJob(db, {
        source: "api",
        runtime: "codex",
        mode: "plan",
        cwd: registered.project.path,
        prompt: "Queued API work",
        projectId: registered.project.id,
      })

      const refused = unregisterProjectForPath({
        db,
        path: projectPath,
      })
      expect(refused).toMatchObject({
        removed: false,
        reason: "active_jobs",
        activeJobs: [{ status: "queued", source: "api" }],
      })
      expect(db.select().from(projects).all()).toHaveLength(1)

      const removed = unregisterProjectForPath({
        db,
        path: projectPath,
        force: true,
      })
      expect(removed).toMatchObject({
        removed: true,
        project: {
          id: registered.project.id,
        },
      })
      const allProjects = db.select().from(projects).all()
      expect(allProjects).toHaveLength(1)
      expect(allProjects[0]?.removedAt).toBeInstanceOf(Date)
    })
  })

  test("register restores a removed project instead of creating a duplicate", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const projectPath = join(root, "project")
      mkdirSync(projectPath)
      const registered = await registerProjectForPath({
        db,
        path: projectPath,
      })

      const removed = unregisterProjectForPath({
        db,
        path: projectPath,
      })
      expect(removed.removed).toBe(true)
      expect(
        getProjectRegistrationForCwd({
          db,
          cwd: projectPath,
        }).registered,
      ).toBe(false)

      const restored = await registerProjectForPath({
        db,
        path: projectPath,
      })
      expect(restored).toMatchObject({
        created: false,
        restored: true,
        project: {
          id: registered.project.id,
        },
      })
      expect(restored.project.removedAt).toBeNull()
      expect(db.select().from(projects).all()).toHaveLength(1)
    })
  })

  test("unregister preserves chats and sub-chats until history deletion", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const projectPath = join(root, "project")
      mkdirSync(projectPath)
      const registered = await registerProjectForPath({
        db,
        path: projectPath,
      })
      db.insert(chats)
        .values({
          id: "chat-1",
          projectId: registered.project.id,
          name: "Saved chat",
        })
        .run()
      db.insert(subChats)
        .values({
          id: "sub-chat-1",
          chatId: "chat-1",
          messages: "[]",
          mode: "agent",
        })
        .run()

      const removed = unregisterProjectForPath({
        db,
        path: projectPath,
      })

      expect(removed.removed).toBe(true)
      expect(db.select().from(projects).all()).toHaveLength(1)
      expect(db.select().from(chats).all()).toHaveLength(1)
      expect(db.select().from(subChats).all()).toHaveLength(1)
      expect(db.select().from(projects).get()?.removedAt).toBeInstanceOf(Date)
    })
  })

  test("unregister matches deleted project paths through the nearest existing symlink ancestor", async () => {
    await withTempDir(async (root) => {
      const db = createAgentJobTestDb()
      const realParent = join(root, "real-parent")
      const aliasParent = join(root, "alias-parent")
      mkdirSync(realParent)
      symlinkSync(realParent, aliasParent, "dir")

      const projectPathViaAlias = join(aliasParent, "deleted-project")
      mkdirSync(projectPathViaAlias)
      const registered = await registerProjectForPath({
        db,
        path: projectPathViaAlias,
      })
      expect(registered.project.path).toBe(realpathSync(projectPathViaAlias))

      rmSync(projectPathViaAlias, { recursive: true, force: true })
      const removed = unregisterProjectForPath({
        db,
        path: projectPathViaAlias,
      })

      expect(removed).toMatchObject({
        removed: true,
        canonicalPath: registered.project.path,
        project: {
          id: registered.project.id,
        },
      })
      const allProjects = db.select().from(projects).all()
      expect(allProjects).toHaveLength(1)
      expect(allProjects[0]?.removedAt).toBeInstanceOf(Date)
    })
  })
})
