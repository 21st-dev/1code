import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { projects } from "../src/main/lib/db/schema"
import {
  getWorktreeSetupTrustStatus,
  recordWorktreeSetupApproval,
  type WorktreeSetupTrustDatabase,
} from "../src/main/lib/git/worktree-setup-trust"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

const tempDirs: string[] = []

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "locus-worktree-trust-test-"))
  tempDirs.push(dir)
  return dir
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value), "utf-8")
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("worktree setup trust", () => {
  test("requires approval before trusting repository setup commands", async () => {
    const db = createAgentJobTestDb()
    const trustDb = db as unknown as WorktreeSetupTrustDatabase
    const projectPath = await makeProject()
    db.insert(projects)
      .values({
        id: "project-setup-trust",
        name: "Trust Project",
        path: projectPath,
      })
      .run()
    await writeJson(join(projectPath, ".locus/worktree.json"), {
      "setup-worktree": ["bun install"],
    })

    const firstStatus = await getWorktreeSetupTrustStatus({
      projectId: "project-setup-trust",
      projectPath,
      db: trustDb,
    })

    expect(firstStatus.status).toBe("untrusted")
    if (firstStatus.status !== "untrusted") {
      throw new Error("expected untrusted status")
    }
    expect(firstStatus.request.commands).toEqual(["bun install"])

    recordWorktreeSetupApproval({
      projectId: "project-setup-trust",
      request: firstStatus.request,
      db: trustDb,
    })

    const approvedStatus = await getWorktreeSetupTrustStatus({
      projectId: "project-setup-trust",
      projectPath,
      db: trustDb,
    })

    expect(approvedStatus.status).toBe("approved")

    await writeJson(join(projectPath, ".locus/worktree.json"), {
      "setup-worktree": ["bun install", "bun run build"],
    })

    const changedStatus = await getWorktreeSetupTrustStatus({
      projectId: "project-setup-trust",
      projectPath,
      db: trustDb,
    })

    expect(changedStatus.status).toBe("untrusted")
    if (changedStatus.status !== "untrusted") {
      throw new Error("expected changed setup to require approval")
    }
    expect(changedStatus.request.commandHash).not.toBe(
      firstStatus.request.commandHash,
    )
  })
})
