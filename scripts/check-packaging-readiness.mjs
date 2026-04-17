#!/usr/bin/env node

import path from "node:path"
import { fileURLToPath } from "node:url"
import { assessPackagingReadiness } from "./release-config.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")
const readiness = assessPackagingReadiness({
  env: process.env,
  rootDir,
})

if (readiness.ok) {
  console.log("OpenCodex packaging readiness: OK")
  process.exit(0)
}

console.log("OpenCodex packaging readiness: BLOCKED")
for (const issue of readiness.issues) {
  console.log(`- ${issue}`)
}
process.exit(1)
