#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const failures = []

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/")
}

function readText(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) {
    fail(`${relativePath} is missing.`)
    return ""
  }
  return readFileSync(absolutePath, "utf8")
}

function fail(message) {
  failures.push(message)
}

function assertIncludes(filePath, text, label) {
  const content = readText(filePath)
  if (!content.includes(text)) {
    fail(`${filePath} must include ${label}.`)
  }
}

function walkFiles(relativeDir, extensions, result = []) {
  const absoluteDir = path.join(repoRoot, relativeDir)
  if (!existsSync(absoluteDir)) return result

  for (const entry of readdirSync(absoluteDir)) {
    if (entry === "node_modules" || entry === "out" || entry === "dist") {
      continue
    }

    const absolutePath = path.join(absoluteDir, entry)
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      walkFiles(relative(absolutePath), extensions, result)
      continue
    }

    if (extensions.some((extension) => entry.endsWith(extension))) {
      result.push(absolutePath)
    }
  }

  return result
}

function assertPackageScripts() {
  const packageJson = JSON.parse(readText("package.json"))
  const scripts = packageJson.scripts ?? {}
  if (scripts["architecture:check"] !== "node scripts/check-architecture-guards.mjs") {
    fail("package.json scripts.architecture:check must run scripts/check-architecture-guards.mjs.")
  }
  if (!String(scripts.check ?? "").includes("bun run architecture:check")) {
    fail("package.json scripts.check must include bun run architecture:check.")
  }
}

function assertOwnershipDocs() {
  const requiredSections = [
    "## Runtime Capability Truth",
    "## Runtime Chat UI Event State",
    "## Guard Decisions",
    "## Provider Credentials",
    "## Claude Desktop Chat Runtime",
    "## Codex Desktop Chat Runtime",
    "## Headless Agent Runtime",
    "## Runtime MCP Configuration",
    "## tRPC Route Boundary",
  ]

  const ownershipMap = readText("docs/OWNERSHIP_MAP.md")
  for (const section of requiredSections) {
    if (!ownershipMap.includes(section)) {
      fail(`docs/OWNERSHIP_MAP.md must include ${section}.`)
    }
  }

  assertIncludes(
    "AGENTS.md",
    "This project does not allow old/new duplicate business paths.",
    "the no-double-path rule",
  )
  assertIncludes(
    "AGENTS.md",
    "docs/OWNERSHIP_MAP.md",
    "the ownership map reference",
  )
}

function assertRuntimeCapabilitySingleOwner() {
  const owner = "src/shared/agent-runtime-capabilities.ts"
  const sourceFiles = walkFiles("src", [".ts", ".tsx"])

  for (const absolutePath of sourceFiles) {
    const filePath = relative(absolutePath)
    const content = readFileSync(absolutePath, "utf8")
    if (
      filePath !== owner &&
      /\b(?:export\s+)?const\s+AGENT_RUNTIME_CAPABILITY_IDS\s*=/.test(content)
    ) {
      fail(`Runtime capability ID definitions belong only in ${owner}, not ${filePath}.`)
    }
    if (filePath !== owner && /\bcapability\(\s*\{/.test(content)) {
      fail(`Runtime capability manifest entries belong only in ${owner}, not ${filePath}.`)
    }
  }

  const codexFacade = readText("src/shared/codex-runtime-capabilities.ts")
  if (!codexFacade.includes('from "./agent-runtime-capabilities"')) {
    fail("src/shared/codex-runtime-capabilities.ts must import capability truth from agent-runtime-capabilities.")
  }
  if (/\bcapability\(\s*\{/.test(codexFacade)) {
    fail("src/shared/codex-runtime-capabilities.ts must remain a facade, not a second capability manifest.")
  }
}

function assertGuardDecisionSingleOwner() {
  const owner = "src/main/lib/agent-guard/decision.ts"
  const sourceFiles = walkFiles("src", [".ts", ".tsx"])
  const exports = []

  for (const absolutePath of sourceFiles) {
    const filePath = relative(absolutePath)
    const content = readFileSync(absolutePath, "utf8")
    if (/\bexport\s+function\s+decideClaudeToolUse\b/.test(content)) {
      exports.push(filePath)
    }
    if (filePath !== owner && /\bfunction\s+decide[A-Za-z]*ToolUse\b/.test(content)) {
      fail(`Guarded tool-use decisions belong in ${owner}, not ${filePath}.`)
    }
  }

  if (exports.length !== 1 || exports[0] !== owner) {
    fail(`decideClaudeToolUse must be exported only from ${owner}; found ${exports.join(", ") || "none"}.`)
  }
}

function assertRuntimeEventStateOwner() {
  const owner = "src/renderer/features/agents/lib/runtime-event-state.ts"
  const transportDir = "src/renderer/features/agents/lib"
  const ownerOnlyAtoms = [
    "askUserQuestionResultsAtom",
    "expiredUserQuestionsAtom",
    "guardedRunAuditsAtom",
    "guardedRunEventsAtom",
    "pendingScopeExpansionRequestsAtom",
    "pendingUserQuestionsAtom",
  ]

  readText(owner)

  for (const absolutePath of walkFiles(transportDir, [".ts", ".tsx"])) {
    const filePath = relative(absolutePath)
    if (filePath === owner) {
      continue
    }

    const content = readFileSync(absolutePath, "utf8")
    for (const atomName of ownerOnlyAtoms) {
      if (content.includes(atomName)) {
        fail(`${atomName} mutations belong in ${owner}, not ${filePath}.`)
      }
    }
  }
}

assertOwnershipDocs()
assertPackageScripts()
assertRuntimeCapabilitySingleOwner()
assertGuardDecisionSingleOwner()
assertRuntimeEventStateOwner()

if (failures.length > 0) {
  console.error("Architecture guard failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Architecture guard passed.")
