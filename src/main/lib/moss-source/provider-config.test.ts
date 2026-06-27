import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
  readMossProviderConfig,
  resolveMossProviderForEngine,
  summarizeMossProviderReadResult,
} from "./provider-config"

function makeFixture(providersYaml: string): string {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "moss-provider-"))
  fs.mkdirSync(path.join(projectPath, ".moss"), { recursive: true })
  fs.writeFileSync(path.join(projectPath, ".moss", "providers.yaml"), providersYaml)
  return projectPath
}

async function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key]
    const value = values[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

describe("Moss provider config", () => {
  test("resolves one provider source into Claude and Codex env", async () => {
    const projectPath = makeFixture(`
version: 1
defaultProvider: moss
providers:
  moss:
    label: Moss Managed
    mode: bundled-quota
    runtime: any
    apiKeyEnv: MOSS_TEST_API_KEY
    baseUrlEnv: MOSS_TEST_BASE_URL
    engines:
      claude-code:
        model: claude-opus-test
      codex:
        model: gpt-test/high
        authMethod: openai-api-key
      custom-acp:
        model: custom-acp-test
`)

    try {
      await withEnv(
        {
          MOSS_TEST_API_KEY: "sk-moss-test",
          MOSS_TEST_BASE_URL: "https://api.moss.test/v1",
        },
        async () => {
          const claude = await resolveMossProviderForEngine({
            projectPath,
            engineId: "claude-code",
          })
          expect(claude.status).toBe("resolved")
          expect(claude.providerId).toBe("moss")
          expect(claude.model).toBe("claude-opus-test")
          expect(claude.baseUrlSource).toBe("env")
          expect(claude.baseUrlEnv).toBe("MOSS_TEST_BASE_URL")
          expect(claude.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-moss-test")
          expect(claude.env.ANTHROPIC_BASE_URL).toBe("https://api.moss.test/v1")

          const codex = await resolveMossProviderForEngine({
            projectPath,
            engineId: "codex",
          })
          expect(codex.status).toBe("resolved")
          expect(codex.model).toBe("gpt-test/high")
          expect(codex.authMethod).toBe("openai-api-key")
          expect(codex.baseUrlSource).toBe("env")
          expect(codex.baseUrlEnv).toBe("MOSS_TEST_BASE_URL")
          expect(codex.env.OPENAI_API_KEY).toBe("sk-moss-test")
          expect(codex.env.CODEX_API_KEY).toBeUndefined()
          expect(codex.env.OPENAI_BASE_URL).toBe("https://api.moss.test/v1")

          const customAcp = await resolveMossProviderForEngine({
            projectPath,
            engineId: "custom-acp",
          })
          expect(customAcp.status).toBe("resolved")
          expect(customAcp.providerId).toBe("moss")
          expect(customAcp.model).toBe("custom-acp-test")
          expect(customAcp.baseUrlSource).toBe("env")
          expect(customAcp.baseUrlEnv).toBe("MOSS_TEST_BASE_URL")
          expect(customAcp.env.MOSS_CUSTOM_ACP_MODEL).toBe("custom-acp-test")
          expect(customAcp.env.MOSS_CUSTOM_ACP_BASE_URL).toBe("https://api.moss.test/v1")
          expect(customAcp.env.MOSS_CUSTOM_ACP_API_KEY).toBe("sk-moss-test")
        },
      )
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  test("resolves engine-level provider base URLs with auditable URL sources", async () => {
    const projectPath = makeFixture(`
version: 1
defaultProvider: custom
providers:
  custom:
    label: Custom
    mode: custom-url-key
    runtime: any
    baseUrl: https://shared.test/v1
    apiKeyEnv: MOSS_TEST_API_KEY
    engines:
      hermes:
        model: moss-custom
        baseUrl: https://hermes.test/v1
      claude-code:
        model: opus-custom
        baseUrlEnv: MOSS_CLAUDE_BASE_URL
      codex:
        model: gpt-custom/high
        authMethod: openai-api-key
      custom-acp:
        model: custom-acp-custom
`)

    try {
      await withEnv(
        {
          MOSS_TEST_API_KEY: "sk-moss-test",
          MOSS_CLAUDE_BASE_URL: "https://claude.test/v1",
        },
        async () => {
          const hermes = await resolveMossProviderForEngine({
            projectPath,
            engineId: "hermes",
          })
          expect(hermes.status).toBe("resolved")
          expect(hermes.baseUrl).toBe("https://hermes.test/v1")
          expect(hermes.baseUrlSource).toBe("inline")
          expect(hermes.baseUrlEnv).toBeUndefined()
          expect(hermes.env.HERMES_BASE_URL).toBe("https://hermes.test/v1")
          expect(hermes.env.HERMES_INFERENCE_MODEL).toBe("moss-custom")

          const claude = await resolveMossProviderForEngine({
            projectPath,
            engineId: "claude-code",
          })
          expect(claude.status).toBe("resolved")
          expect(claude.baseUrl).toBe("https://claude.test/v1")
          expect(claude.baseUrlSource).toBe("env")
          expect(claude.baseUrlEnv).toBe("MOSS_CLAUDE_BASE_URL")
          expect(claude.env.ANTHROPIC_BASE_URL).toBe("https://claude.test/v1")

          const codex = await resolveMossProviderForEngine({
            projectPath,
            engineId: "codex",
          })
          expect(codex.status).toBe("resolved")
          expect(codex.baseUrl).toBe("https://shared.test/v1")
          expect(codex.baseUrlSource).toBe("inline")
          expect(codex.baseUrlEnv).toBeUndefined()
          expect(codex.env.OPENAI_BASE_URL).toBe("https://shared.test/v1")

          const customAcp = await resolveMossProviderForEngine({
            projectPath,
            engineId: "custom-acp",
          })
          expect(customAcp.status).toBe("resolved")
          expect(customAcp.baseUrl).toBe("https://shared.test/v1")
          expect(customAcp.baseUrlSource).toBe("inline")
          expect(customAcp.env.MOSS_CUSTOM_ACP_MODEL).toBe("custom-acp-custom")
          expect(customAcp.env.MOSS_CUSTOM_ACP_BASE_URL).toBe("https://shared.test/v1")
        },
      )
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  test("summarizes provider config without exposing inline secrets", async () => {
    const projectPath = makeFixture(`
version: 1
defaultProvider: custom
credentialPolicy:
  shareAcrossEngines: true
providers:
  custom:
    label: Custom
    mode: custom-url-key
    runtime: any
    apiKey: sk-inline-secret
    baseUrl: https://custom.test/v1
`)

    try {
      const readResult = await readMossProviderConfig(projectPath)
      const summary = summarizeMossProviderReadResult(readResult)

      expect(summary.status).toBe("found")
      expect(summary.defaultProvider).toBe("custom")
      expect(summary.credentialPolicy?.shareAcrossEngines).toBe(true)
      expect(summary.providers[0]?.hasInlineApiKey).toBe(true)
      expect(summary.providers[0]?.hasStoredApiKey).toBe(false)
      expect(JSON.stringify(summary)).not.toContain("sk-inline-secret")
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  test("summarizes stored provider secrets without exposing the secret value", async () => {
    const projectPath = makeFixture(`
version: 1
defaultProvider: custom
credentialPolicy:
  shareAcrossEngines: true
providers:
  custom:
    label: Custom
    mode: custom-url-key
    runtime: any
    baseUrl: https://custom.test/v1
`)

    try {
      const readResult = await readMossProviderConfig(projectPath)
      const summary = summarizeMossProviderReadResult(readResult, {
        custom: { hasApiKey: true },
      })

      expect(summary.providers[0]?.hasStoredApiKey).toBe(true)
      expect(summary.providers[0]?.hasInlineApiKey).toBe(false)
      expect(JSON.stringify(summary)).not.toContain("sk-")
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  test("stored provider secret is shared across engines", async () => {
    const projectPath = makeFixture(`
version: 1
defaultProvider: custom
credentialPolicy:
  shareAcrossEngines: true
providers:
  custom:
    label: Custom
    mode: custom-url-key
    runtime: any
    baseUrl: https://custom.test/v1
    engines:
      hermes:
        model: moss-custom
      claude-code:
        model: opus-custom
      codex:
        model: gpt-custom/high
        authMethod: openai-api-key
      custom-acp:
        model: custom-acp-custom
`)

    try {
      const secretResolver = {
        getSecret: async (providerId: string) => ({
          apiKey: providerId === "custom" ? "sk-stored-secret" : undefined,
        }),
      }

      const hermes = await resolveMossProviderForEngine({
        projectPath,
        engineId: "hermes",
        secretResolver,
      })
      expect(hermes.status).toBe("resolved")
      expect(hermes.apiKeySource).toBe("stored")
      expect(hermes.baseUrlSource).toBe("inline")
      expect(hermes.hasStoredApiKey).toBe(true)
      expect(hermes.env.HERMES_API_KEY).toBe("sk-stored-secret")
      expect(hermes.env.HERMES_BASE_URL).toBe("https://custom.test/v1")

      const claude = await resolveMossProviderForEngine({
        projectPath,
        engineId: "claude-code",
        secretResolver,
      })
      expect(claude.status).toBe("resolved")
      expect(claude.apiKeySource).toBe("stored")
      expect(claude.baseUrlSource).toBe("inline")
      expect(claude.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-stored-secret")
      expect(claude.env.ANTHROPIC_BASE_URL).toBe("https://custom.test/v1")

      const codex = await resolveMossProviderForEngine({
        projectPath,
        engineId: "codex",
        secretResolver,
      })
      expect(codex.status).toBe("resolved")
      expect(codex.apiKeySource).toBe("stored")
      expect(codex.baseUrlSource).toBe("inline")
      expect(codex.env.OPENAI_API_KEY).toBe("sk-stored-secret")
      expect(codex.env.CODEX_API_KEY).toBeUndefined()
      expect(codex.env.OPENAI_BASE_URL).toBe("https://custom.test/v1")

      const customAcp = await resolveMossProviderForEngine({
        projectPath,
        engineId: "custom-acp",
        secretResolver,
      })
      expect(customAcp.status).toBe("resolved")
      expect(customAcp.apiKeySource).toBe("stored")
      expect(customAcp.baseUrlSource).toBe("inline")
      expect(customAcp.env.MOSS_CUSTOM_ACP_API_KEY).toBe("sk-stored-secret")
      expect(customAcp.env.MOSS_CUSTOM_ACP_BASE_URL).toBe("https://custom.test/v1")
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  test("reports missing and parse-error provider sources", async () => {
    const missingProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), "moss-provider-missing-"))
    try {
      const missing = await resolveMossProviderForEngine({
        projectPath: missingProjectPath,
        engineId: "codex",
      })
      expect(missing.status).toBe("missing")
    } finally {
      fs.rmSync(missingProjectPath, { recursive: true, force: true })
    }

    const invalidProjectPath = makeFixture("providers: [")
    try {
      const invalid = await resolveMossProviderForEngine({
        projectPath: invalidProjectPath,
        engineId: "claude-code",
      })
      expect(invalid.status).toBe("parse-error")
      expect(invalid.error).toBeTruthy()
    } finally {
      fs.rmSync(invalidProjectPath, { recursive: true, force: true })
    }
  })

  test("bootstraps default unified provider source when requested", async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "moss-provider-bootstrap-"))
    try {
      const plainRead = await readMossProviderConfig(projectPath)
      expect(plainRead.status).toBe("missing")

      const hermes = await resolveMossProviderForEngine({
        projectPath,
        engineId: "hermes",
        createIfMissing: true,
      })
      expect(hermes.status).toBe("resolved")
      expect(hermes.providerId).toBe("moss")
      expect(hermes.mode).toBe("bundled-quota")
      expect(hermes.model).toBe("moss-default")
      expect(hermes.env.HERMES_MODEL).toBe("moss-default")
      expect(hermes.env.HERMES_INFERENCE_MODEL).toBe("moss-default")
      expect(hermes.warnings).toEqual([])

      const codex = await resolveMossProviderForEngine({
        projectPath,
        engineId: "codex",
      })
      expect(codex.status).toBe("resolved")
      expect(codex.providerId).toBe("moss")
      expect(codex.model).toBe("gpt-5.5/medium")
      expect(codex.env.CODEX_MODEL).toBe("gpt-5.5/medium")

      const claude = await resolveMossProviderForEngine({
        projectPath,
        engineId: "claude-code",
      })
      expect(claude.status).toBe("resolved")
      expect(claude.providerId).toBe("moss")
      expect(claude.model).toBe("opus")
      expect(claude.env.ANTHROPIC_MODEL).toBe("opus")

      const customAcp = await resolveMossProviderForEngine({
        projectPath,
        engineId: "custom-acp",
      })
      expect(customAcp.status).toBe("resolved")
      expect(customAcp.providerId).toBe("moss")
      expect(customAcp.model).toBe("custom-acp")
      expect(customAcp.env.MOSS_CUSTOM_ACP_MODEL).toBe("custom-acp")

      expect(
        fs.existsSync(path.join(projectPath, ".moss", "providers.yaml")),
      ).toBe(true)
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })
})
