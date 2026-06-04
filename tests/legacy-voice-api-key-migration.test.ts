import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
  OPENAI_TRANSCRIPTION_BASE_URL,
  OPENAI_TRANSCRIPTION_MODEL,
  normalizeLegacyOpenAIApiKey,
} from "../src/shared/voice-transcription-api-key"

describe("legacy voice API key migration", () => {
  test("normalizes raw and atomWithStorage JSON string API keys", () => {
    expect(normalizeLegacyOpenAIApiKey("sk-legacy")).toBe("sk-legacy")
    expect(normalizeLegacyOpenAIApiKey("\"sk-json-legacy\"")).toBe(
      "sk-json-legacy",
    )
    expect(normalizeLegacyOpenAIApiKey("not-a-key")).toBeNull()
    expect(normalizeLegacyOpenAIApiKey("sk-key with-space")).toBeNull()
  })

  test("migrates legacy renderer key into voice transcription helper config", () => {
    const appSource = readFileSync(
      join(process.cwd(), "src/renderer/App.tsx"),
      "utf-8",
    )

    expect(LEGACY_OPENAI_API_KEY_STORAGE_KEY).toBe("agents:openai-api-key")
    expect(OPENAI_TRANSCRIPTION_MODEL).toBe("whisper-1")
    expect(OPENAI_TRANSCRIPTION_BASE_URL).toBe("https://api.openai.com/v1")
    expect(appSource).toContain("LEGACY_OPENAI_API_KEY_STORAGE_KEY")
    expect(appSource).toContain("normalizeLegacyOpenAIApiKey")
    expect(appSource).toContain("window.localStorage.removeItem")
    expect(appSource).toContain('purpose: "voice_transcription"')
    expect(appSource).toContain("OPENAI_TRANSCRIPTION_MODEL")
    expect(appSource).toContain("OPENAI_TRANSCRIPTION_BASE_URL")
    expect(appSource).toContain("trpc.localApiProviderConfig.save.useMutation")
    expect(appSource).not.toContain("trpc.voice.setOpenAIKey")
  })

  test("settings and atoms no longer persist voice API keys in renderer storage", () => {
    const atomsSource = readFileSync(
      join(process.cwd(), "src/renderer/lib/atoms/index.ts"),
      "utf-8",
    )
    const modelsTabSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
      ),
      "utf-8",
    )

    expect(atomsSource).not.toContain("openaiApiKeyAtom")
    expect(modelsTabSource).not.toContain("openaiApiKeyAtom")
    expect(modelsTabSource).not.toContain("trpc.voice.setOpenAIKey")
    expect(modelsTabSource).not.toContain("settings.models.openaiApiKey")
    expect(modelsTabSource).toContain('purpose="voice_transcription"')
    expect(modelsTabSource).toContain("OPENAI_TRANSCRIPTION_MODEL")
    expect(modelsTabSource).toContain("OPENAI_TRANSCRIPTION_BASE_URL")
  })
})
