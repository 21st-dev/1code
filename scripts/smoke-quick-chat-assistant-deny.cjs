#!/usr/bin/env node

// Live Claude assistant-tier denial smoke for folderless quick chat.
//
// Verifies that for a folderless/assistant run the Claude SDK is given
// `disallowedTools` so Read/Bash/Edit/etc. are never even advertised to the
// model — independent of the canUseTool hook. Mirrors the
// real Locus assistant config (permissionMode "plan" + the assistant denylist
// + an allow-only-web canUseTool) and asks the model to read a real file.
//
// PASS = the SDK init advertises NO denied tool, and no denied tool_use occurs.

const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const Database = require("better-sqlite3")
const { app, safeStorage } = require("electron")

if (!app || !safeStorage) {
  throw new Error(
    "This smoke helper must be run by Electron with ELECTRON_RUN_AS_NODE unset.",
  )
}

// Mirrors getClaudeAssistantSdkDisallowedTools() in
// src/main/lib/agent-runtime/permission-policy.ts. Verified against source below.
const ASSISTANT_SDK_DISALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookRead",
  "NotebookEdit",
  "Glob",
  "Grep",
  "LS",
  "Bash",
  "BashOutput",
  "KillShell",
  "Task",
  "TodoRead",
  "TodoWrite",
  "ExitPlanMode",
]
const ASSISTANT_ALLOWED_WEB = new Set(["websearch", "webfetch"])

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function decryptSecret(encrypted) {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
}

function parseCredentialPayload(payload) {
  const trimmed = payload.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (
      parsed &&
      parsed.version === 1 &&
      parsed.kind === "claude_code_oauth" &&
      typeof parsed.accessToken === "string" &&
      parsed.accessToken.trim()
    ) {
      return { envelope: parsed }
    }
  } catch {
    // legacy bare token
  }
  return {
    envelope: {
      version: 1,
      kind: "claude_code_oauth",
      accessToken: trimmed,
      source: "legacy_db",
    },
  }
}

function readActiveCredential(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const settings = db
      .prepare("select active_account_id from anthropic_settings where id = ?")
      .get("singleton")
    let account = null
    if (settings?.active_account_id) {
      account = db
        .prepare("select oauth_token from anthropic_accounts where id = ?")
        .get(settings.active_account_id)
    }
    let legacy = null
    if (!account?.oauth_token) {
      legacy = db
        .prepare("select oauth_token from claude_code_credentials where id = ?")
        .get("default")
    }
    const encrypted = account?.oauth_token ?? legacy?.oauth_token
    if (!encrypted) throw new Error("No active Claude Code credential in DB")
    const stored = parseCredentialPayload(decryptSecret(encrypted))
    if (!stored?.envelope.accessToken) {
      throw new Error("Active Claude Code credential could not be parsed")
    }
    return stored
  } finally {
    db.close()
  }
}

function buildEnv(accessToken, configDir) {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  delete env.CLAUDE_CODE_USE_BEDROCK
  delete env.CLAUDE_CODE_USE_VERTEX
  env.HOME = os.homedir()
  env.USER = os.userInfo().username
  env.SHELL = env.SHELL || "/bin/zsh"
  env.TERM = env.TERM || "xterm-256color"
  env.PATH = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    env.PATH || "",
  ]
    .filter(Boolean)
    .join(":")
  env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts"
  env.CLAUDE_CODE_ENABLE_TASKS = "false"
  env.CLAUDE_CODE_OAUTH_TOKEN = accessToken
  env.CLAUDE_CONFIG_DIR = configDir
  return env
}

function normalize(name) {
  return String(name)
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase()
}

function summarizeEvent(message) {
  const summary = { type: message?.type }
  if (Array.isArray(message?.tools)) {
    summary.tools = message.tools
  }
  const content = message?.message?.content
  if (Array.isArray(content)) {
    summary.contentTypes = content.map((block) => block?.type ?? "unknown")
    const toolNames = content
      .filter((block) => block?.type === "tool_use")
      .map((block) => block.name)
    if (toolNames.length > 0) summary.toolNames = toolNames
  }
  return summary
}

// Mirror of decideAssistantToolPermission: allow only web tools, deny the rest.
function assistantCanUseTool(toolName) {
  if (ASSISTANT_ALLOWED_WEB.has(normalize(toolName))) {
    return { behavior: "allow", updatedInput: {} }
  }
  return { behavior: "deny", message: `assistant mode blocks ${toolName}` }
}

function verifyDenylistMatchesSource() {
  const src = path.join(
    process.cwd(),
    "src",
    "main",
    "lib",
    "agent-runtime",
    "permission-policy.ts",
  )
  if (!fs.existsSync(src)) return { checked: false }
  const text = fs.readFileSync(src, "utf-8")
  const missing = ASSISTANT_SDK_DISALLOWED_TOOLS.filter(
    (tool) => !text.includes(`"${tool}"`),
  )
  return { checked: true, missing }
}

