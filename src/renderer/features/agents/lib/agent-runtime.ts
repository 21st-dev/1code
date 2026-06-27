import { CODEX_DEFAULT_MODEL_ID } from "./models"

export const AGENT_ENGINE_IDS = [
  "claude-code",
  "codex",
  "hermes",
  "custom-acp",
] as const
export const HERMES_DEFAULT_MODEL_ID = "moss-default"
export const CUSTOM_ACP_DEFAULT_MODEL_ID = "custom-acp"

export type AgentEngineId = (typeof AGENT_ENGINE_IDS)[number]
export type RunnableAgentEngineId = AgentEngineId
export const DEFAULT_RUNNABLE_AGENT_ENGINE_ID: RunnableAgentEngineId = "hermes"

export type AgentRuntimeVersionAdvisoryStatus =
  | "unknown"
  | "current"
  | "behind_latest"

export type AgentRuntimeUpdateStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "unchanged"

export type AgentRuntimeVersionAdvisory = {
  status: AgentRuntimeVersionAdvisoryStatus
  currentVersion: string | null
  latestVersion: string | null
  updateCommand: string | null
  canUpdate: boolean
  checkedAt: string | null
  message: string | null
}

export type AgentRuntimeUpdateState = {
  status: AgentRuntimeUpdateStatus
  startedAt: string | null
  finishedAt: string | null
  message: string | null
  output: string | null
}

export type AgentRuntimeProviderInstanceStatus =
  | "ready"
  | "warning"
  | "error"
  | "disabled"

export type AgentRuntimeProviderInstanceLike = {
  instanceId: string
  engineId?: string
  displayName?: string
  enabled: boolean
  installed: boolean
  status: AgentRuntimeProviderInstanceStatus
  isDefault?: boolean
  modelIds?: string[]
  version?: string | null
  versionAdvisory?: AgentRuntimeVersionAdvisory | null
  updateState?: AgentRuntimeUpdateState | null
}

export type AgentRuntimeProviderUpdateNoticePhase =
  | "available"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "unchanged"

export type AgentRuntimeProviderUpdateNoticeTone =
  | "info"
  | "warning"
  | "error"
  | "muted"

export type AgentRuntimeProviderUpdateNotice = {
  phase: AgentRuntimeProviderUpdateNoticePhase
  tone: AgentRuntimeProviderUpdateNoticeTone
  icon: "loading" | "warning" | "settings"
  titleKey: string
  bodyKey: string
  values?: Record<string, string | number>
  action: "models" | "runtime"
  actionLabelKey: string
}

export type AgentEngineUiDefinition = {
  id: AgentEngineId
  name: string
  disabled?: boolean
  availability?: string
  statusLabel?: string
  statusReason?: string
  authMethod?: string
  defaultModelLabel?: string
  fallback?: boolean
  version?: string | null
  versionAdvisory?: AgentRuntimeVersionAdvisory | null
  updateState?: AgentRuntimeUpdateState | null
  providerInstances?: AgentRuntimeProviderInstanceLike[]
}

export type RuntimeAvailability =
  | "available"
  | "needs-auth"
  | "not-installed"
  | "unsupported"
  | "error"

export type AgentRuntimeEngineListKind =
  | "ready"
  | "loading"
  | "empty"
  | "error"
  | "fallback"

export type AgentRuntimeEngineListState = {
  kind: AgentRuntimeEngineListKind
  engines: AgentEngineUiDefinition[]
  message?: string
  isLoading: boolean
  isError: boolean
  isFallback: boolean
}

export type RuntimeEngineManifestLike = {
  id: string
  label?: string
  availability?: unknown
  statusReason?: unknown
  authMethod?: unknown
  defaultModelId?: string | null
  version?: string | null
  versionAdvisory?: AgentRuntimeVersionAdvisory | null
  updateState?: AgentRuntimeUpdateState | null
  providerInstances?: AgentRuntimeProviderInstanceLike[]
}

const AVAILABILITY_LABELS: Record<RuntimeAvailability, string> = {
  available: "Available",
  "needs-auth": "Needs auth",
  "not-installed": "Not installed",
  unsupported: "Unsupported",
  error: "Error",
}

export const AGENT_ENGINE_UI_DEFINITIONS: AgentEngineUiDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    defaultModelLabel: "opus",
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    defaultModelLabel: CODEX_DEFAULT_MODEL_ID,
  },
  {
    id: "hermes",
    name: "Hermes",
    defaultModelLabel: HERMES_DEFAULT_MODEL_ID,
  },
  {
    id: "custom-acp",
    name: "Custom ACP",
    disabled: true,
    availability: "unsupported",
    statusLabel: "Unsupported",
    statusReason:
      "Configure a custom ACP adapter before using this engine.",
    defaultModelLabel: CUSTOM_ACP_DEFAULT_MODEL_ID,
  },
]

