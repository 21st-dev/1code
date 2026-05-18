#!/usr/bin/env node

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

const HOSTED_NEEDLES = [
  "21st.dev",
  "1code.dev",
  "21st.sh",
  "e2b.app",
  "csb.app",
  "codesandbox.io",
]
const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep"])

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
      return {
        envelope: parsed,
        storageFormat: "envelope",
      }
    }
  } catch {
    // Legacy rows decrypt to a bare token.
  }

  return {
    envelope: {
      version: 1,
      kind: "claude_code_oauth",
      accessToken: trimmed,
      source: "legacy_db",
      importedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    storageFormat: "legacy_plain_token",
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
        .prepare(
          "select id, email, display_name, oauth_token, connected_at, last_used_at from anthropic_accounts where id = ?",
        )
        .get(settings.active_account_id)
    }

    let legacy = null
    if (!account?.oauth_token) {
      legacy = db
        .prepare(
          "select id, oauth_token, connected_at, user_id from claude_code_credentials where id = ?",
        )
        .get("default")
    }

    const encrypted = account?.oauth_token ?? legacy?.oauth_token
    if (!encrypted) {
      throw new Error("No active Claude Code credential found in app database")
    }

    const stored = parseCredentialPayload(decryptSecret(encrypted))
    if (!stored?.envelope.accessToken) {
      throw new Error("Active Claude Code credential could not be parsed")
    }

    return {
      account,
      legacy,
      stored,
    }
  } finally {
    db.close()
  }
}

function metadataFor(stored, account, legacy) {
  const { envelope, storageFormat } = stored
  const expiresAt = envelope.expiresAt ? new Date(envelope.expiresAt) : null
  const now = Date.now()

  return {
    isConnected: Boolean(envelope.accessToken),
    accountId: account?.id ?? null,
    displayName: account?.display_name ?? null,
    connectedAt: account?.connected_at ?? legacy?.connected_at ?? null,
    source: envelope.source ?? null,
    storageFormat,
    refreshable: Boolean(envelope.refreshToken),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    isExpired: expiresAt ? expiresAt.getTime() <= now : false,
    importedAt: envelope.importedAt ?? null,
    updatedAt: envelope.updatedAt ?? null,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
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
  ].filter(Boolean).join(":")
  env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts"
  env.CLAUDE_CODE_ENABLE_TASKS = "false"
  env.CLAUDE_CODE_OAUTH_TOKEN = accessToken
  env.CLAUDE_CONFIG_DIR = configDir

  return env
}

function scanNeedles(text) {
  const lower = text.toLowerCase()
  return HOSTED_NEEDLES.filter((needle) => lower.includes(needle))
}

async function main() {
  app.setName("Locus Dev")
  const userDataPath = path.join(app.getPath("appData"), "Agent Code for Me Dev")
  app.setPath("userData", userDataPath)

  await app.whenReady()

  const projectPath = path.resolve(
    readArg("project", "/Users/ethan/Documents/GitHub/agent-code-for-me"),
  )
  const dbPath = readArg(
    "db",
    path.join(userDataPath, "data", "agents.db"),
  )
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
  const prompt = readArg(
    "prompt",
    "Read AGENTS.md and summarize the repository instructions in one short paragraph. Do not edit files, do not write files, and do not run shell commands.",
  )

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`)
  }
  if (!fs.existsSync(claudeBinary)) {
    throw new Error(`Claude binary does not exist: ${claudeBinary}`)
  }

  const { account, legacy, stored } = readActiveCredential(dbPath)
  const metadata = metadataFor(stored, account, legacy)
  console.log("[smoke] credential metadata:", JSON.stringify(metadata, null, 2))

  if (!metadata.refreshable) {
    throw new Error("Active Claude Code credential is not refreshable")
  }
  if (metadata.isExpired) {
    throw new Error("Active Claude Code credential is expired")
  }

  const configDir = path.join(
    userDataPath,
    "claude-sessions",
    `smoke-${Date.now()}`,
  )
  await fsp.mkdir(configDir, { recursive: true })

  const { query } = await import("@anthropic-ai/claude-agent-sdk")
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), 120_000)
  const stderrLines = []
  const eventText = []
  let messageCount = 0

  try {
    const stream = query({
      prompt,
      options: {
        abortController,
        cwd: projectPath,
        env: buildEnv(stored.envelope.accessToken, configDir),
        pathToClaudeCodeExecutable: claudeBinary,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        settingSources: ["project", "user"],
        canUseTool: async (toolName, toolInput) => {
          if (!READ_ONLY_TOOLS.has(toolName)) {
            return {
              behavior: "deny",
              message: `Smoke test allows only read-only file inspection; ${toolName} is blocked.`,
            }
          }

          return { behavior: "allow", updatedInput: toolInput }
        },
        stderr: (data) => {
          stderrLines.push(String(data))
        },
      },
    })

    for await (const message of stream) {
      messageCount += 1
      const serialized = JSON.stringify(message)
      eventText.push(serialized)
      if (messageCount <= 8) {
        console.log("[smoke] event:", serialized.slice(0, 1000))
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  const combined = [...stderrLines, ...eventText].join("\n")
  const hostedMatches = scanNeedles(combined)

  console.log("[smoke] messageCount:", messageCount)
  console.log("[smoke] hostedNeedleMatches:", hostedMatches)
  console.log("[smoke] stderrBytes:", stderrLines.join("\n").length)

  if (messageCount === 0) {
    throw new Error("Claude Code smoke produced no SDK messages")
  }
  if (hostedMatches.length > 0) {
    throw new Error(`Hosted service needle found: ${hostedMatches.join(", ")}`)
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
    if (app.isReady()) {
      app.quit()
    }
  })
