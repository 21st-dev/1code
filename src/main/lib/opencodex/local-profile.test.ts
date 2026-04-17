import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  readOpenCodexLocalProfile,
  resetOpenCodexLocalProfile,
  updateOpenCodexLocalProfile,
} from "./local-profile"

let tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe("OpenCodex local profile", () => {
  test("returns a local-native default profile when no file exists", () => {
    const userDataPath = mkdtempSync(join(process.cwd(), "tmp-opencodex-local-profile-"))
    tempDirs.push(userDataPath)

    const profile = readOpenCodexLocalProfile({ userDataPath })

    expect(profile.displayName.length).toBeGreaterThan(0)
    expect(profile.identityLabel).toBe("Local device profile")
  })

  test("persists display-name updates to the owned state directory", () => {
    const userDataPath = mkdtempSync(join(process.cwd(), "tmp-opencodex-local-profile-"))
    tempDirs.push(userDataPath)

    const updated = updateOpenCodexLocalProfile({
      userDataPath,
      updates: { displayName: "OpenCodex Operator" },
    })

    expect(updated.displayName).toBe("OpenCodex Operator")
    expect(readOpenCodexLocalProfile({ userDataPath }).displayName).toBe("OpenCodex Operator")
  })

  test("reset removes the owned local profile file", () => {
    const userDataPath = mkdtempSync(join(process.cwd(), "tmp-opencodex-local-profile-"))
    tempDirs.push(userDataPath)

    updateOpenCodexLocalProfile({
      userDataPath,
      updates: { displayName: "To Reset" },
    })

    const profilePath = join(userDataPath, "opencodex", "state", "local-profile.json")
    expect(existsSync(profilePath)).toBe(true)

    resetOpenCodexLocalProfile({ userDataPath })

    expect(existsSync(profilePath)).toBe(false)
  })
})