const RUNTIME_MODEL_LABELS: Record<string, string> = {
  [HERMES_DEFAULT_MODEL_ID]: "Moss Default",
  [CUSTOM_ACP_DEFAULT_MODEL_ID]: "Custom ACP Default",
}

function withRuntimeStatus(
  engine: AgentEngineUiDefinition,
  status: {
    availability: string
    statusLabel: string
    statusReason: string
    disabled?: boolean
    fallback?: boolean
  },
): AgentEngineUiDefinition {
  return {
    ...engine,
    availability: status.availability,
    statusLabel: status.statusLabel,
    statusReason: status.statusReason,
    disabled: status.disabled ?? true,
    fallback: status.fallback,
  }
}

export function buildStaticRuntimeStatusEngines(
  status: {
    availability: string
    statusLabel: string
    statusReason: string
    disabled?: boolean
  },
): AgentEngineUiDefinition[] {
  return AGENT_ENGINE_UI_DEFINITIONS.map((engine) =>
    withRuntimeStatus(engine, status),
  )
}

export function isRunnableAgentEngineId(
  engineId: unknown,
): engineId is RunnableAgentEngineId {
  return AGENT_ENGINE_IDS.includes(engineId as AgentEngineId)
}

export function isRuntimeAvailability(
  value: unknown,
): value is RuntimeAvailability {
  return (
    value === "available" ||
    value === "needs-auth" ||
    value === "not-installed" ||
    value === "unsupported" ||
    value === "error"
  )
}

export function isEngineDisabled(availability: RuntimeAvailability): boolean {
  return availability !== "available"
}

export function mapRuntimeEnginesToUiDefinitions(
  engines: RuntimeEngineManifestLike[] | undefined,
): AgentEngineUiDefinition[] {
  if (!engines) return AGENT_ENGINE_UI_DEFINITIONS

  return engines.map((engine) => {
    const fallback = AGENT_ENGINE_UI_DEFINITIONS.find(
      (item) => item.id === engine.id,
    )
    const runtimeAvailability: RuntimeAvailability | undefined =
      isRuntimeAvailability(engine.availability) ? engine.availability : undefined
    const fallbackAvailability: RuntimeAvailability = fallback?.disabled
      ? "unsupported"
      : "available"
    const availability: RuntimeAvailability =
      runtimeAvailability ?? fallbackAvailability
    const isFallback =
      runtimeAvailability === undefined && engine.availability !== undefined

    return {
      id: engine.id as AgentEngineId,
      name: engine.label || fallback?.name || engine.id,
      disabled: isEngineDisabled(availability),
      availability,
      statusLabel:
        isFallback
          ? "Fallback"
          : availability === "available"
          ? undefined
          : AVAILABILITY_LABELS[availability],
      statusReason:
        typeof engine.statusReason === "string"
          ? engine.statusReason
          : isFallback
            ? "Moss runtime returned an unknown availability value; using the static engine fallback."
            : undefined,
      authMethod:
        typeof engine.authMethod === "string"
          ? engine.authMethod
          : undefined,
      defaultModelLabel:
        engine.defaultModelId || fallback?.defaultModelLabel,
      fallback: isFallback || undefined,
      version: engine.version ?? undefined,
      versionAdvisory: engine.versionAdvisory ?? undefined,
      updateState: engine.updateState ?? undefined,
      providerInstances: engine.providerInstances ?? undefined,
    }
  })
}

export function isAgentRuntimeUpdateActive(
  engine: Pick<AgentEngineUiDefinition, "updateState">,
): boolean {
  return (
    engine.updateState?.status === "queued" ||
    engine.updateState?.status === "running"
  )
}

export function isAgentRuntimeUpdateCandidate(
  engine: Pick<AgentEngineUiDefinition, "versionAdvisory" | "disabled">,
): boolean {
  return (
    engine.disabled !== true &&
    engine.versionAdvisory?.status === "behind_latest" &&
    typeof engine.versionAdvisory.latestVersion === "string" &&
    engine.versionAdvisory.latestVersion.trim().length > 0
  )
}

function providerUpdateValues(
  engine: Pick<
    AgentEngineUiDefinition,
    "name" | "versionAdvisory" | "updateState"
  >,
): Record<string, string | number> {
  return {
    engine: engine.name,
    currentVersion:
      engine.versionAdvisory?.currentVersion || "current version",
    latestVersion:
      engine.versionAdvisory?.latestVersion || "latest version",
    message:
      engine.updateState?.message ||
      engine.versionAdvisory?.message ||
      "",
  }
}

