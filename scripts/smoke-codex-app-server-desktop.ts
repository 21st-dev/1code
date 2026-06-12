import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { app } from "electron"
import { eq } from "drizzle-orm"

type Scenario =
  | "provider-plan"
  | "guarded-approve"
  | "structured-apply-patch"
  | "plan-denial"
  | "cancel"
  | "mcp-readiness"
  | "long-output"
  | "multi-round-resume"
  | "locus-edit-adoption"
  | "controlled-edit"

type AuthMode = "provider" | "chatgpt" | "api_key"
type AdoptionTier = "zero" | "light" | "explicit"

type DbModule = typeof import("../src/main/lib/db")
let dbModulePromise: Promise<DbModule> | null = null

async function loadDbModule(): Promise<DbModule> {
  dbModulePromise ??= import("../src/main/lib/db")
  return dbModulePromise
}

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function readOptionalArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function readBooleanArg(name: string, fallback = false): boolean {
  const value = readOptionalArg(name)
  if (value === undefined) return fallback
  return value === "1" || value === "true" || value === "yes"
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseJson(value: string | null | undefined, fallback: any = null): any {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function logSmokePhase(phase: string, detail?: Record<string, unknown>): void {
  console.error(`[app-server-smoke] ${phase}`, detail ? redact(detail) : "")
}

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>")
    .replace(/smoke-mcp-secret-[A-Za-z0-9_-]+/g, "<redacted>")
    .replace(/locus-edit-probe-secret-[A-Za-z0-9_-]+/g, "<redacted>")
    .replace(/(SMOKE_MCP_SECRET\s*=\s*)"[^\"]*"/g, '$1"<redacted>"')
    .replace(
      /(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{10,})/g,
      "$1<redacted>",
    )
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|token)=\S+/gi, "$1=<redacted>")
}

function redact(value: unknown): string {
  return redactText(JSON.stringify(value, null, 2))
}

function readJsonl(filePath: string): unknown[] {
  if (!existsSync(filePath)) return []
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJson(line, { parseError: true, raw: line }))
}

function resolveSmokeNodePath(): string {
  for (const candidate of [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    process.env.NODE_PATH,
  ]) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return "node"
}

function sourceCodexHome(): string {
  return path.resolve(readOptionalArg("source-codex-home") ?? process.env.CODEX_HOME ?? path.join(homedir(), ".codex"))
}

function copyCodexAuthFiles(targetCodexHome: string): string[] {
  const source = sourceCodexHome()
  const copied: string[] = []
  for (const fileName of ["auth.json", "installation_id"]) {
    const sourcePath = path.join(source, fileName)
    if (!existsSync(sourcePath)) continue
    copyFileSync(sourcePath, path.join(targetCodexHome, fileName))
    copied.push(fileName)
  }
  return copied
}

function setupMcpReadinessCodexHome(outDir: string): {
  codexHome: string
  serverName: string
  secret: string
} {
  const codexHome = path.join(outDir, "codex-home")
  const serverPath = path.join(outDir, "smoke-mcp-server.mjs")
  const serverName = "locus_smoke_mcp"
  const secret = `smoke-mcp-secret-${Date.now()}`
  rmSync(codexHome, { recursive: true, force: true })
  ensureDir(codexHome)
  ensureDir(outDir)
  writeFileSync(
    serverPath,
    [
      "import readline from 'node:readline'",
      "const rl = readline.createInterface({ input: process.stdin })",
      "function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n') }",
      "rl.on('line', (line) => {",
      "  if (!line.trim()) return",
      "  const msg = JSON.parse(line)",
      "  if (msg.method === 'initialize') {",
      "    send(msg.id, {",
      "      protocolVersion: msg.params?.protocolVersion || '2024-11-05',",
      "      capabilities: { tools: {} },",
      "      serverInfo: { name: 'locus-smoke-mcp', version: '1.0.0' },",
      "    })",
      "    return",
      "  }",
      "  if (msg.method === 'tools/list') {",
      "    send(msg.id, { tools: [{ name: 'smoke_echo', description: 'Echo for Locus app-server MCP readiness smoke.', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] })",
      "    return",
      "  }",
      "  if (msg.method === 'tools/call') {",
      "    send(msg.id, { content: [{ type: 'text', text: `smoke:${msg.params?.arguments?.text || ''}` }] })",
      "    return",
      "  }",
      "  if (msg.id !== undefined) send(msg.id, {})",
      "})",
    ].join("\n"),
  )
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      `[mcp_servers.${serverName}]`,
      `command = ${JSON.stringify(resolveSmokeNodePath())}`,
      `args = [${JSON.stringify(serverPath)}]`,
      "",
      `[mcp_servers.${serverName}.env]`,
      `SMOKE_MCP_SECRET = ${JSON.stringify(secret)}`,
      "",
    ].join("\n"),
  )
  return { codexHome, serverName, secret }
}

