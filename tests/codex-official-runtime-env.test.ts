import { describe, expect, test } from "bun:test"
import {
  CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST,
  buildCodexOfficialRuntimeEnv,
} from "../src/main/lib/codex/official-runtime-env"

describe("Codex official runtime env allowlist", () => {
  test("copies only explicit allowlist entries from host env sources", () => {
    const env = buildCodexOfficialRuntimeEnv({
      processEnv: {
        PATH: "/usr/bin",
        CODEX_HOME: "/tmp/locus-codex-home",
        HOME: "/Users/example",
        SAFE_FLAG: "should-not-pass",
        NODE_OPTIONS: "--inspect",
        OPENAI_API_KEY: "stale-openai",
        CODEX_API_KEY: "stale-codex",
        ANTHROPIC_API_KEY: "stale-anthropic",
        GITHUB_TOKEN: "stale-github",
        CUSTOM_SECRET: "secret",
      },
      shellEnv: {
        PATH: "/bin",
        TMPDIR: "/tmp",
        NPM_CONFIG_PREFIX: "/tmp/npm",
        LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "stale-gateway",
      },
    })

    expect(env).toEqual({
      PATH: "/bin",
      CODEX_HOME: "/tmp/locus-codex-home",
      HOME: "/Users/example",
      TMPDIR: "/tmp",
    })
  })

  test("injects only the selected provider-profile gateway token", () => {
    const env = buildCodexOfficialRuntimeEnv({
      processEnv: {
        PATH: "/usr/bin",
        OPENAI_API_KEY: "stale-openai",
        CODEX_API_KEY: "stale-codex",
      },
      appManagedApiKey: "sk-app-managed",
      providerGatewayToken: "gateway-token",
    })

    expect(env).toEqual({
      PATH: "/usr/bin",
      LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "gateway-token",
    })
  })

  test("injects app-managed Codex key without inheriting stale provider tokens", () => {
    const env = buildCodexOfficialRuntimeEnv({
      processEnv: {
        PATH: "/usr/bin",
        OPENAI_API_KEY: "stale-openai",
        CODEX_API_KEY: "stale-codex",
        ANTHROPIC_AUTH_TOKEN: "stale-anthropic",
      },
      appManagedApiKey: "sk-selected",
    })

    expect(env).toEqual({
      PATH: "/usr/bin",
      CODEX_API_KEY: "sk-selected",
    })
  })

  test("documents the small portable allowlist", () => {
    expect(CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST).toContain("PATH")
    expect(CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST).toContain("CODEX_HOME")
    expect(CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST).toContain("HOME")
    expect(CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST).toContain("TMPDIR")
    expect(CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST).not.toContain("OPENAI_API_KEY")
    expect(CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST).not.toContain("GITHUB_TOKEN")
  })
})
