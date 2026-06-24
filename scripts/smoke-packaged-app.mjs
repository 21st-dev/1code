#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import net from "node:net"
import os from "node:os"
import path from "node:path"

const root = process.cwd()
const require = createRequire(import.meta.url)
const asar = require("@electron/asar")
const plist = require("plist")
const yaml = require("js-yaml")

const failures = []
const warnings = []
const packageJson = readJson("package.json")
const version = packageJson?.version
const productName = packageJson?.build?.productName ?? "1Code"
const appId = packageJson?.build?.appId ?? "dev.21st.agents"
const publishUrl = packageJson?.build?.publish?.url ?? "https://cdn.21st.dev/releases/desktop"
const devUrlPatterns = [
  /https?:\/\/localhost:5173\b/i,
  /https?:\/\/localhost:5174\b/i,
  /https?:\/\/127\.0\.0\.1:5173\b/i,
  /https?:\/\/127\.0\.0\.1:5174\b/i,
]

function projectPath(relativePath) {
  return path.join(root, relativePath)
}

function normalizeRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/")
}

function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath))
}

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8")
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath))
  } catch (error) {
    fail(`Could not parse ${relativePath}: ${error.message}`)
    return undefined
  }
}

function readYaml(relativePath) {
  try {
    return yaml.load(read(relativePath))
  } catch (error) {
    fail(`Could not parse ${relativePath}: ${error.message}`)
    return undefined
  }
}

function statFile(relativePath) {
  const filePath = projectPath(relativePath)
  if (!fs.existsSync(filePath)) return undefined
  return fs.statSync(filePath)
}

function sha256(relativePath) {
  const filePath = projectPath(relativePath)
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function isExecutable(relativePath) {
  const stat = statFile(relativePath)
  return Boolean(stat && (stat.mode & 0o111))
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  })
  return {
    command: [command, ...args].join(" "),
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error?.message,
  }
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : undefined
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error("Could not allocate a local smoke port."))
      })
    })
    server.on("error", reject)
  })
}

function devUrlMatches(text) {
  return devUrlPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source)
}

function verifyNoDevUrls(label, text) {
  const matches = devUrlMatches(text)
  if (matches.length > 0) {
    fail(`${label} contains explicit dev renderer URL pattern(s): ${matches.join(", ")}`)
  }
  return matches.length === 0
}

function readPlist(relativePath) {
  try {
    return plist.parse(read(relativePath))
  } catch (error) {
    fail(`Could not parse ${relativePath}: ${error.message}`)
    return undefined
  }
}

function summarizeCodesign(appDir) {
  const verify = run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appDir])
  const details = run("codesign", ["-dv", "--verbose=4", appDir])
  const detailText = [details.stdout, details.stderr].filter(Boolean).join("\n")
  return {
    verify,
    details: {
      exitCode: details.exitCode,
      signature: detailText.match(/^Signature=(.+)$/m)?.[1] ?? null,
      identifier: detailText.match(/^Identifier=(.+)$/m)?.[1] ?? null,
      teamIdentifier: detailText.match(/^TeamIdentifier=(.+)$/m)?.[1] ?? null,
      rawStatus: detailText.includes("Signature=adhoc") ? "adhoc" : (details.exitCode === 0 ? "signed" : "unknown"),
    },
    status: verify.exitCode === 0 && !detailText.includes("Signature=adhoc")
      ? "signed"
      : "unsigned-or-adhoc",
  }
}

