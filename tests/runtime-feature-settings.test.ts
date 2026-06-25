import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  clearRuntimeFeatureSettingsCacheForTest,
  getRuntimeFeatureSettingsSnapshot,
  readRuntimeFeatureSettings,
  setKunRuntimeEnabled,
  setQwenRuntimeEnabled,
} from "../src/main/lib/agent-runtime/runtime-feature-settings"

let tempDir: string | null = null

function settingsPath() {
  tempDir = mkdtempSync(join(tmpdir(), "locus-runtime-features-"))
  return join(tempDir, "runtime-feature-settings.json")
}

afterEach(() => {
  clearRuntimeFeatureSettingsCacheForTest()
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("runtime feature settings", () => {
  test("defaults Qwen and Kun off and ignores env in packaged product mode", () => {
    const snapshot = getRuntimeFeatureSettingsSnapshot({
      settingsPath: settingsPath(),
      env: {
        LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1",
        LOCUS_ENABLE_KUN_RUNTIME: "1",
      },
      isPackaged: true,
    })

    expect(snapshot.settings.qwenRuntimeEnabled).toBe(false)
    expect(snapshot.resolved.qwenRuntimeEnabled).toBe(false)
    expect(snapshot.settings.kunRuntimeEnabled).toBe(false)
    expect(snapshot.resolved.kunRuntimeEnabled).toBe(false)
    expect(snapshot.mode.allowEnvOverride).toBe(false)
  })

  test("honors env only for unpackaged dev or test mode", () => {
    const snapshot = getRuntimeFeatureSettingsSnapshot({
      settingsPath: settingsPath(),
      env: {
        LOCUS_ENABLE_QWEN_CODE_RUNTIME: "1",
        LOCUS_ENABLE_KUN_RUNTIME: "1",
      },
      isPackaged: false,
    })

    expect(snapshot.settings.qwenRuntimeEnabled).toBe(false)
    expect(snapshot.resolved.qwenRuntimeEnabled).toBe(true)
    expect(snapshot.settings.kunRuntimeEnabled).toBe(false)
    expect(snapshot.resolved.kunRuntimeEnabled).toBe(true)
    expect(snapshot.mode.allowEnvOverride).toBe(true)
  })

  test("persists the explicit Qwen setting", () => {
    const path = settingsPath()
    const snapshot = setQwenRuntimeEnabled(true, {
      settingsPath: path,
      env: {},
      isPackaged: true,
    })

    expect(snapshot.settings.qwenRuntimeEnabled).toBe(true)
    expect(snapshot.resolved.qwenRuntimeEnabled).toBe(true)
    expect(readRuntimeFeatureSettings({ settingsPath: path })).toEqual({
      qwenRuntimeEnabled: true,
      kunRuntimeEnabled: false,
    })
  })

  test("persists the explicit Kun setting", () => {
    const path = settingsPath()
    const snapshot = setKunRuntimeEnabled(true, {
      settingsPath: path,
      env: {},
      isPackaged: true,
    })

    expect(snapshot.settings.kunRuntimeEnabled).toBe(true)
    expect(snapshot.resolved.kunRuntimeEnabled).toBe(true)
    expect(readRuntimeFeatureSettings({ settingsPath: path })).toEqual({
      qwenRuntimeEnabled: false,
      kunRuntimeEnabled: true,
    })
  })
})
