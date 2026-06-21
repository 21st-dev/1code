import type * as fs from "node:fs/promises"
import path from "node:path"
import type {
  SkillProjectionAdapter,
  SkillProjectionCandidate,
  SkillProjectionRecord,
} from "./skill"
import { SKILL_PROJECTION_KIND } from "./skill"

type CodexSkillProjectionFs = {
  mkdir: typeof fs.mkdir
  rm: typeof fs.rm
  stat: typeof fs.stat
  symlink: typeof fs.symlink
}

export interface CodexSkillProjectionDependencies {
  fs: CodexSkillProjectionFs
  platform: NodeJS.Platform
}

export const CODEX_SKILL_PROJECTION_RUNTIME_ID = "codex" as const

export function createCodexSkillProjectionAdapter(
  dependencies: CodexSkillProjectionDependencies,
): SkillProjectionAdapter {
  return {
    kind: SKILL_PROJECTION_KIND,
    runtimeId: CODEX_SKILL_PROJECTION_RUNTIME_ID,
    async project(input) {
      const records: SkillProjectionRecord[] = []
      const symlinkType = dependencies.platform === "win32" ? "junction" : "dir"

      await dependencies.fs.rm(input.targetSkillsDir, {
        recursive: true,
        force: true,
      })
      await dependencies.fs.mkdir(input.targetSkillsDir, { recursive: true })

      for (const skill of input.skills) {
        if (
          !skill.eligibleRuntimes.includes(CODEX_SKILL_PROJECTION_RUNTIME_ID)
        ) {
          records.push(
            skillProjectionRecord(skill, "incompatible", [
              {
                code: "skill.runtime-incompatible",
                message: "This registry skill is not eligible for Codex.",
                remediation: "Install a Codex-compatible version of the skill.",
              },
            ]),
          )
          continue
        }

        if (!isSafeSkillDirectoryName(skill.skillId)) {
          records.push(
            skillProjectionRecord(skill, "unavailable", [
              {
                code: "skill.invalid-id",
                message: "This registry skill id cannot be staged safely.",
                remediation:
                  "Reinstall the skill from a trusted registry entry.",
              },
            ]),
          )
          continue
        }

        const targetPath = path.join(input.targetSkillsDir, skill.skillId)
        try {
          const sourceStat = await dependencies.fs.stat(skill.installPath)
          if (!sourceStat.isDirectory()) {
            records.push(
              skillProjectionRecord(skill, "unavailable", [
                {
                  code: "skill.source-missing",
                  message: "The managed skill directory is missing.",
                  remediation: "Reinstall or update the skill.",
                },
              ]),
            )
            continue
          }

          await dependencies.fs.symlink(
            skill.installPath,
            targetPath,
            symlinkType,
          )
          records.push(skillProjectionRecord(skill, "available", []))
        } catch (error) {
          records.push(
            skillProjectionRecord(skill, "unavailable", [
              {
                code:
                  error instanceof Error &&
                  "code" in error &&
                  error.code === "ENOENT"
                    ? "skill.source-missing"
                    : "skill.stage-failed",
                message: "The managed skill could not be staged for Codex.",
                remediation: "Refresh the skill installation and retry.",
              },
            ]),
          )
        }
      }

      return records
    },
  }
}

function skillProjectionRecord(
  skill: SkillProjectionCandidate,
  state: SkillProjectionRecord["state"],
  diagnostics: SkillProjectionRecord["diagnostics"],
): SkillProjectionRecord {
  return {
    kind: SKILL_PROJECTION_KIND,
    capabilityId: skill.skillId,
    runtimeId: CODEX_SKILL_PROJECTION_RUNTIME_ID,
    state,
    source: {
      type: "registry",
      id: skill.registryId,
      version: skill.version,
    },
    projectionFingerprint: skill.contentHash,
    diagnostics,
  }
}

function isSafeSkillDirectoryName(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
}