function verifyInfoPlist(app) {
  const infoPath = `${app.appDir}/Contents/Info.plist`
  const info = readPlist(infoPath)
  if (!info) return { path: infoPath, status: "failed" }

  if (info.CFBundleName !== productName) {
    fail(`${infoPath} CFBundleName is ${info.CFBundleName ?? "<missing>"}, expected ${productName}.`)
  }
  if (info.CFBundleDisplayName !== productName) {
    fail(`${infoPath} CFBundleDisplayName is ${info.CFBundleDisplayName ?? "<missing>"}, expected ${productName}.`)
  }
  if (info.CFBundleExecutable !== productName) {
    fail(`${infoPath} CFBundleExecutable is ${info.CFBundleExecutable ?? "<missing>"}, expected ${productName}.`)
  }
  if (info.CFBundleIdentifier !== appId) {
    fail(`${infoPath} CFBundleIdentifier is ${info.CFBundleIdentifier ?? "<missing>"}, expected ${appId}.`)
  }
  if (info.CFBundleShortVersionString !== version) {
    fail(`${infoPath} CFBundleShortVersionString is ${info.CFBundleShortVersionString ?? "<missing>"}, expected ${version}.`)
  }
  if (info.CFBundleVersion !== version) {
    fail(`${infoPath} CFBundleVersion is ${info.CFBundleVersion ?? "<missing>"}, expected ${version}.`)
  }

  const schemes = (info.CFBundleURLTypes ?? []).flatMap((entry) => entry.CFBundleURLSchemes ?? [])
  if (!schemes.includes("twentyfirst-agents")) {
    fail(`${infoPath} is missing twentyfirst-agents URL scheme.`)
  }

  const env = info.LSEnvironment ?? {}
  const envText = JSON.stringify(env)
  if (Object.hasOwn(env, "ELECTRON_RENDERER_URL")) {
    fail(`${infoPath} LSEnvironment must not set ELECTRON_RENDERER_URL in packaged apps.`)
  }
  if (Object.hasOwn(env, "MAIN_VITE_API_URL")) {
    fail(`${infoPath} LSEnvironment must not set MAIN_VITE_API_URL in packaged apps.`)
  }
  verifyNoDevUrls(`${infoPath} LSEnvironment`, envText)

  const atsDomains = Object.keys(info.NSAppTransportSecurity?.NSExceptionDomains ?? {})
  const localNetworkingException = atsDomains.includes("localhost") || atsDomains.includes("127.0.0.1")
  if (localNetworkingException) {
    warn(`${infoPath} keeps localhost ATS exceptions for local networking; this is recorded but not treated as a renderer URL leak.`)
  }

  return {
    path: infoPath,
    status: "passed",
    bundleName: info.CFBundleName,
    bundleIdentifier: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    schemes,
    localNetworkingException,
    electronAsarIntegrity: info.ElectronAsarIntegrity?.["Resources/app.asar"] ?? null,
    environmentKeys: Object.keys(env),
  }
}

function verifyResources(app) {
  const resourceDir = `${app.appDir}/Contents/Resources`
  const executablePath = `${app.appDir}/Contents/MacOS/${productName}`
  const asarPath = `${resourceDir}/app.asar`
  const appUpdatePath = `${resourceDir}/app-update.yml`
  const requiredFiles = [
    executablePath,
    asarPath,
    appUpdatePath,
    `${resourceDir}/icon.icns`,
    `${resourceDir}/migrations/meta/_journal.json`,
  ]
  const requiredBinaries = [
    `${resourceDir}/bin/claude`,
    `${resourceDir}/bin/codex`,
    `${resourceDir}/bin/VERSION`,
  ]

  for (const file of requiredFiles) {
    if (!exists(file)) fail(`${app.arch} packaged app is missing ${file}.`)
  }
  for (const file of requiredBinaries) {
    if (!exists(file)) {
      fail(`${app.arch} packaged app is missing bundled runtime ${file}.`)
    } else if (path.basename(file) !== "VERSION" && !isExecutable(file)) {
      fail(`${app.arch} bundled runtime ${file} is not executable.`)
    }
  }

  const appUpdate = exists(appUpdatePath) ? readYaml(appUpdatePath) : undefined
  if (appUpdate) {
    if (appUpdate.provider !== "generic") {
      fail(`${appUpdatePath} provider is ${appUpdate.provider ?? "<missing>"}, expected generic.`)
    }
    if (appUpdate.url !== publishUrl) {
      fail(`${appUpdatePath} url is ${appUpdate.url ?? "<missing>"}, expected ${publishUrl}.`)
    }
    verifyNoDevUrls(appUpdatePath, read(appUpdatePath))
  }

  const asarStat = statFile(asarPath)
  if (asarStat && asarStat.size < 10_000_000) {
    fail(`${asarPath} is unexpectedly small (${asarStat.size} bytes).`)
  }

  return {
    resourceDir,
    executable: {
      path: executablePath,
      present: exists(executablePath),
      executable: isExecutable(executablePath),
    },
    asar: {
      path: asarPath,
      present: exists(asarPath),
      size: asarStat?.size ?? 0,
      sha256: exists(asarPath) ? sha256(asarPath) : null,
    },
    appUpdate: appUpdate
      ? {
        path: appUpdatePath,
        status: "passed",
        provider: appUpdate.provider,
        url: appUpdate.url,
        noDevRendererUrl: verifyNoDevUrls(appUpdatePath, read(appUpdatePath)),
      }
      : null,
    bundledBinaries: requiredBinaries.map((file) => ({
      path: file,
      present: exists(file),
      executable: path.basename(file) === "VERSION" ? null : isExecutable(file),
      size: statFile(file)?.size ?? 0,
    })),
  }
}

