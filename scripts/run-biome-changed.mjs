import { spawnSync } from "node:child_process"
import { extname } from "node:path"

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

function isBiomeSupportedPath(path) {
  return BIOME_SUPPORTED_EXTENSIONS.has(extname(path))
}

const since = process.env.BIOME_CHANGED_SINCE?.trim()
const changedFiles = since
  ? git(["diff", "--name-only", "--diff-filter=ACMR", `${since}...HEAD`])
  : [
      ...git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
      ...git(["ls-files", "--others", "--exclude-standard"]),
    ]

const files = [...new Set(changedFiles)].filter(isBiomeSupportedPath)

if (files.length === 0) {
  console.log("No changed files supported by Biome.")
  process.exit(0)
}

const result = spawnSync(
  process.platform === "win32" ? "biome.cmd" : "biome",
  ["check", ...files],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(typeof result.status === "number" ? result.status : 1)
