import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setElectronUserDataPathProviderForTest } from "../src/main/lib/electron-app"
import {
  getManagedSkillRegistryStatePath,
  installRegistrySkill,
  listManagedSkillInstallRecords,
  listRegistrySkills,
  rollbackRegistrySkill,
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
    expect(listed?.projection).toMatchObject({
      kind: "skill",
      capabilityId: "find-skills",
      runtimeId: "codex",
      state: "available",
      source: {
        type: "registry",
        id: "locus-core-skills",
        version: "1.0.0",
      },
    })
    expect(listed?.installedHash).toBe(
      "9cce43cc9a19538ed44988f81456813146530413bd27736cf355b2b93986c6b8",
    )
  })

  test("preserves update, modified, and rollback status from managed state", async () => {
    const root = await createTempRoot()
    const home = join(root, "home")
    const userDataDir = join(root, "user-data")
    const userSkillDir = join(home, ".codex", "skills", "find-skills")
    await mkdir(userSkillDir, { recursive: true })
    await mkdir(userDataDir, { recursive: true })
    await writeFile(join(userSkillDir, "SKILL.md"), "# user skill\n", "utf-8")
    setElectronUserDataPathProviderForTest(() => userDataDir)
    setSkillRegistryRuntimeRootProviderForTest((runtime) =>
      join(home, runtime === "codex" ? ".codex" : ".claude"),
    )

    await installRegistrySkill({
      id: "find-skills",
      runtime: "codex",
      force: true,
    })

    const statePath = getManagedSkillRegistryStatePath(userDataDir)
    const rawState = JSON.parse(await readFile(statePath, "utf-8"))
    rawState.installed["find-skills"].version = "0.9.0"
    await writeFile(
      statePath,
      `${JSON.stringify(rawState, null, 2)}\n`,
      "utf-8",
    )

    const updateAvailable = (
      await listRegistrySkills({ runtime: "codex" })
    ).find((skill) => skill.id === "find-skills")
    expect(updateAvailable?.status).toBe("update-available")

    await writeFile(
      join(userSkillDir, "SKILL.md"),
      "# locally changed\n",
      "utf-8",
    )
    const modified = (await listRegistrySkills({ runtime: "codex" })).find(
      (skill) => skill.id === "find-skills",
    )
    expect(modified?.status).toBe("modified")

    const rolledBack = await rollbackRegistrySkill({
      id: "find-skills",
      runtime: "codex",
    })
    expect(rolledBack?.status).toBe("user-owned")
    expect(await readFile(join(userSkillDir, "SKILL.md"), "utf-8")).toBe(
      "# user skill\n",
    )
    expect(await listManagedSkillInstallRecords()).toEqual([])
  })

  test("keeps Claude registry installs on the Claude skill path", async () => {
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
      id: "changelog-generator",
      runtime: "claude",
    })
    const installPath = join(home, ".claude", "skills", "changelog-generator")

    expect(installed.status).toBe("installed")
    expect(installed.installPath).toBe(installPath)
    const records = await listManagedSkillInstallRecords()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: "changelog-generator",
      eligibleRuntimes: ["claude"],
      runtimes: {
        claude: {
          runtime: "claude",
          installPath,
        },
      },
    })

    const codexView = (await listRegistrySkills({ runtime: "codex" })).find(
      (skill) => skill.id === "changelog-generator",
    )
    expect(codexView?.status).toBe("not-installed")
    expect(codexView?.projection).toMatchObject({
      kind: "skill",
      capabilityId: "changelog-generator",
      runtimeId: "codex",
      state: "incompatible",
      diagnostics: [
        {
          code: "skill.runtime-incompatible",
        },
      ],
    })
  })
})
