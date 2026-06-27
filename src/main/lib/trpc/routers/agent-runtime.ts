import { eq } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import {
  AGENT_ENGINE_IDS,
  DEFAULT_AGENT_ENGINE_ID,
  buildMossForkSubChatRecord,
  buildMossRollbackSubChatUpdate,
  buildMossSessionActionPlan,
  buildAgentRuntimeLaunchPlan,
  buildHermesNativeSessionBridgePlan,
  getMossSessionControlPlane,
  getAgentRuntimeAdapter,
  getAgentRuntimeManifest,
  listAgentRuntimeManifests,
  mergeMossSessionControlMetadata,
  persistAgentRuntimeSession,
  countLocalTranscriptUserTurns,
  summarizeNativeThreadReadResult,
  type AgentEngineId,
  type AgentPermissionMode,
  type AgentRuntimeExternalAgentConfigMigrationItem,
  type AgentRuntimeSessionRef,
  type AgentRuntimeMcpServerStatusDetail,
  type AgentRuntimePluginMarketplaceKind,
  type AgentRuntimeThreadControlAction,
  type AgentRuntimeThreadGoalStatus,
  type NativeThreadReadSummary,
} from "../../agent-runtime";
import { getDatabase, chats, projects, subChats } from "../../db";
import { createId } from "../../db/utils";
import { applyRollbackStash } from "../../git/stash";
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
} from "../../moss-source";
import { publicProcedure, router } from "../index";

const agentEngineSchema = z.enum(AGENT_ENGINE_IDS);
const permissionModeValues = [
  "plan",
  "agent",
  "bypass",
  "read-only",
  "ask-approval",
  "full-access",
  "custom",
] as const;
const permissionModeSchema = z.enum(permissionModeValues);
const providerModelSettingsSchema = z.object({
  hermes: z.string().optional(),
  claudeCode: z.string().optional(),
  codex: z.string().optional(),
  customAcp: z.string().optional(),
});
const runtimeModelSelectionSchema = z.object({
  instanceId: z.string().min(1),
  modelId: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});
const nativeThreadSortDirectionSchema = z.enum(["asc", "desc"]);
const nativeThreadSortKeySchema = z.enum(["created_at", "updated_at"]);
const nativeThreadControlActionSchema = z.enum([
  "archive",
  "unarchive",
  "delete",
]);
const nativeMcpServerStatusDetailSchema = z.enum(["full", "toolsAndAuthOnly"]);
const nativeConfigWriteMergeStrategySchema = z.enum(["replace", "upsert"]);
const nativeConfigWriteValueSchema = z
  .unknown()
  .refine(
    (value) => value !== undefined,
    "Native config write value is required.",
  );
const nativeAccountLoginTypeSchema = z.enum([
  "apiKey",
  "chatgpt",
  "chatgptDeviceCode",
  "chatgptAuthTokens",
]);
const nativePluginMarketplaceKindSchema = z.enum([
  "local",
  "vertical",
  "workspace-directory",
  "shared-with-me",
]);
const nativeExternalAgentConfigMigrationItemTypeSchema = z.enum([
  "AGENTS_MD",
  "CONFIG",
  "SKILLS",
  "PLUGINS",
  "MCP_SERVER_CONFIG",
  "SUBAGENTS",
  "HOOKS",
  "COMMANDS",
  "SESSIONS",
]);
const nativeExternalAgentConfigMigrationDetailsSchema = z.object({
  commands: z.array(z.object({ name: z.string().min(1) })).optional(),
  hooks: z.array(z.object({ name: z.string().min(1) })).optional(),
  mcpServers: z.array(z.object({ name: z.string().min(1) })).optional(),
  plugins: z
    .array(
      z.object({
        marketplaceName: z.string().min(1),
        pluginNames: z.array(z.string().min(1)),
      }),
    )
    .optional(),
  sessions: z
    .array(
      z.object({
        cwd: z.string().min(1),
        path: z.string().min(1),
        title: z.string().nullable().optional(),
      }),
    )
    .optional(),
  subagents: z.array(z.object({ name: z.string().min(1) })).optional(),
});
const nativeExternalAgentConfigMigrationItemSchema = z.object({
  cwd: z.string().nullable().optional(),
  description: z.string().min(1),
  details: nativeExternalAgentConfigMigrationDetailsSchema
    .nullable()
    .optional(),
  itemType: nativeExternalAgentConfigMigrationItemTypeSchema,
});
const nativeThreadGoalStatusSchema = z.enum([
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
]);
const nativeThreadGitInfoPatchSchema = z.object({
  branch: z.string().nullable().optional(),
  originUrl: z.string().nullable().optional(),
  sha: z.string().nullable().optional(),
});
const nativeThreadTurnDiffInputSchema = z
  .object({
    engine: agentEngineSchema.default("codex"),
    projectPath: z.string().min(1),
    threadId: z.string().min(1),
    fromTurnCount: z.number().int().nonnegative(),
    toTurnCount: z.number().int().nonnegative(),
    ignoreWhitespace: z.boolean().optional(),
  })
  .refine((value) => value.fromTurnCount <= value.toTurnCount, {
    message: "fromTurnCount must be less than or equal to toTurnCount.",
    path: ["toTurnCount"],
  });
const nativeThreadFullDiffInputSchema = z.object({
  engine: agentEngineSchema.default("codex"),
  projectPath: z.string().min(1),
  threadId: z.string().min(1),
  toTurnCount: z.number().int().nonnegative(),
  ignoreWhitespace: z.boolean().optional(),
});

function cleanString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function buildStoredSecretSummary(
  config: MossProviderConfig | undefined,
): Promise<Record<string, { hasApiKey?: boolean }>> {
  const providerIds = Object.keys(config?.providers ?? {});
  const entries = await Promise.all(
    providerIds.map(
      async (providerId) =>
        [
          providerId,
          { hasApiKey: await hasMossProviderSecret(providerId) },
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

function getOrCreateCustomProvider(
  config: MossProviderConfig,
): MossProviderDefinition {
  const existing = config.providers.custom;
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
        authMethod: existing?.engines?.codex?.authMethod ?? "openai-api-key",
      },
      "custom-acp": {
        ...existing?.engines?.["custom-acp"],
        model: existing?.engines?.["custom-acp"]?.model ?? "custom-acp",
      },
    },
  };
}

function parseRuntimeMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isAgentPermissionMode(value: unknown): value is AgentPermissionMode {
  return (
    typeof value === "string" &&
    permissionModeValues.includes(value as AgentPermissionMode)
  );
}

function parseRuntimeModelSelection(
  value: unknown,
): z.infer<typeof runtimeModelSelectionSchema> | null {
  const parsed = runtimeModelSelectionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function resolveSubChatPermissionMode(subChat: {
  mode: string | null;
  runtimeMetadata: string | null;
}): AgentPermissionMode {
  const metadata = parseRuntimeMetadata(subChat.runtimeMetadata);
  return isAgentPermissionMode(metadata.permissionMode)
    ? metadata.permissionMode
    : (subChat.mode as AgentPermissionMode);
}

function normalizeEngineId(value: string | null | undefined): AgentEngineId {
  return AGENT_ENGINE_IDS.includes(value as AgentEngineId)
    ? (value as AgentEngineId)
    : DEFAULT_AGENT_ENGINE_ID;
}

function getProjectPathForSubChat(subChatId: string): string {
  const db = getDatabase();
  const subChat = db
    .select()
    .from(subChats)
    .where(eq(subChats.id, subChatId))
    .get();
  if (!subChat) throw new Error("Sub-chat not found");

  const chat = db
    .select()
    .from(chats)
    .where(eq(chats.id, subChat.chatId))
    .get();
  if (!chat) throw new Error("Chat not found");

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, chat.projectId))
    .get();
  if (!project) throw new Error("Project not found");

  return chat.worktreePath || project.path;
}

