import { describe, expect, test } from "bun:test"
import {
  codexCanMaterialize,
  previewDefaultMcpRegistryRuntimeInstallability,
  previewMcpRegistryRuntimeInstallability,
} from "../src/main/lib/mcp-registry/installability"
import { normalizeOfficialMcpRegistryEntry } from "../src/main/lib/mcp-registry/normalize"

function packageEntry() {
  return normalizeOfficialMcpRegistryEntry({
    server: {
      name: "io.github.example/package",
      version: "1.0.0",
      compatibility: { runtimes: ["claude-code", "codex"] },
      packages: [
        {
          registryType: "npm",
          identifier: "@example/package",
          runtimeHint: "npx",
          transport: { type: "stdio" },
        },
      ],
    },
  })
}

function remoteNeedsSetupEntry() {
  return normalizeOfficialMcpRegistryEntry({
    server: {
      name: "io.github.example/remote",
      version: "1.0.0",
      compatibility: { runtimes: ["claude-code"] },
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [
            {
              name: "Authorization",
              isRequired: true,
              isSecret: true,
            },
          ],
        },
      ],
    },
  })
}

describe("MCP registry runtime installability", () => {
  test("marks package configs materializable while Codex waits for real auth/setup", () => {
    const entry = packageEntry()
    const target = entry.installTargets[0]
    if (!target) throw new Error("Expected package target")

    expect(
      previewDefaultMcpRegistryRuntimeInstallability({ entry, target }),
    ).toEqual([
      {
        runtime: "claude-code",
        status: "needs-setup",
        declaredCompatibility: "declared",
        installableConfig: true,
        requiredSetupKeys: ["local-dependency:package:npm:@example/package"],
        reasons: [
          "required-setup-missing",
          "missing:local-dependency:package:npm:@example/package",
        ],
      },
      {
        runtime: "codex",
        status: "needs-setup",
        declaredCompatibility: "declared",
        installableConfig: true,
        requiredSetupKeys: [
          "local-dependency:package:npm:@example/package",
          "runtime-auth:codex",
        ],
        reasons: [
          "required-setup-missing",
          "missing:local-dependency:package:npm:@example/package",
          "missing:runtime-auth:codex",
        ],
      },
    ])
  })

  test("allows setup-free Codex remote targets only when main-process auth is resolved", () => {
    const entry = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/public-remote",
        version: "1.0.0",
        compatibility: { runtimes: ["codex"] },
        remotes: [
          {
            type: "streamable-http",
            url: "https://public.example.com/mcp",
          },
        ],
      },
    })
    const target = entry.installTargets[0]
    if (!target) throw new Error("Expected remote target")

    expect(codexCanMaterialize(target)).toBe(true)
    expect(
      previewMcpRegistryRuntimeInstallability({
        entry,
        target,
        runtime: "codex",
      }),
    ).toMatchObject({
      status: "needs-setup",
      installableConfig: true,
      requiredSetupKeys: ["runtime-auth:codex"],
      reasons: ["required-setup-missing", "missing:runtime-auth:codex"],
    })
    expect(
      previewMcpRegistryRuntimeInstallability({
        entry,
        target,
        runtime: "codex",
        resolvedSetup: { runtimeAuthenticated: true },
      }),
    ).toMatchObject({
      status: "installable-config",
      installableConfig: true,
      requiredSetupKeys: [],
      reasons: [],
    })
  })

  test("marks required setup before install and preserves local verification states", () => {
    const entry = remoteNeedsSetupEntry()
    const target = entry.installTargets[0]
    if (!target) throw new Error("Expected remote target")

    expect(
      previewMcpRegistryRuntimeInstallability({
        entry,
        target,
        runtime: "claude-code",
      }),
    ).toEqual({
      runtime: "claude-code",
      status: "needs-setup",
      declaredCompatibility: "declared",
      installableConfig: true,
      requiredSetupKeys: [
        "bearer-token-env:Authorization",
        "header:Authorization",
      ],
      reasons: [
        "required-setup-missing",
        "missing:bearer-token-env:Authorization",
        "missing:header:Authorization",
      ],
    })

    expect(
      previewMcpRegistryRuntimeInstallability({
        entry,
        target,
        runtime: "claude-code",
        localState: {
          runtime: "claude-code",
          status: "verified-local",
          reason: "tool-call-proof",
        },
      }),
    ).toEqual({
      runtime: "claude-code",
      status: "verified-local",
      declaredCompatibility: "declared",
      installableConfig: true,
      requiredSetupKeys: ["header:Authorization"],
      reasons: ["tool-call-proof"],
    })
  })

  test("keeps declared compatibility separate from materializable config", () => {
    const entry = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/incomplete",
        version: "1.0.0",
        compatibility: { runtimes: ["claude-code"] },
        packages: [
          {
            registryType: "npm",
            identifier: "@example/incomplete",
            transport: { type: "stdio" },
          },
        ],
      },
    })
    const target = entry.installTargets[0]
    if (!target) throw new Error("Expected incomplete package target")

    expect(
      previewMcpRegistryRuntimeInstallability({
        entry,
        target,
        runtime: "claude-code",
      }),
    ).toEqual({
      runtime: "claude-code",
      status: "declared-compatible",
      declaredCompatibility: "declared",
      installableConfig: false,
      requiredSetupKeys: [],
      reasons: ["adapter-config-missing-command"],
    })
  })
})
