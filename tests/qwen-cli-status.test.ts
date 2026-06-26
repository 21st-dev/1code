import { afterEach, describe, expect, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { getQwenCliSettingsPath } from "../src/main/lib/qwen/qwen-cli-settings"
import {
  resetQwenExecutablePathOverride,
  resolveQwenCliSetupStatus,
  saveQwenExecutablePathOverride,
} from "../src/main/lib/qwen/qwen-cli-status"

const tempRoots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "locus-qwen-cli-"))
  tempRoots.push(root)
  return root
}

function executableFile(root: string, name = "qwen"): string {
  const filePath = join(root, name)
  writeFileSync(filePath, "#!/bin/sh\necho qwen\n", "utf8")
  chmodSync(filePath, 0o755)
  return filePath
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("Qwen CLI setup status", () => {
  test("returns disabled status without probing when Qwen runtime is off", async () => {
    let probeCount = 0

    const resolved = await resolveQwenCliSetupStatus({
      enabled: false,
      probeVersion: async () => {
        probeCount += 1
        return { ok: true, value: "qwen 0.18.5", error: null }
      },
    })

    expect(resolved.executablePath).toBeNull()
    expect(resolved.status).toMatchObject({
      ok: false,
      availability: "disabled",
      blocker: {
        code: "qwen-runtime-disabled",
        message:
          "Qwen Code runtime is disabled. Enable it in Settings to configure Qwen setup.",
      },
    })
    expect(probeCount).toBe(0)
  })

  test("reports missing CLI and ignores cwd-controlled PATH shadowing", async () => {
    const projectRoot = tempRoot()
    executableFile(projectRoot)
    let probeCount = 0

    const resolved = await resolveQwenCliSetupStatus({
      cwd: projectRoot,
      env: {
        PATH: `${projectRoot}${delimiter}.${delimiter}`,
      },
      ignoreSavedOverride: true,
      probeVersion: async () => {
        probeCount += 1
        return { ok: true, value: "qwen 0.18.5", error: null }
      },
    })

    expect(resolved.executablePath).toBeNull()
    expect(resolved.status).toMatchObject({
      ok: false,
      availability: "missing",
      source: "unresolved",
      blocker: {
        component: "qwen-cli",
        code: "qwen-cli-missing",
      },
    })
    expect(probeCount).toBe(0)
  })

  test("ignores PATH candidates that symlink back into the active cwd", async () => {
    const projectRoot = tempRoot()
    const trustedPathDir = tempRoot()
    const projectQwen = executableFile(projectRoot)
    symlinkSync(projectQwen, join(trustedPathDir, "qwen"))
    let probeCount = 0

    const resolved = await resolveQwenCliSetupStatus({
      cwd: projectRoot,
      env: { PATH: trustedPathDir },
      ignoreSavedOverride: true,
      probeVersion: async () => {
        probeCount += 1
        return { ok: true, value: "qwen 0.18.5", error: null }
      },
    })

    expect(resolved.executablePath).toBeNull()
    expect(resolved.status).toMatchObject({
      ok: false,
      availability: "missing",
      source: "unresolved",
      blocker: { code: "qwen-cli-missing" },
    })
    expect(probeCount).toBe(0)
  })

  test("saves a valid absolute override and uses it before PATH discovery", async () => {
    const userDataPath = tempRoot()
    const installRoot = tempRoot()
    const pathRoot = tempRoot()
    const overridePath = executableFile(installRoot)
    const pathQwen = executableFile(pathRoot)

    const saved = await saveQwenExecutablePathOverride(overridePath, {
      userDataPath,
      env: { PATH: pathRoot },
      probeVersion: async (filePath) => ({
        ok: true,
        value: `qwen version from ${filePath}`,
        error: null,
      }),
    })

    expect(saved.executablePath).toBe(overridePath)
    expect(saved.status).toMatchObject({
      ok: true,
      availability: "available",
      source: "override",
      executable: {
        path: overridePath,
      },
    })
    expect(saved.status.version.value).toContain(overridePath)
    expect(saved.status.version.value).not.toContain(pathQwen)

    const settingsPath = getQwenCliSettingsPath({ userDataPath })
    expect(existsSync(settingsPath)).toBe(true)
    const settings = readFileSync(settingsPath, "utf8")
    expect(settings).toContain(overridePath)
    expect(settings).not.toMatch(/API_KEY|access_token|sk-[A-Za-z0-9_-]{20,}/)
  })

  test("rejects invalid overrides without changing the saved executable", async () => {
    const userDataPath = tempRoot()
    const installRoot = tempRoot()
    const validPath = executableFile(installRoot)
    const nonExecutablePath = join(installRoot, "qwen-not-executable")
    writeFileSync(nonExecutablePath, "#!/bin/sh\necho no\n", "utf8")

    await saveQwenExecutablePathOverride(validPath, {
      userDataPath,
      probeVersion: async () => ({
        ok: true,
        value: "qwen 0.18.5",
        error: null,
      }),
    })

    const relative = await saveQwenExecutablePathOverride("qwen --acp", {
      userDataPath,
    })
    expect(relative.status).toMatchObject({
      ok: false,
      availability: "invalid-path",
      blocker: { code: "qwen-cli-invalid-path" },
    })

    const commandString = await saveQwenExecutablePathOverride(
      `${installRoot}/qwen; rm -rf /`,
      { userDataPath },
    )
    expect(commandString.status).toMatchObject({
      ok: false,
      availability: "invalid-path",
      blocker: { code: "qwen-cli-invalid-path" },
    })

    const nonExecutable = await saveQwenExecutablePathOverride(
      nonExecutablePath,
      { userDataPath },
    )
    expect(nonExecutable.status).toMatchObject({
      ok: false,
      availability: "non-executable",
      blocker: { code: "qwen-cli-not-executable" },
    })

    const afterRejectedUpdates = await resolveQwenCliSetupStatus({
      userDataPath,
      probeVersion: async () => ({
        ok: true,
        value: "qwen 0.18.5",
        error: null,
      }),
    })
    expect(afterRejectedUpdates.executablePath).toBe(validPath)
  })

  test("treats version probe failure as spawnable but degraded status", async () => {
    const installRoot = tempRoot()
    const qwenPath = executableFile(installRoot)

    const resolved = await resolveQwenCliSetupStatus({
      overridePath: qwenPath,
      ignoreSavedOverride: true,
      probeVersion: async () => ({
        ok: false,
        value: null,
        error: "failed with sk-abcdefghijklmnopqrstuvwxyz123456",
      }),
    })

    expect(resolved.executablePath).toBe(qwenPath)
    expect(resolved.status).toMatchObject({
      ok: true,
      availability: "version-probe-failed",
      source: "override",
      blocker: null,
    })
    expect(resolved.status.version.error).toContain("<redacted>")
    expect(resolved.status.version.error).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz",
    )
  })

  test("reset removes the saved override and returns to PATH auto-detection", async () => {
    const userDataPath = tempRoot()
    const installRoot = tempRoot()
    const pathRoot = tempRoot()
    const overridePath = executableFile(installRoot)
    const pathQwen = executableFile(pathRoot)

    await saveQwenExecutablePathOverride(overridePath, {
      userDataPath,
      probeVersion: async () => ({
        ok: true,
        value: "qwen override",
        error: null,
      }),
    })
    const reset = await resetQwenExecutablePathOverride({
      userDataPath,
      env: { PATH: pathRoot },
      probeVersion: async (filePath) => ({
        ok: true,
        value: `qwen from ${filePath}`,
        error: null,
      }),
    })

    expect(reset.executablePath).toBe(pathQwen)
    expect(reset.status.source).toBe("path")
    expect(
      readFileSync(getQwenCliSettingsPath({ userDataPath }), "utf8"),
    ).toContain('"executablePath": null')
  })

  test("summarizes Qwen settings without exposing provider secrets", async () => {
    const installRoot = tempRoot()
    const qwenSettingsDir = tempRoot()
    const qwenPath = executableFile(installRoot)
    writeFileSync(
      join(qwenSettingsDir, ".env"),
      "OPENAI_API_KEY=sk-env-secret-value\n",
      "utf8",
    )
    writeFileSync(
      join(qwenSettingsDir, "settings.json"),
      JSON.stringify({
        env: {
          OPENAI_API_KEY: "sk-settings-secret-value",
          CUSTOM_GATEWAY_TOKEN: "secret-token-value",
        },
        security: {
          auth: {
            selectedType: "openai",
          },
        },
        model: {
          name: "qwen3-coder-plus",
        },
        modelProviders: {
          openai: {
            protocol: "openai",
            models: [
              {
                id: "qwen3-coder-plus",
                name: "Qwen3 Coder Plus",
                envKey: "OPENAI_API_KEY",
                baseUrl:
                  "https://user:password@example.test/v1?api_key=secret",
              },
            ],
          },
        },
      }),
      "utf8",
    )

    const resolved = await resolveQwenCliSetupStatus({
      overridePath: qwenPath,
      ignoreSavedOverride: true,
      qwenSettingsDir,
      probeVersion: async () => ({
        ok: true,
        value: "qwen 0.18.5",
        error: null,
      }),
    })

    expect(resolved.status.configuration).toMatchObject({
      state: "configured",
      settingsFilePresent: true,
      envFilePresent: true,
      selectedAuthType: "openai",
      selectedModel: "qwen3-coder-plus",
      envKeysInSettings: ["OPENAI_API_KEY", "CUSTOM_GATEWAY_TOKEN"],
      providers: [
        {
          authType: "openai",
          protocol: "openai",
          modelCount: 1,
          models: [
            {
              id: "qwen3-coder-plus",
              name: "Qwen3 Coder Plus",
              envKey: "OPENAI_API_KEY",
              baseUrlOrigin: "https://example.test",
            },
          ],
        },
      ],
    })
    const rendererPayload = JSON.stringify(resolved.status)
    expect(rendererPayload).not.toContain("sk-env-secret-value")
    expect(rendererPayload).not.toContain("sk-settings-secret-value")
    expect(rendererPayload).not.toContain("secret-token-value")
    expect(rendererPayload).not.toContain("user:password")
    expect(rendererPayload).not.toContain("api_key=secret")
  })

  test("reports missing or invalid Qwen settings as configuration state only", async () => {
    const installRoot = tempRoot()
    const missingSettingsDir = tempRoot()
    const invalidSettingsDir = tempRoot()
    const qwenPath = executableFile(installRoot)
    const noPrefixSecret = "plainSecret_ABCDEF123456"
    const prefixedSecret = "sk-abcdefghijklmnopqrstuvwxyz123456"
    writeFileSync(
      join(invalidSettingsDir, "settings.json"),
      `{"token":"${noPrefixSecret}","apiKey":"${prefixedSecret}",`,
      "utf8",
    )

    const missing = await resolveQwenCliSetupStatus({
      overridePath: qwenPath,
      ignoreSavedOverride: true,
      qwenSettingsDir: missingSettingsDir,
      probeVersion: async () => ({
        ok: true,
        value: "qwen 0.18.5",
        error: null,
      }),
    })
    expect(missing.status.ok).toBe(true)
    expect(missing.status.configuration).toMatchObject({
      state: "missing",
      settingsFilePresent: false,
      parseError: null,
    })

    const invalid = await resolveQwenCliSetupStatus({
      overridePath: qwenPath,
      ignoreSavedOverride: true,
      qwenSettingsDir: invalidSettingsDir,
      probeVersion: async () => ({
        ok: true,
        value: "qwen 0.18.5",
        error: null,
      }),
    })
    expect(invalid.status.ok).toBe(true)
    expect(invalid.status.configuration.state).toBe("invalid")
    expect(invalid.status.configuration.settingsFilePresent).toBe(true)
    expect(invalid.status.configuration.parseError).toBeTruthy()
    expect(invalid.status.configuration.parseError).toContain(
      "Qwen settings.json is not valid JSON",
    )
    expect(invalid.status.configuration.parseError).not.toContain(
      noPrefixSecret,
    )
    expect(invalid.status.configuration.parseError).not.toContain(
      prefixedSecret,
    )
  })

  test("does not read Qwen settings when the runtime gate is disabled", async () => {
    const qwenSettingsDir = tempRoot()
    writeFileSync(join(qwenSettingsDir, ".env"), "OPENAI_API_KEY=sk-env\n")
    writeFileSync(join(qwenSettingsDir, "settings.json"), "{", "utf8")

    const disabled = await resolveQwenCliSetupStatus({
      enabled: false,
      qwenSettingsDir,
      probeVersion: async () => {
        throw new Error("version probe should not run")
      },
    })

    expect(disabled.status.configuration).toMatchObject({
      state: "disabled",
      settingsFilePresent: false,
      envFilePresent: false,
      parseError: null,
    })
  })
})