function getSubChatOrThrow(subChatId: string) {
  const subChat = getDatabase()
    .select()
    .from(subChats)
    .where(eq(subChats.id, subChatId))
    .get();
  if (!subChat) throw new Error("Sub-chat not found");
  return subChat;
}

function buildForkName(params: {
  sourceSubChatId: string;
  chatId: string;
  sourceName: string | null;
  requestedName?: string;
}): string {
  if (params.requestedName?.trim()) return params.requestedName.trim();

  const baseName = (params.sourceName || "Chat").replace(/^\[\d+\]\s*/, "");
  const siblings = getDatabase()
    .select({ name: subChats.name })
    .from(subChats)
    .where(eq(subChats.chatId, params.chatId))
    .all();

  let maxN = 0;
  for (const sibling of siblings) {
    const match = sibling.name?.match(/^\[(\d+)\]/);
    if (match) maxN = Math.max(maxN, Number.parseInt(match[1], 10));
  }

  return `[${maxN + 1}] ${baseName}`;
}

async function copyClaudeForkSessionFiles(params: {
  sourceSubChatId: string;
  targetSubChatId: string;
}): Promise<boolean> {
  try {
    const { app } = await import("electron");
    const userDataPath = app.getPath("userData");
    const sourceDir = path.join(
      userDataPath,
      "claude-sessions",
      params.sourceSubChatId,
      "projects",
    );
    const targetDir = path.join(
      userDataPath,
      "claude-sessions",
      params.targetSubChatId,
      "projects",
    );
    const sourceDirExists = await fs
      .stat(sourceDir)
      .then(() => true)
      .catch(() => false);
    if (!sourceDirExists) return false;

    await fs.cp(sourceDir, targetDir, { recursive: true });
    return true;
  } catch (error) {
    console.warn(
      "[agentRuntime.forkSession] Failed to copy Claude session files:",
      error,
    );
    return false;
  }
}

function buildActionPlanForSubChat(subChatId: string) {
  const subChat = getSubChatOrThrow(subChatId);
  const engine = normalizeEngineId(subChat.engine);
  const manifest = getAgentRuntimeManifest(engine);
  const nativeSessionId =
    subChat.engineSessionId ??
    (engine === "claude-code" ? subChat.sessionId : null);
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
  };
}

