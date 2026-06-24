import { eq } from "drizzle-orm"
import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import {
  AGENT_ENGINE_IDS,
  DEFAULT_AGENT_ENGINE_ID,
  buildMossForkSubChatRecord,
  buildMossRollbackSubChatUpdate,
  buildMossSessionActionPlan,
  buildCodexNativeSessionBridgePlan,
  buildHermesNativeSessionBridgePlan,
  getMossSessionControlPlane,
  getAgentRuntimeAdapter,
  getAgentRuntimeManifest,
  listAgentRuntimeManifests,
  mergeMossSessionControlMetadata,
  persistAgentRuntimeSession,
  type AgentEngineId,
  type AgentPermissionMode,
} from "../../agent-runtime"
import { getDatabase, chats, projects, subChats } from "../../db"
import { createId } from "../../db/utils"
import { applyRollbackStash } from "../../git/stash"
import {
  materializeMossEngineProjectionSafely,
  materializeMossWorkspaceProjections,
  readMossProviderConfig,
  setMossProviderSecret,
  getMossProviderSecret,
  hasMossProviderSecret,
  summarizeMossProviderReadResult,
  writeMossProviderConfig,
  type MossProviderConfig,
  type MossProviderDefinition,
} from "../../moss-source"
import { publicProcedure, router } from "../index"

const agentEngineSchema = z.enum(AGENT_ENGINE_IDS)
const permissionModeValues = [
  "plan",
  "agent",
  "bypass",
  "read-only",
  "ask-approval",
  "full-access",
  "custom",
] as const
const permissionModeSchema = z.enum(permissionModeValues)
const providerModelSettingsSchema = z.object({
  hermes: z.string().optional(),
  claudeCode: z.string().optional(),
  codex: z.string().optional(),
  customAcp: z.string().optional(),
})

function cleanString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

async function buildStoredSecretSummary(
  config: MossProviderConfig | undefined,
): Promise<Record<string, { hasApiKey?: boolean }>> {
  const providerIds = Object.keys(config?.providers ?? {})
  const entries = await Promise.all(
    providerIds.map(async (providerId) => [
      providerId,
      { hasApiKey: await hasMossProviderSecret(providerId) },
    ] as const),
  )
  return Object.fromEntries(entries)
}

function getOrCreateCustomProvider(
  config: MossProviderConfig,
): MossProviderDefinition {
  const existing = config.providers.custom
  return {
    ...existing,
    id: "custom",
    label: existing?.label ?? "Custom OpenAI-Compatible",
    mode: existing?.mode ?? "custom-url-key",
    runtime: existing?.runtime ?? "any",
    apiKeyEnv: existing?.apiKeyEnv ?? "MOSS_CUSTOM_API_KEY",
    baseUrlEnv: existing?.baseUrlEnv ?? "MOSS_CUSTOM_BASE_URL",
    engines: {
      ...existing?.engines,
      hermes: {
        ...existing?.engines?.hermes,
        model: existing?.engines?.hermes?.model ?? "moss-custom",
      },
      "claude-code": {
        ...existing?.engines?.["claude-code"],
        model: existing?.engines?.["claude-code"]?.model ?? "opus",
      },
      codex: {
        ...existing?.engines?.codex,
        model: existing?.engines?.codex?.model ?? "gpt-5.5/medium",
        authMethod:
          existing?.engines?.codex?.authMethod ?? "openai-api-key",
      },
      "custom-acp": {
        ...existing?.engines?.["custom-acp"],
        model: existing?.engines?.["custom-acp"]?.model ?? "custom-acp",
      },
    },
  }
}

function parseRuntimeMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function isAgentPermissionMode(value: unknown): value is AgentPermissionMode {
  return (
    typeof value === "string" &&
    permissionModeValues.includes(value as AgentPermissionMode)
  )
}

