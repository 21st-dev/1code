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

  test("send button stops hold-to-talk on mouseup instead of waiting for click state", () => {
    const buttonSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/features/agents/components/agent-send-button.tsx",
      ),
      "utf-8",
    )

    expect(buttonSource).toContain("voicePointerStartedRef")
    expect(buttonSource).toContain("voiceStopRequestedRef")
    expect(buttonSource).toContain("const handleMouseUp = () =>")
    expect(buttonSource).toContain("onVoiceMouseUp()")
    expect(buttonSource).not.toContain(
      "Click-to-toggle is handled in handleButtonClick",
    )
  })

  test("chat input flows stop pending voice starts without relying only on React recording state", () => {
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

    for (const source of [chatInputSource, newChatSource]) {
      expect(source).toContain("voiceStartRequestedRef")
      expect(source).toContain("voiceStopInFlightRef")
      expect(source).toContain(
        "voiceStartRequestedRef.current || isVoiceRecording",
      )
      expect(source).not.toMatch(
        /const handleVoiceMouseUp[\s\S]{0,240}if \(!isVoiceRecording\) return/,
      )
    }
  })
})
