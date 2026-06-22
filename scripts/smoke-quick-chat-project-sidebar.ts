import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { app, dialog } from "electron"

type DbModule = typeof import("../src/main/lib/db")
type RuntimeChunk = {
  type?: string
  delta?: unknown
}

type ParsedJobInput = {
  runId?: string
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

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>")
    .replace(/(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{12,})/g, "$1<redacted>")
    .replace(
      /(api[_-]?key|access[_-]?token|refresh[_-]?token|token)=\S+/gi,
      "$1=<redacted>",
    )
}

function redact(value: unknown): string {
  return redactText(JSON.stringify(value, null, 2))
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function nowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function collectSubscription<T>(
  observable: {
    subscribe: (handlers: {
      next: (chunk: T) => void
      error: (error: unknown) => void
      complete: () => void
    }) => { unsubscribe: () => void }
  },
  timeoutMs: number,
): Promise<{ chunks: T[]; completed: boolean }> {
  const chunks: T[] = []
  let completed = false
  let subscription: { unsubscribe: () => void } | null = null

  const done = new Promise<void>((resolve, reject) => {
    subscription = observable.subscribe({
      next: (chunk) => chunks.push(chunk),
      error: reject,
      complete: () => {
        completed = true
        resolve()
      },
    })
  })

  try {
    await Promise.race([
      done,
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error("quick chat smoke timed out")),
          timeoutMs,
        ),
      ),
    ])
  } finally {
    subscription?.unsubscribe()
  }

  return { chunks, completed }
}

async function latestJobForRun(dbModule: DbModule, runId: string) {
  const { getDatabase, agentJobs } = dbModule
  return getDatabase()
    .select()
    .from(agentJobs)
    .all()
    .filter(
      (job) => parseJson<ParsedJobInput>(job.inputJson, {}).runId === runId,
    )
    .at(-1)
}

async function assertProviderProfile(input: {
  dbModule: DbModule
  profileId: string
}): Promise<{
  id: string
  name: string
  defaultModel: string
  targetRuntimes: string[]
}> {
  const { getDatabase, agentProviderProfiles } = input.dbModule
  const profile = getDatabase()
    .select()
    .from(agentProviderProfiles)
    .where(eq(agentProviderProfiles.id, input.profileId))
    .get()

  if (!profile)
    throw new Error(`Provider profile not found: ${input.profileId}`)
  const targetRuntimes = parseJson<string[]>(profile.targetRuntimesJson, [])
  if (!profile.encryptedToken) {
    throw new Error(`Provider profile ${profile.name} has no stored token`)
  }
  for (const runtime of ["claude", "codex"]) {
    if (!targetRuntimes.includes(runtime)) {
      throw new Error(
        `Provider profile ${profile.name} does not target ${runtime}`,
      )
    }
  }
  return {
    id: profile.id,
    name: profile.name,
    defaultModel: profile.defaultModel,
    targetRuntimes,
  }
}

