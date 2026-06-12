import { describe, expect, test } from "bun:test"
import {
  buildCodexRuntimeCapabilityErrorChunk,
  getCodexRuntimeCapabilitiesForAdapter,
  getCodexRunRequiredCapability,
  getCodexRuntimeCapabilities,
  getCodexRuntimeCapability,
  type CodexRuntimeCapabilityId,
} from "../src/shared/codex-runtime-capabilities"

const expectedCapabilityIds: CodexRuntimeCapabilityId[] = [
  "hardToolGuard",
  "planMode",
  "scopeExpansion",
  "askUserQuestion",
  "rollback",
  "mcpAuth",
  "mcpConfiguration",
  "providerProfiles",
  "attachments",
  "usageMetadata",
  "runtimePlugins",
  "runtimeCommands",
  "runtimeWorkflows",
  "appAgents",
]

describe("Codex runtime capabilities", () => {
  test("declares every parity-owned capability explicitly", () => {
    const capabilities = getCodexRuntimeCapabilities()

    expect(capabilities.map((capability) => capability.id)).toEqual(
      expectedCapabilityIds,
    )
    expect(
      capabilities.every((capability) => capability.reason.trim().length > 0),
    ).toBe(true)
    expect(
      capabilities
        .filter((capability) => capability.status === "supported")
        .every((capability) => capability.support?.references.length),
    ).toBe(true)
  })

  test("marks implemented core safety capabilities supported through enforced runtime paths", () => {
    expect(getCodexRuntimeCapability("hardToolGuard")).toMatchObject({
      status: "supported",
      scope: "runtime-neutral",
    })
    expect(getCodexRuntimeCapability("planMode")).toMatchObject({
      status: "supported",
    })
    expect(getCodexRuntimeCapability("scopeExpansion")).toMatchObject({
      status: "supported",
    })
    expect(getCodexRuntimeCapability("askUserQuestion")).toMatchObject({
      status: "supported",
    })
    expect(getCodexRuntimeCapability("mcpAuth")).toMatchObject({
      status: "supported",
    })
  })

  test("marks implemented runtime feature capabilities supported", () => {
    expect(getCodexRuntimeCapability("providerProfiles")).toMatchObject({
      status: "supported",
    })
    expect(getCodexRuntimeCapability("attachments")).toMatchObject({
      status: "supported",
    })
    expect(getCodexRuntimeCapability("usageMetadata")).toMatchObject({
      status: "supported",
    })
  })

  test("keeps unfinished feature surfaces honest", () => {
    expect(getCodexRuntimeCapability("mcpConfiguration")).toMatchObject({
      status: "degraded",
      scope: "runtime-specific",
    })
    expect(getCodexRuntimeCapability("runtimePlugins")).toMatchObject({
      status: "unsupported",
    })
    expect(getCodexRuntimeCapability("runtimeCommands")).toMatchObject({
      status: "unsupported",
    })
    expect(getCodexRuntimeCapability("runtimeWorkflows")).toMatchObject({
      status: "unsupported",
    })
    expect(getCodexRuntimeCapability("appAgents")).toMatchObject({
      status: "degraded",
    })
  })

  test("reports app-server capability support only where isolated proofs exist", () => {
    const appServerCapabilities = getCodexRuntimeCapabilitiesForAdapter(
      "codex-app-server",
    )
    const byId = new Map(
      appServerCapabilities.map((capability) => [capability.id, capability]),
    )

    expect(appServerCapabilities.map((capability) => capability.id)).toEqual(
      expectedCapabilityIds,
    )
    expect(
      appServerCapabilities
        .filter((capability) => capability.status === "supported")
        .map((capability) => capability.id),
    ).toEqual([
      "planMode",
      "askUserQuestion",
      "providerProfiles",
      "attachments",
      "usageMetadata",
    ])
    expect(byId.get("hardToolGuard")).toMatchObject({
      status: "degraded",
      reason: expect.stringContaining("depends on an explicit provider auth context"),
      hint: expect.stringContaining("provider auth context"),
    })
    expect(byId.get("scopeExpansion")).toMatchObject({
      status: "degraded",
      reason: expect.stringContaining("not proven on a live transport"),
    })
    expect(byId.get("mcpAuth")).toMatchObject({
      status: "degraded",
      reason: expect.stringContaining("not proven on the app-server transport"),
    })
    expect(byId.get("rollback")).toMatchObject({
      status: "unsupported",
      scope: "unavailable",
    })
    expect(JSON.stringify(appServerCapabilities)).not.toMatch(
      /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}|access_token|authorization|bearer\s+[A-Za-z0-9._-]+|refresh_token/i,
    )
  })

  test("keeps ACP temporary-compat rollback capability truth adapter-specific", () => {
    const acpCapabilities = getCodexRuntimeCapabilitiesForAdapter(
      "codex-acp-temporary-compat",
    )
    expect(
      acpCapabilities.find((capability) => capability.id === "hardToolGuard"),
    ).toMatchObject({
      status: "supported",
      reason: expect.stringContaining("ACP temporary-compat rollback path"),
      support: {
        references: expect.arrayContaining([
          "src/main/lib/codex/acp-permission.ts",
        ]),
      },
    })
    expect(getCodexRuntimeCapability("hardToolGuard").reason).toContain(
      "app-server",
    )
    expect(
      getCodexRuntimeCapabilitiesForAdapter("codex-app-server").find(
        (capability) => capability.id === "mcpAuth",
      ),
    ).toMatchObject({
      status: "degraded",
    })
  })

  test("reports app-server guarded edits supported only for proven app-server auth paths", () => {
    expect(
      getCodexRuntimeCapabilitiesForAdapter({
        adapterSource: "codex-app-server",
        providerAuthMode: "runtime-managed",
      }).find((capability) => capability.id === "hardToolGuard"),
    ).toMatchObject({
      status: "supported",
      reason: expect.stringContaining("controlled-edit executor gate"),
      support: {
        kind: "runtime-code",
      },
    })

    expect(
      getCodexRuntimeCapabilitiesForAdapter({
        adapterSource: "codex-app-server",
        providerAuthMode: "app-managed",
      }).find((capability) => capability.id === "hardToolGuard"),
    ).toMatchObject({
      status: "supported",
    })

    expect(
      getCodexRuntimeCapabilitiesForAdapter({
        adapterSource: "codex-app-server",
        providerAuthMode: "provider-profile",
      }).find((capability) => capability.id === "hardToolGuard"),
    ).toMatchObject({
      status: "supported",
      reason: expect.stringContaining("provider-profile gateway smoke evidence"),
    })

    expect(
      getCodexRuntimeCapabilitiesForAdapter({
        adapterSource: "codex-app-server",
        providerAuthMode: null,
      }).find((capability) => capability.id === "hardToolGuard"),
    ).toMatchObject({
      status: "degraded",
      hint: expect.stringContaining("unknown app-server auth context"),
    })
  })

  test("builds non-secret capability error chunks for fail-closed guarded runs", () => {
    const capability = getCodexRuntimeCapability("hardToolGuard")
    const chunk = buildCodexRuntimeCapabilityErrorChunk({
      capability,
      message:
        "Codex guarded runs are blocked because ACP permission enforcement is unavailable.",
    })

    expect(chunk).toMatchObject({
      type: "capability-error",
      runtime: "codex",
      capability: "hardToolGuard",
      blocker: {
        capability: "hardToolGuard",
        status: "supported",
      },
    })
    expect(chunk.errorText).toContain("Codex guarded runs are blocked")
    expect(chunk.errorText).not.toContain("sk-")
    expect(JSON.stringify(chunk)).not.toContain("access_token")
  })

  test("identifies run modes that require ACP permission enforcement", () => {
    expect(
      getCodexRunRequiredCapability({
        mode: "agent",
        hasScopeContract: false,
      }),
    ).toBeNull()
    expect(
      getCodexRunRequiredCapability({
        mode: "agent",
        hasScopeContract: true,
      }),
    ).toMatchObject({ id: "hardToolGuard", status: "supported" })
    expect(
      getCodexRunRequiredCapability({
        mode: "plan",
        hasScopeContract: false,
      }),
    ).toMatchObject({ id: "planMode", status: "supported" })
  })
})
