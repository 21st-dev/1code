import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { getElectronUserDataPath } from "../electron-app"

const KUN_CLI_SETTINGS_FILE = "kun-cli-settings.json"

export type KunCliSettings = {
  executablePath: string | null
  configPath: string | null
}

const DEFAULT_KUN_CLI_SETTINGS: KunCliSettings = {
  executablePath: null,
  configPath: null,
}

export type KunCliSettingsOptions = {
  userDataPath?: string
  settingsPath?: string
}

export function getKunCliSettingsPath(
  options: KunCliSettingsOptions = {},
): string {
  return (
    options.settingsPath ??
    join(options.userDataPath ?? getElectronUserDataPath(), KUN_CLI_SETTINGS_FILE)
  )
}

function parseKunCliSettingsContent(content: string): KunCliSettings {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      executablePath:
        typeof parsed.executablePath === "string" &&
        parsed.executablePath.trim()
          ? parsed.executablePath
          : null,
      configPath:
        typeof parsed.configPath === "string" && parsed.configPath.trim()
          ? parsed.configPath
          : null,
    }
  } catch {
    return DEFAULT_KUN_CLI_SETTINGS
  }
}

export function readKunCliSettings(
  options: KunCliSettingsOptions = {},
): KunCliSettings {
  const settingsPath = getKunCliSettingsPath(options)
  if (!existsSync(settingsPath)) return DEFAULT_KUN_CLI_SETTINGS
  return parseKunCliSettingsContent(readFileSync(settingsPath, "utf8"))
}

export function writeKunCliSettings(
  settings: KunCliSettings,
  options: KunCliSettingsOptions = {},
): void {
  const settingsPath = getKunCliSettingsPath(options)
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        executablePath: settings.executablePath?.trim() || null,
        configPath: settings.configPath?.trim() || null,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  )
}
