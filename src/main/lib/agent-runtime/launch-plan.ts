import type {
  AgentPermissionMode,
  AgentRuntimeFeature,
  AgentRuntimeManifest,
  AgentRuntimeSessionRef,
} from "./types"
import { getAgentRuntimeManifest } from "./manifests"

export type AgentRuntimeLaunchPlanResultSubtype =
  | "running"
  | "success"
  | "error"
  | "cancelled"

export type AgentRuntimeNativeSessionStrategy =
  | "start"
  | "resume"
  | "continue"
  | "not-supported"
  | "unknown"

export type AgentRuntimeProjectionStatus =
  | "ready"
  | "partial"
  | "missing"
  | "unsupported"
  | "unknown"

export type AgentRuntimeCapabilityStatus =
  | "native"
  | "moss-projected"
  | "unsupported"

export interface AgentRuntimeNegotiatedCapability {
  feature: AgentRuntimeFeature
  status: AgentRuntimeCapabilityStatus
}

export interface AgentRuntimeLaunchPlan {
  version: 1
  runId: string
  subChatId: string
  chatId: string
  engineId: AgentRuntimeSessionRef["engineId"]
  modelId: string | null
  permissionMode: AgentPermissionMode
  cwd: string
  projectPath: string | null
  runtimeConfigDir: string | null
  nativeSessionId: string | null
  nativeSessionStrategy: AgentRuntimeNativeSessionStrategy
  transport: string | null
  providerRoute: string | null
  projectionStatus: AgentRuntimeProjectionStatus
  runtimeContextFingerprint: string | null
  mcpFingerprint: string | null
  resultSubtype: AgentRuntimeLaunchPlanResultSubtype
  negotiatedCapabilities: AgentRuntimeNegotiatedCapability[]
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface BuildAgentRuntimeLaunchPlanInput {
  runId: string
  session: AgentRuntimeSessionRef
  manifest?: AgentRuntimeManifest
  modelId?: string | null
  nativeSessionId?: string | null
  nativeSessionStrategy?: AgentRuntimeNativeSessionStrategy
  transport?: string | null
  providerRoute?: string | null
  projectionStatus?: AgentRuntimeProjectionStatus
  runtimeContextFingerprint?: string | null
  mcpFingerprint?: string | null
  resultSubtype?: AgentRuntimeLaunchPlanResultSubtype
  now?: Date | string
  metadata?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function resolveCreatedAt(value: Date | string | undefined): string {
  if (typeof value === "string") return value
  return (value ?? new Date()).toISOString()
}

function inferNativeSessionStrategy(params: {
  manifest: AgentRuntimeManifest
  nativeSessionId: string | null
  explicit?: AgentRuntimeNativeSessionStrategy
}): AgentRuntimeNativeSessionStrategy {
  if (params.explicit) return params.explicit
  if (params.manifest.availability === "unsupported") return "not-supported"
  if (params.nativeSessionId) return "resume"
  if (params.manifest.features.includes("chat")) return "start"
  return "unknown"
}

function buildNegotiatedCapabilities(
  manifest: AgentRuntimeManifest,
): AgentRuntimeNegotiatedCapability[] {
  return manifest.features.map((feature) => ({
    feature,
    status:
      manifest.availability === "unsupported" ? "unsupported" : "native",
  }))
}

export function buildAgentRuntimeLaunchPlan(
  input: BuildAgentRuntimeLaunchPlanInput,
): AgentRuntimeLaunchPlan {
  const manifest = input.manifest ?? getAgentRuntimeManifest(input.session.engineId)
  const nativeSessionId =
    input.nativeSessionId ?? input.session.nativeSessionId ?? null
  const modelId =
    input.modelId ??
    input.session.modelId ??
    manifest.defaultModelId ??
    null

  return {
    version: 1,
    runId: input.runId,
    subChatId: input.session.subChatId,
    chatId: input.session.chatId,
    engineId: input.session.engineId,
    modelId,
    permissionMode: input.session.permissionMode,
    cwd: input.session.cwd,
    projectPath: input.session.projectPath ?? null,
    runtimeConfigDir: input.session.runtimeConfigDir ?? null,
    nativeSessionId,
    nativeSessionStrategy: inferNativeSessionStrategy({
      manifest,
      nativeSessionId,
      explicit: input.nativeSessionStrategy,
    }),
    transport: input.transport ?? null,
    providerRoute: input.providerRoute ?? null,
    projectionStatus: input.projectionStatus ?? "unknown",
    runtimeContextFingerprint: input.runtimeContextFingerprint ?? null,
    mcpFingerprint: input.mcpFingerprint ?? null,
    resultSubtype: input.resultSubtype ?? "running",
    negotiatedCapabilities: buildNegotiatedCapabilities(manifest),
    createdAt: resolveCreatedAt(input.now),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

function parseMetadata(
  value: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== "string" || value.trim().length === 0) return {}

  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function mergeAgentRuntimeLaunchPlanMetadata(
  runtimeMetadata: Record<string, unknown> | string | null | undefined,
  launchPlan: AgentRuntimeLaunchPlan,
): Record<string, unknown> {
  const parsed = parseMetadata(runtimeMetadata)
  const mossSessionControl = isRecord(parsed.mossSessionControl)
    ? parsed.mossSessionControl
    : {}

  return {
    ...parsed,
    mossSessionControl: {
      ...mossSessionControl,
      launchPlan,
      launchPlanUpdatedAt: launchPlan.createdAt,
    },
  }
}
