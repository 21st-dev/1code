import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
  checkAgentRuntimeCapability,
  getAgentRunRequiredCapabilityIds,
  getAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  getAgentRuntimeCapabilityManifests,
  isRuntimeCapabilitySupported,
  resolveAgentRuntimeCapability,
  resolveAgentRuntimeCapabilityManifest,
  toAgentRuntimeId,
  validateAgentRuntimeCapability,
  type AgentRuntimeCapability,
} from "../src/shared/agent-runtime-capabilities"

describe("agent runtime capability manifests", () => {
  test("registers Claude Code and Codex manifests with the same explicit capability IDs", () => {
    const manifests = getAgentRuntimeCapabilityManifests()

    expect(manifests.map((manifest) => manifest.runtimeId)).toEqual([
      "claude-code",
      "codex",
    ])
    for (const manifest of manifests) {
      expect(manifest.capabilities.map((capability) => capability.id)).toEqual(
        AGENT_RUNTIME_CAPABILITY_IDS,
      )
      expect(JSON.stringify(manifest)).not.toMatch(
        /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
      )
      expect(JSON.stringify(manifest)).not.toContain("access_token")
      expect(JSON.stringify(manifest)).not.toContain("Authorization")
    }
  })

  test("maps UI and registry runtime aliases to canonical runtime IDs", () => {
    expect(toAgentRuntimeId("claude")).toBe("claude-code")
    expect(toAgentRuntimeId("claude-code")).toBe("claude-code")
    expect(toAgentRuntimeId("codex")).toBe("codex")
    expect(toAgentRuntimeId("unknown")).toBeNull()
  })

  test("requires supported claims to carry code or runtime evidence", () => {
    for (const manifest of getAgentRuntimeCapabilityManifests()) {
      for (const capability of manifest.capabilities) {
        if (capability.status !== "supported") continue
        expect(capability.support?.references.length).toBeGreaterThan(0)
        expect(capability.scope).not.toBe("unavailable")
        for (const reference of capability.support?.references ?? []) {
          expect(existsSync(reference)).toBe(true)
        }
      }
    }

    const invalid: AgentRuntimeCapability = {
      id: "hardToolGuard",
      label: "Hard tool guard",
      status: "supported",
      scope: "runtime-neutral",
      reason: "Prompt-only text is not enough evidence.",
      hint: null,
      support: null,
    }

    expect(() => validateAgentRuntimeCapability(invalid)).toThrow(
      "cannot be supported without code or runtime evidence",
    )
  })

  test("keeps runtime-neutral support truthful across Claude Code and Codex", () => {
    for (const id of [
      "hardToolGuard",
      "planMode",
      "scopeExpansion",
      "askUserQuestion",
      "mcpAuth",
      "providerProfiles",
      "attachments",
    ] as const) {
      expect(getAgentRuntimeCapability("claude-code", id)).toMatchObject({
        status: "supported",
        scope: "runtime-neutral",
      })
      expect(getAgentRuntimeCapability("codex", id)).toMatchObject({
        status: "supported",
        scope: "runtime-neutral",
      })
    }
  })

  test("gates degraded and unsupported capabilities before runtime work starts", () => {
    const codexRollback = checkAgentRuntimeCapability({
      runtime: "codex",
      capabilityId: "rollback",
    })
    expect(codexRollback.ok).toBe(false)
    expect(codexRollback.capability).toMatchObject({
      status: "unsupported",
      scope: "unavailable",
    })
    if (!codexRollback.ok) {
      expect(codexRollback.diagnostic).toMatchObject({
        type: "unsupported-capability",
        runtimeId: "codex",
        capability: "rollback",
        status: "unsupported",
      })
      expect(codexRollback.diagnostic.message).toContain("Codex")
      expect(JSON.stringify(codexRollback.diagnostic)).not.toMatch(
        /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
      )
    }

    const claudePlugins = checkAgentRuntimeCapability({
      runtime: "claude-code",
      capabilityId: "runtimePlugins",
    })
    expect(claudePlugins.ok).toBe(false)
    expect(claudePlugins.capability.status).toBe("degraded")
  })

  test("returns normalized diagnostics for unavailable runtimes", () => {
    expect(resolveAgentRuntimeCapabilityManifest("future-runtime")).toEqual({
      ok: false,
      runtimeId: "future-runtime",
      diagnostic: {
        type: "unavailable-runtime",
        runtimeId: "future-runtime",
        message: "Agent runtime future-runtime is not registered.",
        hint: "Choose a registered runtime and retry.",
      },
    })

    expect(
      resolveAgentRuntimeCapability({
        runtime: "future-runtime",
        capabilityId: "planMode",
      }),
    ).toMatchObject({
      ok: false,
      runtimeId: "future-runtime",
      diagnostic: {
        type: "unavailable-runtime",
      },
    })
  })

  test("uses manifests for desktop and future CLI/job run requirements", () => {
    expect(
      getAgentRunRequiredCapabilityIds({
        mode: "agent",
        hasScopeContract: false,
      }),
    ).toEqual([])
    expect(
      getAgentRunRequiredCapabilityIds({
        mode: "agent",
        hasScopeContract: true,
      }),
    ).toEqual(["hardToolGuard"])
    expect(
      getAgentRunRequiredCapabilityIds({
        mode: "plan",
        hasScopeContract: true,
      }),
    ).toEqual(["hardToolGuard", "planMode"])

    expect(isRuntimeCapabilitySupported("claude-code", "rollback")).toBe(true)
    expect(isRuntimeCapabilitySupported("codex", "rollback")).toBe(false)
  })

  test("returns cloned manifests so callers cannot mutate registry state", () => {
    const manifest = getAgentRuntimeCapabilityManifest("codex")
    manifest.capabilities[0].reason = "mutated by caller"

    expect(getAgentRuntimeCapability("codex", "hardToolGuard").reason).not.toBe(
      "mutated by caller",
    )
  })
})