function resolveSubChatPermissionMode(subChat: {
  mode: string | null
  runtimeMetadata: string | null
}): AgentPermissionMode {
  const metadata = parseRuntimeMetadata(subChat.runtimeMetadata)
  return isAgentPermissionMode(metadata.permissionMode)
    ? metadata.permissionMode
    : subChat.mode as AgentPermissionMode
}

function normalizeEngineId(value: string | null | undefined): AgentEngineId {
  return AGENT_ENGINE_IDS.includes(value as AgentEngineId)
    ? value as AgentEngineId
    : DEFAULT_AGENT_ENGINE_ID
}

function getProjectPathForSubChat(subChatId: string): string {
  const db = getDatabase()
  const subChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, subChatId))
    .get()
  if (!subChat) throw new Error("Sub-chat not found")

  const chat = db
    .select()
    .from(chats)
    .where(eq(chats.id, subChat.chatId))
    .get()
  if (!chat) throw new Error("Chat not found")

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, chat.projectId))
    .get()
  if (!project) throw new Error("Project not found")

  return chat.worktreePath || project.path
}

function getSubChatOrThrow(subChatId: string) {
  const subChat = getDatabase()
    .select()
    .from(subChats)
    .where(eq(subChats.id, subChatId))
    .get()
  if (!subChat) throw new Error("Sub-chat not found")
  return subChat
}

function buildForkName(params: {
  sourceSubChatId: string
  chatId: string
  sourceName: string | null
  requestedName?: string
}): string {
  if (params.requestedName?.trim()) return params.requestedName.trim()

  const baseName = (params.sourceName || "Chat").replace(/^\[\d+\]\s*/, "")
  const siblings = getDatabase()
    .select({ name: subChats.name })
    .from(subChats)
    .where(eq(subChats.chatId, params.chatId))
    .all()

  let maxN = 0
  for (const sibling of siblings) {
    const match = sibling.name?.match(/^\[(\d+)\]/)
    if (match) maxN = Math.max(maxN, Number.parseInt(match[1], 10))
  }

  return `[${maxN + 1}] ${baseName}`
}

async function copyClaudeForkSessionFiles(params: {
  sourceSubChatId: string
  targetSubChatId: string
}): Promise<boolean> {
  try {
    const { app } = await import("electron")
    const userDataPath = app.getPath("userData")
    const sourceDir = path.join(
      userDataPath,
      "claude-sessions",
      params.sourceSubChatId,
      "projects",
    )
    const targetDir = path.join(
      userDataPath,
      "claude-sessions",
      params.targetSubChatId,
      "projects",
    )
    const sourceDirExists = await fs
      .stat(sourceDir)
      .then(() => true)
      .catch(() => false)
    if (!sourceDirExists) return false

    await fs.cp(sourceDir, targetDir, { recursive: true })
    return true
  } catch (error) {
    console.warn("[agentRuntime.forkSession] Failed to copy Claude session files:", error)
    return false
  }
}

function buildActionPlanForSubChat(subChatId: string) {
  const subChat = getSubChatOrThrow(subChatId)
  const engine = normalizeEngineId(subChat.engine)
  const manifest = getAgentRuntimeManifest(engine)
  const nativeSessionId =
    subChat.engineSessionId ??
    (engine === "claude-code" ? subChat.sessionId : null)
  return {
    subChat,
    engine,
    manifest,
    plan: buildMossSessionActionPlan({
      subChatId,
      engine,
      nativeSessionId,
      messages: subChat.messages,
      features: manifest.features,
    }),
  }
}

function updateSessionControlMetadata(params: {
  subChatId: string
  runtimeMetadata: string | null
  metadata: Record<string, unknown>
}) {
  return getDatabase()
    .update(subChats)
    .set({
      runtimeMetadata: mergeMossSessionControlMetadata(
        params.runtimeMetadata,
        params.metadata,
      ),
      updatedAt: new Date(),
    })
    .where(eq(subChats.id, params.subChatId))
    .returning()
    .get()
}

