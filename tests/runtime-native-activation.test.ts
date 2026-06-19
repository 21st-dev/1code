import { describe, expect, test } from "bun:test"
import {
  buildRuntimeNativeActivationIdentity,
  buildRuntimeNativeActivationPolicy,
  buildRuntimeNativeActivationState,
} from "../src/main/lib/plugins/runtime-native-activation"
import {
  buildPluginManifestReviewDocument,
  type PluginManifestReviewDocument,
  stableJsonStringify,
} from "../src/shared/plugin-update-review"

function reviewDocument(
  overrides: Partial<PluginManifestReviewDocument> = {},
): PluginManifestReviewDocument {
  return buildPluginManifestReviewDocument({
    runtime: overrides.runtime ?? "claude",
    source: overrides.source ?? "anthropic:context-tools@0.1.0",
    marketplace: overrides.marketplace ?? "anthropic",
    name: overrides.name ?? "Context Tools",
    version: overrides.version ?? "0.1.0",
    targetMode: overrides.targetMode ?? "manifest-only",
    executionStatus: overrides.executionStatus ?? "not-run-by-locus",
    updatePosture: overrides.updatePosture ?? "review-before-enable",
    componentPaths: overrides.componentPaths ?? {
      commands: "/plugin/commands",
      skills: "/plugin/skills",
      agents: "/plugin/agents",
      mcpServers: "/plugin/.mcp.json",
    },
    components: overrides.components ?? {
      commands: 1,
      skills: 2,
      agents: 1,
      mcpServers: ["context"],
    },
    sourcePins: overrides.sourcePins ?? [
      {
        kind: "lock-source-ref",
        value: "500e8738438ed1204eaf23e61280d872f47534fd",
        repo: "anthropic/context-tools",
      },
    ],
  })
}

