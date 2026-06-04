import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("reusable voice input boundaries", () => {
  test("agent send button no longer owns voice input behavior", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/renderer/features/agents/components/agent-send-button.tsx",
      ),
      "utf-8",
    )

    expect(source).not.toContain("showVoiceInput")
    expect(source).not.toContain("onVoiceMouseDown")
    expect(source).not.toContain("MicrophoneIcon")
  })

  test("voice input hook is transport-agnostic and editor-agnostic", () => {
    const source = readFileSync(
      join(process.cwd(), "src/renderer/lib/hooks/use-voice-input.ts"),
      "utf-8",
    )

    expect(source).toContain("transcribeAudio")
    expect(source).toContain("onText")
    expect(source).toContain("blobToBase64")
    expect(source).not.toContain("trpc.voice")
    expect(source).not.toContain("editorRef")
    expect(source).not.toContain("OPENAI_API_KEY")
  })

  test("voice control delegates actions instead of knowing chat state", () => {
    const source = readFileSync(
      join(process.cwd(), "src/renderer/lib/voice/voice-input-control.tsx"),
      "utf-8",
    )

    expect(source).toContain("onStart")
    expect(source).toContain("onStop")
    expect(source).toContain("onCancel")
    expect(source).not.toContain("trpc.voice")
    expect(source).not.toContain("editorRef")
  })
})
