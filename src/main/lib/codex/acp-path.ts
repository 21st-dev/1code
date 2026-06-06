import { existsSync } from "node:fs"
import { dirname, sep } from "node:path"

export type CodexAcpPlatform = NodeJS.Platform
export type CodexAcpArch = NodeJS.Architecture

export function getCodexAcpPackageName(params?: {
  platform?: CodexAcpPlatform
  arch?: CodexAcpArch
}): string {
  const platform = params?.platform ?? process.platform
  const arch = params?.arch ?? process.arch

  if (platform === "darwin") {
    if (arch === "arm64") return "@zed-industries/codex-acp-darwin-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-darwin-x64"
  }

  if (platform === "linux") {
    if (arch === "arm64") return "@zed-industries/codex-acp-linux-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-linux-x64"
  }

  if (platform === "win32") {
    if (arch === "arm64") return "@zed-industries/codex-acp-win32-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-win32-x64"
  }

  throw new Error(`Unsupported platform/arch for codex-acp: ${platform}/${arch}`)
}

export function toUnpackedAsarPath(
  filePath: string,
  options: { exists?: (path: string) => boolean } = {},
): string {
  const unpackedPath = filePath.replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`,
  )
  const exists = options.exists ?? existsSync

  if (unpackedPath !== filePath && exists(unpackedPath)) {
    return unpackedPath
  }

  return filePath
}

export function resolveCodexAcpBinaryPath(): string {
  const packageName = getCodexAcpPackageName()
  const binaryName = process.platform === "win32" ? "codex-acp.exe" : "codex-acp"
  const codexPackageRoot = dirname(
    require.resolve("@zed-industries/codex-acp/package.json"),
  )
  const resolvedPath = require.resolve(`${packageName}/bin/${binaryName}`, {
    // Resolve relative to the wrapper package so nested optional deps work in packaged apps.
    paths: [codexPackageRoot],
  })

  return toUnpackedAsarPath(resolvedPath)
}
