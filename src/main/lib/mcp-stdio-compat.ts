import { existsSync, readFileSync } from "fs"
import { createRequire } from "module"
import * as path from "path"

export interface McpStdioLaunchConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  sourcePath?: string | null
}

export interface McpPathMapping {
  from: string
  to: string
}

export interface McpLoopbackBridgeEndpoint {
  host: string
  port: number
  hostEnvKey: string
  portEnvKey: string
}

export type McpStdioCompatResult =
  | {
      ok: true
      config: {
        command: string
        args?: string[]
        env?: Record<string, string>
        cwd?: string
      }
      rewrites: McpPathMapping[]
    }
  | {
      ok: false
      reason: string
      rewrites: McpPathMapping[]
    }

interface ResolveOptions {
  platform?: NodeJS.Platform
  pathMappings?: McpPathMapping[]
  exists?: (targetPath: string) => boolean
  readFile?: (targetPath: string) => string
  canResolve?: (specifier: string, fromPath: string) => boolean
}

const WINDOWS_ABSOLUTE_PATH = /^([A-Za-z]):[\\/]+(.+)$/
const WINDOWS_WILDCARD_ROOT = /^\*:[\\/]+(.+)$/
const NODE_OPTIONS_WITH_VALUE = new Set([
  "-e",
  "--eval",
  "-p",
  "--print",
  "-r",
  "--require",
  "--loader",
  "--import",
])
const LOCAL_SCRIPT_EXTENSIONS = /\.(?:[cm]?js|[cm]?ts|tsx)$/i
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

function isLoopbackHost(value: string): boolean {
  return LOOPBACK_HOSTS.has(value.trim().toLowerCase())
}

function parseTcpPort(value: string): number | null {
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return port
}

export function extractLoopbackMcpBridgeEndpoint(
  env?: Record<string, string>,
): McpLoopbackBridgeEndpoint | null {
  if (!env) return null

  for (const [portEnvKey, portValue] of Object.entries(env)) {
    if (!portEnvKey.endsWith("_MCP_BRIDGE_PORT")) continue

    const hostEnvKey = `${portEnvKey.slice(0, -"_PORT".length)}_HOST`
    const host = env[hostEnvKey]
    if (!host || !isLoopbackHost(host)) continue

    const port = parseTcpPort(portValue)
    if (!port) continue

    return {
      host,
      port,
      hostEnvKey,
      portEnvKey,
    }
  }

  return null
}

function parseWindowsPath(value: string): { root: string; rest: string } | null {
  const match = value.match(WINDOWS_ABSOLUTE_PATH)
  if (!match) return null

  const restSegments = match[2]
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (restSegments.length === 0) return null

  return {
    root: restSegments[0],
    rest: restSegments.slice(1).join("/"),
  }
}

function isWindowsAbsolutePath(value: string): boolean {
  return WINDOWS_ABSOLUTE_PATH.test(value)
}

function normalizeWindowsRoot(value: string): string | null {
  const wildcard = value.match(WINDOWS_WILDCARD_ROOT)
  if (wildcard) {
    const root = wildcard[1].split(/[\\/]+/).find(Boolean)
    return root ? root.toLowerCase() : null
  }

  const parsed = parseWindowsPath(value)
  if (!parsed) return null
  return parsed.root.toLowerCase()
}

function sourceRootMapping(sourcePath?: string | null): McpPathMapping | null {
  if (!sourcePath) return null
  const sourceBase = path.basename(sourcePath)
  if (!sourceBase) return null
  return {
    from: `*:\\${sourceBase}`,
    to: sourcePath,
  }
}

function rewriteWindowsPath(
  value: string,
  mappings: McpPathMapping[],
): { value: string; rewrite?: McpPathMapping } {
  const parsed = parseWindowsPath(value)
  if (!parsed) return { value }

  for (const mapping of mappings) {
    const fromRoot = normalizeWindowsRoot(mapping.from)
    if (!fromRoot || fromRoot !== parsed.root.toLowerCase()) continue

    const mapped = parsed.rest ? path.join(mapping.to, parsed.rest) : mapping.to
    return {
      value: mapped,
      rewrite: {
        from: value,
        to: mapped,
      },
    }
  }

  return { value }
}

function resolveString(
  value: string,
  mappings: McpPathMapping[],
): { value: string; rewrite?: McpPathMapping } {
  return rewriteWindowsPath(value, mappings)
}

function isNodeLikeCommand(command: string): boolean {
  const commandName = path.basename(command).toLowerCase()
  return ["node", "node.exe", "bun", "bun.exe"].includes(commandName)
}

