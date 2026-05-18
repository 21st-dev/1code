#!/usr/bin/env node

import { spawnSync } from "child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  readFileSync,
} from "fs"
import { tmpdir } from "os"
import { basename, dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function readArg(name) {
  const assignment = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (assignment) {
    return assignment.slice(name.length + 1)
  }

  const index = process.argv.indexOf(name)
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }

  return null
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    stdio: "pipe",
  })

  const rendered = [command, ...args].join(" ")
  const output = [result.stdout, result.stderr].filter(Boolean).join("").trim()

  if (output) {
    console.log(output)
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${rendered} failed with exit code ${result.status}`)
  }

  if (result.status !== 0 && options.allowFailure) {
    console.log(`[smoke] non-fatal: ${rendered} exited ${result.status}`)
  }

  return result
}

function observeLaunchedProcess(installedApp) {
  const result = spawnSync("pgrep", ["-fl", "Contents/MacOS/Locus"], {
    encoding: "utf-8",
    stdio: "pipe",
  })

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .some((line) => line.includes(installedApp))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findDefaultDmg(releaseDir, version) {
  if (!existsSync(releaseDir)) {
    throw new Error(`Release directory not found: ${releaseDir}`)
  }

  const dmgs = readdirSync(releaseDir)
    .filter((file) => file.endsWith(".dmg") && file.includes(version))
    .sort((a, b) => scoreDmg(b) - scoreDmg(a))

  if (!dmgs.length) {
    throw new Error(`No DMG found for version ${version} in ${releaseDir}`)
  }

  return join(releaseDir, dmgs[0])
}

function scoreDmg(file) {
  let score = 0
  if (file.includes("-friend")) score += 10
  if (file.includes("-arm64")) score += 5
  return score
}

function findMountedApp(mountpoint) {
  const appName = readdirSync(mountpoint).find((file) => file.endsWith(".app"))
  if (!appName) {
    throw new Error(`No .app bundle found in mounted DMG: ${mountpoint}`)
  }

  return join(mountpoint, appName)
}

function printManualChecklist(installedApp, shouldLaunch) {
  console.log()
  console.log("Manual UI smoke still required:")
  if (shouldLaunch) {
    console.log(`1. Launch is in progress, or relaunch with: open -n "${installedApp}"`)
  } else {
    console.log("1. Rerun this command with --launch, or install the DMG in Finder.")
  }
  console.log("2. Select a real local repository.")
  console.log("3. Confirm the selected repo is shown before starting an agent.")
  console.log("4. Open Settings and confirm Claude Code and Codex status display.")
  console.log("5. Quit Locus after the check.")
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("macOS DMG smoke can only run on macOS")
  }

  const packageJson = JSON.parse(
    readFileSync(join(__dirname, "../package.json"), "utf-8"),
  )
  const version = readArg("--version") ?? process.env.VERSION ?? packageJson.version
  const releaseDir = resolve(readArg("--release-dir") ?? join(__dirname, "../release"))
  const dmgPath = resolve(readArg("--dmg") ?? findDefaultDmg(releaseDir, version))
  const shouldLaunch = hasFlag("--launch")

  if (!existsSync(dmgPath)) {
    throw new Error(`DMG does not exist: ${dmgPath}`)
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "locus-release-smoke-"))
  const mountpoint = join(tempRoot, "mount")
  const installRoot = resolve(readArg("--install-dir") ?? join(tempRoot, "Applications"))
  mkdirSync(mountpoint, { recursive: true })
  mkdirSync(installRoot, { recursive: true })

  console.log(`[smoke] DMG: ${dmgPath}`)
  console.log(`[smoke] temp install root: ${installRoot}`)

  try {
    run("hdiutil", ["verify", dmgPath])
    run("hdiutil", [
      "attach",
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mountpoint,
      dmgPath,
    ])

    const mountedApp = findMountedApp(mountpoint)
    const installedApp = join(installRoot, basename(mountedApp))

    rmSync(installedApp, { force: true, recursive: true })
    run("ditto", [mountedApp, installedApp])

    console.log(`[smoke] installed copy: ${installedApp}`)
    run("/usr/libexec/PlistBuddy", [
      "-c",
      "Print:CFBundleIdentifier",
      join(installedApp, "Contents/Info.plist"),
    ])
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", installedApp], {
      allowFailure: true,
    })
    run("codesign", ["-dv", "--verbose=4", installedApp], { allowFailure: true })
    run(
      "spctl",
      ["-a", "-vv", "-t", "open", "--context", "context:primary-signature", installedApp],
      { allowFailure: true },
    )
    run("xcrun", ["stapler", "validate", installedApp], { allowFailure: true })

    if (shouldLaunch) {
      run("open", ["-n", installedApp])
      await sleep(4_000)

      if (!observeLaunchedProcess(installedApp)) {
        printManualChecklist(installedApp, shouldLaunch)
        throw new Error(
          "Launch was requested, but no matching Locus process was observed. Unsigned or ad-hoc builds may be blocked by Gatekeeper.",
        )
      }

      console.log("[smoke] launched installed copy; complete the manual UI checks now.")
    }

    printManualChecklist(installedApp, shouldLaunch)
  } finally {
    run("hdiutil", ["detach", mountpoint], { allowFailure: true })

    if (!shouldLaunch) {
      rmSync(tempRoot, { force: true, recursive: true })
    } else {
      console.log(`[smoke] left temp app in place because --launch was used: ${tempRoot}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
