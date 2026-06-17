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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function dictionaryEntriesForKey(content, key) {
  const keyPattern = escapeRegExp(key)
  const entryPattern = new RegExp(
    `"${keyPattern}"\\s*:\\s*([\\s\\S]*?)(?=,\\n\\s*"[^"]+"\\s*:)`,
    "g",
  )
  return [...content.matchAll(entryPattern)].map((match) => match[1])
}

function assertDictionaryContainsValue(content, key, expectedValue) {
  const entries = dictionaryEntriesForKey(content, key)
  if (!entries.some((entry) => entry.includes(JSON.stringify(expectedValue)))) {
    fail(`src/renderer/lib/i18n/dictionaries.ts must set ${key} to ${JSON.stringify(expectedValue)} in at least one locale.`)
  }
}

function assertDictionaryValueExcludes(content, key, forbiddenValues) {
  const entries = dictionaryEntriesForKey(content, key)
  if (entries.length === 0) {
    fail(`src/renderer/lib/i18n/dictionaries.ts must define ${key}.`)
    return
  }

  for (const entry of entries) {
    for (const forbiddenValue of forbiddenValues) {
      if (entry.includes(forbiddenValue)) {
        fail(`src/renderer/lib/i18n/dictionaries.ts ${key} must not use retired Chat vocabulary ${JSON.stringify(forbiddenValue)}.`)
      }
    }
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
    "## Renderer Chat Message Model And Hydration",
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

function assertChatMessageModelOwner() {
  const normalizerOwner = "src/shared/chat-message-normalizer.ts"
  const removedShim = "src/renderer/lib/mock-api.ts"
  const sourceFiles = walkFiles("src", [".ts", ".tsx"])
  const normalizerExportFiles = []

  if (existsSync(path.join(repoRoot, removedShim))) {
    fail(`${removedShim} must not exist; renderer chat data must use agent-chat-api plus the shared normalizer.`)
  }

  for (const absolutePath of sourceFiles) {
    const filePath = relative(absolutePath)
    const content = readFileSync(absolutePath, "utf8")

    if (/from\s+["'][^"']*mock-api["']/.test(content)) {
      fail(`${filePath} must not import the removed mock-api shim.`)
    }

    if (/\bexport\s+(?:function|const)\s+normalizePersistedChatMessages\b/.test(content)) {
      normalizerExportFiles.push(filePath)
    }
  }

  if (
    normalizerExportFiles.length !== 1 ||
    normalizerExportFiles[0] !== normalizerOwner
  ) {
    fail(
      `normalizePersistedChatMessages must be exported only from ${normalizerOwner}; found ${normalizerExportFiles.join(", ") || "none"}.`,
    )
  }

  const adapter = readText("src/renderer/features/agents/lib/agent-chat-api.ts")
  if (!adapter.includes('from "../../../../shared/chat-message-normalizer"')) {
    fail("agent-chat-api must hydrate persisted messages through src/shared/chat-message-normalizer.ts.")
  }
}

function assertNoDeadSettingsState() {
  const atomsFile = "src/renderer/lib/atoms/index.ts"
  const atomsContent = readText(atomsFile)

  // Atoms defined in the settings/atoms source, and the persisted subset.
  const defRegex = /export\s+const\s+(\w+)\s*=\s*(?:atomWithStorage|atomFamily|atom)\b/g
  const defMatches = [...atomsContent.matchAll(defRegex)]
  const definedAtoms = defMatches.map((m) => m[1])
  const persistedAtoms = [
    ...atomsContent.matchAll(/export\s+const\s+(\w+)\s*=\s*atomWithStorage\b/g),
  ].map((m) => m[1])

  // Text of every source file except the atoms definition file, for detecting
  // references that live outside atoms/index.ts (a real consumer).
  const externalText = walkFiles("src", [".ts", ".tsx"])
    .filter((p) => relative(p) !== atomsFile)
    .map((p) => readFileSync(p, "utf8"))
    .join("\n")
  const wordRegex = (name) => new RegExp(`\\b${name}\\b`)

  // Liveness: seed with atoms referenced outside atoms/index.ts, then propagate
  // consumer -> producer (a live derived atom's body keeps the atoms it reads
  // alive) so a setting read only through a live derived atom is not flagged.
  const bodyByName = new Map()
  for (let i = 0; i < defMatches.length; i++) {
    const start = defMatches[i].index
    const end = i + 1 < defMatches.length ? defMatches[i + 1].index : atomsContent.length
    bodyByName.set(defMatches[i][1], atomsContent.slice(start, end))
  }
  const live = new Set(definedAtoms.filter((name) => wordRegex(name).test(externalText)))
  let changed = true
  while (changed) {
    changed = false
    for (const liveName of [...live]) {
      const body = bodyByName.get(liveName)
      if (!body) continue
      for (const name of definedAtoms) {
        if (!live.has(name) && wordRegex(name).test(body)) {
          live.add(name)
          changed = true
        }
      }
    }
  }

  for (const name of persistedAtoms) {
    if (!live.has(name)) {
      fail(
        `Persisted settings atom ${name} in ${atomsFile} has no reader (dead settings state); wire a reader/control or remove it.`,
      )
    }
  }

  // Every settings tab module must be reached by the settings content switcher.
  // Match by module path (not exported symbol), so same-file aliases such as
  // AgentsProjectWorktreeTab / AgentsProjectsTab are not false positives.
  const switcher = readText("src/renderer/features/settings/settings-content.tsx")
  const tabModules = walkFiles("src/renderer/components/dialogs/settings-tabs", [".tsx"])
    .map(relative)
    .filter((p) => /agents-[\w-]+-tab\.tsx$/.test(p))
  for (const tabModule of tabModules) {
    const moduleName = path.basename(tabModule, ".tsx")
    if (!switcher.includes(`settings-tabs/${moduleName}`)) {
      fail(
        `Settings tab module ${tabModule} is never rendered by settings-content.tsx (unrendered tab); render it or remove it.`,
      )
    }
  }
}

function assertCanonicalVocabularyI18n() {
  const dictionary = readText("src/renderer/lib/i18n/dictionaries.ts")

  const expectedValues = [
    ["sidebar.newChat", "New Quick chat"],
    ["sidebar.newChat", "新建快速对话"],
    ["sidebar.startNewChat", "Start a Quick chat"],
    ["sidebar.startNewChat", "开始快速对话"],
    ["settings.keyboard.actions.newWorkspace", "New Workspace"],
    ["settings.keyboard.actions.newWorkspace", "新建工作区"],
    ["quickChat.attachFolder", "Attach a Project"],
    ["quickChat.attachFolder", "关联项目"],
    ["sidebar.openRepository", "Open a Project"],
    ["sidebar.openRepository", "打开项目"],
    ["settings.models.subChatTitle.title", "Chat Title API"],
    ["settings.models.subChatTitle.title", "对话标题 API"],
    ["settings.debug.chats", "Workspaces"],
    ["settings.debug.chats", "工作区"],
    ["settings.debug.subChats", "Chats"],
    ["settings.debug.subChats", "对话"],
  ]

  for (const [key, expectedValue] of expectedValues) {
    assertDictionaryContainsValue(dictionary, key, expectedValue)
  }

  const chatEntityLabelKeys = [
    "onboarding.customModel.utilityApisBody",
    "settings.models.subChatTitle.title",
    "settings.models.subChatTitle.description",
    "settings.models.subChatTitle.modelHint",
    "settings.commands.builtin.clear",
    "settings.debug.subChats",
    "toast.models.subChatTitleSettingsSaved",
    "toast.models.subChatTitleSettingsReset",
    "toast.models.failedToSaveSubChatTitleSettings",
    "toast.models.failedToResetSubChatTitleSettings",
    "workbench.error.chat_context_missing.body",
  ]
  const retiredChatTerms = ["sub-chat", "Sub-chat", "subchat", "子对话"]

  for (const key of chatEntityLabelKeys) {
    assertDictionaryValueExcludes(dictionary, key, retiredChatTerms)
  }
}

assertOwnershipDocs()
assertPackageScripts()
assertRuntimeCapabilitySingleOwner()
assertGuardDecisionSingleOwner()
assertRuntimeEventStateOwner()
assertChatMessageModelOwner()
assertNoDeadSettingsState()
assertCanonicalVocabularyI18n()

if (failures.length > 0) {
  console.error("Architecture guard failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Architecture guard passed.")