function looksLikeLocalScriptArg(value: string): boolean {
  return path.isAbsolute(value) ||
    value.startsWith(".") ||
    value.includes("/") ||
    value.includes("\\") ||
    LOCAL_SCRIPT_EXTENSIONS.test(value)
}

function findNodeScriptArg(args: string[] | undefined): string | null {
  if (!args?.length) return null

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue
    if (arg === "--") return args[index + 1] ?? null
    if (NODE_OPTIONS_WITH_VALUE.has(arg)) {
      index += 1
      continue
    }
    if ([...NODE_OPTIONS_WITH_VALUE].some((option) => arg.startsWith(`${option}=`))) {
      continue
    }
    if (arg.startsWith("-")) continue
    return arg
  }

  return null
}

function findRelativeNodeScriptWithoutCwd(
  command: string,
  args: string[] | undefined,
  cwd: string | undefined,
): string | null {
  if (!isNodeLikeCommand(command) || cwd) return null

  const scriptArg = findNodeScriptArg(args)
  if (!scriptArg || !looksLikeLocalScriptArg(scriptArg)) return null
  if (path.isAbsolute(scriptArg) || isWindowsAbsolutePath(scriptArg)) return null

  return scriptArg
}

function resolveNodeScriptPath(scriptArg: string | null, cwd: string | undefined): string | null {
  if (!scriptArg || !looksLikeLocalScriptArg(scriptArg)) return null
  if (path.isAbsolute(scriptArg)) return scriptArg
  if (!cwd) return null
  return path.resolve(cwd, scriptArg)
}

function looksLikeLocalCommand(value: string): boolean {
  return path.isAbsolute(value) ||
    isWindowsAbsolutePath(value) ||
    value.startsWith(".") ||
    value.includes("/") ||
    value.includes("\\")
}

function resolveLocalCommandPath(command: string, cwd: string | undefined): string | null {
  if (!looksLikeLocalCommand(command)) return null
  if (path.isAbsolute(command)) return command
  if (isWindowsAbsolutePath(command)) return command
  if (!cwd) return null
  return path.resolve(cwd, command)
}

function findRelativeLocalCommandWithoutCwd(command: string, cwd: string | undefined): string | null {
  if (cwd || !looksLikeLocalCommand(command)) return null
  if (path.isAbsolute(command) || isWindowsAbsolutePath(command)) return null
  return command
}

function findMissingLocalCommand(
  command: string,
  cwd: string | undefined,
  exists: (targetPath: string) => boolean,
): string | null {
  const commandPath = resolveLocalCommandPath(command, cwd)
  if (!commandPath) return null
  return exists(commandPath) ? null : commandPath
}

function findMissingNodeScript(
  command: string,
  args: string[] | undefined,
  cwd: string | undefined,
  exists: (targetPath: string) => boolean,
): string | null {
  if (!isNodeLikeCommand(command)) return null

  const scriptArg = findNodeScriptArg(args)
  const scriptPath = resolveNodeScriptPath(scriptArg, cwd)
  if (!scriptPath) return null

  return exists(scriptPath) ? null : scriptPath
}

function findNodeLaunchScript(
  command: string,
  args: string[] | undefined,
  cwd: string | undefined,
  exists: (targetPath: string) => boolean,
): string | null {
  if (!isNodeLikeCommand(command)) return null

  const scriptArg = findNodeScriptArg(args)
  const scriptPath = resolveNodeScriptPath(scriptArg, cwd)
  if (!scriptPath || !exists(scriptPath)) return null

  return scriptPath
}

function isBareModuleSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("node:") &&
    !isWindowsAbsolutePath(specifier)
}

function resolveLocalModulePath(
  fromPath: string,
  specifier: string,
  exists: (targetPath: string) => boolean,
): string | null {
  const base = path.resolve(path.dirname(fromPath), specifier)
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.js"),
    path.join(base, "index.mjs"),
    path.join(base, "index.cjs"),
  ]

  return candidates.find((candidate) => exists(candidate)) ?? null
}

function extractModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s*)?["']([^"']+)["']/g,
    /\bexport\s+[^'"]+\s+from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source))) {
      specifiers.add(match[1])
    }
  }

  return [...specifiers]
}

function canResolveBareSpecifier(specifier: string, fromPath: string): boolean {
  try {
    createRequire(fromPath).resolve(specifier)
    return true
  } catch {
    return false
  }
}