function setupLocusEditAdoptionCodexHome(outDir: string): {
  codexHome: string
  serverName: string
  toolName: string
  toolCallLogPath: string
  secret: string
  copiedAuthFiles: string[]
} {
  const codexHome = path.join(outDir, "codex-home")
  const serverPath = path.join(outDir, "locus-edit-probe-mcp-server.mjs")
  const toolCallLogPath = path.join(outDir, "locus-edit-probe-calls.jsonl")
  const serverName = "locus_edit"
  const toolName = "propose_file_edit"
  const secret = `locus-edit-probe-secret-${Date.now()}`
  rmSync(codexHome, { recursive: true, force: true })
  rmSync(toolCallLogPath, { force: true })
  ensureDir(codexHome)
  ensureDir(outDir)
  writeFileSync(
    serverPath,
    [
      "import fs from 'node:fs'",
      "import readline from 'node:readline'",
      "const logPath = process.env.LOCUS_EDIT_PROBE_LOG",
      "const rl = readline.createInterface({ input: process.stdin })",
      "function log(message) {",
      "  if (!logPath) return",
      "  fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), message }) + '\\n')",
      "}",
      "function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n') }",
      "rl.on('line', (line) => {",
      "  if (!line.trim()) return",
      "  const msg = JSON.parse(line)",
      "  log(msg)",
      "  if (msg.method === 'initialize') {",
      "    send(msg.id, {",
      "      protocolVersion: msg.params?.protocolVersion || '2024-11-05',",
      "      capabilities: { tools: {} },",
      "      serverInfo: { name: 'locus-edit-probe', version: '1.0.0' },",
      "    })",
      "    return",
      "  }",
      "  if (msg.method === 'tools/list') {",
      "    send(msg.id, { tools: [{",
      `      name: ${JSON.stringify(toolName)},`,
      "      description: 'Propose a Locus-controlled file edit. This records structured edit intent only; Locus validates scope, shows a diff, asks for approval, and applies the edit later. Use this for guarded file edits instead of shell file writes.',",
      "      inputSchema: {",
      "        type: 'object',",
      "        properties: {",
      "          path: { type: 'string', description: 'Relative file path inside the current workspace.' },",
      "          operation: { type: 'string', enum: ['create', 'replace', 'patch'] },",
      "          content: { type: 'string', description: 'Full content for create or replace operations.' },",
      "          unified_diff: { type: 'string', description: 'Unified diff for patch operations.' },",
      "        },",
      "        required: ['path', 'operation'],",
      "      },",
      "    }] })",
      "    return",
      "  }",
      "  if (msg.method === 'tools/call') {",
      "    send(msg.id, {",
      "      content: [{ type: 'text', text: 'Locus edit proposal recorded. No filesystem write was performed by this probe.' }],",
      "      isError: false,",
      "    })",
      "    return",
      "  }",
      "  if (msg.id !== undefined) send(msg.id, {})",
      "})",
    ].join("\n"),
  )
  writeFileSync(
    path.join(codexHome, "config.toml"),
    [
      `[mcp_servers.${serverName}]`,
      `command = ${JSON.stringify(resolveSmokeNodePath())}`,
      `args = [${JSON.stringify(serverPath)}]`,
      "",
      `[mcp_servers.${serverName}.env]`,
      `LOCUS_EDIT_PROBE_LOG = ${JSON.stringify(toolCallLogPath)}`,
      `LOCUS_EDIT_PROBE_SECRET = ${JSON.stringify(secret)}`,
      "",
    ].join("\n"),
  )
  const copiedAuthFiles = readBooleanArg("inherit-codex-auth", false)
    ? copyCodexAuthFiles(codexHome)
    : []
  return { codexHome, serverName, toolName, toolCallLogPath, secret, copiedAuthFiles }
}

