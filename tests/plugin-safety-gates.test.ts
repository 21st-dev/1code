import { describe, expect, test } from "bun:test"
import {
  buildPluginSafetyGate,
  isPluginFingerprintReviewed,
} from "../src/shared/plugin-safety-gates"

describe("plugin safety gates", () => {
  test("treats only the current reviewed fingerprint status as reviewed", () => {
    expect(isPluginFingerprintReviewed("reviewed")).toBe(true)
    expect(isPluginFingerprintReviewed("new")).toBe(false)
    expect(isPluginFingerprintReviewed("unchanged")).toBe(false)
    expect(isPluginFingerprintReviewed("changed")).toBe(false)
    expect(isPluginFingerprintReviewed(undefined)).toBe(false)
  })

  test("allows Claude plugin capabilities only after local review and outside safe mode", () => {
    expect(buildPluginSafetyGate({
      runtime: "claude",
      hasMcpServers: true,
      updateReviewStatus: "reviewed",
      safeModeEnabled: false,
    })).toEqual({
      status: "allowed",
      canEnable: true,
      canApproveMcp: true,
      canUseMcp: true,
      reasons: [],
    })
  })

  test("blocks new or changed Claude plugin capabilities before review", () => {
    expect(buildPluginSafetyGate({
      runtime: "claude",
      hasMcpServers: true,
      updateReviewStatus: "new",
      safeModeEnabled: false,
    })).toMatchObject({
      status: "review-required",
      canEnable: false,
      canApproveMcp: false,
      canUseMcp: false,
      reasons: ["review-new"],
    })

    expect(buildPluginSafetyGate({
      runtime: "claude",
      hasMcpServers: true,
      updateReviewStatus: "changed",
      safeModeEnabled: false,
    }).reasons).toEqual(["review-changed"])
  })

  test("safe mode blocks enablement and MCP even for reviewed plugins", () => {
    expect(buildPluginSafetyGate({
      runtime: "claude",
      hasMcpServers: true,
      updateReviewStatus: "reviewed",
      safeModeEnabled: true,
    })).toEqual({
      status: "safe-mode",
      canEnable: false,
      canApproveMcp: false,
      canUseMcp: false,
      reasons: ["global-safe-mode"],
    })
  })

  test("keeps Codex plugin cache read-only", () => {
    expect(buildPluginSafetyGate({
      runtime: "codex",
      hasMcpServers: true,
      updateReviewStatus: "reviewed",
      safeModeEnabled: false,
    })).toEqual({
      status: "read-only",
      canEnable: false,
      canApproveMcp: false,
      canUseMcp: false,
      reasons: ["codex-read-only-cache"],
    })
  })

  test("records no MCP server as a reason without making reviewed Claude metadata unsafe", () => {
    expect(buildPluginSafetyGate({
      runtime: "claude",
      hasMcpServers: false,
      updateReviewStatus: "reviewed",
      safeModeEnabled: false,
    })).toEqual({
      status: "allowed",
      canEnable: true,
      canApproveMcp: false,
      canUseMcp: false,
      reasons: ["no-mcp-servers"],
    })
  })
})
