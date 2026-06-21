import { describe, expect, test } from "bun:test"
import {
  createRuntimeCapabilityProjectionService,
  SKILL_PROJECTION_KIND,
  type SkillProjectionAdapter,
} from "../src/main/lib/runtime-capability-projection"

describe("runtime capability projection", () => {
  test("invokes registered skill projection adapters", async () => {
    const adapter: SkillProjectionAdapter = {
      kind: SKILL_PROJECTION_KIND,
      runtimeId: "codex",
      async project(input) {
        return input.skills.map((skill) => ({
          kind: SKILL_PROJECTION_KIND,
          capabilityId: skill.skillId,
          runtimeId: "codex",
          state: skill.eligibleRuntimes.includes("codex")
            ? "available"
            : "incompatible",
          source: {
            type: "registry",
            id: skill.registryId,
            version: skill.version,
          },
          projectionFingerprint: skill.contentHash,
          diagnostics: [],
        }))
      },
    }
    const service = createRuntimeCapabilityProjectionService([adapter])

    const result = await service.project({
      kind: SKILL_PROJECTION_KIND,
      runtimeId: "codex",
      payload: {
        runtimeId: "codex",
        targetHome: "/tmp/locus-codex-home",
        targetSkillsDir: "/tmp/locus-codex-home/skills",
        skills: [
          {
            skillId: "reviewer",
            registryId: "bundled",
            version: "1.0.0",
            contentHash: "a".repeat(64),
            sourcePath: "/registry/reviewer",
            installPath: "/home/user/.codex/skills/reviewer",
            eligibleRuntimes: ["codex"],
            installStatus: "installed",
          },
        ],
      },
    })

    expect(result.registered).toBe(true)
    expect(result.records).toEqual([
      {
        kind: "skill",
        capabilityId: "reviewer",
        runtimeId: "codex",
        state: "available",
        source: {
          type: "registry",
          id: "bundled",
          version: "1.0.0",
        },
        projectionFingerprint: "a".repeat(64),
        diagnostics: [],
      },
    ])
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  test("does not create placeholder records for unregistered kinds", async () => {
    const service = createRuntimeCapabilityProjectionService()

    const result = await service.project({
      kind: "mcp_server",
      runtimeId: "codex",
      payload: { id: "calculator" },
    })

    expect(result).toEqual({
      registered: false,
      kind: "mcp_server",
      runtimeId: "codex",
      records: [],
    })
  })

  test("rejects duplicate adapters for the same kind and runtime", () => {
    const adapter: SkillProjectionAdapter = {
      kind: SKILL_PROJECTION_KIND,
      runtimeId: "codex",
      async project() {
        return []
      },
    }

    expect(() =>
      createRuntimeCapabilityProjectionService([adapter, adapter]),
    ).toThrow("already registered")
  })

  test("rejects secret-bearing renderer diagnostics", async () => {
    const adapter: SkillProjectionAdapter = {
      kind: SKILL_PROJECTION_KIND,
      runtimeId: "codex",
      async project() {
        return [
          {
            kind: SKILL_PROJECTION_KIND,
            capabilityId: "reviewer",
            runtimeId: "codex",
            state: "unavailable",
            source: {
              type: "registry",
              id: "bundled",
              version: "1.0.0",
            },
            diagnostics: [
              {
                code: "projection.failed",
                message: "Authorization Bearer secret-token leaked here.",
              },
            ],
          },
        ]
      },
    }
    const service = createRuntimeCapabilityProjectionService([adapter])

    await expect(
      service.project({
        kind: SKILL_PROJECTION_KIND,
        runtimeId: "codex",
        payload: {
          runtimeId: "codex",
          targetHome: "/tmp/locus-codex-home",
          targetSkillsDir: "/tmp/locus-codex-home/skills",
          skills: [],
        },
      }),
    ).rejects.toThrow("secret-like text")
  })
})
