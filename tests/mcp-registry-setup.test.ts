import { describe, expect, test } from "bun:test"
import { normalizeOfficialMcpRegistryEntry } from "../src/main/lib/mcp-registry/normalize"
import { classifyMcpRegistrySetup } from "../src/main/lib/mcp-registry/setup"

function complexEntry() {
  return normalizeOfficialMcpRegistryEntry({
    server: {
      name: "io.github.example/setup",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@example/setup",
          runtimeHint: "npx",
          transport: { type: "stdio" },
          environmentVariables: [
            { name: "SETUP_TOKEN", isRequired: true, isSecret: true },
            { name: "SETUP_MODE", isRequired: false },
          ],
        },
      ],
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [
            { name: "Authorization", isRequired: true, isSecret: true },
            { name: "X-Optional", isRequired: false },
          ],
          variables: [
            { name: "tenant", isRequired: true },
            { name: "region", isRequired: false },
          ],
        },
      ],
    },
  })
}

describe("MCP registry setup classification", () => {
  test("classifies required and optional package setup plus local dependencies", () => {
    const entry = complexEntry()
    const target = entry.installTargets[0]
    if (!target) throw new Error("Expected package target")

    expect(
      classifyMcpRegistrySetup({ runtime: "claude-code", target }),
    ).toEqual({
      runtime: "claude-code",
      env: {
        required: ["SETUP_TOKEN"],
        optional: ["SETUP_MODE"],
        missing: ["SETUP_TOKEN"],
      },
      headers: { required: [], optional: [], missing: [] },
      variables: { required: [], optional: [], missing: [] },
      bearerTokenEnvRefs: [],
      oauthRequired: false,
      oauthMissing: false,
      runtimeAuthRequired: false,
      runtimeAuthMissing: false,
      localDependencies: [{ key: "package:npm:@example/setup", missing: true }],
      missingKeys: [
        "env:SETUP_TOKEN",
        "local-dependency:package:npm:@example/setup",
      ],
      adapterCanKeepIncompleteInactive: true,
      missingSetupBehavior: "save-needs-setup",
    })

    expect(
      classifyMcpRegistrySetup({
        runtime: "claude-code",
        target,
        resolved: {
          env: { SETUP_TOKEN: true },
          localDependencies: { "package:npm:@example/setup": true },
        },
      }).missingSetupBehavior,
    ).toBe("none")
  })

  test("classifies bearer header env references, variables, and runtime auth", () => {
    const entry = complexEntry()
    const target = entry.installTargets[1]
    if (!target) throw new Error("Expected remote target")

    expect(
      classifyMcpRegistrySetup({ runtime: "codex", target }),
    ).toMatchObject({
      runtime: "codex",
      headers: {
        required: ["Authorization"],
        optional: ["X-Optional"],
        missing: ["Authorization"],
      },
      variables: {
        required: ["tenant"],
        optional: ["region"],
        missing: ["tenant"],
      },
      bearerTokenEnvRefs: [{ headerName: "Authorization", missing: true }],
      runtimeAuthRequired: true,
      runtimeAuthMissing: true,
      missingKeys: [
        "bearer-token-env:Authorization",
        "header:Authorization",
        "runtime-auth:codex",
        "variable:tenant",
      ],
      adapterCanKeepIncompleteInactive: false,
      missingSetupBehavior: "block-install",
    })

    expect(
      classifyMcpRegistrySetup({
        runtime: "codex",
        target,
        resolved: {
          headers: { Authorization: true },
          variables: { tenant: true },
          bearerTokenEnvRefs: { Authorization: "MCP_AUTH_TOKEN" },
          runtimeAuthenticated: true,
        },
      }),
    ).toMatchObject({
      bearerTokenEnvRefs: [
        {
          headerName: "Authorization",
          envName: "MCP_AUTH_TOKEN",
          missing: false,
        },
      ],
      missingKeys: [],
      missingSetupBehavior: "none",
    })
  })
})