function verifyAsarRuntime(app) {
  const asarPath = `${app.appDir}/Contents/Resources/app.asar`
  if (!exists(asarPath)) return { status: "failed", path: asarPath }

  let files = []
  try {
    files = asar.listPackage(projectPath(asarPath))
  } catch (error) {
    fail(`Could not list ${asarPath}: ${error.message}`)
    return { status: "failed", path: asarPath }
  }

  for (const file of ["out/main/index.js", "out/preload/index.js"]) {
    if (!files.includes(`/${file}`)) {
      fail(`${asarPath} is missing ${file}.`)
    }
  }

  let mainEntry = ""
  try {
    mainEntry = asar.extractFile(projectPath(asarPath), "out/main/index.js").toString("utf8")
  } catch (error) {
    fail(`Could not extract out/main/index.js from ${asarPath}: ${error.message}`)
  }

  const packagedApiGuard = /app\.isPackaged\)\s*{\s*return "https:\/\/21st\.dev";\s*}/.test(mainEntry)
  if (!packagedApiGuard) {
    fail(`${asarPath} out/main/index.js must keep the packaged app API URL guard returning https://21st.dev.`)
  }
  const noMainDevRendererUrl = verifyNoDevUrls(`${asarPath} out/main/index.js`, mainEntry)
  if (mainEntry.includes("MAIN_VITE_API_URL")) {
    fail(`${asarPath} out/main/index.js should not carry MAIN_VITE_API_URL into the production main bundle.`)
  }

  return {
    status: "passed",
    path: asarPath,
    fileCount: files.length,
    containsMainEntry: files.includes("/out/main/index.js"),
    containsPreloadEntry: files.includes("/out/preload/index.js"),
    packagedApiGuard,
    noMainDevRendererUrl,
    electronRendererUrlGuardPresent: mainEntry.includes("ELECTRON_RENDERER_URL"),
  }
}

function verifyDistribution(app) {
  const manifest = exists(app.updateManifest) ? readYaml(app.updateManifest) : undefined
  if (!manifest) {
    fail(`${app.updateManifest} is missing or invalid.`)
  } else {
    if (manifest.version !== version) {
      fail(`${app.updateManifest} version is ${manifest.version ?? "<missing>"}, expected ${version}.`)
    }
    if (manifest.path !== path.basename(app.zipArtifact)) {
      fail(`${app.updateManifest} path is ${manifest.path ?? "<missing>"}, expected ${path.basename(app.zipArtifact)}.`)
    }
    verifyNoDevUrls(app.updateManifest, read(app.updateManifest))
  }

  for (const artifact of [app.dmgArtifact, app.zipArtifact]) {
    const stat = statFile(artifact)
    if (!stat) {
      fail(`${app.arch} release artifact is missing: ${artifact}`)
    } else if (stat.size < 10_000_000) {
      fail(`${app.arch} release artifact ${artifact} is unexpectedly small (${stat.size} bytes).`)
    }
  }

  return {
    updateManifest: manifest
      ? {
        path: app.updateManifest,
        status: "passed",
        version: manifest.version,
        artifactPath: manifest.path,
        artifactSize: manifest.files?.[0]?.size ?? null,
        noDevRendererUrl: verifyNoDevUrls(app.updateManifest, read(app.updateManifest)),
      }
      : null,
    artifacts: [app.dmgArtifact, app.zipArtifact].map((artifact) => ({
      path: artifact,
      present: exists(artifact),
      size: statFile(artifact)?.size ?? 0,
    })),
  }
}

function verifyApp(app) {
  if (!exists(app.appDir)) {
    fail(`${app.arch} packaged app is missing: ${app.appDir}`)
    return {
      arch: app.arch,
      appDir: app.appDir,
      status: "failed",
    }
  }

  const info = verifyInfoPlist(app)
  const resources = verifyResources(app)
  const runtime = verifyAsarRuntime(app)
  const distribution = verifyDistribution(app)
  const signing = summarizeCodesign(projectPath(app.appDir))
  if (signing.status === "unsigned-or-adhoc") {
    warn(`${app.arch} packaged app is not developer-id signed yet; signing/notarization remains a separate release blocker.`)
  }

  return {
    arch: app.arch,
    appDir: app.appDir,
    status: "passed",
    info,
    resources,
    runtime,
    distribution,
    signing,
  }
}

