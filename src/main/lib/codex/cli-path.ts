import { existsSync } from "node:fs"
import { join } from "node:path"
import { type ElectronAppLike, getElectronApp } from "../electron-app"

export const BUNDLED_CODEX_CLI_VERSION = "0.139.0"

export function getBundledCodexCliPath(
  appContext: Pick<
    ElectronAppLike,
    "isPackaged" | "getAppPath"
  > = getElectronApp(),
): string {
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex"
  const resourcesDir = appContext.isPackaged
    ? join(process.resourcesPath, "bin")
    : join(
        appContext.getAppPath?.() ?? process.cwd(),
        "resources",
        "bin",
        `${process.platform}-${process.arch}`,
      )

  return join(resourcesDir, binaryName)
}

export function resolveBundledCodexCliPath(
  appContext: Pick<
    ElectronAppLike,
    "isPackaged" | "getAppPath"
  > = getElectronApp(),
): string {
  const binaryPath = getBundledCodexCliPath(appContext)
  if (existsSync(binaryPath)) {
    return binaryPath
  }

  const hint = appContext.isPackaged
    ? "Binary is missing from bundled resources."
    : "Run `bun run codex:download` to download it for local dev."

  throw new Error(
    `[codex] Bundled Codex CLI not found at ${binaryPath}. ${hint}`,
  )
}
