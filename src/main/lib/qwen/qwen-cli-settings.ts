import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { getElectronUserDataPath } from "../electron-app"

const QWEN_CLI_SETTINGS_FILE = "qwen-cli-settings.json"

export type QwenCliSettings = {
  executablePath: string | null
}

const DEFAULT_QWEN_CLI_SETTINGS: QwenCliSettings = {
  executablePath: null,
}

export type QwenCliSettingsOptions = {
  userDataPath?: string
  settingsPath?: string
}

export function getQwenCliSettingsPath(
  options: QwenCliSettingsOptions = {},
): string {
  return (
    options.settingsPath ??
    join(
      options.userDataPath ?? getElectronUserDataPath(),
      QWEN_CLI_SETTINGS_FILE,
    )
  )
}

function parseQwenCliSettingsContent(content: string): QwenCliSettings {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      executablePath:
        typeof parsed.executablePath === "string" &&
        parsed.executablePath.trim()
          ? parsed.executablePath
          : null,
    }
  } catch {
    return DEFAULT_QWEN_CLI_SETTINGS
  }
}

export function readQwenCliSettings(
  options: QwenCliSettingsOptions = {},
): QwenCliSettings {
  const settingsPath = getQwenCliSettingsPath(options)
  if (!existsSync(settingsPath)) return DEFAULT_QWEN_CLI_SETTINGS
  return parseQwenCliSettingsContent(readFileSync(settingsPath, "utf8"))
}

export function writeQwenCliSettings(
  settings: QwenCliSettings,
  options: QwenCliSettingsOptions = {},
): void {
  const settingsPath = getQwenCliSettingsPath(options)
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        executablePath: settings.executablePath?.trim() || null,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  )
}
