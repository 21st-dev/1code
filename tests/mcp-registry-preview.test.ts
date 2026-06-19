import { describe, expect, test } from "bun:test"
import { normalizeOfficialMcpRegistryEntry } from "../src/main/lib/mcp-registry/normalize"
import {
  buildMcpRegistryInstallPreview,
  buildMcpRegistryInstallPreviews,
} from "../src/main/lib/mcp-registry/preview"

describe("MCP registry install preview", () => {
  test("builds a registry-specific redacted package preview", () => {
    const entry = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/secret-tools",
        title: "Secret Tools",
        description: "Uses secrets",
        version: "1.2.3",
        repository: { url: "https://github.com/example/secret-tools" },
        compatibility: { runtimes: ["claude-code"] },
        packages: [
          {
            registryType: "npm",
            identifier: "@example/secret-tools",
            version: "1.2.3",
            fileSha256: "abc123",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            runtimeArguments: ["-y"],
            packageArguments: [
              "@example/secret-tools",
              "--api-key",
              "registry-secret-value",
            ],
            environmentVariables: [
              {
                name: "SECRET_TOOLS_TOKEN",
                description: "API token",
                isRequired: true,
                isSecret: true,
                default: "registry-secret-default",
              },
            ],
          },
        ],
      },
    })
    const target = entry.installTargets[0]
    if (!target) throw new Error("Expected package target")

    const preview = buildMcpRegistryInstallPreview({ entry, target })

    expect(preview).toMatchObject({
      kind: "mcp-registry-install-preview",
      version: 1,
      state: "pending",
      entryId: "io.github.example/secret-tools",
      targetId: "package:@example/secret-tools:0",
      serverName: "io.github.example/secret-tools",
      title: "Secret Tools",
      versionRef: "1.2.3",
      sourceUrl: "https://github.com/example/secret-tools",
      targetSource: "package",
      transport: "stdio",
      command: "npx",
      env: [
        {
          key: "SECRET_TOOLS_TOKEN",
          source: "env",
          required: true,
          secret: true,
          hasDefaultValue: true,
          redacted: true,
          valuePreview: "<redacted>",
        },
      ],
      provenance: {
        provenance: "immutable",
        integrity: "present",
      },
      wouldWritePaths: [],
      warnings: [],
    })
    expect(preview.runtimeInstallability).toEqual([
      {
        runtime: "claude-code",
        status: "needs-setup",
        declaredCompatibility: "declared",
        installableConfig: true,
        requiredSetupKeys: ["env:SECRET_TOOLS_TOKEN"],
        reasons: ["required-setup-missing"],
      },
      {
        runtime: "codex",
        status: "codex-deferred",
        declaredCompatibility: "not-declared",
        installableConfig: false,
        requiredSetupKeys: ["env:SECRET_TOOLS_TOKEN"],
        reasons: [
          "codex-registry-support-deferred",
          "codex-config-writes-do-not-cover-registry-fields",
          "codex-runtime-proof-missing",
        ],
      },
    ])
    expect(preview.args).toEqual([
      { value: "-y", redacted: false },
      { value: "@example/secret-tools", redacted: false },
      { value: "--api-key", redacted: false },
      { value: "<redacted>", redacted: true },
    ])
    expect(preview.entryFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(preview.configFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(JSON.stringify(preview)).not.toContain("registry-secret")
    expect(preview).not.toHaveProperty("effectiveEnabled")
    expect(preview).not.toHaveProperty("requestedActions")
  })

  test("builds remote previews with sanitized URLs and provenance warnings", () => {
    const entry = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/remote",
        version: "latest",
        remotes: [
          {
            type: "sse",
            url: "https://mcp.example.com/sse?access_token=url-secret&tenant=acme",
            headers: [
              {
                name: "Authorization",
                isRequired: true,
                isSecret: true,
                value: "Bearer header-secret",
              },
            ],
          },
        ],
      },
    })
    const previews = buildMcpRegistryInstallPreviews({ entry })

    expect(previews).toHaveLength(1)
    expect(previews[0]).toMatchObject({
      kind: "mcp-registry-install-preview",
      targetSource: "remote",
      transport: "sse",
      url: "https://mcp.example.com/sse?access_token=<redacted>&tenant=<redacted>",
      headers: [
        {
          key: "Authorization",
          source: "header",
          required: true,
          secret: true,
          hasDefaultValue: true,
          redacted: true,
          valuePreview: "<redacted>",
        },
      ],
      auth: {
        kind: "bearer",
        required: true,
        headerNames: ["Authorization"],
        envNames: [],
      },
      provenance: {
        provenance: "mutable",
        integrity: "missing",
      },
      warnings: [
        "mutable-provenance",
        "integrity-missing",
        "declared-runtime-support-unknown",
      ],
    })
    expect(JSON.stringify(previews[0])).not.toContain("url-secret")
    expect(JSON.stringify(previews[0])).not.toContain("header-secret")
  })
})
