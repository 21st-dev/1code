import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  RuntimeCapabilityProjectionAdapter,
  RuntimeCapabilityProjectionDiagnostic,
  RuntimeCapabilityProjectionRecord,
} from "./types"
import { validateProjectionRecord } from "./validation"

export const SKILL_PROJECTION_KIND = "skill" as const

export type SkillProjectionKind = typeof SKILL_PROJECTION_KIND

export type SkillProjectionInstallStatus =
  | "installed"
  | "modified"
  | "update-available"

export type SkillProjectionAvailabilityInstallStatus =
  | SkillProjectionInstallStatus
  | "not-installed"
  | "user-owned"
  | "missing-source"
  | "integrity-error"

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

export interface SkillProjectionAvailabilityInput {
  skillId: string
  registryId: string
  version: string
  contentHash: string
  runtimeId: AgentRuntimeId
  eligibleRuntimes: AgentRuntimeId[]
  installStatus: SkillProjectionAvailabilityInstallStatus
  hasRuntimeInstallRecord?: boolean
  statusMessage?: string
}

export function buildSkillProjectionAvailabilityRecord(
  input: SkillProjectionAvailabilityInput,
): SkillProjectionRecord {
  const diagnostics: RuntimeCapabilityProjectionDiagnostic[] = []
  let state: SkillProjectionRecord["state"] = "not_projected"

  if (!input.eligibleRuntimes.includes(input.runtimeId)) {
    state = "incompatible"
    diagnostics.push({
      code: "skill.runtime-incompatible",
      message: `This registry skill is not compatible with ${input.runtimeId}.`,
      remediation: "Install it for a compatible runtime.",
    })
  } else if (
    input.installStatus === "installed" ||
    input.installStatus === "modified" ||
    input.installStatus === "update-available"
  ) {
    state = "available"
    if (input.installStatus === "modified") {
      diagnostics.push({
        code: "skill.local-modified",
        message:
          "The runtime can see this skill, but local files differ from the registry package.",
        remediation: "Restore or update the registry skill for this runtime.",
      })
    } else if (input.installStatus === "update-available") {
      diagnostics.push({
        code: "skill.update-available",
        message:
          "The runtime can see this installed copy, and a newer registry version is available.",
        remediation: "Update the skill for this runtime when ready.",
      })
    }
  } else if (input.installStatus === "missing-source") {
    state = "unavailable"
    diagnostics.push({
      code: "skill.source-missing",
      message: input.statusMessage || "The registry source package is missing.",
      remediation: "Refresh or repair the registry package before installing.",
    })
  } else if (input.installStatus === "integrity-error") {
    state = "unavailable"
    diagnostics.push({
      code: "skill.integrity-error",
      message:
        input.statusMessage ||
        "The registry source package does not match its recorded hash.",
      remediation: "Refresh the registry package before installing.",
    })
  } else if (input.hasRuntimeInstallRecord) {
    state = "unavailable"
    diagnostics.push({
      code: "skill.install-files-missing",
      message:
        input.statusMessage ||
        "The skill has a runtime install record, but its files are missing.",
      remediation: "Reinstall or restore the registry skill for this runtime.",
    })
  } else if (input.installStatus === "user-owned") {
    state = "not_projected"
    diagnostics.push({
      code: "skill.user-owned",
      message:
        "A user-owned skill with this id exists; the registry package is not projected.",
      remediation:
        "Replace it with the registry package only if you want Locus to manage it.",
    })
  } else {
    state = "not_projected"
    diagnostics.push({
      code: "skill.not-installed",
      message: "This registry skill is not installed for this runtime.",
      remediation: "Install the registry skill for this runtime to project it.",
    })
  }

  const record: SkillProjectionRecord = {
    kind: SKILL_PROJECTION_KIND,
    capabilityId: input.skillId,
    runtimeId: input.runtimeId,
    state,
    source: {
      type: "registry",
      id: input.registryId,
      version: input.version,
    },
    projectionFingerprint: input.contentHash,
    diagnostics,
  }
  validateProjectionRecord(record)
  return record
}
