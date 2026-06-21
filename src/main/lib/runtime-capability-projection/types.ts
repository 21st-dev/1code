import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"

export const RUNTIME_CAPABILITY_PROJECTION_STATES = [
  "available",
  "unavailable",
  "incompatible",
  "not_projected",
] as const

export type RuntimeCapabilityProjectionState =
  (typeof RUNTIME_CAPABILITY_PROJECTION_STATES)[number]

export type RuntimeCapabilityProjectionSourceType =
  | "registry"
  | "bundled"
  | "user"
  | "plugin"
  | "project"

export interface RuntimeCapabilityProjectionSource {
  type: RuntimeCapabilityProjectionSourceType
  id: string
  version?: string
}

export interface RuntimeCapabilityProjectionDiagnostic {
  code: string
  message: string
  remediation?: string
}

export interface RuntimeCapabilityProjectionRecord<
  Kind extends string = string,
> {
  kind: Kind
  capabilityId: string
  runtimeId: AgentRuntimeId
  state: RuntimeCapabilityProjectionState
  source: RuntimeCapabilityProjectionSource
  projectionFingerprint?: string
  diagnostics: RuntimeCapabilityProjectionDiagnostic[]
}

export interface RuntimeCapabilityProjectionAdapterContext {
  now: Date
}

export interface RuntimeCapabilityProjectionAdapter<
  Kind extends string = string,
  Payload = unknown,
> {
  kind: Kind
  runtimeId: AgentRuntimeId
  project(
    payload: Payload,
    context: RuntimeCapabilityProjectionAdapterContext,
  ): Promise<RuntimeCapabilityProjectionRecord<Kind>[]>
}

export type RuntimeCapabilityProjectionRegisteredResult<
  Kind extends string = string,
> = {
  registered: true
  kind: Kind
  runtimeId: AgentRuntimeId
  records: RuntimeCapabilityProjectionRecord<Kind>[]
}

export type RuntimeCapabilityProjectionMissingAdapterResult<
  Kind extends string = string,
> = {
  registered: false
  kind: Kind
  runtimeId: AgentRuntimeId
  records: []
}

export type RuntimeCapabilityProjectionResult<Kind extends string = string> =
  | RuntimeCapabilityProjectionRegisteredResult<Kind>
  | RuntimeCapabilityProjectionMissingAdapterResult<Kind>
