#!/usr/bin/env node

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const includeEvidence = args.includes("--include-evidence")
const allowUnsigned = args.includes("--allow-unsigned")

function argValue(name, fallback) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1]) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  return fallback
}

const channel = argValue("--channel", process.env.RELEASE_CHANNEL ?? "latest")
if (!["latest", "beta"].includes(channel)) {
  console.error(`Invalid release channel: ${channel}`)
  process.exit(1)
}

const provider = argValue(
  "--provider",
  process.env.RELEASE_UPLOAD_PROVIDER ?? "command",
)

function projectPath(relativePath) {
  return path.join(root, relativePath)
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(projectPath(relativePath), "utf8"))
}

function normalizeRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/")
}

function sha512(filePath) {
  return createHash("sha512").update(fs.readFileSync(filePath)).digest("base64")
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".yml" || ext === ".yaml") return "text/yaml"
  if (ext === ".zip") return "application/zip"
  if (ext === ".dmg") return "application/x-apple-diskimage"
  if (ext === ".json") return "application/json"
  if (ext === ".txt") return "text/plain"
  return "application/octet-stream"
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function replaceTemplate(template, item) {
  return template
    .replaceAll("{file}", shellQuote(item.absolutePath))
    .replaceAll("{path}", shellQuote(item.absolutePath))
    .replaceAll("{key}", shellQuote(item.key))
    .replaceAll("{url}", shellQuote(item.url))
    .replaceAll("{contentType}", shellQuote(item.contentType))
}

function releaseBaseUrl(packageJson) {
  const url = packageJson?.build?.publish?.url
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error("package.json build.publish.url must be an HTTPS CDN URL.")
  }
  return url.replace(/\/+$/, "")
}

function defaultUploadPrefix(baseUrl) {
  const parsed = new URL(baseUrl)
  return parsed.pathname.replace(/^\/+|\/+$/g, "")
}

function requiredReleaseFiles(packageJson) {
  const version = process.env.VERSION || packageJson.version
  const prefix = channel === "beta" ? "beta" : "latest"
  const names = [
    `${prefix}-mac.yml`,
    `${prefix}-mac-x64.yml`,
    `1Code-${version}-arm64-mac.zip`,
    `1Code-${version}-mac.zip`,
    `1Code-${version}-arm64.dmg`,
    `1Code-${version}.dmg`,
  ]

  if (includeEvidence) {
    const releaseDir = projectPath("release")
    if (fs.existsSync(releaseDir)) {
      names.push(
        ...fs.readdirSync(releaseDir)
          .filter((name) => /notary|notar|codesign|staple|spctl/i.test(name))
          .sort(),
      )
    }
  }

  return [...new Set(names)].map((name) => path.join("release", name))
}

function validNotarizationReport() {
  const releaseDir = projectPath("release")
  if (!fs.existsSync(releaseDir)) return null

  for (const name of fs.readdirSync(releaseDir).sort()) {
    if (!/^notarization-.+\.json$/i.test(name)) continue
    const filePath = path.join(releaseDir, name)
    try {
      const report = JSON.parse(fs.readFileSync(filePath, "utf8"))
      if (
        report.status === "passed" &&
        report.mode?.dryRun === false &&
        Number(report.summary?.notarytoolSubmissions ?? 0) > 0 &&
        Number(report.summary?.stapleCommands ?? 0) > 0 &&
        Number(report.summary?.codesignVerifications ?? 0) > 0
      ) {
        return normalizeRelative(filePath)
      }
    } catch {
      // Ignore malformed evidence; verify-release-packaging reports it separately.
    }
  }

  return null
}

