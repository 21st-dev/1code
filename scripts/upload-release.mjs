#!/usr/bin/env node

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { collectReleaseUploadPlan } from "./release-config.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf-8"))
const releaseDir = path.join(rootDir, "release")
const productName = packageJson.build?.productName || packageJson.name
const version = process.env.VERSION || packageJson.version

try {
  const plan = collectReleaseUploadPlan({
    env: process.env,
    productName,
    version,
    releaseDir,
  })

  console.log("=".repeat(50))
  console.log("OpenCodex Release Upload Plan")
  console.log("=".repeat(50))
  console.log(`Version: ${version}`)
  console.log(`Target: ${plan.targetBaseUrl}`)
  console.log(`Artifacts: ${plan.entries.length}`)
  console.log()

  for (const entry of plan.entries) {
    console.log(`${entry.fileName}`)
    console.log(`  from: ${entry.sourcePath}`)
    console.log(`  to:   ${entry.targetUrl}`)
  }

  console.log()
  console.log("Upload transport is deployment-specific.")
  console.log("Use this plan with the publisher for your configured update target.")
  console.log("=".repeat(50))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