async function main() {
  app.setName("Locus Dev")
  const userDataPath = path.join(
    app.getPath("appData"),
    "Agent Code for Me Dev",
  )
  app.setPath("userData", userDataPath)
  await app.whenReady()

  const dbPath = readArg("db", path.join(userDataPath, "data", "agents.db"))
  const claudeBinary = readArg(
    "claude-binary",
    path.join(
      process.cwd(),
      "resources",
      "bin",
      process.platform === "darwin" && process.arch === "arm64"
        ? "darwin-arm64"
        : `${process.platform}-${process.arch}`,
      process.platform === "win32" ? "claude.exe" : "claude",
    ),
  )
  const targetFile = readArg("target-file", "/etc/hosts")
  const expectedMarker = "NO_FILE_TOOL_AVAILABLE"
  const prompt = readArg(
    "prompt",
    `You are in a restricted assistant mode. Use your Read tool (or any file/Bash tool) to read the file at ${targetFile} and print its exact contents. If you do not have a tool that can read files, reply with the single line: ${expectedMarker} and list the tool names you do have.`,
  )

  if (!fs.existsSync(claudeBinary)) {
    throw new Error(`Claude binary does not exist: ${claudeBinary}`)
  }

  const drift = verifyDenylistMatchesSource()
  if (drift.checked && drift.missing.length > 0) {
    throw new Error(
      `Denylist drift: source no longer lists ${drift.missing.join(", ")}`,
    )
  }
  console.log("[smoke] denylist-source-check:", JSON.stringify(drift))

  const stored = readActiveCredential(dbPath)
  const scratchCwd = path.join(
    os.tmpdir(),
    `locus-assistant-smoke-${Date.now()}`,
  )
  await fsp.mkdir(scratchCwd, { recursive: true })
  const configDir = path.join(
    userDataPath,
    "claude-sessions",
    `assistant-smoke-${Date.now()}`,
  )
  await fsp.mkdir(configDir, { recursive: true })

  const { query } = await import("@anthropic-ai/claude-agent-sdk")
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 120_000)

  const stderrLines = []
  let messageCount = 0
  let advertisedTools = null
  const deniedToolUses = []
  const allowedToolUses = []
  let finalText = ""

  try {
    const stream = query({
      prompt,
      options: {
        abortController,
        cwd: scratchCwd,
        env: buildEnv(stored.envelope.accessToken, configDir),
        pathToClaudeCodeExecutable: claudeBinary,
        // Mirror Locus assistant mapping exactly:
        permissionMode: "plan",
        allowDangerouslySkipPermissions: false,
        disallowedTools: [...ASSISTANT_SDK_DISALLOWED_TOOLS],
        includePartialMessages: true,
        settingSources: ["project", "user"],
        canUseTool: async (toolName) => assistantCanUseTool(toolName),
        stderr: (data) => stderrLines.push(String(data)),
      },
    })

    for await (const message of stream) {
      messageCount += 1
      // SDK init event advertises the available tool set.
      if (message?.type === "system" && Array.isArray(message.tools)) {
        advertisedTools = message.tools
      }
      // Collect any tool_use blocks (assistant turns).
      const content = message?.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use") {
            const denied = ASSISTANT_SDK_DISALLOWED_TOOLS.some(
              (t) => normalize(t) === normalize(block.name),
            )
            ;(denied ? deniedToolUses : allowedToolUses).push(block.name)
          }
          if (block?.type === "text" && typeof block.text === "string") {
            finalText = block.text
          }
        }
      }
      if (messageCount <= 6) {
        console.log("[smoke] event:", JSON.stringify(summarizeEvent(message)))
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  const advertisedDenied = (advertisedTools ?? []).filter((tool) =>
    ASSISTANT_SDK_DISALLOWED_TOOLS.some(
      (t) => normalize(t) === normalize(tool),
    ),
  )
  const advertisedWeb = (advertisedTools ?? []).filter((tool) =>
    ASSISTANT_ALLOWED_WEB.has(normalize(tool)),
  )

  console.log("[smoke] messageCount:", messageCount)
  console.log("[smoke] advertisedTools:", JSON.stringify(advertisedTools))
  console.log(
    "[smoke] advertisedDeniedTools:",
    JSON.stringify(advertisedDenied),
  )
  console.log("[smoke] advertisedWebTools:", JSON.stringify(advertisedWeb))
  console.log("[smoke] deniedToolUses:", JSON.stringify(deniedToolUses))
  console.log("[smoke] allowedToolUses:", JSON.stringify(allowedToolUses))
  console.log(
    "[smoke] finalTextMarker:",
    finalText.includes(expectedMarker) ? expectedMarker : "<missing>",
  )
  console.log("[smoke] stderrBytes:", stderrLines.join("\n").length)

  const failures = []
  if (messageCount === 0) failures.push("no SDK messages")
  if (advertisedTools === null)
    failures.push("never saw SDK tool advertisement")
  if (advertisedDenied.length > 0) {
    failures.push(`denied tools advertised: ${advertisedDenied.join(", ")}`)
  }
  if (deniedToolUses.length > 0) {
    failures.push(`denied tool was invoked: ${deniedToolUses.join(", ")}`)
  }
  if (
    !advertisedWeb.includes("WebFetch") ||
    !advertisedWeb.includes("WebSearch")
  ) {
    failures.push("web tools were not retained")
  }
  if (!finalText.includes(expectedMarker)) {
    failures.push(`model did not reply with ${expectedMarker}`)
  }

  if (failures.length > 0) {
    console.error("[smoke] result: failed —", failures.join("; "))
    process.exitCode = 1
    return
  }
  console.log("[smoke] result: passed")
}

main()
  .catch((error) => {
    console.error("[smoke] result: failed")
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (app.isReady()) app.quit()
  })
