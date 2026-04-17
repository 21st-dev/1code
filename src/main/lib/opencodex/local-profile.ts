import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { resolveOpenCodexDataPaths } from "./preflight"

export interface OpenCodexLocalProfile {
  displayName: string
  identityLabel: string
}

function getLocalProfilePath(userDataPath: string): string {
  return join(resolveOpenCodexDataPaths(userDataPath).stateDir, "local-profile.json")
}

function getDefaultDisplayName(): string {
  return (
    process.env.OPENCODEX_DISPLAY_NAME?.trim() ||
    process.env.USERNAME?.trim() ||
    process.env.USER?.trim() ||
    "OpenCodex User"
  )
}

function getDefaultProfile(): OpenCodexLocalProfile {
  return {
    displayName: getDefaultDisplayName(),
    identityLabel: "Local device profile",
  }
}

export function readOpenCodexLocalProfile({
  userDataPath,
}: {
  userDataPath: string
}): OpenCodexLocalProfile {
  const filePath = getLocalProfilePath(userDataPath)
  if (!existsSync(filePath)) {
    return getDefaultProfile()
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<OpenCodexLocalProfile>
  return {
    displayName:
      typeof parsed.displayName === "string" && parsed.displayName.trim().length > 0
        ? parsed.displayName.trim()
        : getDefaultDisplayName(),
    identityLabel:
      typeof parsed.identityLabel === "string" && parsed.identityLabel.trim().length > 0
        ? parsed.identityLabel.trim()
        : "Local device profile",
  }
}

export function updateOpenCodexLocalProfile({
  userDataPath,
  updates,
}: {
  userDataPath: string
  updates: { displayName?: string }
}): OpenCodexLocalProfile {
  const nextProfile: OpenCodexLocalProfile = {
    ...readOpenCodexLocalProfile({ userDataPath }),
    ...(typeof updates.displayName === "string" && updates.displayName.trim().length > 0
      ? { displayName: updates.displayName.trim() }
      : {}),
  }

  const filePath = getLocalProfilePath(userDataPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(nextProfile, null, 2), "utf8")
  return nextProfile
}

export function resetOpenCodexLocalProfile({
  userDataPath,
}: {
  userDataPath: string
}): void {
  rmSync(getLocalProfilePath(userDataPath), { force: true })
}