async function verifyLaunch(app) {
  const executablePath = `${app.appDir}/Contents/MacOS/${productName}`
  if (!exists(executablePath)) {
    fail(`Cannot launch packaged app because executable is missing: ${executablePath}`)
    return {
      status: "failed",
      arch: app.arch,
      executablePath,
    }
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "moss-packaged-launch-"))
  const port = await findFreePort()
  const child = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `
      import { spawn } from "node:child_process";
      const child = spawn(${JSON.stringify(projectPath(executablePath))}, [
        ${JSON.stringify(`--remote-debugging-port=${port}`)},
        ${JSON.stringify(`--user-data-dir=${userDataDir}`)}
      ], {
        cwd: ${JSON.stringify(root)},
        env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      let endpoint = null;
      let earlyExit = null;
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (child.exitCode !== null) {
          earlyExit = child.exitCode;
          break;
        }
        try {
          const response = await fetch(${JSON.stringify(`http://127.0.0.1:${port}/json/version`)});
          if (response.ok) {
            endpoint = await response.json();
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (child.exitCode === null) child.kill("SIGKILL");
      console.log(JSON.stringify({
        endpoint,
        earlyExit,
        stdout: stdout.slice(0, 2000),
        stderr: stderr.slice(0, 2000)
      }));
      process.exit(endpoint ? 0 : 1);
    `,
  ], {
    cwd: root,
    encoding: "utf8",
  })

  fs.rmSync(userDataDir, { recursive: true, force: true })

  let launchOutput = {}
  try {
    launchOutput = JSON.parse(child.stdout.trim() || "{}")
  } catch {
    launchOutput = {
      parseError: true,
      stdout: child.stdout.trim().slice(0, 2000),
      stderr: child.stderr.trim().slice(0, 2000),
    }
  }

  const endpoint = launchOutput.endpoint
  if (child.status !== 0 || !endpoint?.webSocketDebuggerUrl) {
    fail(`${app.arch} packaged app launch smoke failed to reach Electron remote debugging endpoint.`)
  }

  const combinedOutput = `${launchOutput.stdout ?? ""}\n${launchOutput.stderr ?? ""}`
  verifyNoDevUrls(`${app.arch} packaged app launch output`, combinedOutput)

  return {
    status: child.status === 0 && endpoint?.webSocketDebuggerUrl ? "passed" : "failed",
    arch: app.arch,
    executablePath,
    remoteDebuggingEndpoint: `http://127.0.0.1:${port}/json/version`,
    browser: endpoint?.Browser ?? null,
    webSocketDebuggerUrlPresent: Boolean(endpoint?.webSocketDebuggerUrl),
    earlyExit: launchOutput.earlyExit ?? null,
    stdoutSample: launchOutput.stdout ?? "",
    stderrSample: launchOutput.stderr ?? "",
    exitCode: child.status,
  }
}

function writeReport(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const reportDir = projectPath(path.join(".1code/program/packaged-app-smoke", timestamp))
  fs.mkdirSync(reportDir, { recursive: true })

  const reportPath = path.join(reportDir, "report.json")
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const latestPath = projectPath(".1code/program/packaged-app-smoke/latest.json")
  fs.writeFileSync(latestPath, `${JSON.stringify({
    report: normalizeRelative(reportPath),
    generatedAt: report.generatedAt,
    status: report.status,
  }, null, 2)}\n`)

  return reportPath
}

if (!version) {
  fail("package.json version is missing.")
}

const apps = [
  {
    arch: "arm64",
    appDir: "release/mac-arm64/1Code.app",
    updateManifest: "release/latest-mac.yml",
    dmgArtifact: `release/1Code-${version}-arm64.dmg`,
    zipArtifact: `release/1Code-${version}-arm64-mac.zip`,
  },
  {
    arch: "x64",
    appDir: "release/mac/1Code.app",
    updateManifest: "release/latest-mac-x64.yml",
    dmgArtifact: `release/1Code-${version}.dmg`,
    zipArtifact: `release/1Code-${version}-mac.zip`,
  },
]

const appReports = apps.map(verifyApp)
const launchArch = process.arch === "arm64" ? "arm64" : "x64"
const launchApp = apps.find((app) => app.arch === launchArch) ?? apps[0]
const launch = await verifyLaunch(launchApp)
const report = {
  status: failures.length === 0 ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  package: {
    name: packageJson?.name,
    version,
    productName,
    appId,
    publishUrl,
  },
  productionConfig: {
    packagedApiUrl: "https://21st.dev",
    devRendererUrlPolicy: "Info.plist, app-update.yml, update manifests, and app-owned main bundle must not point at localhost dev renderer URLs.",
    allowedLocalNetworkingException: "localhost ATS exceptions are allowed for local MCP/runtime networking and are recorded as warnings.",
  },
  apps: appReports,
  launch,
  warnings,
  failures,
}

const reportPath = writeReport(report)

console.log("Moss packaged app smoke")
console.log(`status: ${report.status}`)
console.log(`report: ${normalizeRelative(reportPath)}`)
for (const app of appReports) {
  console.log(`${app.arch}: app=${app.appDir} signing=${app.signing?.status ?? "missing"} asarFiles=${app.runtime?.fileCount ?? 0}`)
}
console.log(`launch: ${launch.arch} ${launch.status} ${launch.browser ?? "unknown-browser"}`)

for (const message of warnings) {
  console.warn(`warning: ${message}`)
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`error: ${message}`)
  }
  process.exit(1)
}
