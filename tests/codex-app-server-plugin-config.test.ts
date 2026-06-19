import { describe, expect, test } from "bun:test"
import {
  buildCodexAppServerResolvedPluginConfigOverrides,
  getCodexAppServerPluginId,
} from "../src/main/lib/codex/app-server-plugin-config"
import { buildRuntimeNativeActivationIdentity } from "../src/main/lib/plugins/runtime-native-activation"
import { buildPluginManifestReviewDocument } from "../src/shared/plugin-update-review"

describe("Codex app-server plugin config", () => {
  test("maps Locus Codex plugin sources to app-server plugin ids", () => {
    expect(
      getCodexAppServerPluginId({
        runtime: "codex",
        marketplace: "openai-curated",
        source: "openai-curated:figma@7118aaa3",
      }),
    ).toBe("figma@openai-curated")

    expect(
      getCodexAppServerPluginId({
        runtime: "codex",
        marketplace: "openai-primary-runtime",
        source: "openai-primary-runtime:spreadsheets@26.614.11602",
      }),
    ).toBe("spreadsheets@openai-primary-runtime")

    expect(
      getCodexAppServerPluginId({
        runtime: "claude",
        marketplace: "team",
        source: "team:figma",
      }),
    ).toBeUndefined()
  })

  test("enables reviewed Codex plugins after isolated app-server home proof exists", () => {
    const reviewDocument = buildPluginManifestReviewDocument({
      runtime: "codex",
      marketplace: "openai-curated",
      source: "openai-curated:figma@7118aaa3",
      name: "Figma",
      version: "2.0.10",
      targetMode: "manifest-only",
      executionStatus: "not-run-by-locus",
      updatePosture: "review-before-enable",
      componentPaths: {
        skills: "/plugin/skills",
      },
      components: {
        skills: 7,
      },
      sourcePins: [{ kind: "cache-version", value: "7118aaa3" }],
    })
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument,
      reviewFingerprint: "manifest-a",
    })

    const result = buildCodexAppServerResolvedPluginConfigOverrides({
      candidates: [
        {
          plugin: {
            runtime: "codex",
            marketplace: "openai-curated",
            source: "openai-curated:figma@7118aaa3",
            sourceKind: "cache",
            path: "/plugins/openai-curated/figma/7118aaa3",
          },
          pluginEnabled: true,
          safeModeEnabled: false,
          manifestReviewStatus: "reviewed",
          identity,
          reviewedIdentityFingerprint: identity.identityFingerprint,
          hasMcpServers: false,
          mcpServersApprovedOrFiltered: true,
        },
      ],
    })

    expect(result.config).toEqual({
      "plugins.figma@openai-curated.enabled": true,
    })
    expect(result.entries[0]).toMatchObject({
      pluginId: "figma@openai-curated",
      enabled: true,
      pluginPath: "/plugins/openai-curated/figma/7118aaa3",
      cacheCoordinates: {
        marketplace: "openai-curated",
        name: "figma",
        version: "7118aaa3",
      },
      nativeActivationPolicy: {
        status: "allowed",
        reasons: [],
      },
    })
  })

  test("fails closed for disabled, unreviewed, safe-mode, drifted, and unapproved-MCP plugins", () => {
    const reviewDocument = buildPluginManifestReviewDocument({
      runtime: "codex",
      marketplace: "openai-curated",
      source: "openai-curated:cloudflare@7118aaa3",
      name: "Cloudflare",
      version: "0.1.2",
      targetMode: "manifest-only",
      executionStatus: "not-run-by-locus",
      updatePosture: "review-before-enable",
      componentPaths: {
        skills: "/plugin/skills",
        mcpServers: "/plugin/.mcp.json",
      },
      components: {
        skills: 3,
        mcpServers: ["cloudflare"],
      },
      sourcePins: [{ kind: "cache-version", value: "7118aaa3" }],
    })
    const identity = buildRuntimeNativeActivationIdentity({
      reviewDocument,
      reviewFingerprint: "manifest-a",
    })

    const result = buildCodexAppServerResolvedPluginConfigOverrides({
      candidates: [
        {
          plugin: {
            runtime: "codex",
            marketplace: "openai-curated",
            source: "openai-curated:disabled@7118aaa3",
            sourceKind: "cache",
          },
          pluginEnabled: false,
          safeModeEnabled: false,
          manifestReviewStatus: "reviewed",
          identity,
          reviewedIdentityFingerprint: identity.identityFingerprint,
          hasMcpServers: false,
          mcpServersApprovedOrFiltered: true,
        },
        {
          plugin: {
            runtime: "codex",
            marketplace: "openai-curated",
            source: "openai-curated:new@7118aaa3",
            sourceKind: "cache",
          },
          pluginEnabled: true,
          safeModeEnabled: false,
          manifestReviewStatus: "new",
          identity,
          reviewedIdentityFingerprint: identity.identityFingerprint,
          hasMcpServers: false,
          mcpServersApprovedOrFiltered: true,
        },
        {
          plugin: {
            runtime: "codex",
            marketplace: "openai-curated",
            source: "openai-curated:safe-mode@7118aaa3",
            sourceKind: "cache",
          },
          pluginEnabled: true,
          safeModeEnabled: true,
          manifestReviewStatus: "reviewed",
          identity,
          reviewedIdentityFingerprint: identity.identityFingerprint,
          hasMcpServers: false,
          mcpServersApprovedOrFiltered: true,
        },
        {
          plugin: {
            runtime: "codex",
            marketplace: "openai-curated",
            source: "openai-curated:drifted@7118aaa3",
            sourceKind: "cache",
          },
          pluginEnabled: true,
          safeModeEnabled: false,
          manifestReviewStatus: "reviewed",
          identity,
          reviewedIdentityFingerprint: "old-identity",
          hasMcpServers: false,
          mcpServersApprovedOrFiltered: true,
        },
        {
          plugin: {
            runtime: "codex",
            marketplace: "openai-curated",
            source: "openai-curated:cloudflare@7118aaa3",
            sourceKind: "cache",
          },
          pluginEnabled: true,
          safeModeEnabled: false,
          manifestReviewStatus: "reviewed",
          identity,
          reviewedIdentityFingerprint: identity.identityFingerprint,
          hasMcpServers: true,
          mcpServersApprovedOrFiltered: false,
        },
      ],
    })

    expect(result.config).toEqual({
      "plugins.cloudflare@openai-curated.enabled": false,
      "plugins.disabled@openai-curated.enabled": false,
      "plugins.drifted@openai-curated.enabled": false,
      "plugins.new@openai-curated.enabled": false,
      "plugins.safe-mode@openai-curated.enabled": false,
    })
    expect(
      result.entries.map((entry) => entry.nativeActivationPolicy.reasons),
    ).toEqual([
      ["mcp-approval-required"],
      ["plugin-disabled"],
      ["activation-identity-drifted"],
      ["manifest-review-required"],
      ["global-safe-mode"],
    ])
  })
})
