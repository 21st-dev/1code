import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  detectWorktreeConfig,
  detectWorktreeSetupPlan,
  getSetupCommands,
} from "../src/main/lib/git/worktree-config"

const tempDirs: string[] = []

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "locus-worktree-test-"))
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

describe("worktree config detection", () => {
  test("uses custom path before built-in config locations", async () => {
    const project = await makeProject()
    await writeJson(join(project, ".locus/worktree.json"), {})
    await writeJson(join(project, "custom.json"), {
      "setup-worktree": ["custom"],
    })

    const detected = await detectWorktreeConfig(project, "custom.json")

    expect(detected.source).toBe("custom")
    expect(detected.path).toBe(join(project, "custom.json"))
    expect(detected.config).toEqual({ "setup-worktree": ["custom"] })
  })

  test("prefers .locus over .cursor and legacy .1code", async () => {
    const project = await makeProject()
    await writeJson(join(project, ".locus/worktree.json"), {
      "setup-worktree": ["locus"],
    })
    await writeJson(join(project, ".cursor/worktrees.json"), {
      "setup-worktree": ["cursor"],
    })
    await writeJson(join(project, ".1code/worktree.json"), {
      "setup-worktree": ["legacy"],
    })

    const detected = await detectWorktreeConfig(project)

    expect(detected.source).toBe("locus")
    expect(detected.config).toEqual({ "setup-worktree": ["locus"] })
  })

  test("falls back from cursor to legacy .1code only when newer configs are absent", async () => {
    const project = await makeProject()
    await writeJson(join(project, ".1code/worktree.json"), {
      "setup-worktree": ["legacy"],
    })

    expect((await detectWorktreeConfig(project)).source).toBe("1code")

    await writeJson(join(project, ".cursor/worktrees.json"), {
      "setup-worktree": ["cursor"],
    })
    const detected = await detectWorktreeConfig(project)

    expect(detected.source).toBe("cursor")
    expect(detected.config).toEqual({ "setup-worktree": ["cursor"] })
  })

  test("falls through invalid custom config to .locus", async () => {
    const project = await makeProject()
    await mkdir(project, { recursive: true })
    await writeFile(join(project, "custom.json"), "{invalid json", "utf-8")
    await writeJson(join(project, ".locus/worktree.json"), {
      "setup-worktree": ["locus"],
    })

    const detected = await detectWorktreeConfig(project, "custom.json")

    expect(detected.source).toBe("locus")
    expect(detected.config).toEqual({ "setup-worktree": ["locus"] })
  })

  test("selects platform setup commands before generic fallback", () => {
    const platformSpecific =
      process.platform === "win32"
        ? { "setup-worktree-windows": ["win"], "setup-worktree": ["generic"] }
        : { "setup-worktree-unix": ["unix"], "setup-worktree": ["generic"] }

    expect(getSetupCommands(platformSpecific)).toEqual([
      process.platform === "win32" ? "win" : "unix",
    ])
    expect(getSetupCommands({ "setup-worktree": "generic" })).toBe("generic")
    expect(getSetupCommands({ "setup-worktree": ["  "] })).toBeNull()
  })

  test("detects cursor setup commands as a plan without executing them", async () => {
    const project = await makeProject()
    await writeJson(join(project, ".cursor/worktrees.json"), {
      "setup-worktree": ["echo cursor setup", "  bun install  "],
    })

    const plan = await detectWorktreeSetupPlan(project)

    expect(plan).toEqual({
      source: "cursor",
      configPath: join(project, ".cursor/worktrees.json"),
      commands: ["echo cursor setup", "bun install"],
    })
  })
})