function buildUploadItems(packageJson) {
  const baseUrl = releaseBaseUrl(packageJson)
  const uploadPrefix =
    process.env.RELEASE_UPLOAD_PREFIX ?? defaultUploadPrefix(baseUrl)
  const missing = []
  const items = []

  for (const relativePath of requiredReleaseFiles(packageJson)) {
    const absolutePath = projectPath(relativePath)
    if (!fs.existsSync(absolutePath)) {
      missing.push(relativePath)
      continue
    }

    const name = path.basename(relativePath)
    const key = [uploadPrefix, name].filter(Boolean).join("/")
    items.push({
      name,
      relativePath,
      absolutePath,
      key,
      url: `${baseUrl}/${encodeURIComponent(name)}`,
      size: fs.statSync(absolutePath).size,
      sha512: sha512(absolutePath),
      contentType: contentTypeFor(relativePath),
    })
  }

  return { baseUrl, uploadPrefix, items, missing }
}

function runUpload(item) {
  if (provider === "command") {
    const template = process.env.RELEASE_UPLOAD_COMMAND_TEMPLATE
    if (!template) {
      throw new Error(
        "RELEASE_UPLOAD_COMMAND_TEMPLATE is required for command uploads. Use --dry-run to generate an upload plan only.",
      )
    }
    const command = replaceTemplate(template, item)
    return spawnSync("sh", ["-c", command], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    })
  }

  if (provider === "wrangler") {
    const bucket = process.env.CLOUDFLARE_R2_BUCKET ?? process.env.R2_BUCKET
    if (!bucket) {
      throw new Error("CLOUDFLARE_R2_BUCKET or R2_BUCKET is required for wrangler uploads.")
    }
    return spawnSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${bucket}/${item.key}`, "--file", item.absolutePath],
      {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      },
    )
  }

  throw new Error(`Unsupported release upload provider: ${provider}`)
}

function writePlan(plan) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = projectPath(path.join(".1code/program/release-upload", timestamp))
  fs.mkdirSync(dir, { recursive: true })
  const manifestPath = path.join(dir, "manifest.json")
  fs.writeFileSync(manifestPath, `${JSON.stringify(plan, null, 2)}\n`)
  fs.writeFileSync(
    projectPath(".1code/program/release-upload/latest.json"),
    `${JSON.stringify({
      manifest: normalizeRelative(manifestPath),
      generatedAt: plan.generatedAt,
      status: plan.status,
      dryRun: plan.mode.dryRun,
    }, null, 2)}\n`,
  )
  return manifestPath
}

const failures = []
const uploaded = []
const packageJson = readJson("package.json")
const { baseUrl, uploadPrefix, items, missing } = buildUploadItems(packageJson)
const notarizationReport = validNotarizationReport()

if (missing.length > 0) {
  failures.push(`Missing release upload artifact(s): ${missing.join(", ")}`)
}
if (!dryRun && !allowUnsigned && !notarizationReport) {
  failures.push("No passing notarization report found; refusing real upload without --allow-unsigned.")
}

if (failures.length === 0 && !dryRun) {
  for (const item of items) {
    try {
      const result = runUpload(item)
      if (result.status !== 0) {
        failures.push(`Upload failed for ${item.relativePath} with exit code ${result.status ?? "<unknown>"}.`)
      } else {
        uploaded.push(item.relativePath)
      }
    } catch (error) {
      failures.push(error.message)
      break
    }
  }
}

const plan = {
  status: failures.length === 0 ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  mode: {
    dryRun,
    provider,
    channel,
    includeEvidence,
    allowUnsigned,
  },
  target: {
    baseUrl,
    uploadPrefix,
    notarizationReport,
  },
  artifacts: items.map(({ absolutePath: _absolutePath, ...item }) => item),
  uploaded,
  missing,
  failures,
}
const manifestPath = writePlan(plan)

console.log("Moss release upload plan")
console.log(`status: ${plan.status}`)
console.log(`mode: ${dryRun ? "dry-run" : provider}`)
console.log(`manifest: ${normalizeRelative(manifestPath)}`)
console.log(`artifacts: ${items.length}`)
console.log(`target: ${baseUrl}`)

for (const failure of failures) {
  console.error(`error: ${failure}`)
}

if (failures.length > 0) {
  process.exit(1)
}
