import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import {
  projects,
  worktreeSetupTrustDecisions,
} from "../src/main/lib/db/schema"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []
const worktreesToRemove: string[] = []
let testDb = createAgentJobTestDb()

mock.module("../src/main/lib/db", () => ({
  getDatabase: () => testDb,
  projects,
  worktreeSetupTrustDecisions,
}))

const { createWorktreeForChat } = await import("../src/main/lib/git/worktree")

type ApprovalRequest = Parameters<
  NonNullable<
    Parameters<typeof createWorktreeForChat>[5]
  >["onSetupApprovalRequired"]
>[0]

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd })
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8")
}

async function makeGitProject(): Promise<string> {
  const projectPath = await makeTempDir("locus-worktree-rce-project-")

  await git(projectPath, ["init", "-b", "main"])
  await git(projectPath, ["config", "user.email", "test@example.com"])
  await git(projectPath, ["config", "user.name", "Test User"])
  await writeFile(join(projectPath, "README.md"), "# test\n", "utf-8")
  await git(projectPath, ["add", "README.md"])
  await git(projectPath, ["commit", "-m", "initial commit"])

  return projectPath
}

beforeEach(() => {
  testDb = createAgentJobTestDb()
})

afterEach(async () => {
  await Promise.all(
    worktreesToRemove
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("worktree setup RCE regression", () => {
  test("does not execute untrusted .cursor setup commands when creating a chat worktree", async () => {
    const projectPath = await makeGitProject()
    const payloadPath = join(
      await makeTempDir("locus-worktree-rce-payload-"),
      "pwned",
    )
    const maliciousCommand = `node -e "require('fs').writeFileSync(${JSON.stringify(payloadPath)}, 'owned')"`

    testDb
      .insert(projects)
      .values({
        id: "project-cursor-rce",
        name: "Cursor RCE Regression",
        path: projectPath,
      })
      .run()

    await writeJson(join(projectPath, ".cursor/worktrees.json"), {
      "setup-worktree": [maliciousCommand],
    })

    let approvalRequest: ApprovalRequest | null = null
    const result = await createWorktreeForChat(
      projectPath,
      "cursor-rce-regression",
      "chat-cursor-rce",
      "main",
      "local",
      {
        projectId: "project-cursor-rce",
        onSetupApprovalRequired: (request) => {
          approvalRequest = request
        },
      },
    )

    if (result.worktreePath) {
      worktreesToRemove.push(result.worktreePath)
    }

    expect(result.success).toBe(true)
    expect(existsSync(payloadPath)).toBe(false)
    expect(approvalRequest).toMatchObject({
      projectId: "project-cursor-rce",
      chatId: "chat-cursor-rce",
      source: "cursor",
      configPath: ".cursor/worktrees.json",
      commands: [maliciousCommand],
    })
    expect(approvalRequest?.commandHash).toBeString()
    expect(approvalRequest?.worktreePath).toBe(result.worktreePath)
  })
})
