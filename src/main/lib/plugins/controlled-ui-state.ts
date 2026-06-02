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
const MAX_SETTING_TEXT_LENGTH = 4000

export type PluginControlledUiSettingValue = string | boolean

export interface PluginControlledUiStoredSetting {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  fieldId: string
  value: PluginControlledUiSettingValue
  updatedAt: string
}

interface PluginControlledUiState {
  schemaVersion: 1
  grants: PluginControlledUiPermissionGrant[]
  settings: PluginControlledUiStoredSetting[]
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
    if (state.schemaVersion !== CONTROLLED_UI_STATE_VERSION) {
      return emptyState()
    }
    return {
      schemaVersion: CONTROLLED_UI_STATE_VERSION,
      grants: Array.isArray(state.grants) ? state.grants.filter(isValidGrant) : [],
      settings: Array.isArray(state.settings) ? state.settings.filter(isValidStoredSetting) : [],
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

export async function setControlledUiSettingValue(input: {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  fieldId: string
  value: PluginControlledUiSettingValue
  filePath?: string
  now?: Date
}): Promise<PluginControlledUiStoredSetting> {
  const filePath = input.filePath ?? getPluginControlledUiStatePath()
  const state = await readPluginControlledUiState(filePath)
  const setting: PluginControlledUiStoredSetting = {
    pluginReviewKey: input.pluginReviewKey,
    contributionFingerprint: input.contributionFingerprint,
    contributionId: input.contributionId,
    fieldId: input.fieldId,
    value: sanitizeSettingValue(input.value),
    updatedAt: (input.now ?? new Date()).toISOString(),
  }
  state.settings = [
    ...state.settings.filter((existing) =>
      existing.pluginReviewKey !== setting.pluginReviewKey ||
      existing.contributionId !== setting.contributionId ||
      existing.fieldId !== setting.fieldId
    ),
    setting,
  ]
  await writePluginControlledUiState(state, filePath)
  return setting
}

export async function getControlledUiSettingsValues(input: {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  fieldIds?: string[]
  filePath?: string
}): Promise<Record<string, PluginControlledUiSettingValue>> {
  const state = await readPluginControlledUiState(input.filePath)
  const allowedFieldIds = input.fieldIds ? new Set(input.fieldIds) : undefined
  const entries = state.settings
    .filter((setting) =>
      setting.pluginReviewKey === input.pluginReviewKey &&
      setting.contributionFingerprint === input.contributionFingerprint &&
      setting.contributionId === input.contributionId &&
      (!allowedFieldIds || allowedFieldIds.has(setting.fieldId))
    )
    .map((setting) => [setting.fieldId, setting.value] as const)
  return Object.fromEntries(entries)
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
    settings: [],
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

function isValidStoredSetting(value: unknown): value is PluginControlledUiStoredSetting {
  if (!value || typeof value !== "object") return false
  const setting = value as Record<string, unknown>
  return (
    typeof setting.pluginReviewKey === "string" &&
    typeof setting.contributionFingerprint === "string" &&
    typeof setting.contributionId === "string" &&
    typeof setting.fieldId === "string" &&
    (typeof setting.value === "string" || typeof setting.value === "boolean") &&
    typeof setting.updatedAt === "string"
  )
}

function sanitizeSettingValue(value: PluginControlledUiSettingValue): PluginControlledUiSettingValue {
  if (typeof value === "boolean") return value
  return value.slice(0, MAX_SETTING_TEXT_LENGTH)
}
