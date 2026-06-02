#!/usr/bin/env node

import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const releaseDir = path.resolve(__dirname, "../release")

await rm(releaseDir, { recursive: true, force: true })
console.log(`[release] Removed ${releaseDir}`)
