import { existsSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const isWindows = process.platform === "win32"
const skipPostinstall = process.env.LOCUS_SKIP_POSTINSTALL === "1"
const electronBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  isWindows ? "electron.cmd" : "electron",
)
const electronRebuildBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  isWindows ? "electron-rebuild.cmd" : "electron-rebuild",
)

const args = new Set(process.argv.slice(2))
const forceRebuild = args.has("--force")
const checkOnly = args.has("--check-only")
const nativeModules = [
  {
    name: "better-sqlite3",
    test: `
      const Database = require("better-sqlite3");
      const db = new Database(":memory:");
      db.prepare("select 1").get();
      db.close();
    `,
  },
  {
    name: "node-pty",
    test: `require("node-pty");`,
  },
]

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: "utf8",
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  })
}

function testNativeModule(moduleInfo) {
  const result = run(electronBin, ["-e", moduleInfo.test], {
    env: {
      ELECTRON_RUN_AS_NODE: "1",
    },
  })

  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  }
}

function testNativeModules() {
  return nativeModules.map((moduleInfo) => ({
    ...moduleInfo,
    ...testNativeModule(moduleInfo),
  }))
}

function summarizeFailures(results) {
  return results
    .filter((result) => !result.ok)
    .map((result) => {
      const output = result.output.split("\n").slice(0, 6).join("\n")
      return `- ${result.name}: ${output || "failed to load"}`
    })
    .join("\n")
}

function rebuildNativeModules() {
  console.log("[native] Rebuilding Electron native modules...")
  const result = run(
    electronRebuildBin,
    ["-f", "-w", nativeModules.map((moduleInfo) => moduleInfo.name).join(",")],
    { stdio: "inherit" },
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (process.env.VERCEL) {
  console.log("[native] Skipping Electron native module check on Vercel.")
  process.exit(0)
}

if (skipPostinstall) {
  console.log("[native] Skipping Electron native module check for this install.")
  process.exit(0)
}

if (!existsSync(electronBin)) {
  console.error("[native] Electron is not installed. Run `bun install` first.")
  process.exit(1)
}

if (!existsSync(electronRebuildBin)) {
  console.error("[native] electron-rebuild is not installed. Run `bun install` first.")
  process.exit(1)
}

let results = forceRebuild ? [] : testNativeModules()
const hasFailure = forceRebuild || results.some((result) => !result.ok)

if (!hasFailure) {
  console.log("[native] Electron native modules are ready.")
  process.exit(0)
}

if (!forceRebuild) {
  console.warn("[native] Electron native module check failed:")
  console.warn(summarizeFailures(results))
}

if (checkOnly) {
  process.exit(1)
}

rebuildNativeModules()
results = testNativeModules()

if (results.some((result) => !result.ok)) {
  console.error("[native] Electron native modules still failed after rebuild:")
  console.error(summarizeFailures(results))
  process.exit(1)
}

console.log("[native] Electron native modules rebuilt successfully.")