function findMissingNodeDependency(
  entryPath: string,
  options: Required<Pick<ResolveOptions, "exists" | "readFile" | "canResolve">>,
  visited = new Set<string>(),
): string | null {
  if (visited.has(entryPath)) return null
  if (visited.size >= 16) return null
  visited.add(entryPath)

  let source: string
  try {
    source = options.readFile(entryPath)
  } catch {
    return null
  }

  for (const specifier of extractModuleSpecifiers(source)) {
    if (isBareModuleSpecifier(specifier)) {
      if (!options.canResolve(specifier, entryPath)) {
        return `${specifier} imported by ${entryPath}`
      }
      continue
    }

    if (specifier.startsWith(".")) {
      const localPath = resolveLocalModulePath(entryPath, specifier, options.exists)
      if (!localPath) continue
      const missing = findMissingNodeDependency(localPath, options, visited)
      if (missing) return missing
    }
  }

  return null
}

export function resolveHostCompatibleMcpStdioConfig(
  config: McpStdioLaunchConfig,
  options: ResolveOptions = {},
): McpStdioCompatResult {
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? existsSync
  const readFile = options.readFile ?? ((targetPath: string) => readFileSync(targetPath, "utf-8"))
  const canResolve = options.canResolve ?? canResolveBareSpecifier
  const mappings = [
    ...(options.pathMappings ?? []),
    ...(sourceRootMapping(config.sourcePath) ? [sourceRootMapping(config.sourcePath)!] : []),
  ]
  const rewrites: McpPathMapping[] = []

  const command = resolveString(config.command, mappings)
  if (command.rewrite) rewrites.push(command.rewrite)

  const args = config.args?.map((arg) => {
    const resolved = resolveString(arg, mappings)
    if (resolved.rewrite) rewrites.push(resolved.rewrite)
    return resolved.value
  })

  const env = config.env
    ? Object.fromEntries(
        Object.entries(config.env).map(([key, value]) => {
          if (typeof value !== "string") return [key, value]
          const resolved = resolveString(value, mappings)
          if (resolved.rewrite) rewrites.push(resolved.rewrite)
          return [key, resolved.value]
        }),
      )
    : undefined

  const cwdInput =
    config.cwd ??
    (config.sourcePath && exists(config.sourcePath) ? config.sourcePath : undefined)
  const cwdResult = cwdInput ? resolveString(cwdInput, mappings) : undefined
  if (cwdResult?.rewrite) rewrites.push(cwdResult.rewrite)
  const cwd =
    cwdResult?.value &&
    !path.isAbsolute(cwdResult.value) &&
    config.sourcePath &&
    exists(config.sourcePath)
      ? path.resolve(config.sourcePath, cwdResult.value)
      : cwdResult?.value

  if (platform !== "win32") {
    const unresolved = [command.value, ...(args ?? []), ...(cwd ? [cwd] : []), ...Object.values(env ?? {})].find(
      (value) => typeof value === "string" && isWindowsAbsolutePath(value),
    )
    if (unresolved) {
      return {
        ok: false,
        reason: `Windows path is not mapped on ${platform}: ${unresolved}`,
        rewrites,
      }
    }
  }

  const relativeLocalCommandWithoutCwd = findRelativeLocalCommandWithoutCwd(command.value, cwd)
  if (relativeLocalCommandWithoutCwd) {
    return {
      ok: false,
      reason: `Relative stdio command requires cwd before launch: ${relativeLocalCommandWithoutCwd}`,
      rewrites,
    }
  }

  const missingLocalCommand = findMissingLocalCommand(command.value, cwd, exists)
  if (missingLocalCommand) {
    return {
      ok: false,
      reason: `Local stdio command does not exist: ${missingLocalCommand}`,
      rewrites,
    }
  }

  const relativeScriptWithoutCwd = findRelativeNodeScriptWithoutCwd(command.value, args, cwd)
  if (relativeScriptWithoutCwd) {
    return {
      ok: false,
      reason: `Relative stdio script requires cwd before launch: ${relativeScriptWithoutCwd}`,
      rewrites,
    }
  }

  const missingScript = findMissingNodeScript(command.value, args, cwd, exists)
  if (missingScript) {
    return {
      ok: false,
      reason: `Local stdio script does not exist: ${missingScript}`,
      rewrites,
    }
  }

  if (isNodeLikeCommand(command.value) && !findNodeScriptArg(args)) {
    return {
      ok: false,
      reason: "Node stdio command has no entry script",
      rewrites,
    }
  }

  const scriptPath = findNodeLaunchScript(command.value, args, cwd, exists)
  const missingDependency = scriptPath
    ? findMissingNodeDependency(scriptPath, { exists, readFile, canResolve })
    : null
  if (missingDependency) {
    return {
      ok: false,
      reason: `Local stdio script dependency is not installed: ${missingDependency}`,
      rewrites,
    }
  }

  return {
    ok: true,
    config: {
      command: command.value,
      args,
      env,
      cwd,
    },
    rewrites,
  }
}
