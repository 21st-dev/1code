"use client"

import { memo, useCallback, useState, useRef, useEffect } from "react"
import { Mic, Loader2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import {
  useVoiceRecording,
  blobToBase64,
  getAudioFormat,
} from "../../../lib/hooks/use-voice-recording"

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Voice input button with hold-to-talk functionality
 *
 * Hold down the button to record, release to transcribe.
 * Uses OpenAI Whisper API for transcription.
 */
export const VoiceInputButton = memo(function VoiceInputButton({
  onTranscript,
  disabled = false,
  className,
}: VoiceInputButtonProps) {
  const { isRecording, startRecording, stopRecording, cancelRecording, error } =
    useVoiceRecording()
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)

  // Track if we're using touch to prevent duplicate mouse events
  const isTouchRef = useRef(false)

  // Ref to track if component is mounted (for async operations)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const transcribeMutation = trpc.voice.transcribe.useMutation({
    onError: (err) => {
      console.error("[VoiceInput] Transcription error:", err)
      if (isMountedRef.current) {
        setTranscribeError(err.message)
      }
    },
  })

  const handleStart = useCallback(async () => {
    if (disabled || isTranscribing || isRecording) return

    setTranscribeError(null)

    try {
      await startRecording()
    } catch (err) {
      console.error("[VoiceInput] Failed to start recording:", err)
    }
  }, [disabled, isTranscribing, isRecording, startRecording])

  const handleEnd = useCallback(async () => {
    if (!isRecording) return

    try {
      const blob = await stopRecording()

      // Don't transcribe very short recordings (likely accidental clicks)
      if (blob.size < 1000) {
        console.log("[VoiceInput] Recording too short, ignoring")
        return
      }

      if (!isMountedRef.current) return

      setIsTranscribing(true)

      const base64 = await blobToBase64(blob)
      const format = getAudioFormat(blob.type)

      const result = await transcribeMutation.mutateAsync({
        audio: base64,
        format,
      })

      if (!isMountedRef.current) return

      if (result.text && result.text.trim()) {
        onTranscript(result.text.trim())
      }
    } catch (err) {
      console.error("[VoiceInput] Transcription failed:", err)
    } finally {
      if (isMountedRef.current) {
        setIsTranscribing(false)
      }
    }
  }, [isRecording, stopRecording, transcribeMutation, onTranscript])

  // Mouse handlers - skip if touch was used
  const handleMouseDown = useCallback(() => {
    if (isTouchRef.current) {
      isTouchRef.current = false
      return
    }
    handleStart()
  }, [handleStart])

  const handleMouseUp = useCallback(() => {
    if (isTouchRef.current) return
    handleEnd()
  }, [handleEnd])

  const handleMouseLeave = useCallback(() => {
    if (isTouchRef.current) return
    if (isRecording) {
      // Cancel instead of transcribing when leaving button area
      cancelRecording()
    }
  }, [isRecording, cancelRecording])

  // Touch handlers - set flag to prevent mouse events
  const handleTouchStart = useCallback(() => {
    isTouchRef.current = true
    handleStart()
  }, [handleStart])

  const handleTouchEnd = useCallback(() => {
    handleEnd()
  }, [handleEnd])

  const isLoading = isTranscribing || transcribeMutation.isPending
  const hasError = !!error || !!transcribeError

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={disabled || isLoading}
      title={
        hasError
          ? transcribeError || error?.message || "Voice input error"
          : isRecording
            ? "Release to transcribe"
            : "Hold to record"
      }
      className={cn(
        "relative p-1.5 rounded-md transition-all duration-150 ease-out",
        "hover:bg-accent active:scale-[0.97]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isRecording && "bg-red-500/20 ring-2 ring-red-500",
        isLoading && "bg-yellow-500/20",
        hasError && "bg-red-500/10",
        className
      )}
    >
      <div className="relative w-4 h-4">
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        ) : (
          <Mic
            className={cn(
              "w-4 h-4 transition-colors",
              isRecording
                ? "text-red-500 animate-pulse"
                : hasError
                  ? "text-red-500/70"
                  : "text-muted-foreground"
            )}
          />
        )}
      </div>

      {/* Recording indicator dot */}
      {isRecording && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
    </button>
  )
})