function redactMcpReadinessCodexHome(codexHome: string): void {
  const configPath = path.join(codexHome, "config.toml")
  if (existsSync(configPath)) {
    writeFileSync(configPath, redactText(readFileSync(configPath, "utf8")))
  }
  rmSync(path.join(codexHome, "shell_snapshots"), {
    recursive: true,
    force: true,
  })
  rmSync(path.join(codexHome, "auth.json"), { force: true })
  rmSync(path.join(codexHome, "installation_id"), { force: true })
  rmSync(path.join(codexHome, "sessions"), {
    recursive: true,
    force: true,
  })
  rmSync(path.join(codexHome, "plugins"), {
    recursive: true,
    force: true,
  })
  rmSync(path.join(codexHome, ".tmp"), {
    recursive: true,
    force: true,
  })
}

async function seedDesktopRows(input: {
  projectId: string
  chatId: string
  subChatId: string
  cwd: string
  scenario: Scenario
  mode: "plan" | "agent"
}) {
  const { getDatabase, projects, chats, subChats } = await loadDbModule()
  const db = getDatabase()
  const date = new Date()

  const existingProjectById = db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .get()
  const existingProjectByPath = db
    .select()
    .from(projects)
    .all()
    .find((project) => project.path === input.cwd)
  const projectId = existingProjectById?.id ?? existingProjectByPath?.id ?? input.projectId

  if (!existingProjectById && !existingProjectByPath) {
    db.insert(projects)
      .values({
        id: projectId,
        name: `Codex app-server smoke ${input.scenario}`,
        path: input.cwd,
        createdAt: date,
        updatedAt: date,
      })
      .run()
  }

  const existingChat = db
    .select()
    .from(chats)
    .where(eq(chats.id, input.chatId))
    .get()
  if (!existingChat) {
    db.insert(chats)
      .values({
        id: input.chatId,
        name: `6.8 ${input.scenario}`,
        projectId,
        createdAt: date,
        updatedAt: date,
      })
      .run()
  }

  const existingSubChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, input.subChatId))
    .get()
  if (!existingSubChat) {
    db.insert(subChats)
      .values({
        id: input.subChatId,
        name: `6.8 ${input.scenario}`,
        chatId: input.chatId,
        mode: input.mode,
        messages: "[]",
        createdAt: date,
        updatedAt: date,
      })
      .run()
  } else {
    db.update(subChats)
      .set({
        mode: input.mode,
        messages: "[]",
        updatedAt: date,
      })
      .where(eq(subChats.id, input.subChatId))
      .run()
  }
}

async function latestJobForRun(runId: string) {
  const { getDatabase, agentJobs } = await loadDbModule()
  const db = getDatabase()
  return db
    .select()
    .from(agentJobs)
    .all()
    .filter((job) => parseJson(job.inputJson)?.runId === runId)
    .at(-1)
}

async function resolveProviderProfileId(
  authMode: AuthMode,
  explicitProfileId?: string,
): Promise<string | null> {
  if (authMode !== "provider") return null
  if (explicitProfileId) return explicitProfileId

  const { getDatabase, agentProviderProfiles } = await loadDbModule()
  const db = getDatabase()
  const profile = db
    .select()
    .from(agentProviderProfiles)
    .all()
    .find((candidate) => {
      const targetRuntimes = parseJson(candidate.targetRuntimesJson, [])
      return Boolean(candidate.encryptedToken) && targetRuntimes.includes("codex")
    })

  if (!profile) {
    throw new Error("No Codex-targeted provider profile with a stored token found. Pass --profile=<id>.")
  }

  return profile.id
}

async function jobEvents(jobId: string) {
  const { getDatabase, agentJobEvents } = await loadDbModule()
  const db = getDatabase()
  return db
    .select()
    .from(agentJobEvents)
    .where(eq(agentJobEvents.jobId, jobId))
    .all()
    .map((event) => ({
      ...event,
      payloadJson: parseJson(event.payloadJson),
    }))
}

