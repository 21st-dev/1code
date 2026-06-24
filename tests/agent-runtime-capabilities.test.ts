import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
  AGENT_RUNTIME_IDS,
  CONTRACT_RUNTIME_IDS,
  EXPERIMENTAL_RUNTIME_IDS,
  type AgentRuntimeCapability,
  checkAgentRuntimeCapability,
  getAgentRunRequiredCapabilityIds,
  getAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  getAgentRuntimeCapabilityManifests,
  isRuntimeCapabilitySupported,
  resolveAgentRuntimeCapability,
  resolveAgentRuntimeCapabilityManifest,
  shouldEnableExperimentalAgentRuntime,
  shouldEnableKunRuntime,
  shouldEnableQwenCodeRuntime,
  toAgentRuntimeId,
  validateAgentRuntimeCapability,
} from "../src/shared/agent-runtime-capabilities"

describe("agent runtime capability manifests", () => {
  test("keeps non-desktop contract runtimes explicit", () => {
    expect([...CONTRACT_RUNTIME_IDS]).toEqual(["claude-code", "codex"])
    expect([...AGENT_RUNTIME_IDS]).toEqual([
      "claude-code",
      "codex",
      "qwen-code",
      "kun",
    ])
    expect([...EXPERIMENTAL_RUNTIME_IDS]).toEqual(["qwen-code", "kun"])
    expect([...CONTRACT_RUNTIME_IDS]).not.toContain("qwen-code")
    expect([...CONTRACT_RUNTIME_IDS]).not.toContain("kun")
  })

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
    expect(toAgentRuntimeId("qwen")).toBe("qwen-code")
    expect(toAgentRuntimeId("qwen-code")).toBe("qwen-code")
    expect(toAgentRuntimeId("kun")).toBe("kun")
    expect(toAgentRuntimeId("unknown")).toBeNull()
  })

  test("keeps experimental manifests flag-gated from default manifest lists", () => {
    expect(shouldEnableQwenCodeRuntime({})).toBe(false)
    expect(shouldEnableKunRuntime({})).toBe(false)
    expect(
      shouldEnableQwenCodeRuntime({ LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1" }),
    ).toBe(true)
    expect(shouldEnableKunRuntime({ LOCUS_ENABLE_KUN_RUNTIME: "1" })).toBe(
      true,
    )
    expect(
      shouldEnableExperimentalAgentRuntime("qwen-code", {
        LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1",
      }),
    ).toBe(true)
    expect(
      shouldEnableExperimentalAgentRuntime("kun", {
        LOCUS_ENABLE_KUN_RUNTIME: "1",
      }),
    ).toBe(true)
    expect(
      getAgentRuntimeCapabilityManifests().map((manifest) => manifest.runtimeId),
    ).toEqual(["claude-code", "codex"])
    expect(
      getAgentRuntimeCapabilityManifests({ includeExperimental: true }).map(
        (manifest) => manifest.runtimeId,
      ),
    ).toEqual(["claude-code", "codex", "qwen-code", "kun"])
    expect(getAgentRuntimeCapabilityManifest("qwen-code")).toMatchObject({
      runtimeId: "qwen-code",
      label: "Qwen Code",
    })
    expect(getAgentRuntimeCapabilityManifest("kun")).toMatchObject({
      runtimeId: "kun",
      label: "Kun",
    })
    expect(getAgentRuntimeCapability("kun", "hardToolGuard")).toMatchObject({
      status: "supported",
      scope: "runtime-neutral",
      reason: expect.stringContaining("shared guard owner"),
    })
    expect(getAgentRuntimeCapability("kun", "providerProfiles")).toMatchObject({
      status: "supported",
      scope: "runtime-neutral",
      reason: expect.stringContaining("responses-gateway"),
    })
  })

  test("requires supported claims to carry code or runtime evidence", () => {
    for (const manifest of getAgentRuntimeCapabilityManifests({
      includeExperimental: true,
    })) {
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
      "quickChatAssistant",
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
    expect(claudePlugins.capability).toMatchObject({
      status: "degraded",
      scope: "runtime-specific",
      reason: expect.stringContaining("native MCP discovery skipped"),
      hint: expect.stringContaining("identity review"),
    })

    const codexPlugins = checkAgentRuntimeCapability({
      runtime: "codex",
      capabilityId: "runtimePlugins",
    })
    expect(codexPlugins.ok).toBe(false)
    expect(codexPlugins.capability).toMatchObject({
      status: "degraded",
      scope: "runtime-specific",
      reason: expect.stringContaining("no-turn thread/start"),
      hint: expect.stringContaining("managed-run proof"),
    })
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
    expect(
      getAgentRunRequiredCapabilityIds({
        mode: "plan",
        workspaceKind: "folderless",
        hasScopeContract: true,
      }),
    ).toEqual(["quickChatAssistant"])

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