async function copyProviderProfileFromSourceDb(input: {
  dbModule: DbModule
  sourceDbPath: string | undefined
  profileId: string
}): Promise<boolean> {
  const { getDatabase, agentProviderProfiles } = input.dbModule
  const db = getDatabase()
  const existing = db
    .select({ id: agentProviderProfiles.id })
    .from(agentProviderProfiles)
    .where(eq(agentProviderProfiles.id, input.profileId))
    .get()
  if (existing) return false
  if (!input.sourceDbPath) return false

  const betterSqlite = await import("better-sqlite3")
  const Database = betterSqlite.default
  const source = new Database(input.sourceDbPath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    const row = source
      .prepare(
        [
          "select id, name, preset_id, protocol, base_url, default_model,",
          "auth_mode, encrypted_token, headers_json, target_runtimes_json,",
          "capabilities_json, last_test_status_json, created_at, updated_at",
          "from agent_provider_profiles where id = ?",
        ].join(" "),
      )
      .get(input.profileId) as
      | {
          id: string
          name: string
          preset_id: string | null
          protocol: string
          base_url: string
          default_model: string
          auth_mode: string
          encrypted_token: string | null
          headers_json: string
          target_runtimes_json: string
          capabilities_json: string
          last_test_status_json: string | null
          created_at: number | null
          updated_at: number | null
        }
      | undefined
    if (!row) {
      throw new Error(
        `Provider profile ${input.profileId} not found in source DB`,
      )
    }
    db.insert(agentProviderProfiles)
      .values({
        id: row.id,
        name: row.name,
        presetId: row.preset_id,
        protocol: row.protocol,
        baseUrl: row.base_url,
        defaultModel: row.default_model,
        authMode: row.auth_mode,
        encryptedToken: row.encrypted_token,
        headersJson: row.headers_json,
        targetRuntimesJson: row.target_runtimes_json,
        capabilitiesJson: row.capabilities_json,
        lastTestStatusJson: row.last_test_status_json,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
      })
      .run()
    return true
  } finally {
    source.close()
  }
}