async function runScenario(input: {
  scenario: Scenario
  cwd: string
  providerProfileId: string | null
  authMode: AuthMode
  model: string
  outDir: string
  denyShellApprovals: boolean
  enableApplyPatchExperiment: boolean
  adoptionTier: AdoptionTier
}) {
  const scenarioId = input.scenario
  const mode =
    scenarioId === "provider-plan" ||
    scenarioId === "plan-denial" ||
    scenarioId === "mcp-readiness"
      ? "plan"
      : "agent"
  const projectId = `smoke-app-server-project-${scenarioId}`
  const chatId = `smoke-app-server-chat-${scenarioId}-${Date.now()}`
  const subChatId = `smoke-app-server-sub-${scenarioId}-${Date.now()}`
  const runId = `smoke-app-server-run-${scenarioId}-${Date.now()}`
  const canaryPath = path.join(input.outDir, `canary-${scenarioId}.txt`)
  if (existsSync(canaryPath)) rmSync(canaryPath)
  logSmokePhase("scenario:start", {
    scenario: scenarioId,
    outDir: input.outDir,
    canaryPath,
    denyShellApprovals: input.denyShellApprovals,
    enableApplyPatchExperiment: input.enableApplyPatchExperiment,
    adoptionTier: input.adoptionTier,
    model: input.model,
  })

  await seedDesktopRows({
    projectId,
    chatId,
    subChatId,
    cwd: input.cwd,
    scenario: scenarioId,
    mode,
  })
  logSmokePhase("scenario:seeded", { scenario: scenarioId, runId })

  logSmokePhase("scenario:router-import", { scenario: scenarioId, runId })
  const { createAppRouter } = await import("../src/main/lib/trpc/routers")
  logSmokePhase("scenario:router-imported", { scenario: scenarioId, runId })
  const caller = createAppRouter(() => null).createCaller({
    getWindow: () => null,
  })
  const chunks: unknown[] = []
  let completed = false
  let subscription: { unsubscribe: () => void } | null = null
  const promptByScenario: Record<Scenario, string> = {
    "provider-plan":
      "Output exactly this single token and no other words: LOCUS_PROVIDER_TEXT_DELTA_OK_20260612",
    "mcp-readiness":
      "Reply with exactly: app-server desktop mcp readiness smoke ok",
    "long-output":
      "Write exactly 60 numbered lines. Each line must contain the token DOGFOOD_LONG_OUTPUT_OK and its line number. Do not use tools.",
    "multi-round-resume":
      "Output exactly this single token and no other words: DOGFOOD_RESUME_TURN_ONE",
    "locus-edit-adoption": (() => {
      const relativeCanaryPath = path.relative(input.cwd, canaryPath)
      const naturalTask = [
        `Create or update ${relativeCanaryPath}.`,
        "The file content should be exactly:",
        "LOCUS_EDIT_ADOPTION_OK_20260612",
        "",
        "Do not make any other changes.",
      ].join("\n")
      if (input.adoptionTier === "light") {
        return [
          naturalTask,
          "",
          "If a structured file-editing tool is available, use it instead of shell commands for the file edit.",
        ].join("\n")
      }
      if (input.adoptionTier === "explicit") {
        return [
          naturalTask,
          "",
          "Diagnostic instruction: use the locus_edit MCP server's propose_file_edit tool to propose this edit.",
        ].join("\n")
      }
      return naturalTask
    })(),
    "controlled-edit": [
      `Create or update ${path.relative(input.cwd, canaryPath)}.`,
      "The file content should be exactly:",
      "LOCUS_CONTROLLED_EDIT_OK_20260612",
      "",
      "If a structured file-editing tool is available, use it instead of shell commands for the file edit.",
      "Do not make any other changes.",
    ].join("\n"),
    "plan-denial": `Try to create ${canaryPath} with text plan-denied. This is plan mode.`,
    "guarded-approve": [
      `Create or overwrite this exact file: ${canaryPath}`,
      "The file content must be exactly: app-server-desktop-approved-edit",
      "Use this bounded shell pattern exactly so the desktop approval bridge can review it:",
      `mkdir -p ${path.dirname(canaryPath)} && printf 'app-server-desktop-approved-edit\\n' > ${canaryPath}`,
      "Do not use here-documents, cat redirection, command substitution, Python, Node, or any other shell form.",
    ].join("\n"),
    "structured-apply-patch": [
      "Use only the Codex apply_patch file editing mechanism.",
      "Do not use shell commands, Bash, terminal commands, mkdir, echo, printf, python, node, or command execution.",
      `Create this exact file: ${canaryPath}`,
      "The file content must be exactly:",
      "app-server-desktop-approved-edit",
      "",
      "Apply this patch exactly:",
      "*** Begin Patch",
      `*** Add File: ${canaryPath}`,
      "+app-server-desktop-approved-edit",
      "*** End Patch",
    ].join("\n"),
    cancel:
      "Write a very long answer with at least 200 numbered lines. Keep going until stopped.",
  }
  const scopeContract =
    scenarioId === "guarded-approve" ||
    scenarioId === "structured-apply-patch" ||
    scenarioId === "locus-edit-adoption" ||
    scenarioId === "controlled-edit"
      ? {
          id: `scope-${runId}`,
          version: 1 as const,
          status: "approved" as const,
          createdAt: nowIso(),
          approvedAt: nowIso(),
          source: "manual" as const,
          chatId,
          subChatId,
          runId,
          cwd: input.cwd,
          projectPath: input.cwd,
          editableScope: [{ path: path.relative(input.cwd, input.outDir), kind: "directory" as const }],
          readOnlyEvidence: [],
          successChecks:
            scenarioId === "locus-edit-adoption"
              ? []
              : [
                  {
                    command: `test -f ${path.relative(input.cwd, canaryPath)}`,
                  },
                ],
          blockedPaths: [],
          expansions: [],
        }
      : undefined

  logSmokePhase("scenario:chat-request", { scenario: scenarioId, runId })
  const chatObservable = await caller.codex.chat({
      subChatId,
      chatId,
      runId,
      prompt: promptByScenario[scenarioId],
      cwd: input.cwd,
      projectPath: input.cwd,
      mode,
      model: input.model,
      providerProfileId: input.providerProfileId ?? undefined,
      ...(input.providerProfileId
        ? {}
        : {
            codexAuthMethod:
              input.authMode === "api_key" ? ("api_key" as const) : ("chatgpt" as const),
          }),
      forceNewSession: true,
      images: [],
      longTextAttachments: [],
      scopeContract,
    })
  logSmokePhase("scenario:chat-observable", { scenario: scenarioId, runId })

  const done = new Promise<void>((resolve, reject) => {
    subscription = chatObservable.subscribe({
      next: (chunk: unknown) => {
        chunks.push(chunk)
        const record = chunk as any
        if (chunks.length <= 5 || record?.type === "ask-user-question" || record?.type === "finish") {
          logSmokePhase("scenario:chunk", {
            scenario: scenarioId,
            runId,
            type: record?.type ?? null,
            count: chunks.length,
          })
        }
        if (record?.type === "ask-user-question") {
          const answers: Record<string, string> = {}
          for (const question of record.questions ?? []) {
            const prompt = question.header || question.question || "Approve"
            answers[prompt] =
              input.denyShellApprovals && question.header === "Run command"
                ? "Deny"
                : "Approve"
          }
          void caller.codex.respondToolApproval({
            toolUseId: record.toolUseId,
            approved: true,
            updatedInput: { answers },
          })
        }
        if (scenarioId === "cancel" && chunks.length >= 3) {
          void caller.codex.cancel({ subChatId, runId })
        }
      },
      error: (error: unknown) => {
        logSmokePhase("scenario:error", {
          scenario: scenarioId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        })
        reject(error)
      },
      complete: () => {
        completed = true
        logSmokePhase("scenario:complete", { scenario: scenarioId, runId })
        resolve()
      },
    })
  })

  const timeout = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error(`Scenario timed out: ${scenarioId}`)), 150_000)
  })
  try {
    await Promise.race([done, timeout])
  } finally {
    subscription?.unsubscribe()
  }

  const job = await latestJobForRun(runId)
  const events = job ? await jobEvents(job.id) : []
  const textDeltas = chunks
    .filter((chunk: any) => chunk?.type === "text-delta")
    .map((chunk: any) => (typeof chunk.delta === "string" ? chunk.delta : ""))
  const textContent = textDeltas.join("")
  const askUserQuestionChunks = chunks.filter(
    (chunk: any) => chunk?.type === "ask-user-question",
  )
  const approvalQuestionHeaders = askUserQuestionChunks.flatMap((chunk: any) =>
    (chunk.questions ?? []).map((question: any) => question.header ?? null),
  )
  const structuredFileChangeChunks = chunks.filter((chunk: any) =>
    chunk?.type === "file-change-patch" ||
    chunk?.type === "file-change-diff" ||
    chunk?.type === "file-change-delta",
  )
  const locusEditCallLogPath =
    scenarioId === "locus-edit-adoption"
      ? path.join(input.outDir, "locus-edit-probe-calls.jsonl")
      : null
  const locusEditLogEntries = locusEditCallLogPath ? readJsonl(locusEditCallLogPath) : []
  const locusEditToolCalls = locusEditLogEntries.filter((entry: any) => {
    const message = entry?.message
    return (
      message?.method === "tools/call" &&
      message?.params?.name === "propose_file_edit"
    )
  })
  const locusEditToolCallArguments = locusEditToolCalls.map(
    (entry: any) => entry?.message?.params?.arguments ?? null,
  )
  const locusEditAdoptionClass =
    locusEditToolCalls.length > 0
      ? input.adoptionTier === "zero"
        ? "zero-prompt"
        : input.adoptionTier === "light"
          ? "light-hint"
          : "explicit-tool-name-only"
      : "no-adoption"
  const locusEditAdoptionProven =
    locusEditAdoptionClass === "zero-prompt" ||
    locusEditAdoptionClass === "light-hint"
  const evidence = {
    scenario: scenarioId,
    completed,
    runId,
    projectId,
    chatId,
    subChatId,
    mode,
    providerProfileId: input.providerProfileId,
    authMode: input.authMode,
    model: input.model,
    denyShellApprovals: input.denyShellApprovals,
    controlledEditExecutor: scenarioId === "controlled-edit",
    appServerExperimentalApi:
      input.enableApplyPatchExperiment || scenarioId === "controlled-edit",
    applyPatchExperimentalApi: input.enableApplyPatchExperiment,
    adoptionTier: input.adoptionTier,
    applyPatchExperimentConfigKeys: input.enableApplyPatchExperiment
      ? [
          "features.apply_patch_freeform",
          "features.apply_patch_streaming_events",
          "include_apply_patch_tool",
          "tools.apply_patch.enabled",
          "tools.apply_patch.approval_mode",
          "model_providers.locus_profile.apply_patch_tool_type",
          "model_providers.locus_profile.experimental_supported_tools",
        ]
      : [],
    canaryPath,
    canaryExists: existsSync(canaryPath),
    canaryContent: existsSync(canaryPath) ? readFileSync(canaryPath, "utf8") : null,
    textDeltaCount: textDeltas.length,
    textContent,
    askUserQuestionCount: askUserQuestionChunks.length,
    commandApprovalQuestionCount: approvalQuestionHeaders.filter(
      (header) => header === "Run command",
    ).length,
    fileChangeApprovalQuestionCount: approvalQuestionHeaders.filter(
      (header) => header === "Allow file change" || header === "Apply patch",
    ).length,
    controlledEditApprovalQuestionCount: approvalQuestionHeaders.filter(
      (header) => header === "Apply edit",
    ).length,
    structuredFileChangeChunkCount: structuredFileChangeChunks.length,
    locusEditAdoptionClass,
    locusEditAdoptionProven,
    locusEditToolCallCount: locusEditToolCalls.length,
    locusEditToolCallArguments,
    locusEditLogEntries,
    guardEventCount: chunks.filter((chunk: any) => chunk?.type === "guard-event")
      .length,
    approvalQuestionHeaders,
    guardEvents: chunks
      .filter((chunk: any) => chunk?.type === "guard-event")
      .map((chunk: any) => chunk.event ?? null),
    mcpRuntimeStatusChunks: chunks.filter(
      (chunk: any) => chunk?.type === "runtime-status" && chunk?.mcp,
    ),
    structuredFileChangeChunks,
    chunkTypes: chunks.map((chunk: any) => chunk?.type ?? null),
    chunks,
    job,
    events,
  }
  writeFileSync(path.join(input.outDir, `${scenarioId}.json`), redact(evidence))
  console.log(redact({
    scenario: scenarioId,
    completed,
    runId,
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    authMode: evidence.authMode,
    model: evidence.model,
    controlledEditExecutor: evidence.controlledEditExecutor,
    appServerExperimentalApi: evidence.appServerExperimentalApi,
    applyPatchExperimentalApi: evidence.applyPatchExperimentalApi,
    applyPatchExperimentConfigKeys: evidence.applyPatchExperimentConfigKeys,
    canaryExists: evidence.canaryExists,
    canaryContent: evidence.canaryContent,
    textDeltaCount: evidence.textDeltaCount,
    textContent: evidence.textContent,
    askUserQuestionCount: evidence.askUserQuestionCount,
    commandApprovalQuestionCount: evidence.commandApprovalQuestionCount,
    fileChangeApprovalQuestionCount: evidence.fileChangeApprovalQuestionCount,
    controlledEditApprovalQuestionCount:
      evidence.controlledEditApprovalQuestionCount,
    structuredFileChangeChunkCount: evidence.structuredFileChangeChunkCount,
    locusEditAdoptionClass: evidence.locusEditAdoptionClass,
    locusEditAdoptionProven: evidence.locusEditAdoptionProven,
    locusEditToolCallCount: evidence.locusEditToolCallCount,
    locusEditToolCallArguments: evidence.locusEditToolCallArguments,
    approvalQuestionHeaders: evidence.approvalQuestionHeaders,
    guardEventCount: evidence.guardEventCount,
    mcpRuntimeStatusChunks: evidence.mcpRuntimeStatusChunks,
    chunkTypes: evidence.chunkTypes,
    eventTypes: events.map((event) => event.type),
  }))

  if (scenarioId === "multi-round-resume") {
    const firstSessionInit = chunks.find((chunk: any) => chunk?.type === "session-init") as
      | Record<string, unknown>
      | undefined
    const secondRunId = `${runId}-turn-2`
    const secondChunks: unknown[] = []
    let secondCompleted = false

    const secondObservable = await caller.codex.chat({
      subChatId,
      chatId,
      runId: secondRunId,
      prompt:
        "This is the second turn in the same chat. Output exactly this single token and no other words: DOGFOOD_RESUME_TURN_TWO",
      cwd: input.cwd,
      projectPath: input.cwd,
      mode,
      model: input.model,
      providerProfileId: input.providerProfileId ?? undefined,
      ...(input.providerProfileId
        ? {}
        : {
            codexAuthMethod:
              input.authMode === "api_key" ? ("api_key" as const) : ("chatgpt" as const),
          }),
      forceNewSession: false,
      images: [],
      longTextAttachments: [],
    })

    const secondDone = new Promise<void>((resolve, reject) => {
      const secondSubscription = secondObservable.subscribe({
        next: (chunk: unknown) => secondChunks.push(chunk),
        error: reject,
        complete: () => {
          secondCompleted = true
          secondSubscription.unsubscribe()
          resolve()
        },
      })
    })

    await Promise.race([
      secondDone,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Scenario timed out: multi-round-resume turn 2")), 150_000),
      ),
    ])

    const secondJob = await latestJobForRun(secondRunId)
    const secondEvents = secondJob ? await jobEvents(secondJob.id) : []
    const secondTextContent = secondChunks
      .filter((chunk: any) => chunk?.type === "text-delta")
      .map((chunk: any) => (typeof chunk.delta === "string" ? chunk.delta : ""))
      .join("")
    const secondErrorTexts = secondChunks
      .filter((chunk: any) => chunk?.type === "error")
      .map((chunk: any) =>
        typeof chunk.errorText === "string" ? chunk.errorText : null,
      )
      .filter(Boolean)
    const secondSessionInit = secondChunks.find((chunk: any) => chunk?.type === "session-init") as
      | Record<string, unknown>
      | undefined
    const resumeEvidence = {
      scenario: scenarioId,
      authMode: input.authMode,
      providerProfileId: input.providerProfileId,
      model: input.model,
      firstRunId: runId,
      secondRunId,
      firstJobId: job?.id ?? null,
      secondJobId: secondJob?.id ?? null,
      firstJobStatus: job?.status ?? null,
      secondJobStatus: secondJob?.status ?? null,
      firstCompleted: completed,
      secondCompleted,
      firstTextContent: textContent,
      secondTextContent,
      firstSessionInit,
      secondSessionInit,
      sameSessionId:
        typeof firstSessionInit?.sessionId === "string" &&
        firstSessionInit.sessionId === secondSessionInit?.sessionId,
      firstChunkTypes: chunks.map((chunk: any) => chunk?.type ?? null),
      secondChunkTypes: secondChunks.map((chunk: any) => chunk?.type ?? null),
      secondChunks,
      secondErrorTexts,
      firstEvents: events,
      secondEvents,
    }
    writeFileSync(
      path.join(input.outDir, `${scenarioId}-resume.json`),
      redact(resumeEvidence),
    )
    console.log(redact({
      scenario: `${scenarioId}-resume`,
      authMode: resumeEvidence.authMode,
      firstJobId: resumeEvidence.firstJobId,
      secondJobId: resumeEvidence.secondJobId,
      firstJobStatus: resumeEvidence.firstJobStatus,
      secondJobStatus: resumeEvidence.secondJobStatus,
      firstTextContent: resumeEvidence.firstTextContent,
      secondTextContent: resumeEvidence.secondTextContent,
      secondErrorTexts: resumeEvidence.secondErrorTexts,
      firstSessionId: firstSessionInit?.sessionId ?? null,
      secondSessionId: secondSessionInit?.sessionId ?? null,
      sameSessionId: resumeEvidence.sameSessionId,
    }))
  }
}