function updateSessionControlMetadata(params: {
  subChatId: string;
  runtimeMetadata: string | null;
  metadata: Record<string, unknown>;
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
    .get();
}

function summarizeNativeThreadControlResult(result: {
  status: string;
  sourceThreadId?: string | null;
  threadId?: string | null;
  numTurns?: number;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    status: result.status,
    ...(result.sourceThreadId !== undefined
      ? { sourceThreadId: result.sourceThreadId ?? null }
      : {}),
    threadId: result.threadId ?? null,
    ...(typeof result.numTurns === "number"
      ? { numTurns: result.numTurns }
      : {}),
    ...(result.message ? { message: result.message } : {}),
    updatedAt: result.updatedAt,
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}

function buildRuntimeSessionRefForSubChat(params: {
  subChat: {
    id: string;
    chatId: string;
    engineConfigDir: string | null;
    modelId: string | null;
    mode: string | null;
    runtimeMetadata: string | null;
  };
  engine: AgentEngineId;
  nativeSessionId: string | null;
  projectPath: string;
}): AgentRuntimeSessionRef {
  const metadata = parseRuntimeMetadata(params.subChat.runtimeMetadata);
  const modelSelection = parseRuntimeModelSelection(metadata.modelSelection);
  const providerInstanceId =
    typeof metadata.providerInstanceId === "string"
      ? (cleanString(metadata.providerInstanceId) ?? null)
      : (modelSelection?.instanceId ?? null);

  return {
    subChatId: params.subChat.id,
    chatId: params.subChat.chatId,
    engineId: params.engine,
    providerInstanceId,
    nativeSessionId: params.nativeSessionId,
    modelId: params.subChat.modelId,
    modelSelection,
    permissionMode: resolveSubChatPermissionMode(params.subChat),
    cwd: params.projectPath,
    projectPath: params.projectPath,
    runtimeConfigDir: params.subChat.engineConfigDir,
    metadata,
  };
}

function buildRuntimeSessionRefForProject(params: {
  engine: AgentEngineId;
  projectPath: string;
  permissionMode?: AgentPermissionMode;
}): AgentRuntimeSessionRef {
  return {
    subChatId: "",
    chatId: "",
    engineId: params.engine,
    nativeSessionId: null,
    permissionMode: params.permissionMode ?? "agent",
    cwd: params.projectPath,
    projectPath: params.projectPath,
    metadata: {},
  };
}

export const agentRuntimeRouter = router({
  listEngines: publicProcedure.query(async () => {
    const manifests = listAgentRuntimeManifests();
    const healthEntries = await Promise.all(
      manifests.map(async (manifest) => {
        const adapter = getAgentRuntimeAdapter(manifest.id);
        const session = {
          subChatId: "",
          chatId: "",
          engineId: manifest.id,
          permissionMode: "agent",
          cwd: "",
        } as const;
        const health = adapter.inspect
          ? await adapter.inspect(session)
          : {
              availability: await adapter.canStart(session),
            };
        return [manifest.id, health] as const;
      }),
    );

    const healthByEngine = Object.fromEntries(healthEntries);

    return manifests.map((manifest) => ({
      ...manifest,
      availability:
        healthByEngine[manifest.id]?.availability ?? manifest.availability,
      statusReason: healthByEngine[manifest.id]?.statusReason,
      authMethod: healthByEngine[manifest.id]?.authMethod,
      models: healthByEngine[manifest.id]?.models ?? manifest.models,
      providerInstances:
        healthByEngine[manifest.id]?.providerInstances ??
        manifest.providerInstances,
      version: healthByEngine[manifest.id]?.version ?? manifest.version,
      versionAdvisory:
        healthByEngine[manifest.id]?.versionAdvisory ??
        manifest.versionAdvisory,
      updateState:
        healthByEngine[manifest.id]?.updateState ?? manifest.updateState,
    }));
  }),

  getSession: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase();
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get();

      if (!subChat) {
        return null;
      }

      const metadata = parseRuntimeMetadata(subChat.runtimeMetadata);
      const modelSelection = parseRuntimeModelSelection(
        metadata.modelSelection,
      );
      const providerInstanceId =
        typeof metadata.providerInstanceId === "string"
          ? (cleanString(metadata.providerInstanceId) ?? null)
          : (modelSelection?.instanceId ?? null);

      return {
        subChatId: subChat.id,
        chatId: subChat.chatId,
        engine: subChat.engine as AgentEngineId,
        legacySessionId: subChat.sessionId,
        nativeSessionId: subChat.engineSessionId,
        configDir: subChat.engineConfigDir,
        modelId: subChat.modelId,
        providerInstanceId,
        modelSelection,
        permissionMode: isAgentPermissionMode(metadata.permissionMode)
          ? metadata.permissionMode
          : (subChat.mode as AgentPermissionMode),
        metadata,
        updatedAt: subChat.updatedAt,
      };
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
        };
      }

      const readResult = await readMossProviderConfig(input.projectPath, {
        createIfMissing: true,
      });
      const storedSecrets = await buildStoredSecretSummary(readResult.config);
      return summarizeMossProviderReadResult(readResult, storedSecrets);
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

  refreshNativeThread: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        includeTurns: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { subChat, engine } = buildActionPlanForSubChat(input.subChatId);
      const nativeSessionId =
        subChat.engineSessionId ??
        (engine === "claude-code" ? subChat.sessionId : null);
      if (!nativeSessionId) {
        throw new Error(
          "A native session id is required to refresh the thread.",
        );
      }

      const adapter = getAgentRuntimeAdapter(engine);
      if (!adapter.readThread) {
        throw new Error(`${engine} does not support native thread refresh.`);
      }

      const includeTurns = input.includeTurns ?? true;
      const projectPath = getProjectPathForSubChat(input.subChatId);
      const nativeResult = await adapter.readThread({
        includeTurns,
        session: buildRuntimeSessionRefForSubChat({
          subChat,
          engine,
          nativeSessionId,
          projectPath,
        }),
      });
      const nativeThreadRead = summarizeNativeThreadReadResult(nativeResult, {
        includeTurns,
        localMessages: subChat.messages,
      });
      const nativeBridgePlan = {
        engine,
        action: "read",
        bridge: nativeResult.metadata?.bridge ?? "native-thread",
        method: nativeResult.metadata?.method ?? "thread/read",
        sessionId: nativeSessionId,
        cwd: projectPath,
        includeTurns,
        canRunHeadless: true,
      };
      const updated = updateSessionControlMetadata({
        subChatId: input.subChatId,
        runtimeMetadata: subChat.runtimeMetadata,
        metadata: {
          action: "refresh-native-thread",
          mode: "native",
          nativeSessionLinked: true,
          nativeThreadRead,
          nativeBridgePlan,
        },
      });

      return {
        success: nativeResult.status === "success",
        action: "refresh-native-thread" as const,
        status: nativeResult.status,
        nativeThreadRead,
        nativeBridgePlan,
        subChat: updated,
      };
    }),

  listNativeThreads: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        archived: z.boolean().nullable().optional(),
        cursor: z.string().nullable().optional(),
        cwd: z
          .union([z.string(), z.array(z.string())])
          .nullable()
          .optional(),
        limit: z.number().int().nonnegative().nullable().optional(),
        modelProviders: z.array(z.string()).nullable().optional(),
        searchTerm: z.string().nullable().optional(),
        sortDirection: nativeThreadSortDirectionSchema.nullable().optional(),
        sortKey: nativeThreadSortKeySchema.nullable().optional(),
        sourceKinds: z.array(z.string()).nullable().optional(),
        useStateDbOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listThreads) {
        throw new Error(
          `${input.engine} does not support native thread listing.`,
        );
      }

      const result = await adapter.listThreads({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        archived: input.archived,
        cursor: input.cursor,
        cwd: input.cwd === undefined ? input.projectPath : input.cwd,
        limit: input.limit,
        modelProviders: input.modelProviders,
        searchTerm: input.searchTerm,
        sortDirection: input.sortDirection,
        sortKey: input.sortKey,
        sourceKinds: input.sourceKinds,
        useStateDbOnly: input.useStateDbOnly,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread listing failed.`,
        );
      }
      return result;
    }),

  listLoadedNativeThreads: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listLoadedThreads) {
        throw new Error(
          `${input.engine} does not support loaded native thread listing.`,
        );
      }

      const result = await adapter.listLoadedThreads({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cursor: input.cursor,
        limit: input.limit,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} loaded native thread listing failed.`,
        );
      }
      return result;
    }),

  getNativeThreadTurnDiff: publicProcedure
    .input(nativeThreadTurnDiffInputSchema)
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.getThreadTurnDiff) {
        throw new Error(
          `${input.engine} does not support native thread turn diffs.`,
        );
      }

      const result = await adapter.getThreadTurnDiff({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
        fromTurnCount: input.fromTurnCount,
        toTurnCount: input.toTurnCount,
        ignoreWhitespace: input.ignoreWhitespace,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread turn diff failed.`,
        );
      }
      return result;
    }),

  getNativeThreadFullDiff: publicProcedure
    .input(nativeThreadFullDiffInputSchema)
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.getThreadFullDiff) {
        throw new Error(
          `${input.engine} does not support native thread full diffs.`,
        );
      }

      const result = await adapter.getThreadFullDiff({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
        toTurnCount: input.toTurnCount,
        ignoreWhitespace: input.ignoreWhitespace,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread full diff failed.`,
        );
      }
      return result;
    }),

  readNativeConfig: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwd: z.string().nullable().optional(),
        includeLayers: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.readConfig) {
        throw new Error(
          `${input.engine} does not support native config reads.`,
        );
      }

      const result = await adapter.readConfig({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwd: input.cwd === undefined ? input.projectPath : input.cwd,
        includeLayers: input.includeLayers,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native config read failed.`,
        );
      }
      return result;
    }),

  readNativeConfigRequirements: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.readConfigRequirements) {
        throw new Error(
          `${input.engine} does not support native config requirements.`,
        );
      }

      const result = await adapter.readConfigRequirements({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native config requirements read failed.`,
        );
      }
      return result;
    }),

  writeNativeConfigValue: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        keyPath: z.string().min(1),
        value: nativeConfigWriteValueSchema,
        mergeStrategy: nativeConfigWriteMergeStrategySchema.default("replace"),
        filePath: z.string().nullable().optional(),
        expectedVersion: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.writeConfigValue) {
        throw new Error(
          `${input.engine} does not support native config writes.`,
        );
      }

      const result = await adapter.writeConfigValue({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        keyPath: input.keyPath,
        value: input.value,
        mergeStrategy: input.mergeStrategy,
        filePath: input.filePath,
        expectedVersion: input.expectedVersion,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native config write failed.`,
        );
      }
      return result;
    }),

  batchWriteNativeConfig: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        edits: z
          .array(
            z.object({
              keyPath: z.string().min(1),
              value: nativeConfigWriteValueSchema,
              mergeStrategy:
                nativeConfigWriteMergeStrategySchema.default("replace"),
            }),
          )
          .min(1),
        filePath: z.string().nullable().optional(),
        expectedVersion: z.string().nullable().optional(),
        reloadUserConfig: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.batchWriteConfig) {
        throw new Error(
          `${input.engine} does not support native config batch writes.`,
        );
      }

      const result = await adapter.batchWriteConfig({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        edits: input.edits,
        filePath: input.filePath,
        expectedVersion: input.expectedVersion,
        reloadUserConfig: input.reloadUserConfig,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native config batch write failed.`,
        );
      }
      return result;
    }),

  listNativePermissionProfiles: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwd: z.string().nullable().optional(),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listPermissionProfiles) {
        throw new Error(
          `${input.engine} does not support native permission profiles.`,
        );
      }

      const result = await adapter.listPermissionProfiles({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwd: input.cwd === undefined ? input.projectPath : input.cwd,
        cursor: input.cursor,
        limit: input.limit,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native permission profile listing failed.`,
        );
      }
      return result;
    }),

  listNativeMcpServerStatuses: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cursor: z.string().nullable().optional(),
        detail: nativeMcpServerStatusDetailSchema.nullable().optional(),
        limit: z.number().int().nonnegative().nullable().optional(),
        threadId: z.string().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listMcpServerStatuses) {
        throw new Error(
          `${input.engine} does not support native MCP status reads.`,
        );
      }

      const result = await adapter.listMcpServerStatuses({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cursor: input.cursor,
        detail: input.detail as
          | AgentRuntimeMcpServerStatusDetail
          | null
          | undefined,
        limit: input.limit,
        threadId: input.threadId,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native MCP status read failed.`,
        );
      }
      return result;
    }),

  reloadNativeMcpServerConfig: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.reloadMcpServerConfig) {
        throw new Error(
          `${input.engine} does not support native MCP config reload.`,
        );
      }

      const result = await adapter.reloadMcpServerConfig({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native MCP config reload failed.`,
        );
      }
      return result;
    }),

  listNativeSkills: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwds: z.array(z.string().min(1)).nullable().optional(),
        forceReload: z.boolean().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listSkills) {
        throw new Error(
          `${input.engine} does not support native skill listing.`,
        );
      }

      const result = await adapter.listSkills({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwds: input.cwds,
        forceReload: input.forceReload,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native skill listing failed.`,
        );
      }
      return result;
    }),

  listNativeHooks: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwds: z.array(z.string().min(1)).nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listHooks) {
        throw new Error(
          `${input.engine} does not support native hook listing.`,
        );
      }

      const result = await adapter.listHooks({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwds: input.cwds,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native hook listing failed.`,
        );
      }
      return result;
    }),

  listNativeApps: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cursor: z.string().nullable().optional(),
        forceRefetch: z.boolean().nullable().optional(),
        limit: z.number().int().nonnegative().nullable().optional(),
        threadId: z.string().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listApps) {
        throw new Error(`${input.engine} does not support native app listing.`);
      }

      const result = await adapter.listApps({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cursor: input.cursor,
        forceRefetch: input.forceRefetch,
        limit: input.limit,
        threadId: input.threadId,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native app listing failed.`,
        );
      }
      return result;
    }),

  listNativePlugins: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwds: z.array(z.string().min(1)).nullable().optional(),
        marketplaceKinds: z
          .array(nativePluginMarketplaceKindSchema)
          .nullable()
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listPlugins) {
        throw new Error(
          `${input.engine} does not support native plugin listing.`,
        );
      }

      const result = await adapter.listPlugins({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwds: input.cwds,
        marketplaceKinds: input.marketplaceKinds as
          | AgentRuntimePluginMarketplaceKind[]
          | null
          | undefined,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native plugin listing failed.`,
        );
      }
      return result;
    }),

  listNativeInstalledPlugins: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwds: z.array(z.string().min(1)).nullable().optional(),
        installSuggestionPluginNames: z
          .array(z.string().min(1))
          .nullable()
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listInstalledPlugins) {
        throw new Error(
          `${input.engine} does not support native installed plugin listing.`,
        );
      }

      const result = await adapter.listInstalledPlugins({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwds: input.cwds,
        installSuggestionPluginNames: input.installSuggestionPluginNames,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native installed plugin listing failed.`,
        );
      }
      return result;
    }),

  readNativePlugin: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        pluginName: z.string().min(1),
        marketplacePath: z.string().nullable().optional(),
        remoteMarketplaceName: z.string().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.readPlugin) {
        throw new Error(`${input.engine} does not support native plugin read.`);
      }

      const result = await adapter.readPlugin({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        pluginName: input.pluginName,
        marketplacePath: input.marketplacePath,
        remoteMarketplaceName: input.remoteMarketplaceName,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native plugin read failed.`,
        );
      }
      return result;
    }),

  installNativePlugin: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        pluginName: z.string().min(1),
        marketplacePath: z.string().nullable().optional(),
        remoteMarketplaceName: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.installPlugin) {
        throw new Error(
          `${input.engine} does not support native plugin install.`,
        );
      }

      const result = await adapter.installPlugin({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        pluginName: input.pluginName,
        marketplacePath: input.marketplacePath,
        remoteMarketplaceName: input.remoteMarketplaceName,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native plugin install failed.`,
        );
      }
      return result;
    }),

  detectNativeExternalAgentConfig: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cwds: z.array(z.string().min(1)).nullable().optional(),
        includeHome: z.boolean().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.detectExternalAgentConfig) {
        throw new Error(
          `${input.engine} does not support native external config detection.`,
        );
      }

      const result = await adapter.detectExternalAgentConfig({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cwds: input.cwds,
        includeHome: input.includeHome,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native external config detection failed.`,
        );
      }
      return result;
    }),

  importNativeExternalAgentConfig: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        migrationItems: z
          .array(nativeExternalAgentConfigMigrationItemSchema)
          .min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.importExternalAgentConfig) {
        throw new Error(
          `${input.engine} does not support native external config import.`,
        );
      }

      const result = await adapter.importExternalAgentConfig({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        migrationItems:
          input.migrationItems as AgentRuntimeExternalAgentConfigMigrationItem[],
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native external config import failed.`,
        );
      }
      return result;
    }),

  startNativeMcpServerOauthLogin: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        name: z.string().min(1),
        scopes: z.array(z.string().min(1)).nullable().optional(),
        timeoutSecs: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.startMcpServerOauthLogin) {
        throw new Error(
          `${input.engine} does not support native MCP OAuth login.`,
        );
      }

      const result = await adapter.startMcpServerOauthLogin({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        name: input.name,
        scopes: input.scopes,
        timeoutSecs: input.timeoutSecs,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native MCP OAuth login failed.`,
        );
      }
      return result;
    }),

  listNativeModels: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        cursor: z.string().nullable().optional(),
        includeHidden: z.boolean().nullable().optional(),
        limit: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.listModels) {
        throw new Error(
          `${input.engine} does not support native model listing.`,
        );
      }

      const result = await adapter.listModels({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        cursor: input.cursor,
        includeHidden: input.includeHidden,
        limit: input.limit,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native model listing failed.`,
        );
      }
      return result;
    }),

  startNativeAccountLogin: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        type: nativeAccountLoginTypeSchema.default("chatgpt"),
        apiKey: z.string().nullable().optional(),
        codexStreamlinedLogin: z.boolean().optional(),
        accessToken: z.string().nullable().optional(),
        chatgptAccountId: z.string().nullable().optional(),
        chatgptPlanType: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.startAccountLogin) {
        throw new Error(
          `${input.engine} does not support native account login.`,
        );
      }

      const result = await adapter.startAccountLogin({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        type: input.type,
        apiKey: input.apiKey,
        codexStreamlinedLogin: input.codexStreamlinedLogin,
        accessToken: input.accessToken,
        chatgptAccountId: input.chatgptAccountId,
        chatgptPlanType: input.chatgptPlanType,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native account login failed.`,
        );
      }
      return result;
    }),

  cancelNativeAccountLogin: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        loginId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.cancelAccountLogin) {
        throw new Error(
          `${input.engine} does not support native account login cancel.`,
        );
      }

      const result = await adapter.cancelAccountLogin({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        loginId: input.loginId,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native account login cancel failed.`,
        );
      }
      return result;
    }),

  logoutNativeAccount: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.logoutAccount) {
        throw new Error(
          `${input.engine} does not support native account logout.`,
        );
      }

      const result = await adapter.logoutAccount({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native account logout failed.`,
        );
      }
      return result;
    }),

  readNativeAccount: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        refreshToken: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.readAccount) {
        throw new Error(
          `${input.engine} does not support native account reads.`,
        );
      }

      const result = await adapter.readAccount({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        refreshToken: input.refreshToken,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native account read failed.`,
        );
      }
      return result;
    }),

  readNativeAccountRateLimits: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.readAccountRateLimits) {
        throw new Error(
          `${input.engine} does not support native account rate limits.`,
        );
      }

      const result = await adapter.readAccountRateLimits({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native account rate-limit read failed.`,
        );
      }
      return result;
    }),

  readNativeAccountUsage: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.readAccountUsage) {
        throw new Error(
          `${input.engine} does not support native account usage.`,
        );
      }

      const result = await adapter.readAccountUsage({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native account usage read failed.`,
        );
      }
      return result;
    }),

  controlNativeThread: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        action: nativeThreadControlActionSchema,
        threadId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.controlThread) {
        throw new Error(
          `${input.engine} does not support native thread control.`,
        );
      }

      const result = await adapter.controlThread({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        action: input.action as AgentRuntimeThreadControlAction,
        threadId: input.threadId,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread control failed.`,
        );
      }
      return result;
    }),

  setNativeThreadName: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        threadId: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.setThreadName) {
        throw new Error(
          `${input.engine} does not support native thread name updates.`,
        );
      }

      const result = await adapter.setThreadName({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
        name: input.name,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread name update failed.`,
        );
      }
      return result;
    }),

  updateNativeThreadMetadata: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        threadId: z.string().min(1),
        gitInfo: nativeThreadGitInfoPatchSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.updateThreadMetadata) {
        throw new Error(
          `${input.engine} does not support native thread metadata updates.`,
        );
      }

      const result = await adapter.updateThreadMetadata({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
        gitInfo: input.gitInfo,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message ||
            `${input.engine} native thread metadata update failed.`,
        );
      }
      return result;
    }),

  getNativeThreadGoal: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        threadId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.getThreadGoal) {
        throw new Error(
          `${input.engine} does not support native thread goals.`,
        );
      }

      const result = await adapter.getThreadGoal({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread goal read failed.`,
        );
      }
      return result;
    }),

  setNativeThreadGoal: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        threadId: z.string().min(1),
        objective: z.string().nullable().optional(),
        status: nativeThreadGoalStatusSchema.nullable().optional(),
        tokenBudget: z.number().int().nonnegative().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.setThreadGoal) {
        throw new Error(
          `${input.engine} does not support native thread goal updates.`,
        );
      }

      const result = await adapter.setThreadGoal({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
        objective: input.objective,
        status: input.status as AgentRuntimeThreadGoalStatus | null | undefined,
        tokenBudget: input.tokenBudget,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread goal update failed.`,
        );
      }
      return result;
    }),

  clearNativeThreadGoal: publicProcedure
    .input(
      z.object({
        engine: agentEngineSchema.default("codex"),
        projectPath: z.string().min(1),
        threadId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const adapter = getAgentRuntimeAdapter(input.engine);
      if (!adapter.clearThreadGoal) {
        throw new Error(
          `${input.engine} does not support native thread goal clearing.`,
        );
      }

      const result = await adapter.clearThreadGoal({
        session: buildRuntimeSessionRefForProject({
          engine: input.engine,
          projectPath: input.projectPath,
        }),
        threadId: input.threadId,
      });
      if (result.status !== "success") {
        throw new Error(
          result.message || `${input.engine} native thread goal clear failed.`,
        );
      }
      return result;
    }),

  prepareSessionResume: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const { subChat, plan } = buildActionPlanForSubChat(input.subChatId);
      const action = plan.actions.resume;
      if (action.status !== "ready") {
        throw new Error(action.reason || "Session is not ready to resume.");
      }
      const engine = normalizeEngineId(subChat.engine);
      const nativeSessionId =
        subChat.engineSessionId ??
        (engine === "claude-code" ? subChat.sessionId : null);
      const permissionMode = resolveSubChatPermissionMode(subChat);
      const nativeBridgePlan =
        engine === "codex" && nativeSessionId
          ? ({
              engine: "codex",
              action: "resume",
              sessionId: nativeSessionId,
              bridge: "codex-app-server-thread",
              mode: "headless-app-server",
              cwd: getProjectPathForSubChat(input.subChatId),
              modelId: subChat.modelId,
              permissionMode,
              canRunHeadless: true,
              notes: ["Codex native resume uses app-server thread/resume."],
            } as const)
          : engine === "hermes" && nativeSessionId
            ? buildHermesNativeSessionBridgePlan({
                action: "resume",
                sessionId: nativeSessionId,
                cwd: getProjectPathForSubChat(input.subChatId),
                modelId: subChat.modelId,
                permissionMode,
              })
            : undefined;
      const nativeBridgeRunner =
        nativeBridgePlan?.bridge === "codex-app-server-thread"
          ? {
              kind: "codex-app-server-thread",
              runner: "streamCodexAppServerRuntimeRun",
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
            : undefined;

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
      });

      return {
        success: true as const,
        action: "resume" as const,
        mode: action.mode,
        nativeBridgePlan,
        nativeBridgeRunner,
        subChat: updated,
      };
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
      const { subChat: sourceSubChat, engine } = buildActionPlanForSubChat(
        input.subChatId,
      );
      const sourceNativeSessionId =
        sourceSubChat.engineSessionId ??
        (engine === "claude-code" ? sourceSubChat.sessionId : null);
      const permissionMode = resolveSubChatPermissionMode(sourceSubChat);
      const projectPath = getProjectPathForSubChat(input.subChatId);
      let nativeBridgePlan: unknown =
        engine === "codex" && sourceNativeSessionId
          ? {
              engine: "codex",
              action: "fork",
              sessionId: sourceNativeSessionId,
              bridge: "codex-app-server-thread",
              mode: "headless-app-server",
              cwd: projectPath,
              modelId: sourceSubChat.modelId,
              permissionMode,
              targetMessageId: input.messageId ?? null,
              targetMessageIndex: input.messageIndex ?? null,
              canRunHeadless: true,
              notes: [
                "Codex native fork uses app-server thread/fork.",
                "When the requested fork point is not the latest turn, the forked thread is rolled back after creation.",
              ],
            }
          : engine === "hermes" && sourceNativeSessionId
            ? buildHermesNativeSessionBridgePlan({
                action: "fork",
                sessionId: sourceNativeSessionId,
                cwd: projectPath,
                modelId: sourceSubChat.modelId,
                permissionMode,
                targetMessageId: input.messageId,
              })
            : undefined;
      const forkName = buildForkName({
        sourceSubChatId: input.subChatId,
        chatId: sourceSubChat.chatId,
        sourceName: sourceSubChat.name,
        requestedName: input.name,
      });
      const targetSubChatId = createId();
      let forkRecord = buildMossForkSubChatRecord({
        sourceSubChat,
        targetSubChatId,
        targetName: forkName,
        targetMessageId: input.messageId,
        targetMessageIndex: input.messageIndex,
        nativeBridgePlan,
      });
      let snapshot = forkRecord.snapshot;
      let nativeSessionLinked = forkRecord.nativeSessionLinked;
      let nativeThreadRead: NativeThreadReadSummary | null = null;
      let forkedCodexThreadId: string | null = null;

      if (nativeSessionLinked && engine === "codex" && sourceNativeSessionId) {
        const adapter = getAgentRuntimeAdapter("codex");
        if (!adapter.forkThread) {
          throw new Error("Codex adapter does not support native thread fork.");
        }

        const runtimeSession = buildRuntimeSessionRefForSubChat({
          subChat: sourceSubChat,
          engine: "codex",
          nativeSessionId: sourceNativeSessionId,
          projectPath,
        });
        const sourceUserTurnCount = countLocalTranscriptUserTurns(
          sourceSubChat.messages,
        );
        const forkUserTurnCount = countLocalTranscriptUserTurns(
          JSON.stringify(snapshot.messages),
        );
        const nativeForkRollbackTurns = Math.max(
          0,
          sourceUserTurnCount - forkUserTurnCount,
        );

        if (typeof nativeBridgePlan === "object" && nativeBridgePlan !== null) {
          nativeBridgePlan = {
            ...nativeBridgePlan,
            nativeForkRollbackTurns,
          };
        }

        const nativeForkResult = await adapter.forkThread({
          session: runtimeSession,
        });
        forkedCodexThreadId = cleanString(nativeForkResult.threadId) ?? null;
        if (nativeForkResult.status !== "success" || !forkedCodexThreadId) {
          throw new Error(
            nativeForkResult.message || "Codex native thread fork failed.",
          );
        }

        const targetRuntimeSession: AgentRuntimeSessionRef = {
          ...runtimeSession,
          subChatId: targetSubChatId,
          nativeSessionId: forkedCodexThreadId,
        };
        let nativeBridgeMetadata: Record<string, unknown> = {
          targetEngineSessionId: forkedCodexThreadId,
          nativeForkRollbackTurns,
          nativeBridgeResult:
            summarizeNativeThreadControlResult(nativeForkResult),
        };

        if (nativeForkRollbackTurns > 0) {
          if (!adapter.rollbackThread) {
            throw new Error(
              "Codex adapter does not support native thread rollback.",
            );
          }

          const nativeRollbackResult = await adapter.rollbackThread({
            numTurns: nativeForkRollbackTurns,
            session: targetRuntimeSession,
          });
          if (nativeRollbackResult.status !== "success") {
            throw new Error(
              nativeRollbackResult.message ||
                "Codex native fork rollback failed.",
            );
          }

          nativeBridgeMetadata = {
            ...nativeBridgeMetadata,
            nativeForkRollbackResult:
              summarizeNativeThreadControlResult(nativeRollbackResult),
          };
        }

        if (adapter.readThread) {
          const nativeReadResult = await adapter.readThread({
            includeTurns: true,
            session: targetRuntimeSession,
          });
          nativeThreadRead = summarizeNativeThreadReadResult(nativeReadResult, {
            includeTurns: true,
            localMessages: JSON.stringify(snapshot.messages),
          });
          nativeBridgeMetadata = {
            ...nativeBridgeMetadata,
            nativeThreadRead,
          };
        }

        forkRecord = buildMossForkSubChatRecord({
          sourceSubChat,
          targetSubChatId,
          targetName: forkName,
          targetMessageId: input.messageId,
          targetMessageIndex: input.messageIndex,
          nativeBridgePlan,
          metadata: nativeBridgeMetadata,
        });
        snapshot = forkRecord.snapshot;
        nativeSessionLinked = forkRecord.nativeSessionLinked;
      }

      let newSubChat = getDatabase()
        .insert(subChats)
        .values({
          ...forkRecord.insertValues,
          ...(forkedCodexThreadId
            ? { engineSessionId: forkedCodexThreadId }
            : {}),
        })
        .returning()
        .get();

      if (nativeSessionLinked && engine === "claude-code") {
        const copied = sourceSubChat.sessionId
          ? await copyClaudeForkSessionFiles({
              sourceSubChatId: input.subChatId,
              targetSubChatId,
            })
          : false;

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
          });
          snapshot = forkRecord.snapshot;
          nativeSessionLinked = forkRecord.nativeSessionLinked;
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
            .get();
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
        nativeThreadRead,
      };
    }),

  rollbackSession: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        targetMessageId: z.string().optional(),
        targetSdkMessageUuid: z.string().optional(),
        strictTarget: z.boolean().optional(),
        nativeCheckpointTurnCount: z.number().int().nonnegative().optional(),
        nativeCheckpointRef: z.string().optional(),
        applyGitCheckpoint: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { subChat, engine } = buildActionPlanForSubChat(input.subChatId);
      const sourceNativeSessionId =
        subChat.engineSessionId ??
        (engine === "claude-code" ? subChat.sessionId : null);
      const permissionMode = resolveSubChatPermissionMode(subChat);
      let nativeBridgePlan: unknown =
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
          : undefined;
      let rollbackRecord = buildMossRollbackSubChatUpdate({
        subChat,
        targetMessageId: input.targetMessageId,
        targetSdkMessageUuid: input.targetSdkMessageUuid,
        strictTarget: input.strictTarget,
        appliedGitCheckpoint: Boolean(input.applyGitCheckpoint),
        nativeBridgePlan,
      });
      let snapshot = rollbackRecord.snapshot;
      let nativeThreadRead: NativeThreadReadSummary | null = null;

      if (input.applyGitCheckpoint) {
        if (!snapshot.targetSdkMessageUuid) {
          throw new Error(
            "A target SDK message UUID is required for git rollback.",
          );
        }

        const chat = getDatabase()
          .select()
          .from(chats)
          .where(eq(chats.id, subChat.chatId))
          .get();
        if (!chat?.worktreePath) {
          throw new Error("A worktree path is required for git rollback.");
        }

        const rollback = await applyRollbackStash(
          chat.worktreePath,
          snapshot.targetSdkMessageUuid,
        );
        if (!rollback.success) {
          throw new Error(`Git rollback failed: ${rollback.error}`);
        }
        if (!rollback.checkpointFound) {
          throw new Error("Checkpoint not found - cannot rollback git state.");
        }
      }

      if (
        engine === "codex" &&
        sourceNativeSessionId &&
        snapshot.nativeSessionLinked
      ) {
        const projectPath = getProjectPathForSubChat(input.subChatId);
        const adapter = getAgentRuntimeAdapter("codex");
        const runtimeSession = buildRuntimeSessionRefForSubChat({
          subChat,
          engine: "codex",
          nativeSessionId: sourceNativeSessionId,
          projectPath,
        });
        const nativeCheckpointTurnCount = input.nativeCheckpointTurnCount;
        const nativeCheckpointRef = input.nativeCheckpointRef?.trim() || null;
        let numTurns = snapshot.nativeRollbackTurnCount;
        let nativeThreadReadBeforeRollback: NativeThreadReadSummary | null =
          null;
        let nativeCheckpointCurrentTurnCount: number | null = null;

        if (nativeCheckpointTurnCount !== undefined) {
          if (!adapter.readThread) {
            throw new Error(
              "Codex adapter does not support native thread reads for checkpoint rollback.",
            );
          }

          const nativeReadResult = await adapter.readThread({
            includeTurns: true,
            session: runtimeSession,
          });
          nativeThreadReadBeforeRollback = summarizeNativeThreadReadResult(
            nativeReadResult,
            {
              includeTurns: true,
              localMessages: JSON.stringify(snapshot.messages),
            },
          );

          if (nativeReadResult.status !== "success") {
            throw new Error(
              nativeThreadReadBeforeRollback.message ||
                nativeReadResult.message ||
                "Codex native thread read failed before checkpoint rollback.",
            );
          }

          if (typeof nativeThreadReadBeforeRollback.turnCount !== "number") {
            throw new Error(
              "Codex native thread read did not include a turn count for checkpoint rollback.",
            );
          }

          nativeCheckpointCurrentTurnCount =
            nativeThreadReadBeforeRollback.turnCount;
          if (nativeCheckpointTurnCount > nativeCheckpointCurrentTurnCount) {
            throw new Error(
              `Checkpoint turn count (${nativeCheckpointTurnCount}) is newer than Codex native thread turn count (${nativeCheckpointCurrentTurnCount}).`,
            );
          }
          numTurns =
            nativeCheckpointCurrentTurnCount - nativeCheckpointTurnCount;
        }

        const nativeCheckpointRevertPlan =
          nativeCheckpointTurnCount !== undefined
            ? {
                type: "thread.checkpoint.revert",
                turnCount: nativeCheckpointTurnCount,
                checkpointRef: nativeCheckpointRef,
                currentTurnCount: nativeCheckpointCurrentTurnCount,
                numTurns,
              }
            : null;

        nativeBridgePlan = {
          engine: "codex",
          action: "rollback",
          bridge: "codex-app-server-thread",
          mode: "headless-app-server",
          sessionId: sourceNativeSessionId,
          cwd: projectPath,
          modelId: subChat.modelId,
          permissionMode,
          numTurns,
          ...(nativeCheckpointRevertPlan
            ? {
                checkpointTurnCount: nativeCheckpointTurnCount,
                checkpointRef: nativeCheckpointRef,
                nativeCheckpointRevert: nativeCheckpointRevertPlan,
              }
            : {}),
          canRunHeadless: true,
          notes: [
            "Codex native rollback uses app-server thread/rollback.",
            nativeCheckpointRevertPlan
              ? "Rollback turns were computed from the selected native checkpoint turn count."
              : "Rollback turns were computed from the Moss transcript boundary.",
            numTurns > 0
              ? "The native thread will be rolled back before the Moss transcript is persisted."
              : "No later Codex turns were found after the rollback target; the native thread call is skipped.",
          ],
        };

        let nativeBridgeMetadata: Record<string, unknown> = {
          nativeBridgeSkipped:
            numTurns <= 0 ? "No Codex turns after rollback target." : false,
          ...(nativeCheckpointRevertPlan
            ? { nativeCheckpointRevert: nativeCheckpointRevertPlan }
            : {}),
          ...(nativeThreadReadBeforeRollback
            ? { nativeThreadReadBeforeRollback }
            : {}),
        };

        if (numTurns > 0) {
          if (!adapter.rollbackThread) {
            throw new Error(
              "Codex adapter does not support native thread rollback.",
            );
          }

          const nativeResult = await adapter.rollbackThread({
            numTurns,
            session: runtimeSession,
          });

          if (nativeResult.status !== "success") {
            throw new Error(
              nativeResult.message || "Codex native thread rollback failed.",
            );
          }

          nativeBridgeMetadata = {
            ...nativeBridgeMetadata,
            nativeBridgeResult:
              summarizeNativeThreadControlResult(nativeResult),
          };

          if (adapter.readThread) {
            const nativeReadResult = await adapter.readThread({
              includeTurns: true,
              session: runtimeSession,
            });
            nativeThreadRead = summarizeNativeThreadReadResult(
              nativeReadResult,
              {
                includeTurns: true,
                localMessages: JSON.stringify(snapshot.messages),
              },
            );
            nativeBridgeMetadata = {
              ...nativeBridgeMetadata,
              nativeThreadRead,
            };
          }
        }

        rollbackRecord = buildMossRollbackSubChatUpdate({
          subChat,
          targetMessageId: input.targetMessageId,
          targetSdkMessageUuid: input.targetSdkMessageUuid,
          strictTarget: input.strictTarget,
          appliedGitCheckpoint: Boolean(input.applyGitCheckpoint),
          nativeBridgePlan,
          metadata: nativeBridgeMetadata,
        });
        snapshot = rollbackRecord.snapshot;
      }

      const updated = getDatabase()
        .update(subChats)
        .set(rollbackRecord.updateValues)
        .where(eq(subChats.id, input.subChatId))
        .returning()
        .get();

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
        nativeThreadRead,
      };
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
        };
      }

      const readResult = await readMossProviderConfig(input.projectPath, {
        createIfMissing: true,
      });
      if (readResult.status !== "found" || !readResult.config) {
        return {
          status: readResult.status,
          sourcePath: readResult.sourcePath,
          defaultProvider: "moss",
          useCustomProvider: false,
          customProvider: null,
          error: readResult.error,
        };
      }

      const custom = getOrCreateCustomProvider(readResult.config);
      const hasApiKey = await hasMossProviderSecret(custom.id);

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
      };
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
      });
      if (readResult.status !== "found" || !readResult.config) {
        throw new Error(
          readResult.error || "Unable to read Moss provider config",
        );
      }

      const config = readResult.config;
      const custom = getOrCreateCustomProvider(config);
      const models = input.customProvider.models;

      custom.baseUrl = cleanString(input.customProvider.baseUrl);
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
      };
      delete custom.apiKey;

      config.defaultProvider = input.useCustomProvider ? "custom" : "moss";
      config.credentialPolicy = {
        ...config.credentialPolicy,
        singleUserConfiguration: true,
        allowCustomBaseUrl: true,
        allowCustomApiKey: true,
        shareAcrossEngines: true,
      };
      config.providers.custom = custom;

      if (input.customProvider.clearApiKey) {
        await setMossProviderSecret({ providerId: "custom", apiKey: null });
      } else if (typeof input.customProvider.apiKey === "string") {
        await setMossProviderSecret({
          providerId: "custom",
          apiKey: input.customProvider.apiKey,
        });
      }

      const updated = await writeMossProviderConfig(input.projectPath, config);
      const storedSecrets = await buildStoredSecretSummary(updated.config);
      return summarizeMossProviderReadResult(updated, storedSecrets);
    }),

  setSessionEngine: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        engine: agentEngineSchema,
        nativeSessionId: z.string().nullable().optional(),
        configDir: z.string().nullable().optional(),
        providerInstanceId: z.string().nullable().optional(),
        modelId: z.string().nullable().optional(),
        modelSelection: runtimeModelSelectionSchema.nullable().optional(),
        permissionMode: permissionModeSchema.optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existingSubChat = getSubChatOrThrow(input.subChatId);
      const projectPath = getProjectPathForSubChat(input.subChatId);
      const manifest = getAgentRuntimeManifest(input.engine);
      const providerInstanceId =
        input.providerInstanceId ?? input.modelSelection?.instanceId ?? null;
      const metadata = {
        ...(input.metadata ?? {}),
        ...(providerInstanceId ? { providerInstanceId } : {}),
        ...(input.modelSelection
          ? { modelSelection: input.modelSelection }
          : {}),
      };
      const launchPlan = buildAgentRuntimeLaunchPlan({
        runId: `engine-selection:${input.subChatId}:${Date.now()}`,
        session: {
          subChatId: input.subChatId,
          chatId: existingSubChat.chatId,
          engineId: input.engine,
          providerInstanceId,
          nativeSessionId: input.nativeSessionId ?? null,
          modelId: input.modelId ?? manifest.defaultModelId ?? null,
          modelSelection: input.modelSelection ?? null,
          permissionMode:
            input.permissionMode ??
            resolveSubChatPermissionMode(existingSubChat),
          cwd: projectPath,
          projectPath,
          runtimeConfigDir:
            input.configDir ?? manifest.configRoots.user ?? null,
          metadata,
        },
        nativeSessionStrategy: input.nativeSessionId ? "resume" : "start",
        transport: "settings-selection",
        providerRoute: "settings-selection",
      });

      persistAgentRuntimeSession({
        subChatId: input.subChatId,
        engine: input.engine,
        nativeSessionId: input.nativeSessionId,
        configDir: input.configDir,
        providerInstanceId,
        modelId: input.modelId,
        modelSelection: input.modelSelection,
        permissionMode: input.permissionMode,
        metadata,
        launchPlan,
        updateLegacySessionId: input.engine === "claude-code",
      });

      const projection = await materializeMossEngineProjectionSafely({
        projectPath,
        engineId: input.engine,
        createIfMissing: true,
      });

      return { success: true as const, projection };
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
      const projectPath =
        input.projectPath ||
        (input.subChatId ? getProjectPathForSubChat(input.subChatId) : null);

      if (!projectPath) {
        throw new Error("projectPath or subChatId is required");
      }

      return materializeMossWorkspaceProjections({
        projectPath,
        engines: input.engine ? [input.engine] : AGENT_ENGINE_IDS,
        dryRun: input.dryRun,
        createIfMissing: input.createIfMissing ?? true,
      });
    }),
});
