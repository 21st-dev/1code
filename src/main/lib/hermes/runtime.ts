import * as fs from "fs"
import * as os from "os"
import * as path from "path"

export type HermesRuntimeResolution = {
  executable?: string
  sourceRoot?: string
  acpAdapterPath?: string
  acpExecutable?: string
}

export type HermesAcpLaunch = {
  command: string
  args: string[]
}

function pathExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath)
    return true
  } catch {
    return false
  }
}

function compactCandidates(candidates: Array<string | undefined>): string[] {
  return candidates.filter((candidate): candidate is string =>
    Boolean(candidate?.trim()),
  )
}

export function resolveHermesRuntime(): HermesRuntimeResolution {
  const home = os.homedir()
  const sourceRoot = path.join(home, ".hermes", "hermes-agent")
  const acpAdapterPath = path.join(sourceRoot, "acp_adapter", "server.py")

  const executableCandidates = compactCandidates([
    process.env.HERMES_BIN,
    path.join(home, ".local", "bin", "hermes"),
    path.join(sourceRoot, "venv", "bin", "hermes"),
  ])
  const acpExecutableCandidates = compactCandidates([
    process.env.HERMES_ACP_BIN,
    path.join(home, ".local", "bin", "hermes-acp"),
    path.join(sourceRoot, "venv", "bin", "hermes-acp"),
  ])

  return {
    executable: executableCandidates.find(pathExists),
    sourceRoot: pathExists(sourceRoot) ? sourceRoot : undefined,
    acpAdapterPath: pathExists(acpAdapterPath) ? acpAdapterPath : undefined,
    acpExecutable: acpExecutableCandidates.find(pathExists),
  }
}

export function resolveHermesAcpLaunch(): HermesAcpLaunch {
  const runtime = resolveHermesRuntime()

  if (runtime.acpExecutable) {
    return { command: runtime.acpExecutable, args: [] }
  }

  if (runtime.executable) {
    return { command: runtime.executable, args: ["acp"] }
  }

  throw new Error("Hermes ACP executable was not found.")
}
