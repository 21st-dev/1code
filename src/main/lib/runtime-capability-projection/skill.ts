import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  RuntimeCapabilityProjectionAdapter,
  RuntimeCapabilityProjectionRecord,
} from "./types"

export const SKILL_PROJECTION_KIND = "skill" as const

export type SkillProjectionKind = typeof SKILL_PROJECTION_KIND

export type SkillProjectionInstallStatus =
  | "installed"
  | "modified"
  | "update-available"

export interface SkillProjectionCandidate {
  skillId: string
  registryId: string
  version: string
  contentHash: string
  sourcePath: string
  installPath: string
  eligibleRuntimes: AgentRuntimeId[]
  installStatus: SkillProjectionInstallStatus
}

export interface SkillProjectionRequest {
  runtimeId: AgentRuntimeId
  targetHome: string
  targetSkillsDir: string
  skills: SkillProjectionCandidate[]
}

export type SkillProjectionRecord =
  RuntimeCapabilityProjectionRecord<SkillProjectionKind>

export type SkillProjectionAdapter = RuntimeCapabilityProjectionAdapter<
  SkillProjectionKind,
  SkillProjectionRequest
>