describe("runtime native plugin activation", () => {
  test("builds a deterministic identity from review and package drift fields", () => {
    const document = reviewDocument()
    const first = buildRuntimeNativeActivationIdentity({
      reviewDocument: document,
      reviewFingerprint: "manifest-a",
      packageHash: "sha256:package-a",
      sourcePins: [
        { kind: "store-package-sha256", value: "bbb" },
        { kind: "lock-source-ref", value: "aaa" },
      ],
    })
    const second = buildRuntimeNativeActivationIdentity({
      reviewDocument: document,
      reviewFingerprint: "manifest-a",
      packageHash: "sha256:package-a",
      sourcePins: [
        { kind: "lock-source-ref", value: "aaa" },
        { kind: "store-package-sha256", value: "bbb" },
      ],
    })
    const drifted = buildRuntimeNativeActivationIdentity({
      reviewDocument: document,
      reviewFingerprint: "manifest-a",
      packageHash: "sha256:package-b",
      sourcePins: [
        { kind: "lock-source-ref", value: "aaa" },
        { kind: "store-package-sha256", value: "bbb" },
      ],
    })

    expect(first.status).toBe("complete")
    expect(first.missingFields).toEqual([])
    expect(first.identityFingerprint).toBe(second.identityFingerprint)
    expect(first.identityFingerprint).not.toBe(drifted.identityFingerprint)
    expect(stableJsonStringify(first.sourcePins)).toBe(
      stableJsonStringify(second.sourcePins),
    )
  })

  test("allows native activation only when all runtime gates pass", () => {
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument(),
      reviewFingerprint: "manifest-a",
    })

    expect(
      buildRuntimeNativeActivationPolicy({
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        runtimeSupportsNativeLoading: true,
        runtimeSupportsPerRunPluginControl: true,
        identity,
        reviewedIdentityFingerprint: identity.identityFingerprint,
        hasMcpServers: true,
        mcpServersApprovedOrFiltered: true,
      }),
    ).toEqual({
      status: "allowed",
      canActivateNative: true,
      identityStatus: "reviewed",
      reasons: [],
    })
  })

  test("derives per-runtime MCP approval behavior in the shared owner", () => {
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument(),
      reviewFingerprint: "manifest-a",
    })

    expect(
      buildRuntimeNativeActivationState({
        runtime: "claude",
        sourceKind: "local-marketplace",
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        identity,
        reviewedIdentityFingerprint: identity.identityFingerprint,
        hasMcpServers: true,
        mcpServerNames: ["context"],
        mcpApprovalIdentifiers: {
          context: "anthropic:context-tools@0.1.0:context#mcp-sha256:abc",
        },
        approvedPluginMcpServers: [
          "anthropic:context-tools@0.1.0:context#mcp-sha256:abc",
        ],
      }).current,
    ).toMatchObject({
      status: "allowed",
      reasons: [],
    })

    expect(
      buildRuntimeNativeActivationState({
        runtime: "codex",
        sourceKind: "cache",
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        identity: {
          ...identity,
          runtime: "codex",
        },
        reviewedIdentityFingerprint: identity.identityFingerprint,
        hasMcpServers: true,
        mcpServerNames: ["context"],
        mcpApprovalIdentifiers: {},
        approvedPluginMcpServers: [],
      }).current.reasons,
    ).toEqual([
      "runtime-native-unsupported",
      "per-run-plugin-control-missing",
      "mcp-approval-required",
    ])
  })

  test("reports bounded reasons for ordinary blocked states", () => {
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument(),
      reviewFingerprint: "manifest-a",
    })

    expect(
      buildRuntimeNativeActivationPolicy({
        pluginEnabled: false,
        safeModeEnabled: true,
        manifestReviewStatus: "changed",
        runtimeSupportsNativeLoading: false,
        runtimeSupportsPerRunPluginControl: false,
        identity,
        reviewedIdentityFingerprint: identity.identityFingerprint,
        hasMcpServers: true,
        mcpServersApprovedOrFiltered: false,
        nativeLoadFailure: true,
      }),
    ).toMatchObject({
      status: "blocked",
      canActivateNative: false,
      identityStatus: "reviewed",
      reasons: [
        "plugin-disabled",
        "global-safe-mode",
        "manifest-review-required",
        "runtime-native-unsupported",
        "per-run-plugin-control-missing",
        "native-load-failed",
        "mcp-approval-required",
      ],
    })
  })

  test("blocks complete activation identities until the current identity is reviewed", () => {
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument(),
      reviewFingerprint: "manifest-a",
    })

    expect(
      buildRuntimeNativeActivationPolicy({
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        runtimeSupportsNativeLoading: true,
        runtimeSupportsPerRunPluginControl: true,
        identity,
        hasMcpServers: false,
        mcpServersApprovedOrFiltered: false,
      }),
    ).toMatchObject({
      status: "blocked",
      identityStatus: "identity-unreviewed",
      reasons: ["activation-identity-unreviewed"],
    })
  })

  test("blocks drifted activation identities even when the manifest is reviewed", () => {
    const reviewedIdentity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument(),
      reviewFingerprint: "manifest-a",
      packageHash: "sha256:package-a",
    })
    const currentIdentity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument(),
      reviewFingerprint: "manifest-a",
      packageHash: "sha256:package-b",
    })

    expect(
      buildRuntimeNativeActivationPolicy({
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        runtimeSupportsNativeLoading: true,
        runtimeSupportsPerRunPluginControl: true,
        identity: currentIdentity,
        reviewedIdentityFingerprint: reviewedIdentity.identityFingerprint,
        hasMcpServers: false,
        mcpServersApprovedOrFiltered: false,
      }),
    ).toMatchObject({
      status: "blocked",
      identityStatus: "identity-drifted",
      reasons: ["activation-identity-drifted"],
    })
  })

  test("requires a current high-risk acknowledgement for identity-incomplete packages", () => {
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument: reviewDocument({
        sourcePins: [],
      }),
      reviewFingerprint: "manifest-a",
    })

    expect(identity.status).toBe("identity-incomplete")
    expect(identity.missingFields).toEqual(["drift-detection-field"])
    expect(
      buildRuntimeNativeActivationPolicy({
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        runtimeSupportsNativeLoading: true,
        runtimeSupportsPerRunPluginControl: true,
        identity,
        hasMcpServers: false,
        mcpServersApprovedOrFiltered: false,
      }),
    ).toMatchObject({
      status: "blocked",
      identityStatus: "identity-incomplete",
      reasons: ["activation-identity-incomplete"],
    })

    expect(
      buildRuntimeNativeActivationPolicy({
        pluginEnabled: true,
        safeModeEnabled: false,
        manifestReviewStatus: "reviewed",
        runtimeSupportsNativeLoading: true,
        runtimeSupportsPerRunPluginControl: true,
        identity,
        identityIncompleteAcknowledgedFingerprint: identity.identityFingerprint,
        hasMcpServers: false,
        mcpServersApprovedOrFiltered: false,
      }),
    ).toMatchObject({
      status: "allowed",
      canActivateNative: true,
      identityStatus: "identity-incomplete-acknowledged",
      reasons: [],
    })
  })
})
