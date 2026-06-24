import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { getElectronUserDataPath } from "../electron-app"

const KUN_CLI_SETTINGS_FILE = "kun-cli-settings.json"

export type KunCliSettings = {
  executablePath: string | null
  configPath: string | null
  shellApprovedExecutableHash: string | null
}

const DEFAULT_KUN_CLI_SETTINGS: KunCliSettings = {
  executablePath: null,
  configPath: null,
  shellApprovedExecutableHash: null,
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
      shellApprovedExecutableHash:
        typeof parsed.shellApprovedExecutableHash === "string" &&
        /^[a-f0-9]{64}$/i.test(parsed.shellApprovedExecutableHash.trim())
          ? parsed.shellApprovedExecutableHash.trim().toLowerCase()
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
        shellApprovedExecutableHash:
          settings.shellApprovedExecutableHash?.trim().toLowerCase() || null,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  )
}
