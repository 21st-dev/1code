import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setElectronUserDataPathProviderForTest } from "../src/main/lib/electron-app"
import {
  getManagedSkillRegistryStatePath,
  installRegistrySkill,
  listManagedSkillInstallRecords,
  listRegistrySkills,
  setSkillRegistryRuntimeRootProviderForTest,
} from "../src/main/lib/skills/registry"

const tempRoots: string[] = []

afterEach(async () => {
  setElectronUserDataPathProviderForTest(null)
  setSkillRegistryRuntimeRootProviderForTest(null)
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "locus-skill-registry-state-"))
  tempRoots.push(root)
  return root
}

describe("skill registry managed install state", () => {
  test("stores registry installs as Locus canonical state", async () => {
    const root = await createTempRoot()
    const home = join(root, "home")
    const userDataDir = join(root, "user-data")
    await mkdir(home, { recursive: true })
    await mkdir(userDataDir, { recursive: true })
    setElectronUserDataPathProviderForTest(() => userDataDir)
    setSkillRegistryRuntimeRootProviderForTest((runtime) =>
      join(home, runtime === "codex" ? ".codex" : ".claude"),
    )

    const installed = await installRegistrySkill({
      id: "find-skills",
      runtime: "codex",
    })

    const installPath = join(home, ".codex", "skills", "find-skills")
    expect(installed.status).toBe("installed")
    expect(installed.installPath).toBe(installPath)

    const records = await listManagedSkillInstallRecords()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: "find-skills",
      registryId: "locus-core-skills",
      version: "1.0.0",
      contentHash:
        "9cce43cc9a19538ed44988f81456813146530413bd27736cf355b2b93986c6b8",
      sourceType: "bundled",
      source: "skills/find-skills",
      eligibleRuntimes: ["claude", "codex"],
      runtimes: {
        codex: {
          runtime: "codex",
          installPath,
        },
      },
    })

    const rawState = JSON.parse(
      await readFile(getManagedSkillRegistryStatePath(userDataDir), "utf-8"),
    )
    expect(rawState.installed["find-skills"].runtimes.codex.installPath).toBe(
      installPath,
    )

    await rm(join(home, ".codex", "skill-registry-state.json"), { force: true })
    const listed = (await listRegistrySkills({ runtime: "codex" })).find(
      (skill) => skill.id === "find-skills",
    )
    expect(listed?.status).toBe("installed")
    expect(listed?.installedHash).toBe(
      "9cce43cc9a19538ed44988f81456813146530413bd27736cf355b2b93986c6b8",
    )
  })
})