export function getAgentRuntimeProviderUpdateNotice(
  engine: AgentEngineUiDefinition | undefined,
): AgentRuntimeProviderUpdateNotice | null {
  if (!engine) return null

  const values = providerUpdateValues(engine)
  switch (engine.updateState?.status) {
    case "queued":
      return {
        phase: "queued",
        tone: "info",
        icon: "loading",
        titleKey: "runtime.update.queued.title",
        bodyKey: "runtime.update.queued.body",
        values,
        action: "runtime",
        actionLabelKey: "runtime.openRuntime",
      }
    case "running":
      return {
        phase: "running",
        tone: "info",
        icon: "loading",
        titleKey: "runtime.update.running.title",
        bodyKey: "runtime.update.running.body",
        values,
        action: "runtime",
        actionLabelKey: "runtime.openRuntime",
      }
    case "failed":
      return {
        phase: "failed",
        tone: "error",
        icon: "warning",
        titleKey: "runtime.update.failed.title",
        bodyKey: values.message
          ? "runtime.update.failed.bodyWithMessage"
          : "runtime.update.failed.body",
        values,
        action: "runtime",
        actionLabelKey: "runtime.openRuntime",
      }
    case "unchanged":
      return {
        phase: "unchanged",
        tone: "warning",
        icon: "warning",
        titleKey: "runtime.update.unchanged.title",
        bodyKey: "runtime.update.unchanged.body",
        values,
        action: "runtime",
        actionLabelKey: "runtime.openRuntime",
      }
    case "succeeded":
      return {
        phase: "succeeded",
        tone: "muted",
        icon: "settings",
        titleKey: "runtime.update.succeeded.title",
        bodyKey: "runtime.update.succeeded.body",
        values,
        action: "runtime",
        actionLabelKey: "runtime.openRuntime",
      }
    default:
      break
  }

  if (!isAgentRuntimeUpdateCandidate(engine)) return null

  return {
    phase: "available",
    tone: "warning",
    icon: "warning",
    titleKey: engine.versionAdvisory?.canUpdate
      ? "runtime.update.available.title"
      : "runtime.update.manual.title",
    bodyKey: engine.versionAdvisory?.canUpdate
      ? "runtime.update.available.body"
      : "runtime.update.manual.body",
    values,
    action: "runtime",
    actionLabelKey: "runtime.openRuntime",
  }
}

export function buildRuntimeEngineListState(params: {
  engines?: RuntimeEngineManifestLike[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
}): AgentRuntimeEngineListState {
  if (params.isLoading && !params.engines) {
    return {
      kind: "loading",
      engines: mapRuntimeEnginesToUiDefinitions(undefined),
      message: "Checking agent runtimes...",
      isLoading: true,
      isError: false,
      isFallback: false,
    }
  }

  if (params.isError) {
    return {
      kind: "error",
      engines: buildStaticRuntimeStatusEngines({
        availability: "error",
        statusLabel: "Runtime error",
        statusReason:
          params.errorMessage ||
          "Moss could not read agent runtime health.",
      }),
      message:
        params.errorMessage ||
        "Moss could not read agent runtime health.",
      isLoading: false,
      isError: true,
      isFallback: false,
    }
  }

  if (params.engines && params.engines.length === 0) {
    return {
      kind: "empty",
      engines: buildStaticRuntimeStatusEngines({
        availability: "empty",
        statusLabel: "No engines",
        statusReason: "Moss runtime returned no engine manifests.",
      }),
      message: "Moss runtime returned no engine manifests.",
      isLoading: false,
      isError: false,
      isFallback: false,
    }
  }

  const engines = mapRuntimeEnginesToUiDefinitions(params.engines)
  const hasFallback = engines.some((engine) => engine.fallback)

  return {
    kind: hasFallback ? "fallback" : "ready",
    engines,
    message: hasFallback
      ? "One or more engines are using static fallback metadata."
      : undefined,
    isLoading: false,
    isError: false,
    isFallback: hasFallback,
  }
}

export function getAgentEngineLabel(engineId: AgentEngineId): string {
  return (
    AGENT_ENGINE_UI_DEFINITIONS.find((engine) => engine.id === engineId)
      ?.name ?? engineId
  )
}

export function formatRuntimeModelLabel(modelId?: string | null): string {
  if (!modelId) return "Runtime Default"
  return RUNTIME_MODEL_LABELS[modelId] ?? modelId
}
