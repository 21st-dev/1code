import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  LEGACY_OPENAI_API_KEY_STORAGE_KEY,
  OPENAI_TRANSCRIPTION_BASE_URL,
  OPENAI_TRANSCRIPTION_MODEL,
} from "../src/shared/voice-transcription-api-key"

describe("legacy voice API key cleanup", () => {
  test("cleans the legacy renderer key without reading or persisting it", () => {
    // The legacy migrations live in a dedicated hook, out of the routing path.
    const migrationsSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/features/onboarding/lib/use-legacy-migrations.ts",
      ),
      "utf-8",
    )
    const voiceEffectMarker = "voiceKeyAttemptedRef.current = true"
    const voiceEffectStart = migrationsSource.lastIndexOf(
      "useEffect(() =>",
      migrationsSource.indexOf(voiceEffectMarker),
    )
    const voiceEffectEnd = migrationsSource.indexOf(
      "// Legacy renderer-stored custom Claude provider token",
      voiceEffectStart,
    )
    const voiceEffectSource = migrationsSource.slice(
      voiceEffectStart,
      voiceEffectEnd,
    )

    expect(LEGACY_OPENAI_API_KEY_STORAGE_KEY).toBe("agents:openai-api-key")
    expect(OPENAI_TRANSCRIPTION_MODEL).toBe("whisper-1")
    expect(OPENAI_TRANSCRIPTION_BASE_URL).toBe("https://api.openai.com/v1")
    expect(voiceEffectSource).toContain("LEGACY_OPENAI_API_KEY_STORAGE_KEY")
    expect(voiceEffectSource).toContain("window.localStorage.removeItem")
    expect(voiceEffectSource).not.toContain("window.localStorage.getItem")
    expect(migrationsSource).not.toContain("normalizeLegacyOpenAIApiKey")
    expect(migrationsSource).not.toContain('purpose: "voice_transcription"')
    expect(migrationsSource).not.toContain("OPENAI_TRANSCRIPTION_MODEL")
    expect(migrationsSource).not.toContain("OPENAI_TRANSCRIPTION_BASE_URL")
    expect(migrationsSource).not.toContain(
      "trpc.localApiProviderConfig.save.useMutation",
    )
    expect(migrationsSource).not.toContain("trpc.voice.setOpenAIKey")
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
    expect(atomsSource).not.toContain("normalizeLegacyOpenAIApiKey")
    expect(modelsTabSource).not.toContain("openaiApiKeyAtom")
    expect(modelsTabSource).not.toContain("trpc.voice.setOpenAIKey")
    expect(modelsTabSource).not.toContain("settings.models.openaiApiKey")
    expect(modelsTabSource).toContain('purpose="voice_transcription"')
    expect(modelsTabSource).toContain("OPENAI_TRANSCRIPTION_MODEL")
    expect(modelsTabSource).toContain("OPENAI_TRANSCRIPTION_BASE_URL")
  })
})
