import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { extname, join } from "node:path"
import { pathToFileURL } from "node:url"

const BIOME_SUPPORTED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".gql",
  ".graphql",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
])
export const BIOME_JSON_MAX_BUFFER_BYTES = 64 * 1024 * 1024

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function gitText(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout
}

function isBiomeSupportedPath(path) {
  return BIOME_SUPPORTED_EXTENSIONS.has(extname(path))
}

function isAllZeroSha(value) {
  return /^0{40}$/i.test(value)
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "")
}

function addChangedLine(changeMap, path, line) {
  const normalizedPath = normalizePath(path)
  const entry = changeMap.get(normalizedPath) ?? { lines: new Set() }
  entry.lines.add(line)
  changeMap.set(normalizedPath, entry)
}

export function collectChangedLinesFromUnifiedDiff(diffText) {
  const changeMap = new Map()
  let currentPath = null

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) {
      const nextPath = line.slice(4).trim()
      currentPath = nextPath.startsWith("b/") ? nextPath.slice(2) : null
      continue
    }

    if (!currentPath || !line.startsWith("@@ ")) {
      continue
    }

    const match = line.match(/\+(\d+)(?:,(\d+))?/)
    if (!match) {
      continue
    }

    const start = Number.parseInt(match[1], 10)
    const count = match[2] ? Number.parseInt(match[2], 10) : 1
    for (let offset = 0; offset < count; offset += 1) {
      addChangedLine(changeMap, currentPath, start + offset)
    }
  }

  return changeMap
}

export function markAllLinesChanged(changeMap, paths) {
  const next = new Map(changeMap)
  for (const path of paths) {
    next.set(normalizePath(path), { allLines: true, lines: new Set() })
  }
  return next
}

function hasChangedLineInRange(change, startLine, endLine) {
  if (change.allLines) return true
  for (let line = startLine; line <= endLine; line += 1) {
    if (change.lines.has(line)) return true
  }
  return false
}

export function diagnosticTouchesChangedLines(diagnostic, changeMap) {
  const path = diagnostic?.location?.path
  if (!path) return false

  const change = changeMap.get(normalizePath(path))
  if (!change) return false
  if (change.allLines) return true

  const startLine = diagnostic?.location?.start?.line
  if (typeof startLine !== "number") {
    return true
  }

  const endLine =
    typeof diagnostic?.location?.end?.line === "number"
      ? diagnostic.location.end.line
      : startLine
  return hasChangedLineInRange(change, startLine, endLine)
}

export function filterDiagnosticsForChangedLines(diagnostics, changeMap) {
  return diagnostics.filter((diagnostic) =>
    diagnosticTouchesChangedLines(diagnostic, changeMap),
  )
}

export function resolveBiomeExecutable({
  cwd = process.cwd(),
  platform = process.platform,
  exists = existsSync,
} = {}) {
  const binaryName = platform === "win32" ? "biome.cmd" : "biome"
  const path = join(cwd, "node_modules", ".bin", binaryName)
  if (exists(path)) {
    return { ok: true, command: path, shell: platform === "win32" }
  }

  return {
    ok: false,
    error: `Biome executable not found at ${path}. Run \`bun install\` before linting.`,
  }
}

function formatDiagnostic(diagnostic) {
  const location = diagnostic.location
  const path = location?.path ?? "<unknown>"
  const line = location?.start?.line ?? "?"
  const column = location?.start?.column ?? "?"
  const category = diagnostic.category ? ` ${diagnostic.category}` : ""
  return `${diagnostic.severity}${category} ${path}:${line}:${column} ${diagnostic.message}`
}

function parseBiomeJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`Failed to parse Biome JSON output: ${error.message}`)
  }
}

function getChangedLineMap(since) {
  if (!since) {
    const diffText = gitText([
      "diff",
      "--unified=0",
      "--diff-filter=ACMR",
      "HEAD",
    ])
    const untracked = git(["ls-files", "--others", "--exclude-standard"])
    return markAllLinesChanged(
      collectChangedLinesFromUnifiedDiff(diffText),
      untracked,
    )
  }

  if (isAllZeroSha(since)) {
    console.log(
      "BIOME_CHANGED_SINCE is the all-zero SHA; checking current HEAD diff.",
    )
    return getChangedLineMap(null)
  }

  return collectChangedLinesFromUnifiedDiff(
    gitText(["diff", "--unified=0", "--diff-filter=ACMR", `${since}...HEAD`]),
  )
}

function getChangedFilesFromMap(changeMap) {
  return [...changeMap.keys()].filter(isBiomeSupportedPath)
}

function runBiome(command, shell, files) {
  return spawnSync(command, ["check", "--reporter=json", ...files], {
    encoding: "utf8",
    maxBuffer: BIOME_JSON_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    shell,
  })
}

function main() {
  const biome = resolveBiomeExecutable()
  if (!biome.ok) {
    console.error(biome.error)
    process.exit(1)
  }

  const since = process.env.BIOME_CHANGED_SINCE?.trim()
  const changedLineMap = getChangedLineMap(since)
  const files = getChangedFilesFromMap(changedLineMap)

  if (files.length === 0) {
    console.log("No changed files supported by Biome.")
    process.exit(0)
  }

  const result = runBiome(biome.command, biome.shell, files)
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  const output = parseBiomeJson(result.stdout)
  const diagnostics = Array.isArray(output.diagnostics)
    ? output.diagnostics
    : []
  const changedDiagnostics = filterDiagnosticsForChangedLines(
    diagnostics,
    changedLineMap,
  )
  const changedErrors = changedDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  )

  if (changedDiagnostics.length > 0) {
    console.error("Biome diagnostics on changed lines:")
    for (const diagnostic of changedDiagnostics) {
      console.error(`- ${formatDiagnostic(diagnostic)}`)
    }
  }

  if (changedErrors.length > 0) {
    process.exit(1)
  }

  if (typeof result.status === "number" && result.status !== 0) {
    console.log(
      "Biome reported diagnostics only outside changed lines; ignoring legacy file diagnostics.",
    )
  }

  process.exit(0)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
