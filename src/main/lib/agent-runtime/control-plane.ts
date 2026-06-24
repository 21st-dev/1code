import { eq } from "drizzle-orm"
import {
  chats,
  getDatabase,
  projects,
  subChats,
  type Chat,
  type Project,
  type SubChat,
} from "../db"
import {
  readMossProjectionManifestSummary,
  readMossProviderConfig,
  resolveMossProviderForEngine,
  summarizeMossProviderReadResult,
  type MossProjectionManifestSummary,
  type MossProviderSecretResolver,
  type MossProviderSummary,
} from "../moss-source"
import { getAgentRuntimeManifest } from "./manifests"
import {
  buildMossSessionActionPlan,
  type MossSessionActionPlan,
} from "./session-actions"
import { AGENT_ENGINE_IDS, DEFAULT_AGENT_ENGINE_ID, type AgentEngineId } from "./types"

export type MossSessionControlStatus =
  | "ready"
  | "missing-project"
  | "missing-project-path"

export type MossNativeSessionState =
  | "linked"
  | "pending-native-session"

export type MossProjectionSessionState =
  | "materialized"
  | "native"
  | "not-materialized"
  | "unknown"

export interface MossProviderRouteSummary {
  status: "resolved" | "missing" | "unconfigured" | "parse-error"
  providerId?: string
  label?: string
  mode?: string
  model?: string
  authMethod?: string
  apiKeySource?: "inline" | "env" | "stored"
  hasBaseUrl: boolean
  baseUrlSource?: "inline" | "env" | "stored"
  baseUrlEnv?: string
  warnings: string[]
  reason?: string
  error?: string
}

export interface MossSessionControlEntry {
  chatId: string
  chatName: string | null
  workspacePath: string
  branch: string | null
  subChatId: string
  subChatName: string | null
  engine: AgentEngineId
  modelId: string | null
  nativeSessionId: string | null
  configDir: string | null
  permissionMode: string
  mossManaged: boolean
  nativeSessionLinked: boolean
  nativeSessionState: MossNativeSessionState
  projectionState: MossProjectionSessionState
  messageCount: number
  actions: MossSessionActionPlan["actions"]
  providerId?: string
  providerModel?: string
  updatedAt: string | null
  runtimeUpdatedAt: string | null
}

export interface MossSessionControlPlane {
  status: MossSessionControlStatus
  projectPath: string | null
  scopePath: string | null
  projectId: string | null
  projectName: string | null
  summary: {
    workspaces: number
    sessions: number
    mossManagedSessions: number
    nativeSessionLinked: number
    pendingNativeSessions: number
    engines: Record<AgentEngineId, number>
  }
  provider: MossProviderSummary
  providerRoutes: Record<AgentEngineId, MossProviderRouteSummary>
  projectionManifest: MossProjectionManifestSummary
  sessions: MossSessionControlEntry[]
}

function emptyProviderSummary(projectPath: string | null): MossProviderSummary {
  return {
    status: "missing",
    sourcePath: projectPath ? `${projectPath}/.moss/providers.yaml` : "",
    providers: [],
  }
}

function emptyProjectionSummary(
  projectPath: string | null,
): MossProjectionManifestSummary {
  return {
    status: "missing",
    sourcePath: projectPath ? `${projectPath}/.moss/projections/manifest.json` : "",
    totalEntries: 0,
    engines: [],
  }
}

function emptyProviderRoutes(): Record<AgentEngineId, MossProviderRouteSummary> {
  const routes = {} as Record<AgentEngineId, MossProviderRouteSummary>
  for (const engineId of AGENT_ENGINE_IDS) {
    routes[engineId] = {
      status: "missing",
      hasBaseUrl: false,
      warnings: [],
      reason: "No project path is selected.",
    }
  }
  return routes
}

function parseRuntimeMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function toIsoString(
  value: Date | string | number | null | undefined,
): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeEngine(value: string | null | undefined): AgentEngineId {
  return AGENT_ENGINE_IDS.includes(value as AgentEngineId)
    ? value as AgentEngineId
    : DEFAULT_AGENT_ENGINE_ID
}

function getProjectionState(
  engine: AgentEngineId,
  manifest: MossProjectionManifestSummary,
): MossProjectionSessionState {
  if (engine === "hermes") return "native"
  if (manifest.status !== "found") return "unknown"
  const engineEntries = manifest.engines.find((entry) => entry.engineId === engine)
  return engineEntries && engineEntries.entries > 0
    ? "materialized"
    : "not-materialized"
}

async function buildProviderRoutes(
  projectPath: string,
  secretResolver?: MossProviderSecretResolver,
): Promise<Record<AgentEngineId, MossProviderRouteSummary>> {
  const entries = await Promise.all(
    AGENT_ENGINE_IDS.map(async (engineId) => {
      const resolved = await resolveMossProviderForEngine({
        projectPath,
        engineId,
        createIfMissing: true,
        secretResolver,
      })
      return [
        engineId,
        {
          status: resolved.status,
          providerId: resolved.providerId,
          label: resolved.label,
          mode: resolved.mode,
          model: resolved.model,
          authMethod: resolved.authMethod,
          apiKeySource: resolved.apiKeySource,
          hasBaseUrl: Boolean(resolved.baseUrl),
          baseUrlSource: resolved.baseUrlSource,
          baseUrlEnv: resolved.baseUrlEnv,
          warnings: resolved.warnings,
          reason: resolved.reason,
          error: resolved.error,
        } satisfies MossProviderRouteSummary,
      ] as const
    }),
  )
  return Object.fromEntries(entries) as Record<
    AgentEngineId,
    MossProviderRouteSummary
  >
}

