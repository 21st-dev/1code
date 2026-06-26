import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import * as schema from "../src/main/lib/db/schema"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

const tempDirs: string[] = []
let testDb = createAgentJobTestDb()

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
  },
  shell: {
    trashItem: async () => {},
  },
}))

mock.module("../src/main/lib/db", () => ({
  ...schema,
  getDatabase: () => testDb,
}))

mock.module("../src/main/lib/claude", () => ({
  getBundledClaudeBinaryPath: () => "/tmp/locus-test-claude",
}))

mock.module("../src/main/lib/plugins", () => ({
  getPluginComponentPaths: () => ({ commands: "/tmp/locus-test-plugin" }),
}))

mock.module("../src/main/lib/plugins/runtime-gates", () => ({
  discoverAllowedClaudePluginRuntimeComponents: async () => [],
}))

mock.module("../src/main/lib/trpc/routers/claude-settings", () => ({
  getEnabledPlugins: async () => [],
}))

mock.module("../src/main/lib/runtime-executable", () => ({
  getRuntimeExecutableStatus: async () => ({ available: false }),
}))

const { filesRouter } = await import("../src/main/lib/trpc/routers/files")
const { commandsRouter } = await import("../src/main/lib/trpc/routers/commands")

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf-8")
}

beforeEach(() => {
  testDb = createAgentJobTestDb()
})

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("tRPC path boundaries", () => {
  test("file reads reject absolute paths outside registered roots", async () => {
    const projectPath = await makeTempDir("locus-files-project-")
    const secretRoot = await makeTempDir("locus-files-secret-")
    const allowedPath = join(projectPath, "src", "allowed.txt")
    const secretPath = join(secretRoot, "secret.txt")

    await writeText(allowedPath, "allowed")
    await writeText(secretPath, "SECRET_PAYLOAD")
    testDb
      .insert(schema.projects)
      .values({
        id: "project-files-boundary",
        name: "Files Boundary",
        path: projectPath,
      })
      .run()

    const caller = filesRouter.createCaller({ getWindow: () => null })

    await expect(
      caller.readFile({ filePath: allowedPath, projectPath }),
    ).resolves.toBe("allowed")
    await expect(
      caller.readFile({ filePath: secretPath, projectPath }),
    ).rejects.toThrow("Path escapes allowed directory")
    await expect(
      caller.readTextFile({ filePath: secretPath, projectPath }),
    ).rejects.toThrow("Path escapes allowed directory")
  })

  test("file reads reject attacker-selected unregistered roots", async () => {
    const rootPath = await makeTempDir("locus-files-unregistered-")
    const filePath = join(rootPath, "payload.txt")

    await writeText(filePath, "UNREGISTERED_PAYLOAD")

    const caller = filesRouter.createCaller({ getWindow: () => null })

    await expect(
      caller.readFile({ filePath, projectPath: rootPath }),
    ).rejects.toThrow("File read root is not registered")
  })

  test("file search and watch reject attacker-selected unregistered roots", async () => {
    const rootPath = await makeTempDir("locus-files-search-unregistered-")
    await writeText(join(rootPath, "payload.txt"), "UNREGISTERED_PAYLOAD")

    const caller = filesRouter.createCaller({ getWindow: () => null })

    await expect(
      caller.search({ projectPath: rootPath, query: "", limit: 50 }),
    ).rejects.toThrow("File read root is not registered")
    await expect(
      Promise.resolve().then(() => caller.watchChanges({ projectPath: rootPath })),
    ).rejects.toThrow("File read root is not registered")
  })

  test("file rename and delete reject targets outside registered roots", async () => {
    const projectPath = await makeTempDir("locus-files-write-project-")
    const secretRoot = await makeTempDir("locus-files-write-secret-")
    const allowedPath = join(projectPath, "src", "allowed.txt")
    const secretPath = join(secretRoot, "secret.txt")

    await writeText(allowedPath, "allowed")
    await writeText(secretPath, "SECRET_PAYLOAD")
    testDb
      .insert(schema.projects)
      .values({
        id: "project-files-write-boundary",
        name: "Files Write Boundary",
        path: projectPath,
      })
      .run()

    const caller = filesRouter.createCaller({ getWindow: () => null })

    await expect(
      caller.renameFile({
        projectPath,
        absolutePath: secretPath,
        newName: "renamed.txt",
      }),
    ).rejects.toThrow("Path escapes allowed directory")
    await expect(
      caller.deleteFile({ projectPath, absolutePath: secretPath }),
    ).rejects.toThrow("Path escapes allowed directory")
  })

  test("file rename rejects replacement names with traversal or separators", async () => {
    const projectPath = await makeTempDir("locus-files-rename-project-")
    const filePath = join(projectPath, "src", "allowed.txt")

    await writeText(filePath, "allowed")
    testDb
      .insert(schema.projects)
      .values({
        id: "project-files-rename-boundary",
        name: "Files Rename Boundary",
        path: projectPath,
      })
      .run()

    const caller = filesRouter.createCaller({ getWindow: () => null })

    await expect(
      caller.renameFile({
        projectPath,
        absolutePath: filePath,
        newName: "../escape.txt",
      }),
    ).rejects.toThrow("File name cannot contain path separators")
    await expect(
      caller.renameFile({
        projectPath,
        absolutePath: filePath,
        newName: "..",
      }),
    ).rejects.toThrow("Invalid file name")
  })

  test("command routes reject absolute paths outside command directories", async () => {
    const projectPath = await makeTempDir("locus-commands-project-")
    const secretRoot = await makeTempDir("locus-commands-secret-")
    const commandPath = join(projectPath, ".claude", "commands", "safe.md")
    const secretPath = join(secretRoot, "secret.md")

    await writeText(commandPath, "---\ndescription: Safe\n---\n\nsafe body\n")
    await writeText(secretPath, "SECRET_COMMAND_PAYLOAD")

    const caller = commandsRouter.createCaller({ getWindow: () => null })

    await expect(
      caller.getContent({
        path: ".claude/commands/safe.md",
        projectPath,
      }),
    ).resolves.toEqual({ content: "safe body" })
    await expect(
      caller.getContent({ path: secretPath, projectPath }),
    ).rejects.toThrow("Invalid command path")
    await expect(
      caller.update({
        path: secretPath,
        name: "secret",
        description: "secret",
        content: "overwrite",
        projectPath,
      }),
    ).rejects.toThrow("Absolute paths are not allowed")
    await expect(
      caller.delete({ path: secretPath, projectPath }),
    ).rejects.toThrow("Absolute paths are not allowed")
  })
})
