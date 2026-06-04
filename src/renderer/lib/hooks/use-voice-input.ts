import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import {
  blobToBase64,
  getAudioFormat,
  useVoiceRecording,
} from "./use-voice-recording"

export type VoiceTranscriptionInput = {
  audio: string
  format: "webm" | "mp3" | "m4a" | "wav" | "ogg"
}

export type VoiceTranscriptionResult = {
  text?: string | null
}

export type VoiceInputErrorPhase = "start" | "transcribe"

export type UseVoiceInputOptions = {
  disabled?: boolean
  minBlobSize?: number
  transcribeAudio: (
    input: VoiceTranscriptionInput,
  ) => Promise<VoiceTranscriptionResult>
  onText: (text: string) => void
  onError?: (error: unknown, phase: VoiceInputErrorPhase) => void
  onNoSpeech?: () => void
  onShortRecording?: () => void
  logPrefix?: string
}

export function useVoiceInput({
  disabled = false,
  minBlobSize = 1000,
  transcribeAudio,
  onText,
  onError,
  onNoSpeech,
  onShortRecording,
  logPrefix = "[VoiceInput]",
}: UseVoiceInputOptions) {
  const {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording()
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mountedRef = useRef(true)
  const startRequestedRef = useRef(false)
  const stopInFlightRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const start = useCallback(async () => {
    if (
      disabled ||
      isTranscribing ||
      isRecording ||
      startRequestedRef.current ||
      stopInFlightRef.current
    ) {
      return
    }

    startRequestedRef.current = true
    try {
      await startRecording()
    } catch (err) {
      startRequestedRef.current = false
      console.error(`${logPrefix} Failed to start recording:`, err)
      onError?.(err, "start")
    }
  }, [
    disabled,
    isTranscribing,
    isRecording,
    startRecording,
    logPrefix,
    onError,
  ])

  const stop = useCallback(async () => {
    if (
      stopInFlightRef.current ||
      (!startRequestedRef.current && !isRecording)
    ) {
      return
    }

    stopInFlightRef.current = true
    setIsTranscribing(true)

    try {
      const blob = await stopRecording()
      startRequestedRef.current = false

      if (blob.size < minBlobSize) {
        console.log(`${logPrefix} Recording too short, ignoring`)
        onShortRecording?.()
        return
      }

      if (!mountedRef.current) return

      const audio = await blobToBase64(blob)
      const format = getAudioFormat(blob.type)
      const result = await transcribeAudio({ audio, format })

      if (!mountedRef.current) return

      const text = result.text?.trim()
      if (text) {
        onText(text)
      } else {
        onNoSpeech?.()
      }
    } catch (err) {
      console.error(`${logPrefix} Transcription failed:`, err)
      onError?.(err, "transcribe")
    } finally {
      startRequestedRef.current = false
      stopInFlightRef.current = false
      if (mountedRef.current) {
        setIsTranscribing(false)
      }
    }
  }, [
    isRecording,
    stopRecording,
    minBlobSize,
    logPrefix,
    onShortRecording,
    transcribeAudio,
    onText,
    onNoSpeech,
    onError,
  ])

  const cancel = useCallback(() => {
    if (startRequestedRef.current || isRecording) {
      startRequestedRef.current = false
      cancelRecording()
    }
  }, [isRecording, cancelRecording])

  useEffect(() => {
    if (!isRecording) return

    const handleFocusLoss = () => {
      cancel()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) cancel()
    }

    window.addEventListener("blur", handleFocusLoss)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.removeEventListener("blur", handleFocusLoss)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isRecording, cancel])

  return {
    isRecording,
    isTranscribing,
    audioLevel,
    startRequestedRef,
    start,
    stop,
    cancel,
  }
}

type UseVoiceInputHotkeyOptions = {
  hotkey?: string | null
  enabled?: boolean
  isRecording: boolean
  isTranscribing: boolean
  startRequestedRef: MutableRefObject<boolean>
  onStart: () => void
  onStop: () => void
}

export function useVoiceInputHotkey({
  hotkey,
  enabled = true,
  isRecording,
  isTranscribing,
  startRequestedRef,
  onStart,
  onStop,
}: UseVoiceInputHotkeyOptions) {
  useEffect(() => {
    if (!enabled || !hotkey) return

    const parts = hotkey.split("+").map((part) => part.toLowerCase())
    const modifiers = parts.filter((part) =>
      ["cmd", "meta", "ctrl", "opt", "alt", "shift"].includes(part),
    )
    const mainKey = parts.find(
      (part) => !["cmd", "meta", "ctrl", "opt", "alt", "shift"].includes(part),
    )

    const needsCmd = modifiers.includes("cmd") || modifiers.includes("meta")
    const needsShift = modifiers.includes("shift")
    const needsCtrl = modifiers.includes("ctrl")
    const needsAlt = modifiers.includes("alt") || modifiers.includes("opt")
    const isModifierOnlyHotkey = !mainKey

    const modifiersMatch = (event: KeyboardEvent) =>
      event.metaKey === needsCmd &&
      event.shiftKey === needsShift &&
      event.ctrlKey === needsCtrl &&
      event.altKey === needsAlt

    const matchesHotkey = (event: KeyboardEvent) => {
      if (isModifierOnlyHotkey) return modifiersMatch(event)

      const keyMatches =
        event.key.toLowerCase() === mainKey ||
        event.code.toLowerCase() === mainKey ||
        event.code.toLowerCase() === `key${mainKey}` ||
        (mainKey === "space" && event.code === "Space")

      return keyMatches && modifiersMatch(event)
    }

    const isModifierRelease = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      return key === "control" || key === "alt" || key === "meta" || key === "shift"
    }

    const isMainKeyRelease = (event: KeyboardEvent) => {
      if (isModifierOnlyHotkey) return isModifierRelease(event)
      const eventKey = event.key.toLowerCase()
      return (
        eventKey === mainKey ||
        event.code.toLowerCase() === mainKey ||
        event.code.toLowerCase() === `key${mainKey}` ||
        (mainKey === "space" && event.code === "Space")
      )
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesHotkey(event) || event.repeat) return

      event.preventDefault()
      event.stopPropagation()

      if (!isRecording && !isTranscribing) {
        onStart()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isMainKeyRelease(event)) return

      if (startRequestedRef.current || isRecording) {
        event.preventDefault()
        event.stopPropagation()
        onStop()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("keyup", handleKeyUp, true)
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("keyup", handleKeyUp, true)
    }
  }, [
    hotkey,
    enabled,
    isRecording,
    isTranscribing,
    startRequestedRef,
    onStart,
    onStop,
  ])
}
