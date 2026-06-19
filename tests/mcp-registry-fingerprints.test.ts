import { describe, expect, test } from "bun:test"
import {
  classifyMcpRegistryProvenance,
  fingerprintMcpRegistryEntry,
  fingerprintMcpRegistryInstallTarget,
} from "../src/main/lib/mcp-registry/fingerprints"
import { normalizeOfficialMcpRegistryEntry } from "../src/main/lib/mcp-registry/normalize"

function normalizedEntry(overrides: {
  version?: string
  fileSha256?: string
  url?: string
}) {
  return normalizeOfficialMcpRegistryEntry({
    server: {
      name: "io.github.example/demo",
      version: overrides.version ?? "1.2.3",
      packages: [
        {
          registryType: "npm",
          identifier: "@example/demo-mcp",
          version: overrides.version ?? "1.2.3",
          ...(overrides.fileSha256 ? { fileSha256: overrides.fileSha256 } : {}),
          runtimeHint: "npx",
          transport: { type: "stdio" },
          runtimeArguments: ["-y"],
          packageArguments: ["@example/demo-mcp"],
        },
      ],
      remotes: [
        {
          type: "sse",
          url: overrides.url ?? "https://demo.example.com/sse",
        },
      ],
    },
  })
}

describe("MCP registry fingerprints and provenance", () => {
  test("builds stable entry fingerprints independent of object key order", () => {
    const first = normalizeOfficialMcpRegistryEntry({
      server: {
        name: "io.github.example/stable",
        version: "1.0.0",
        title: "Stable",
        packages: [
          {
            registryType: "npm",
            identifier: "@example/stable",
            fileSha256: "abc",
            transport: { type: "stdio" },
          },
        ],
      },
    })
    const second = normalizeOfficialMcpRegistryEntry({
      server: {
        packages: [
          {
            transport: { type: "stdio" },
            fileSha256: "abc",
            identifier: "@example/stable",
            registryType: "npm",
          },
        ],
        title: "Stable",
        version: "1.0.0",
        name: "io.github.example/stable",
      },
    })

    expect(fingerprintMcpRegistryEntry(first)).toBe(
      fingerprintMcpRegistryEntry(second),
    )
    expect(fingerprintMcpRegistryEntry(first)).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  test("builds config fingerprints from runtime-relevant target fields", () => {
    const first = normalizedEntry({ fileSha256: "abc" })
    const firstTarget = first.installTargets[1]
    const second = normalizedEntry({
      fileSha256: "abc",
      url: "https://demo.example.com/changed",
    })
    const secondTarget = second.installTargets[1]

    expect(firstTarget).toBeDefined()
    expect(secondTarget).toBeDefined()
    if (!firstTarget || !secondTarget) {
      throw new Error("Expected remote install targets")
    }
    expect(
      fingerprintMcpRegistryInstallTarget({
        entry: first,
        target: firstTarget,
      }),
    ).not.toBe(
      fingerprintMcpRegistryInstallTarget({
        entry: second,
        target: secondTarget,
      }),
    )
  })

  test("classifies immutable, mutable, and unknown provenance conservatively", () => {
    expect(
      classifyMcpRegistryProvenance(
        normalizedEntry({ version: "1.2.3", fileSha256: "abc" }),
      ),
    ).toEqual({
      provenance: "immutable",
      integrity: "present",
      reasons: ["integrity-hash-present", "exact-version-ref"],
    })

    expect(
      classifyMcpRegistryProvenance(
        normalizedEntry({ version: "latest", fileSha256: "abc" }),
      ),
    ).toEqual({
      provenance: "mutable",
      integrity: "present",
      reasons: ["integrity-hash-present", "mutable-version-ref"],
    })

    expect(
      classifyMcpRegistryProvenance(normalizedEntry({ version: "1.2.3" })),
    ).toEqual({
      provenance: "unknown",
      integrity: "missing",
      reasons: ["integrity-hash-missing", "exact-version-ref"],
    })
  })
})
