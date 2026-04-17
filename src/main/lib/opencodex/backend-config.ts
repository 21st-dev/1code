import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  parseOpenCodexBackendRoute,
  type OpenCodexBackendRoute,
} from "../../../shared/opencodex-backend-route"
import { resolveOpenCodexDataPaths } from "./preflight"

export type OpenCodexBackendConfigRecord = OpenCodexBackendRoute

function getBackendConfigPath(userDataPath: string): string {
  return join(resolveOpenCodexDataPaths(userDataPath).stateDir, "backend-config.json")
}

function normalizeConfig(config: OpenCodexBackendConfigRecord): OpenCodexBackendConfigRecord {
  const normalized = parseOpenCodexBackendRoute(config)
  if (!normalized) {
    throw new Error("OpenCodex backend config is invalid")
  }

  return normalized
}

export function readOpenCodexBackendConfig({
  userDataPath,
}: {
  userDataPath: string
}): OpenCodexBackendConfigRecord | null {
  const filePath = getBackendConfigPath(userDataPath)
  if (!existsSync(filePath)) {
    return null
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown
  return parseOpenCodexBackendRoute(parsed)
}

export function saveOpenCodexBackendConfig({
  userDataPath,
  config,
}: {
  userDataPath: string
  config: OpenCodexBackendConfigRecord
}): OpenCodexBackendConfigRecord {
  const filePath = getBackendConfigPath(userDataPath)
  const normalized = normalizeConfig(config)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8")
  return normalized
}

export function resetOpenCodexBackendConfig({
  userDataPath,
}: {
  userDataPath: string
}): void {
  rmSync(getBackendConfigPath(userDataPath), { force: true })
}