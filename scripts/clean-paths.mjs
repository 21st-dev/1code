#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")
const targets = process.argv.slice(2)

if (targets.length === 0) {
  console.error("Provide one or more relative paths to clean.")
  process.exit(1)
}

for (const target of targets) {
  const normalizedTarget = path.normalize(target)
  if (
    path.isAbsolute(normalizedTarget) ||
    normalizedTarget === ".." ||
    normalizedTarget.startsWith(`..${path.sep}`)
  ) {
    console.error(`Refusing to clean unsafe path: ${target}`)
    process.exit(1)
  }

  fs.rmSync(path.join(rootDir, normalizedTarget), { recursive: true, force: true })
}