function findProjectScope(projectPath: string): {
  project: Project | null
  scopePath: string
  chats: Chat[]
} {
  const db = getDatabase()
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.path, projectPath))
    .get()

  if (project) {
    return {
      project,
      scopePath: project.path,
      chats: db
        .select()
        .from(chats)
        .where(eq(chats.projectId, project.id))
        .all(),
    }
  }

  const worktreeChat = db
    .select()
    .from(chats)
    .where(eq(chats.worktreePath, projectPath))
    .get()
  if (!worktreeChat) {
    return {
      project: null,
      scopePath: projectPath,
      chats: [],
    }
  }

  const sourceProject = db
    .select()
    .from(projects)
    .where(eq(projects.id, worktreeChat.projectId))
    .get() ?? null

  return {
    project: sourceProject,
    scopePath: projectPath,
    chats: [worktreeChat],
  }
}

function listSubChatsForChat(chatId: string): SubChat[] {
  return getDatabase()
    .select()
    .from(subChats)
    .where(eq(subChats.chatId, chatId))
    .all()
}

function buildEntries(params: {
  projectPath: string
  chats: Chat[]
  projectionManifest: MossProjectionManifestSummary
  providerRoutes: Record<AgentEngineId, MossProviderRouteSummary>
}): MossSessionControlEntry[] {
  const entries = params.chats.flatMap((chat) =>
    listSubChatsForChat(chat.id).map((subChat) => {
      const engine = normalizeEngine(subChat.engine)
      const metadata = parseRuntimeMetadata(subChat.runtimeMetadata)
      const nativeSessionId =
        subChat.engineSessionId ??
        (engine === "claude-code" ? subChat.sessionId : null)
      const nativeSessionLinked = Boolean(nativeSessionId)
      const manifest = getAgentRuntimeManifest(engine)
      const actionPlan = buildMossSessionActionPlan({
        subChatId: subChat.id,
        engine,
        nativeSessionId,
        messages: subChat.messages,
        features: manifest.features,
      })

      return {
        chatId: chat.id,
        chatName: chat.name,
        workspacePath: chat.worktreePath || params.projectPath,
        branch: chat.branch,
        subChatId: subChat.id,
        subChatName: subChat.name,
        engine,
        modelId: subChat.modelId,
        nativeSessionId,
        configDir: subChat.engineConfigDir,
        permissionMode: subChat.mode,
        mossManaged: true,
        nativeSessionLinked,
        nativeSessionState: nativeSessionLinked
          ? "linked"
          : "pending-native-session",
        projectionState: getProjectionState(engine, params.projectionManifest),
        messageCount: actionPlan.messageCount,
        actions: actionPlan.actions,
        providerId: params.providerRoutes[engine]?.providerId,
        providerModel: params.providerRoutes[engine]?.model,
        updatedAt: toIsoString(subChat.updatedAt),
        runtimeUpdatedAt:
          typeof metadata.updatedAt === "string" ? metadata.updatedAt : null,
      } satisfies MossSessionControlEntry
    }),
  )

  return entries.sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  )
}

function buildSummary(
  chats: Chat[],
  sessions: MossSessionControlEntry[],
): MossSessionControlPlane["summary"] {
  const engines = Object.fromEntries(
    AGENT_ENGINE_IDS.map((engineId) => [engineId, 0]),
  ) as Record<AgentEngineId, number>
  for (const session of sessions) {
    engines[session.engine] += 1
  }

  return {
    workspaces: chats.length,
    sessions: sessions.length,
    mossManagedSessions: sessions.filter((session) => session.mossManaged).length,
    nativeSessionLinked: sessions.filter((session) => session.nativeSessionLinked)
      .length,
    pendingNativeSessions: sessions.filter(
      (session) => !session.nativeSessionLinked,
    ).length,
    engines,
  }
}

export async function getMossSessionControlPlane(params: {
  projectPath?: string | null
  secretResolver?: MossProviderSecretResolver
}): Promise<MossSessionControlPlane> {
  const projectPath = params.projectPath?.trim()
  if (!projectPath) {
    return {
      status: "missing-project-path",
      projectPath: null,
      scopePath: null,
      projectId: null,
      projectName: null,
      summary: buildSummary([], []),
      provider: emptyProviderSummary(null),
      providerRoutes: emptyProviderRoutes(),
      projectionManifest: emptyProjectionSummary(null),
      sessions: [],
    }
  }

  const [providerRead, providerRoutes, projectionManifest] = await Promise.all([
    readMossProviderConfig(projectPath, { createIfMissing: true }),
    buildProviderRoutes(projectPath, params.secretResolver),
    readMossProjectionManifestSummary(projectPath),
  ])
  const provider = summarizeMossProviderReadResult(providerRead)
  const scope = findProjectScope(projectPath)
  const sessions = buildEntries({
    projectPath,
    chats: scope.chats,
    projectionManifest,
    providerRoutes,
  })

  return {
    status: scope.project ? "ready" : "missing-project",
    projectPath: scope.project?.path ?? projectPath,
    scopePath: scope.scopePath,
    projectId: scope.project?.id ?? null,
    projectName: scope.project?.name ?? null,
    summary: buildSummary(scope.chats, sessions),
    provider,
    providerRoutes,
    projectionManifest,
    sessions,
  }
}