export const agentRuntimeRouter = router({
  listEngines: publicProcedure.query(async () => {
    const manifests = listAgentRuntimeManifests()
    const healthEntries = await Promise.all(
      manifests.map(async (manifest) => {
        const adapter = getAgentRuntimeAdapter(manifest.id)
        const session = {
          subChatId: "",
          chatId: "",
          engineId: manifest.id,
          permissionMode: "agent",
          cwd: "",
        } as const
        const health = adapter.inspect
          ? await adapter.inspect(session)
          : {
              availability: await adapter.canStart(session),
            }
        return [manifest.id, health] as const
      }),
    )

    const healthByEngine = Object.fromEntries(healthEntries)

    return manifests.map((manifest) => ({
      ...manifest,
      availability: healthByEngine[manifest.id]?.availability ?? manifest.availability,
      statusReason: healthByEngine[manifest.id]?.statusReason,
      authMethod: healthByEngine[manifest.id]?.authMethod,
      models: healthByEngine[manifest.id]?.models ?? manifest.models,
    }))
  }),

  getSession: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()

      if (!subChat) {
        return null
      }

      const metadata = parseRuntimeMetadata(subChat.runtimeMetadata)

      return {
        subChatId: subChat.id,
        chatId: subChat.chatId,
        engine: subChat.engine as AgentEngineId,
        legacySessionId: subChat.sessionId,
        nativeSessionId: subChat.engineSessionId,
        configDir: subChat.engineConfigDir,
        modelId: subChat.modelId,
        permissionMode: isAgentPermissionMode(metadata.permissionMode)
          ? metadata.permissionMode
          : subChat.mode as AgentPermissionMode,
        metadata,
        updatedAt: subChat.updatedAt,
      }
    }),

  getProviderConfig: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      if (!input.projectPath) {
        return {
          status: "missing" as const,
          sourcePath: "",
          providers: [],
        }
      }

      const readResult = await readMossProviderConfig(input.projectPath, {
        createIfMissing: true,
      })
      const storedSecrets = await buildStoredSecretSummary(readResult.config)
      return summarizeMossProviderReadResult(readResult, storedSecrets)
    }),

  getControlPlane: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
      }),
    )
    .query(({ input }) =>
      getMossSessionControlPlane({
        projectPath: input.projectPath,
        secretResolver: { getSecret: getMossProviderSecret },
      }),
    ),

  getSessionActionPlan: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => buildActionPlanForSubChat(input.subChatId).plan),

  prepareSessionResume: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const { subChat, plan } = buildActionPlanForSubChat(input.subChatId)
      const action = plan.actions.resume
      if (action.status !== "ready") {
        throw new Error(action.reason || "Session is not ready to resume.")
      }
      const engine = normalizeEngineId(subChat.engine)
      const nativeSessionId =
        subChat.engineSessionId ??
        (engine === "claude-code" ? subChat.sessionId : null)
      const permissionMode = resolveSubChatPermissionMode(subChat)
      const nativeBridgePlan =
        engine === "codex" && nativeSessionId
          ? buildCodexNativeSessionBridgePlan({
              action: "resume",
              sessionId: nativeSessionId,
              cwd: getProjectPathForSubChat(input.subChatId),
              modelId: subChat.modelId,
              permissionMode,
            })
          : engine === "hermes" && nativeSessionId
            ? buildHermesNativeSessionBridgePlan({
                action: "resume",
                sessionId: nativeSessionId,
                cwd: getProjectPathForSubChat(input.subChatId),
                modelId: subChat.modelId,
                permissionMode,
              })
          : undefined
      const nativeBridgeRunner =
        nativeBridgePlan?.bridge === "codex-exec-resume"
          ? {
              kind: "codex-exec-resume",
              runner: "runCodexExecResumeBridge",
              promptSource: "stdin",
              canRunHeadless: nativeBridgePlan.canRunHeadless,
            }
          : nativeBridgePlan?.bridge === "hermes-cli-resume"
            ? {
                kind: "hermes-cli-resume",
                runner: "runHermesCliResumeBridge",
                promptSource: nativeBridgePlan.promptSource,
                canRunHeadless: nativeBridgePlan.canRunHeadless,
              }
          : undefined

      const updated = updateSessionControlMetadata({
        subChatId: input.subChatId,
        runtimeMetadata: subChat.runtimeMetadata,
        metadata: {
          action: "resume",
          mode: action.mode,
          status: action.status,
          nativeSessionLinked: action.mode === "native",
          nativeSessionId,
          nativeBridgePlan,
          nativeBridgeRunner,
        },
      })

      return {
        success: true as const,
        action: "resume" as const,
        mode: action.mode,
        nativeBridgePlan,
        nativeBridgeRunner,
        subChat: updated,
      }
    }),

  forkSession: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        messageId: z.string().optional(),
        messageIndex: z.number().int().nonnegative().optional(),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { subChat: sourceSubChat, engine } =
        buildActionPlanForSubChat(input.subChatId)
      const sourceNativeSessionId =
        sourceSubChat.engineSessionId ??
        (engine === "claude-code" ? sourceSubChat.sessionId : null)
      const permissionMode = resolveSubChatPermissionMode(sourceSubChat)
      const nativeBridgePlan =
        engine === "codex" && sourceNativeSessionId
          ? buildCodexNativeSessionBridgePlan({
              action: "fork",
              sessionId: sourceNativeSessionId,
              cwd: getProjectPathForSubChat(input.subChatId),
              modelId: sourceSubChat.modelId,
              permissionMode,
            })
          : engine === "hermes" && sourceNativeSessionId
            ? buildHermesNativeSessionBridgePlan({
                action: "fork",
                sessionId: sourceNativeSessionId,
                cwd: getProjectPathForSubChat(input.subChatId),
                modelId: sourceSubChat.modelId,
                permissionMode,
                targetMessageId: input.messageId,
              })
          : undefined
      const forkName = buildForkName({
        sourceSubChatId: input.subChatId,
        chatId: sourceSubChat.chatId,
        sourceName: sourceSubChat.name,
        requestedName: input.name,
      })
      const targetSubChatId = createId()
      let forkRecord = buildMossForkSubChatRecord({
        sourceSubChat,
        targetSubChatId,
        targetName: forkName,
        targetMessageId: input.messageId,
        targetMessageIndex: input.messageIndex,
        nativeBridgePlan,
      })
      let snapshot = forkRecord.snapshot
      let nativeSessionLinked = forkRecord.nativeSessionLinked

      let newSubChat = getDatabase()
        .insert(subChats)
        .values(forkRecord.insertValues)
        .returning()
        .get()

      if (nativeSessionLinked && engine === "claude-code") {
        const copied = sourceSubChat.sessionId
          ? await copyClaudeForkSessionFiles({
              sourceSubChatId: input.subChatId,
              targetSubChatId,
            })
          : false

        if (!copied) {
          forkRecord = buildMossForkSubChatRecord({
            sourceSubChat,
            targetSubChatId,
            targetName: forkName,
            targetMessageId: input.messageId,
            targetMessageIndex: input.messageIndex,
            nativeBridgePlan,
            forceTranscript: true,
            fallbackReason: "Claude session files were not available to copy.",
          })
          snapshot = forkRecord.snapshot
          nativeSessionLinked = forkRecord.nativeSessionLinked
          newSubChat = getDatabase()
            .update(subChats)
            .set({
              messages: forkRecord.insertValues.messages,
              sessionId: forkRecord.insertValues.sessionId,
              engineSessionId: forkRecord.insertValues.engineSessionId,
              runtimeMetadata: forkRecord.insertValues.runtimeMetadata,
              updatedAt: new Date(),
            })
            .where(eq(subChats.id, targetSubChatId))
            .returning()
            .get()
        }
      }

      return {
        success: true as const,
        action: "fork" as const,
        mode: snapshot.mode,
        nativeSessionLinked,
        subChat: newSubChat,
        messageCount: snapshot.messageCount,
        forkAtSdkUuid: snapshot.forkAtSdkUuid,
        nativeBridgePlan,
      }
    }),

  rollbackSession: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        targetMessageId: z.string().optional(),
        targetSdkMessageUuid: z.string().optional(),
        applyGitCheckpoint: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { subChat, engine } = buildActionPlanForSubChat(input.subChatId)
      const sourceNativeSessionId =
        subChat.engineSessionId ??
        (engine === "claude-code" ? subChat.sessionId : null)
      const permissionMode = resolveSubChatPermissionMode(subChat)
      const nativeBridgePlan =
        engine === "hermes" && sourceNativeSessionId
          ? buildHermesNativeSessionBridgePlan({
              action: "rollback",
              sessionId: sourceNativeSessionId,
              cwd: getProjectPathForSubChat(input.subChatId),
              modelId: subChat.modelId,
              permissionMode,
              targetMessageId: input.targetMessageId,
              targetSdkMessageUuid: input.targetSdkMessageUuid,
            })
          : undefined
      const rollbackRecord = buildMossRollbackSubChatUpdate({
        subChat,
        targetMessageId: input.targetMessageId,
        targetSdkMessageUuid: input.targetSdkMessageUuid,
        appliedGitCheckpoint: Boolean(input.applyGitCheckpoint),
        nativeBridgePlan,
      })
      const snapshot = rollbackRecord.snapshot

      if (input.applyGitCheckpoint) {
        if (!snapshot.targetSdkMessageUuid) {
          throw new Error("A target SDK message UUID is required for git rollback.")
        }

        const chat = getDatabase()
          .select()
          .from(chats)
          .where(eq(chats.id, subChat.chatId))
          .get()
        if (!chat?.worktreePath) {
          throw new Error("A worktree path is required for git rollback.")
        }

        const rollback = await applyRollbackStash(
          chat.worktreePath,
          snapshot.targetSdkMessageUuid,
        )
        if (!rollback.success) {
          throw new Error(`Git rollback failed: ${rollback.error}`)
        }
        if (!rollback.checkpointFound) {
          throw new Error("Checkpoint not found - cannot rollback git state.")
        }
      }

      const updated = getDatabase()
        .update(subChats)
        .set(rollbackRecord.updateValues)
        .where(eq(subChats.id, input.subChatId))
        .returning()
        .get()

      return {
        success: true as const,
        action: "rollback" as const,
        mode: snapshot.mode,
        nativeSessionLinked: snapshot.nativeSessionLinked,
        subChat: updated,
        messageCount: snapshot.messageCount,
        targetMessageId: snapshot.targetMessageId,
        targetSdkMessageUuid: snapshot.targetSdkMessageUuid,
        nativeBridgePlan,
      }
    }),

  getProviderSettings: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      if (!input.projectPath) {
        return {
          status: "missing" as const,
          sourcePath: "",
          defaultProvider: "moss",
          useCustomProvider: false,
          customProvider: null,
        }
      }

      const readResult = await readMossProviderConfig(input.projectPath, {
        createIfMissing: true,
      })
      if (readResult.status !== "found" || !readResult.config) {
        return {
          status: readResult.status,
          sourcePath: readResult.sourcePath,
          defaultProvider: "moss",
          useCustomProvider: false,
          customProvider: null,
          error: readResult.error,
        }
      }

      const custom = getOrCreateCustomProvider(readResult.config)
      const hasApiKey = await hasMossProviderSecret(custom.id)

      return {
        status: "found" as const,
        sourcePath: readResult.sourcePath,
        defaultProvider: readResult.config.defaultProvider ?? "moss",
        useCustomProvider: readResult.config.defaultProvider === "custom",
        customProvider: {
          id: custom.id,
          label: custom.label,
          mode: custom.mode,
          baseUrl: custom.baseUrl ?? "",
          hasApiKey,
          models: {
            hermes: custom.engines?.hermes?.model ?? "",
            claudeCode: custom.engines?.["claude-code"]?.model ?? "",
            codex: custom.engines?.codex?.model ?? "",
            customAcp: custom.engines?.["custom-acp"]?.model ?? "",
          },
        },
      }
    }),

  saveProviderSettings: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        useCustomProvider: z.boolean(),
        customProvider: z.object({
          apiKey: z.string().optional(),
          clearApiKey: z.boolean().optional(),
          baseUrl: z.string().optional(),
          models: providerModelSettingsSchema.optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const readResult = await readMossProviderConfig(input.projectPath, {
        createIfMissing: true,
      })
      if (readResult.status !== "found" || !readResult.config) {
        throw new Error(readResult.error || "Unable to read Moss provider config")
      }

      const config = readResult.config
      const custom = getOrCreateCustomProvider(config)
      const models = input.customProvider.models

      custom.baseUrl = cleanString(input.customProvider.baseUrl)
      custom.engines = {
        ...custom.engines,
        hermes: {
          ...custom.engines?.hermes,
          model: cleanString(models?.hermes) ?? "moss-custom",
        },
        "claude-code": {
          ...custom.engines?.["claude-code"],
          model: cleanString(models?.claudeCode) ?? "opus",
        },
        codex: {
          ...custom.engines?.codex,
          model: cleanString(models?.codex) ?? "gpt-5.5/medium",
          authMethod: custom.engines?.codex?.authMethod ?? "openai-api-key",
        },
        "custom-acp": {
          ...custom.engines?.["custom-acp"],
          model: cleanString(models?.customAcp) ?? "custom-acp",
        },
      }
      delete custom.apiKey

      config.defaultProvider = input.useCustomProvider ? "custom" : "moss"
      config.credentialPolicy = {
        ...config.credentialPolicy,
        singleUserConfiguration: true,
        allowCustomBaseUrl: true,
        allowCustomApiKey: true,
        shareAcrossEngines: true,
      }
      config.providers.custom = custom

      if (input.customProvider.clearApiKey) {
        await setMossProviderSecret({ providerId: "custom", apiKey: null })
      } else if (typeof input.customProvider.apiKey === "string") {
        await setMossProviderSecret({
          providerId: "custom",
          apiKey: input.customProvider.apiKey,
        })
      }

      const updated = await writeMossProviderConfig(input.projectPath, config)
      const storedSecrets = await buildStoredSecretSummary(updated.config)
      return summarizeMossProviderReadResult(updated, storedSecrets)
    }),

  setSessionEngine: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        engine: agentEngineSchema,
        nativeSessionId: z.string().nullable().optional(),
        configDir: z.string().nullable().optional(),
        modelId: z.string().nullable().optional(),
        permissionMode: permissionModeSchema.optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      persistAgentRuntimeSession({
        subChatId: input.subChatId,
        engine: input.engine,
        nativeSessionId: input.nativeSessionId,
        configDir: input.configDir,
        modelId: input.modelId,
        permissionMode: input.permissionMode,
        metadata: input.metadata,
        updateLegacySessionId: input.engine === "claude-code",
      })

      const projectPath = getProjectPathForSubChat(input.subChatId)
      const projection = await materializeMossEngineProjectionSafely({
        projectPath,
        engineId: input.engine,
        createIfMissing: true,
      })

      return { success: true as const, projection }
    }),

  materializeProjection: publicProcedure
    .input(
      z.object({
        subChatId: z.string().optional(),
        projectPath: z.string().optional(),
        engine: agentEngineSchema.optional(),
        dryRun: z.boolean().optional(),
        createIfMissing: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const projectPath = input.projectPath ||
        (input.subChatId ? getProjectPathForSubChat(input.subChatId) : null)

      if (!projectPath) {
        throw new Error("projectPath or subChatId is required")
      }

      return materializeMossWorkspaceProjections({
        projectPath,
        engines: input.engine ? [input.engine] : AGENT_ENGINE_IDS,
        dryRun: input.dryRun,
        createIfMissing: input.createIfMissing ?? true,
      })
    }),
})