async function main() {
  const hardTimeout = setTimeout(() => {
    console.error("[quick-chat-smoke] hard timeout")
    process.exit(124)
  }, 240_000)

  app.setName("Locus Dev")
  const userDataPath = process.env.LOCUS_USER_DATA_DIR
    ? path.resolve(process.env.LOCUS_USER_DATA_DIR)
    : path.join(app.getPath("appData"), "Agent Code for Me Dev")
  app.setPath("userData", userDataPath)
  await app.whenReady()

  const outDir = path.resolve(
    readArg(
      "out",
      path.join(process.cwd(), ".tmp-quick-chat-smoke", "evidence"),
    ),
  )
  const profileId = readOptionalArg("profile")
  if (!profileId) throw new Error("Pass --profile=<provider-profile-id>")
  ensureDir(outDir)

  const dbModule = await import("../src/main/lib/db")
  const sourceDbPath = readOptionalArg("source-db")
  const copiedProfile = await copyProviderProfileFromSourceDb({
    dbModule,
    sourceDbPath,
    profileId,
  })
  const { createAppRouter } = await import("../src/main/lib/trpc/routers")
  const { providerProfileSource } = await import(
    "../src/shared/provider-profile-types"
  )
  const { stageLongTextAttachment } = await import(
    "../src/main/lib/long-text-attachments"
  )
  const { decideAssistantToolPermission, resolveDesktopPermissionPolicy } =
    await import("../src/main/lib/agent-runtime/permission-policy")
  const { decideCodexAcpToolPermission } = await import(
    "../src/main/lib/codex/acp-permission"
  )
  const {
    createCodexAppServerApprovalBridge,
    resolveCodexAppServerPermissionsApprovalDecision,
  } = await import("../src/main/lib/codex/app-server-approval")
  const { verifyDesktopRunPreflight } = await import(
    "../src/main/lib/agent-runtime/preflight"
  )

  const { getDatabase, chats, projects, subChats } = dbModule
  const db = getDatabase()
  const profile = await assertProviderProfile({ dbModule, profileId })
  const model = readArg("model", profile.defaultModel)
  const caller = createAppRouter(() => null).createCaller({
    getWindow: () => null,
  })
  const smokeId = nowId()
  const folderlessCwd = "__locus_folderless_quick_chat__"

  const claudeQuickChat = await caller.chats.create({
    projectId: null,
    name: `Claude quick chat smoke ${smokeId}`,
    provider: "claude-code",
    model,
    modelSource: providerProfileSource(profile.id),
    providerProfileId: profile.id,
    mode: "agent",
    initialMessage: "claude quick chat smoke seed",
    useWorktree: false,
  })
  const claudeQuickSubChat = claudeQuickChat.subChats[0]
  if (!claudeQuickSubChat) {
    throw new Error("Claude quick chat did not create a sub-chat")
  }

  const quickChat = await caller.chats.create({
    projectId: null,
    name: `Quick chat smoke ${smokeId}`,
    provider: "codex",
    model,
    modelSource: providerProfileSource(profile.id),
    providerProfileId: profile.id,
    mode: "agent",
    initialMessage: "quick chat smoke seed",
    useWorktree: false,
  })
  const quickSubChat = quickChat.subChats[0]
  if (!quickSubChat) throw new Error("Quick chat did not create a sub-chat")

  const uploadMarker = `LQC_UPLOAD_SOURCE_${smokeId.replace(/[^A-Za-z0-9]/g, "_")}`
  const uploadedText = [
    `Upload marker: ${uploadMarker}.`,
    "Original sentence: qwick chatt can reed upload notes and rewrite them better.",
    "Rewrite target: polished product copy about quick chat attachments.",
  ].join("\n")
  const longText = await stageLongTextAttachment({
    subChatId: quickSubChat.id,
    filename: "quick-chat-upload-smoke.txt",
    text: uploadedText,
    kind: "pasted",
  })

  const runId = `quick-chat-upload-${smokeId}`
  const prompt = [
    "Read the uploaded note and rewrite the original sentence as polished product copy.",
    "Include the upload marker exactly as written.",
    "Do not use tools. Keep the answer under 40 words.",
  ].join(" ")
  const codexObservable = await caller.codex.chat({
    subChatId: quickSubChat.id,
    chatId: quickChat.id,
    runId,
    prompt,
    cwd: folderlessCwd,
    mode: "agent",
    model,
    providerProfileId: profile.id,
    forceNewSession: true,
    images: [],
    longTextAttachments: [
      {
        type: "long-text-attachment",
        attachmentId: longText.id,
        localRef: longText.localRef,
        filename: longText.filename,
        byteLength: longText.byteLength,
        preview: longText.preview,
        kind: longText.kind,
      },
    ],
  })
  const uploadRun = await collectSubscription<RuntimeChunk>(
    codexObservable,
    180_000,
  )
  const textContent = uploadRun.chunks
    .filter((chunk) => chunk?.type === "text-delta")
    .map((chunk) => (typeof chunk.delta === "string" ? chunk.delta : ""))
    .join("")
  const job = await latestJobForRun(dbModule, runId)
  const uploadRewritePassed =
    uploadRun.completed &&
    Boolean(textContent.trim()) &&
    textContent.includes(uploadMarker) &&
    /quick chat/i.test(textContent)

  const savedPath = path.join(outDir, "assistant-output-smoke.md")
  const dialogWithStub = dialog as typeof dialog & {
    showSaveDialog: typeof dialog.showSaveDialog
  }
  dialogWithStub.showSaveDialog = async () => ({
    canceled: false,
    filePath: savedPath,
  })
  const saveResult = await caller.external.saveTextFile({
    content: textContent,
    filename: "assistant-output-smoke.md",
  })
  const savePassed =
    saveResult.success === true &&
    existsSync(savedPath) &&
    readFileSync(savedPath, "utf8") === textContent

  const claudeAssistantPolicy = resolveDesktopPermissionPolicy({
    runtimeId: "claude-code",
    mode: "agent",
    workspaceKind: "folderless",
  })
  const codexAppServerPolicy = resolveDesktopPermissionPolicy({
    runtimeId: "codex",
    mode: "agent",
    workspaceKind: "folderless",
    codexAdapterSource: "codex-app-server",
  })
  const codexAppServerMapping = codexAppServerPolicy.runtimeMapping
  if (
    codexAppServerMapping.runtime !== "codex" ||
    codexAppServerMapping.adapterSource !== "codex-app-server"
  ) {
    throw new Error("Codex app-server assistant policy did not resolve")
  }

  const assistantToolDecisions = {
    webFetch: decideAssistantToolPermission({ toolName: "WebFetch" }),
    claudeRead: decideAssistantToolPermission({ toolName: "Read" }),
    claudeBash: decideAssistantToolPermission({ toolName: "Bash" }),
    claudeMcp: decideAssistantToolPermission({ toolName: "mcp__repo__status" }),
  }
  const claudePreflight = verifyDesktopRunPreflight(db, {
    chatId: claudeQuickChat.id,
    subChatId: claudeQuickSubChat.id,
    cwd: folderlessCwd,
  })
  const claudeQuickChatPassed =
    claudeQuickChat.projectId === null &&
    claudePreflight.kind === "folderless" &&
    claudeAssistantPolicy.controlLevel === "assistant" &&
    assistantToolDecisions.webFetch.decision === "allow" &&
    assistantToolDecisions.claudeRead.decision === "deny" &&
    assistantToolDecisions.claudeBash.decision === "deny" &&
    assistantToolDecisions.claudeMcp.decision === "deny"
  const codexPermissionDecisions = {
    shell: decideCodexAcpToolPermission({
      tool: {
        toolUseId: "codex-shell",
        toolName: "Bash",
        kind: "execute",
        toolInput: { command: "printf denied > quick-chat-smoke.txt" },
      },
      mode: "agent",
      controlLevel: "assistant",
      observedToolPolicy: codexAppServerPolicy.observedToolPolicy,
      contract: null,
    }),
    file: decideCodexAcpToolPermission({
      tool: {
        toolUseId: "codex-file",
        toolName: "Edit",
        kind: "edit",
        toolInput: { path: "quick-chat-smoke.txt" },
      },
      mode: "agent",
      controlLevel: "assistant",
      observedToolPolicy: codexAppServerPolicy.observedToolPolicy,
      contract: null,
    }),
    mcp: decideCodexAcpToolPermission({
      tool: {
        toolUseId: "codex-mcp",
        toolName: "mcp__repo__status",
        kind: "read",
        toolInput: {},
      },
      mode: "agent",
      controlLevel: "assistant",
      observedToolPolicy: codexAppServerPolicy.observedToolPolicy,
      contract: null,
    }),
  }
  const appServerBridge = createCodexAppServerApprovalBridge({
    subChatId: quickSubChat.id,
    permission: codexAppServerMapping,
  })
  const appServerDenials = {
    command: await appServerBridge.handleCommandExecution({
      requestId: "command-request",
      params: {
        threadId: "thread",
        turnId: "turn",
        itemId: "command-item",
        startedAtMs: Date.now(),
        command: "printf denied > quick-chat-smoke.txt",
        cwd: folderlessCwd,
      },
    }),
    file: await appServerBridge.handleFileChange({
      requestId: "file-request",
      params: {
        threadId: "thread",
        turnId: "turn",
        itemId: "file-item",
        startedAtMs: Date.now(),
        grantRoot: "quick-chat-smoke.txt",
      },
    }),
    permissions: resolveCodexAppServerPermissionsApprovalDecision({
      params: {
        threadId: "thread",
        turnId: "turn",
        itemId: "permissions-item",
        startedAtMs: Date.now(),
        cwd: folderlessCwd,
        reason: "quick chat smoke permission request",
        permissions: {
          network: { enabled: true },
          fileSystem: {
            read: ["."],
            write: ["quick-chat-smoke.txt"],
          },
        },
      },
      permission: codexAppServerMapping,
    }),
  }
  const assistantPolicyPassed =
    claudeAssistantPolicy.controlLevel === "assistant" &&
    codexAppServerPolicy.controlLevel === "assistant" &&
    assistantToolDecisions.webFetch.decision === "allow" &&
    assistantToolDecisions.claudeRead.decision === "deny" &&
    assistantToolDecisions.claudeBash.decision === "deny" &&
    assistantToolDecisions.claudeMcp.decision === "deny" &&
    codexPermissionDecisions.shell.decision === "deny" &&
    codexPermissionDecisions.file.decision === "deny" &&
    codexPermissionDecisions.mcp.decision === "deny" &&
    appServerDenials.command.decision === "decline" &&
    appServerDenials.file.decision === "decline" &&
    appServerDenials.permissions.allowedByPolicy === false

  const projectPath = await mkdtemp(
    path.join(tmpdir(), "locus-quick-chat-project-"),
  )
  const projectId = `quick-chat-smoke-project-${smokeId}`
  const date = new Date()
  db.insert(projects)
    .values({
      id: projectId,
      name: `Quick chat smoke project ${smokeId}`,
      path: projectPath,
      createdAt: date,
      updatedAt: date,
    })
    .run()

  const attached = await caller.chats.attachProject({
    chatId: quickChat.id,
    projectId,
    useWorktree: false,
    targetMode: "agent",
  })
  const attachedSubChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, quickSubChat.id))
    .get()
  const projectPreflight = verifyDesktopRunPreflight(db, {
    chatId: quickChat.id,
    subChatId: quickSubChat.id,
    cwd: projectPath,
  })
  const projectPolicy = resolveDesktopPermissionPolicy({
    runtimeId: "codex",
    mode: "agent",
    workspaceKind: "project",
    codexAdapterSource: "codex-app-server",
  })
  const attachPassed =
    attached.projectId === projectId &&
    attached.worktreePath === projectPath &&
    attachedSubChat?.sessionId === null &&
    projectPreflight.kind === "project" &&
    projectPolicy.controlLevel !== "assistant"

  const quickDelete = await caller.chats.create({
    projectId: null,
    name: `Quick delete smoke ${smokeId}`,
    provider: "codex",
    model,
    modelSource: providerProfileSource(profile.id),
    providerProfileId: profile.id,
    mode: "agent",
    initialMessage: "quick delete smoke seed",
    useWorktree: false,
  })
  await caller.chats.delete({ id: quickDelete.id })
  const quickDeleteRemaining = db
    .select()
    .from(chats)
    .where(eq(chats.id, quickDelete.id))
    .get()
  const quickDeleteSubChatsRemaining = db
    .select()
    .from(subChats)
    .where(eq(subChats.chatId, quickDelete.id))
    .all()
  const quickDeletePassed =
    !quickDeleteRemaining && quickDeleteSubChatsRemaining.length === 0

  const archiveWorkspace = await caller.chats.create({
    projectId,
    name: `Archive workspace smoke ${smokeId}`,
    provider: "codex",
    model,
    modelSource: providerProfileSource(profile.id),
    providerProfileId: profile.id,
    mode: "agent",
    initialMessage: "archive workspace smoke seed",
    useWorktree: false,
  })
  await caller.chats.archive({ id: archiveWorkspace.id, deleteWorktree: false })
  const archivedWorkspace = db
    .select()
    .from(chats)
    .where(eq(chats.id, archiveWorkspace.id))
    .get()

  const deleteWorkspace = await caller.chats.create({
    projectId,
    name: `Delete workspace smoke ${smokeId}`,
    provider: "codex",
    model,
    modelSource: providerProfileSource(profile.id),
    providerProfileId: profile.id,
    mode: "agent",
    initialMessage: "delete workspace smoke seed",
    useWorktree: false,
  })
  await caller.chats.delete({ id: deleteWorkspace.id })
  const deleteWorkspaceRemaining = db
    .select()
    .from(chats)
    .where(eq(chats.id, deleteWorkspace.id))
    .get()
  const archiveDeletePassed =
    Boolean(archivedWorkspace?.archivedAt) && !deleteWorkspaceRemaining

  const sidebarQuickChat = await caller.chats.create({
    projectId: null,
    name: `Sidebar quick chat smoke ${smokeId}`,
    provider: "codex",
    model,
    modelSource: providerProfileSource(profile.id),
    providerProfileId: profile.id,
    mode: "agent",
    initialMessage: "sidebar quick chat smoke seed",
    useWorktree: false,
  })
  const activeChats = await caller.chats.list({})
  const quickChats = activeChats.filter((chat) => chat.projectId === null)
  const projectChats = activeChats.filter(
    (chat) => chat.projectId === projectId,
  )
  const sidebarGroupingDataPassed =
    quickChats.some((chat) => chat.id === sidebarQuickChat.id) &&
    projectChats.some((chat) => chat.id === quickChat.id)

  const evidence = {
    smokeId,
    userDataPath,
    providerProfile: {
      id: profile.id,
      name: profile.name,
      defaultModel: profile.defaultModel,
      targetRuntimes: profile.targetRuntimes,
      copiedFromSourceDb: copiedProfile,
    },
    uploadRewrite: {
      passed: uploadRewritePassed,
      completed: uploadRun.completed,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
      textDeltaCount: uploadRun.chunks.filter(
        (chunk) => chunk?.type === "text-delta",
      ).length,
      textContent,
      markerIncluded: textContent.includes(uploadMarker),
      mentionsQuickChat: /quick chat/i.test(textContent),
      chunkTypes: uploadRun.chunks.map((chunk) => chunk?.type ?? null),
    },
    saveDownload: {
      passed: savePassed,
      result: saveResult,
      savedPath,
      savedBytes: existsSync(savedPath)
        ? readFileSync(savedPath, "utf8").length
        : 0,
    },
    assistantPolicy: {
      passed: assistantPolicyPassed,
      claudeQuickChatPassed,
      claudeQuickChatId: claudeQuickChat.id,
      claudePreflightKind: claudePreflight.kind,
      claudeEnforcement: claudeAssistantPolicy.enforcement,
      codexAppServerEnforcement: codexAppServerPolicy.enforcement,
      assistantToolDecisions,
      codexPermissionDecisions,
      appServerDenials,
    },
    attachProject: {
      passed: attachPassed,
      projectId,
      projectPath,
      attachedProjectId: attached.projectId,
      attachedWorktreePath: attached.worktreePath,
      attachedSubChatSessionId: attachedSubChat?.sessionId ?? null,
      projectPreflightKind: projectPreflight.kind,
      projectPolicyControlLevel: projectPolicy.controlLevel,
    },
    deleteArchive: {
      quickDeletePassed,
      archiveDeletePassed,
      archivedWorkspaceId: archiveWorkspace.id,
      archivedAt: archivedWorkspace?.archivedAt ?? null,
      deleteWorkspaceId: deleteWorkspace.id,
      deleteWorkspaceRemaining: Boolean(deleteWorkspaceRemaining),
    },
    sidebarGroupingData: {
      passed: sidebarGroupingDataPassed,
      quickChatIds: quickChats.map((chat) => chat.id),
      projectChatIds: projectChats.map((chat) => chat.id),
      attachedQuickChatId: quickChat.id,
      sidebarQuickChatId: sidebarQuickChat.id,
    },
  }

  const allPassed =
    uploadRewritePassed &&
    savePassed &&
    claudeQuickChatPassed &&
    assistantPolicyPassed &&
    attachPassed &&
    quickDeletePassed &&
    archiveDeletePassed &&
    sidebarGroupingDataPassed

  writeFileSync(path.join(outDir, "quick-chat-smoke.json"), redact(evidence))
  console.log(
    redact({
      allPassed,
      uploadRewritePassed,
      savePassed,
      claudeQuickChatPassed,
      assistantPolicyPassed,
      attachPassed,
      quickDeletePassed,
      archiveDeletePassed,
      sidebarGroupingDataPassed,
      providerProfile: evidence.providerProfile,
      jobStatus: evidence.uploadRewrite.jobStatus,
      textDeltaCount: evidence.uploadRewrite.textDeltaCount,
      textContent: evidence.uploadRewrite.textContent,
    }),
  )

  rmSync(projectPath, { recursive: true, force: true })
  clearTimeout(hardTimeout)
  if (!allPassed) {
    process.exitCode = 1
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
