import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  readOpenCodexBackendConfig,
  saveOpenCodexBackendConfig,
} from "./backend-config"

let tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe("OpenCodex backend config persistence", () => {
  test("round-trips the canonical route union and trims api-backed fields", () => {
    const userDataPath = mkdtempSync(join(process.cwd(), "tmp-opencodex-backend-config-"))
    tempDirs.push(userDataPath)

    const saved = saveOpenCodexBackendConfig({
      userDataPath,
      config: {
        kind: "custom-endpoint",
        authSource: "api-key",
        providerFamily: "anthropic-compatible",
        baseUrl: " https://proxy.example.com ",
        model: " claude-sonnet-4-6 ",
        apiKey: " sk-ant-123456789012345678901 ",
      },
    })

    expect(saved).toEqual({
      kind: "custom-endpoint",
      authSource: "api-key",
      providerFamily: "anthropic-compatible",
      baseUrl: "https://proxy.example.com",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-123456789012345678901",
    })
    expect(readOpenCodexBackendConfig({ userDataPath })).toEqual(saved)
  })

  test("migrates the legacy narrow config file into the canonical openai-compatible api route", () => {
    const userDataPath = mkdtempSync(join(process.cwd(), "tmp-opencodex-backend-config-"))
    tempDirs.push(userDataPath)

    const configPath = join(userDataPath, "opencodex", "state", "backend-config.json")
    rmSync(join(userDataPath, "opencodex"), { recursive: true, force: true })
    mkdirSync(join(userDataPath, "opencodex", "state"), { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({
        providerFamily: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.2",
        apiKey: "sk-legacy-openai",
      }, null, 2),
      "utf8",
    )

    expect(readOpenCodexBackendConfig({ userDataPath })).toEqual({
      kind: "openai-compatible-api",
      authSource: "api-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.2",
      apiKey: "sk-legacy-openai",
    })
  })

  test("rejects invalid backend route payloads instead of accepting degraded config", () => {
    const userDataPath = mkdtempSync(join(process.cwd(), "tmp-opencodex-backend-config-"))
    tempDirs.push(userDataPath)

    const configPath = join(userDataPath, "opencodex", "state", "backend-config.json")
    rmSync(join(userDataPath, "opencodex"), { recursive: true, force: true })
    mkdirSync(join(userDataPath, "opencodex", "state"), { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({
        kind: "anthropic-compatible-api",
        authSource: "api-key",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-6",
        apiKey: "sk-invalid",
      }, null, 2),
      "utf8",
    )

    expect(readOpenCodexBackendConfig({ userDataPath })).toBeNull()
  })
})