import { app } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import {
  buildControlledUiPermissionGrant,
  getControlledUiGrantStatus,
  type PluginControlledUiGrantStatus,
  type PluginControlledUiPermissionGrant,
} from "../../../shared/plugin-controlled-ui"

const CONTROLLED_UI_STATE_VERSION = 1
const CONTROLLED_UI_STATE_FILE = "plugin-controlled-ui-state.json"

interface PluginControlledUiState {
  schemaVersion: 1
  grants: PluginControlledUiPermissionGrant[]
}

export function getPluginControlledUiStatePath(
  userDataPath = app.getPath("userData"),
): string {
  return path.join(userDataPath, CONTROLLED_UI_STATE_FILE)
}

export async function readPluginControlledUiState(
  filePath = getPluginControlledUiStatePath(),
): Promise<PluginControlledUiState> {
  try {
    const state = JSON.parse(await fs.readFile(filePath, "utf-8")) as PluginControlledUiState
    if (state.schemaVersion !== CONTROLLED_UI_STATE_VERSION || !Array.isArray(state.grants)) {
      return emptyState()
    }
    return {
      schemaVersion: CONTROLLED_UI_STATE_VERSION,
      grants: state.grants.filter(isValidGrant),
    }
  } catch {
    return emptyState()
  }
}

export async function grantControlledUiPermission(input: {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  permissionId: string
  actionId?: string
  fieldId?: string
  filePath?: string
  now?: Date
}): Promise<PluginControlledUiPermissionGrant> {
  const filePath = input.filePath ?? getPluginControlledUiStatePath()
  const state = await readPluginControlledUiState(filePath)
  const grant = buildControlledUiPermissionGrant({
    pluginReviewKey: input.pluginReviewKey,
    contributionFingerprint: input.contributionFingerprint,
    contributionId: input.contributionId,
    permissionId: input.permissionId,
    actionId: input.actionId,
    fieldId: input.fieldId,
    grantedAt: (input.now ?? new Date()).toISOString(),
  })
  state.grants = [
    ...state.grants.filter((existing) => getControlledUiGrantStatus(existing, grant) === "mismatch"),
    grant,
  ]
  await writePluginControlledUiState(state, filePath)
  return grant
}

export async function getControlledUiPermissionGrantStatus(input: {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  permissionId: string
  actionId?: string
  fieldId?: string
  filePath?: string
}): Promise<PluginControlledUiGrantStatus> {
  const state = await readPluginControlledUiState(input.filePath)
  const matching = state.grants.find((grant) =>
    grant.pluginReviewKey === input.pluginReviewKey &&
    grant.contributionId === input.contributionId &&
    grant.permissionId === input.permissionId &&
    grant.actionId === input.actionId &&
    grant.fieldId === input.fieldId
  )
  return getControlledUiGrantStatus(matching, input)
}

async function writePluginControlledUiState(
  state: PluginControlledUiState,
  filePath = getPluginControlledUiStatePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf-8")
  await fs.rename(tmpPath, filePath)
}

function emptyState(): PluginControlledUiState {
  return {
    schemaVersion: CONTROLLED_UI_STATE_VERSION,
    grants: [],
  }
}

function isValidGrant(value: unknown): value is PluginControlledUiPermissionGrant {
  if (!value || typeof value !== "object") return false
  const grant = value as Record<string, unknown>
  return (
    typeof grant.pluginReviewKey === "string" &&
    typeof grant.contributionFingerprint === "string" &&
    typeof grant.contributionId === "string" &&
    typeof grant.permissionId === "string" &&
    (grant.actionId === undefined || typeof grant.actionId === "string") &&
    (grant.fieldId === undefined || typeof grant.fieldId === "string") &&
    typeof grant.grantedAt === "string"
  )
}
