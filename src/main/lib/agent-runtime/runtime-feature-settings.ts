import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  resolveKunRuntimeEnabled,
  type AgentRuntimeFeatureEnv,
} from "../../../shared/agent-runtime-capabilities"
import { getElectronApp, getElectronUserDataPath } from "../electron-app"

const RUNTIME_FEATURE_SETTINGS_FILE = "runtime-feature-settings.json"

export type RuntimeFeatureSettings = {
  kunRuntimeEnabled: boolean
}

export type RuntimeFeatureSettingsSnapshot = {
  settings: RuntimeFeatureSettings
  resolved: RuntimeFeatureSettings
  mode: {
    isPackaged: boolean
    allowEnvOverride: boolean
  }
}

const DEFAULT_RUNTIME_FEATURE_SETTINGS: RuntimeFeatureSettings = {
  kunRuntimeEnabled: false,
}

export type RuntimeFeatureSettingsOptions = {
  userDataPath?: string
  settingsPath?: string
  env?: AgentRuntimeFeatureEnv
  isPackaged?: boolean
}

let cachedSettings:
  | {
      path: string
      settings: RuntimeFeatureSettings
    }
  | null = null

export function clearRuntimeFeatureSettingsCacheForTest(): void {
  cachedSettings = null
}

export function getRuntimeFeatureSettingsPath(
  options: RuntimeFeatureSettingsOptions = {},
): string {
  return (
    options.settingsPath ??
    join(
      options.userDataPath ?? getElectronUserDataPath(),
      RUNTIME_FEATURE_SETTINGS_FILE,
    )
  )
}

function parseRuntimeFeatureSettingsContent(
  content: string,
): RuntimeFeatureSettings {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      kunRuntimeEnabled: parsed.kunRuntimeEnabled === true,
    }
  } catch {
    return DEFAULT_RUNTIME_FEATURE_SETTINGS
  }
}

export function readRuntimeFeatureSettings(
  options: RuntimeFeatureSettingsOptions = {},
): RuntimeFeatureSettings {
  const settingsPath = getRuntimeFeatureSettingsPath(options)
  if (cachedSettings?.path === settingsPath) return cachedSettings.settings
  const settings = existsSync(settingsPath)
    ? parseRuntimeFeatureSettingsContent(readFileSync(settingsPath, "utf8"))
    : DEFAULT_RUNTIME_FEATURE_SETTINGS
  cachedSettings = { path: settingsPath, settings }
  return settings
}

export function writeRuntimeFeatureSettings(
  settings: RuntimeFeatureSettings,
  options: RuntimeFeatureSettingsOptions = {},
): void {
  const settingsPath = getRuntimeFeatureSettingsPath(options)
  const normalized: RuntimeFeatureSettings = {
    kunRuntimeEnabled: settings.kunRuntimeEnabled === true,
  }
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  cachedSettings = { path: settingsPath, settings: normalized }
}

function resolveIsPackaged(options: RuntimeFeatureSettingsOptions): boolean {
  if (typeof options.isPackaged === "boolean") return options.isPackaged
  return getElectronApp().isPackaged === true
}

export function getRuntimeFeatureSettingsSnapshot(
  options: RuntimeFeatureSettingsOptions = {},
): RuntimeFeatureSettingsSnapshot {
  const settings = readRuntimeFeatureSettings(options)
  const isPackaged = resolveIsPackaged(options)
  const env = options.env ?? process.env
  return {
    settings,
    resolved: {
      kunRuntimeEnabled: resolveKunRuntimeEnabled({
        setting: settings.kunRuntimeEnabled,
        env,
        isPackaged,
      }),
    },
    mode: {
      isPackaged,
      allowEnvOverride: !isPackaged,
    },
  }
}

export function setKunRuntimeEnabled(
  enabled: boolean,
  options: RuntimeFeatureSettingsOptions = {},
): RuntimeFeatureSettingsSnapshot {
  const current = readRuntimeFeatureSettings(options)
  writeRuntimeFeatureSettings(
    { ...current, kunRuntimeEnabled: enabled },
    options,
  )
  return getRuntimeFeatureSettingsSnapshot(options)
}

export function isKunRuntimeEnabled(
  options: RuntimeFeatureSettingsOptions = {},
): boolean {
  return getRuntimeFeatureSettingsSnapshot(options).resolved.kunRuntimeEnabled
}