async function main() {
  const hardTimeout = setTimeout(() => {
    console.error("[app-server-smoke] hard-timeout")
    process.exit(124)
  }, 210_000)
  app.setName("Locus Dev")
  const userDataPath = process.env.LOCUS_USER_DATA_DIR
    ? path.resolve(process.env.LOCUS_USER_DATA_DIR)
    : path.join(app.getPath("appData"), "Agent Code for Me Dev")
  app.setPath("userData", userDataPath)
  await app.whenReady()

  const cwd = path.resolve(readArg("project", process.cwd()))
  const outDir = path.resolve(readArg("out", path.join(cwd, ".tmp-app-server-smoke", "evidence", "desktop")))
  const scenario = readArg("scenario", "provider-plan") as Scenario
  const authMode = readArg("auth", "provider") as AuthMode
  if (!["provider", "chatgpt", "api_key"].includes(authMode)) {
    throw new Error(`Unsupported --auth=${authMode}`)
  }
  const providerProfileId = await resolveProviderProfileId(
    authMode,
    readOptionalArg("profile"),
  )
  const model = readArg("model", "deepseek-v4-flash")
  const denyShellApprovals = readBooleanArg("deny-shell-approvals", false)
  const adoptionTier = readArg("adoption-tier", "zero") as AdoptionTier
  if (!["zero", "light", "explicit"].includes(adoptionTier)) {
    throw new Error(`Unsupported --adoption-tier=${adoptionTier}`)
  }
  const enableApplyPatchExperiment = readBooleanArg(
    "enable-apply-patch-experiment",
    false,
  )
  ensureDir(outDir)
  const previousCodexHome = process.env.CODEX_HOME
  const previousExperimentalApi = process.env.LOCUS_CODEX_APP_SERVER_EXPERIMENTAL_API
  const previousApplyPatchExperiment =
    process.env.LOCUS_CODEX_APP_SERVER_APPLY_PATCH_EXPERIMENT
  const previousControlledEditExecutor =
    process.env.LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR
  const mcpSetup =
    scenario === "mcp-readiness"
      ? setupMcpReadinessCodexHome(outDir)
      : scenario === "locus-edit-adoption"
        ? setupLocusEditAdoptionCodexHome(outDir)
      : null
  if (mcpSetup) {
    process.env.CODEX_HOME = mcpSetup.codexHome
    logSmokePhase("scenario:mcp-home", {
      codexHome: mcpSetup.codexHome,
      serverName: mcpSetup.serverName,
      secret: mcpSetup.secret,
      copiedAuthFiles: "copiedAuthFiles" in mcpSetup ? mcpSetup.copiedAuthFiles : [],
    })
  }
  if (enableApplyPatchExperiment) {
    process.env.LOCUS_CODEX_APP_SERVER_EXPERIMENTAL_API = "1"
    process.env.LOCUS_CODEX_APP_SERVER_APPLY_PATCH_EXPERIMENT = "1"
  }
  if (scenario === "controlled-edit") {
    process.env.LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR = "1"
  }
  try {
    await runScenario({
      scenario,
      cwd,
      providerProfileId,
      authMode,
      model,
      outDir,
      denyShellApprovals,
      enableApplyPatchExperiment,
      adoptionTier,
    })
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    if (previousExperimentalApi === undefined) {
      delete process.env.LOCUS_CODEX_APP_SERVER_EXPERIMENTAL_API
    } else {
      process.env.LOCUS_CODEX_APP_SERVER_EXPERIMENTAL_API =
        previousExperimentalApi
    }
    if (previousApplyPatchExperiment === undefined) {
      delete process.env.LOCUS_CODEX_APP_SERVER_APPLY_PATCH_EXPERIMENT
    } else {
      process.env.LOCUS_CODEX_APP_SERVER_APPLY_PATCH_EXPERIMENT =
        previousApplyPatchExperiment
    }
    if (previousControlledEditExecutor === undefined) {
      delete process.env.LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR
    } else {
      process.env.LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR =
        previousControlledEditExecutor
    }
    if (mcpSetup) {
      redactMcpReadinessCodexHome(mcpSetup.codexHome)
    }
    clearTimeout(hardTimeout)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (app.isReady()) app.quit()
  })
