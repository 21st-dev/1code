import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("voice recording interaction hardening", () => {
  test("recording hook lets stop wait for an in-flight start", () => {
    const hookSource = readFileSync(
      join(process.cwd(), "src/renderer/lib/hooks/use-voice-recording.ts"),
      "utf-8",
    )

    expect(hookSource).toContain("startPromiseRef")
    expect(hookSource).toContain("cancelRequestedRef")
    expect(hookSource).toContain("await startPromiseRef.current")
  })

  test("voice control stops hold-to-talk on mouseup instead of waiting for click state", () => {
    const controlSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/lib/voice/voice-input-control.tsx",
      ),
      "utf-8",
    )

    expect(controlSource).toContain("pointerStartedRef")
    expect(controlSource).toContain("stopRequestedRef")
    expect(controlSource).toContain("const handleStop = () =>")
    expect(controlSource).toContain("onStop()")
    expect(controlSource).not.toContain(
      "Click-to-toggle is handled in handleButtonClick",
    )
  })

  test("shared voice input hook stops pending voice starts without relying only on React recording state", () => {
    const hookSource = readFileSync(
      join(process.cwd(), "src/renderer/lib/hooks/use-voice-input.ts"),
      "utf-8",
    )
    const chatInputSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/features/agents/main/chat-input-area.tsx",
      ),
      "utf-8",
    )
    const newChatSource = readFileSync(
      join(process.cwd(), "src/renderer/features/agents/main/new-chat-form.tsx"),
      "utf-8",
    )

    expect(hookSource).toContain("startRequestedRef")
    expect(hookSource).toContain("stopInFlightRef")
    expect(hookSource).toContain(
      "startRequestedRef.current || isRecording",
    )
    expect(hookSource).not.toMatch(
      /const stop[\s\S]{0,280}if \(!isRecording\) return/,
    )

    for (const source of [chatInputSource, newChatSource]) {
      expect(source).toContain("useVoiceInput(")
      expect(source).toContain("useVoiceInputHotkey(")
      expect(source).toContain("<VoiceInputControl")
      expect(source).not.toContain("voiceStopInFlightRef")
    }
  })
})
