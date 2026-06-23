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
import { getKunCliSettingsPath } from "../src/main/lib/kun/kun-cli-settings"
import {
  resolveKunCliSetupStatus,
  saveKunConfigPathOverride,
  saveKunExecutablePathOverride,
} from "../src/main/lib/kun/kun-cli-status"

const tempRoots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "locus-kun-cli-"))
  tempRoots.push(root)
  return root
}

function executableFile(root: string, name = "kun"): string {
  const filePath = join(root, name)
  writeFileSync(filePath, "#!/bin/sh\necho kun\n", "utf8")
  chmodSync(filePath, 0o755)
  return filePath
}

function kunWithoutVersionFile(root: string): string {
  const filePath = join(root, "kun")
  writeFileSync(
    filePath,
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"help\" ]; then",
      "  echo 'kun <command> [options]'",
      "  exit 0",
      "fi",
      "echo 'kun serve: invalid serve options' >&2",
      "exit 78",
      "",
    ].join("\n"),
    "utf8",
  )
  chmodSync(filePath, 0o755)
  return filePath
}

function configFile(root: string, name = "config.json"): string {
  const filePath = join(root, name)
  writeFileSync(
    filePath,
    JSON.stringify({
      models: [
        {
          provider: "fake",
          baseUrl: "http://127.0.0.1:12345/v1",
          apiKey: "sk-provider-secret-value-123456",
          endpointFormat: "responses",
        },
      ],
    }),
    "utf8",
  )
  return filePath
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("Kun CLI setup status", () => {
  test("reports disabled and ignores cwd-controlled PATH shadowing", async () => {
    const projectRoot = tempRoot()
    executableFile(projectRoot)

    const disabled = await resolveKunCliSetupStatus({
      enabled: false,
      ignoreSavedOverride: true,
      env: { PATH: projectRoot },
    })
    expect(disabled.status).toMatchObject({
      ok: false,
      availability: "disabled",
      blocker: { code: "kun-runtime-disabled" },
    })

    const shadowed = await resolveKunCliSetupStatus({
      cwd: projectRoot,
      env: {
        PATH: `${projectRoot}${delimiter}.${delimiter}`,
      },
      ignoreSavedOverride: true,
      probeVersion: async () => {
        throw new Error("should not probe cwd shadow")
      },
    })
    expect(shadowed.executablePath).toBeNull()
    expect(shadowed.status).toMatchObject({
      ok: false,
      availability: "missing",
      source: "unresolved",
      blocker: { code: "kun-cli-missing" },
    })
  })

  test("ignores PATH symlinks into the active cwd", async () => {
    const projectRoot = tempRoot()
    const trustedPathDir = tempRoot()
    const projectKun = executableFile(projectRoot)
    symlinkSync(projectKun, join(trustedPathDir, "kun"))

    const resolved = await resolveKunCliSetupStatus({
      cwd: projectRoot,
      env: { PATH: trustedPathDir },
      ignoreSavedOverride: true,
      probeVersion: async () => ({
        ok: true,
        value: "kun 1.0.0",
        error: null,
      }),
    })

    expect(resolved.executablePath).toBeNull()
    expect(resolved.status).toMatchObject({
      ok: false,
      availability: "missing",
      source: "unresolved",
      blocker: { code: "kun-cli-missing" },
    })
  })

  test("saves valid absolute executable and config overrides without leaking secret-like text", async () => {
    const userDataPath = tempRoot()
    const installRoot = tempRoot()
    const overridePath = executableFile(installRoot)
    const configPath = configFile(installRoot)

    const saved = await saveKunExecutablePathOverride(overridePath, {
      userDataPath,
      probeVersion: async (filePath) => ({
        ok: true,
        value: `kun version from ${filePath}`,
        error: null,
      }),
    })

    expect(saved.executablePath).toBe(overridePath)
    expect(saved.status).toMatchObject({
      ok: false,
      availability: "config-missing",
      source: "override",
      executable: { path: overridePath },
      blocker: { code: "kun-config-missing" },
    })

    const configured = await saveKunConfigPathOverride(configPath, {
      userDataPath,
      probeVersion: async (filePath) => ({
        ok: true,
        value: `kun version from ${filePath}`,
        error: null,
      }),
    })

    expect(configured.executablePath).toBe(overridePath)
    expect(configured.configPath).toBe(configPath)
    expect(configured.status).toMatchObject({
      ok: true,
      availability: "available",
      source: "override",
      executable: { path: overridePath },
      config: { path: configPath, ok: true },
    })

    const settingsPath = getKunCliSettingsPath({ userDataPath })
    expect(existsSync(settingsPath)).toBe(true)
    const settings = readFileSync(settingsPath, "utf8")
    expect(settings).toContain(overridePath)
    expect(settings).toContain(configPath)
    expect(settings).not.toMatch(/API_KEY|access_token|sk-[A-Za-z0-9_-]{20,}/)
  })

  test("falls back to help when the Kun binary does not expose --version", async () => {
    const installRoot = tempRoot()
    const overridePath = kunWithoutVersionFile(installRoot)
    const configPath = configFile(installRoot)

    const resolved = await resolveKunCliSetupStatus({
      overridePath,
      configPathOverride: configPath,
      ignoreSavedOverride: true,
    })

    expect(resolved.executablePath).toBe(overridePath)
    expect(resolved.status).toMatchObject({
      ok: true,
      availability: "available",
      source: "override",
      version: {
        ok: true,
        value: "Kun CLI detected (version unavailable)",
        error: null,
      },
    })
  })

  test("rejects unsafe override strings before probing", async () => {
    const unsafeInputs = [
      "kun",
      "/usr/local/bin/kun; echo pwned",
      "/tmp/sk-provider-secret-value-123456/kun",
    ]

    for (const executablePath of unsafeInputs) {
      const resolved = await resolveKunCliSetupStatus({
        overridePath: executablePath,
        ignoreSavedOverride: true,
        probeVersion: async () => {
          throw new Error("unsafe override should not be probed")
        },
      })

      expect(resolved.executablePath).toBeNull()
      expect(resolved.status.ok).toBe(false)
      expect(resolved.status.availability).toBe("invalid-path")
      expect(resolved.status.blocker?.code).toBe("kun-cli-invalid-path")
    }
  })
})
