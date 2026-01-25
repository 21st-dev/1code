import { useState, useRef, useCallback, useEffect } from "react"

interface UseVoiceRecordingReturn {
  isRecording: boolean
  error: Error | null
  audioLevel: number // 0-1 normalized audio level
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob>
  cancelRecording: () => void
}

/**
 * Hook for managing voice recording using MediaRecorder API
 *
 * Usage:
 * ```tsx
 * const { isRecording, startRecording, stopRecording, error } = useVoiceRecording()
 *
 * // Start recording (e.g., on mouse down)
 * await startRecording()
 *
 * // Stop recording and get audio blob (e.g., on mouse up)
 * const blob = await stopRecording()
 * ```
 */
export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const isStartingRef = useRef(false) // Prevent race conditions

  // Audio analysis refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Cleanup function to stop all tracks and reset state
  const cleanup = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Clean up audio analysis
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          // Ignore errors during cleanup
        }
      }
      mediaRecorderRef.current = null
    }
    chunksRef.current = []
    isStartingRef.current = false
    setAudioLevel(0)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
      setIsRecording(false)
    }
  }, [cleanup])

  // Cancel recording without returning a blob
  const cancelRecording = useCallback(() => {
    cleanup()
    setIsRecording(false)
  }, [cleanup])

  const startRecording = useCallback(async () => {
    // Prevent multiple simultaneous starts
    if (isStartingRef.current || mediaRecorderRef.current) {
      console.warn("[VoiceRecording] Already recording or starting")
      return
    }

    isStartingRef.current = true

    try {
      setError(null)

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Whisper works well with 16kHz
        },
      })

      streamRef.current = stream

      // Set up audio analysis for visualization
      try {
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.5

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser

        // Start audio level monitoring
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const updateLevel = () => {
          if (!analyserRef.current) return

          analyserRef.current.getByteFrequencyData(dataArray)

          // Calculate average amplitude from frequency data
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] ?? 0
          }
          const average = sum / dataArray.length
          // Normalize to 0-1 with stronger amplification for better visibility
          // Using power curve to make quiet sounds more visible
          const raw = average / 255
          const amplified = Math.pow(raw, 0.6) * 2.5 // Power curve + strong amplification
          const normalized = Math.min(1, amplified)
          setAudioLevel(normalized)

          animationFrameRef.current = requestAnimationFrame(updateLevel)
        }
        updateLevel()
      } catch (err) {
        console.warn("[VoiceRecording] Failed to set up audio analysis:", err)
        // Continue without audio level - recording still works
      }

      // Determine best supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4" // Fallback for Safari

      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      isStartingRef.current = false
    } catch (err) {
      isStartingRef.current = false
      cleanup()

      // Provide user-friendly error messages
      let error: Error
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          error = new Error("Microphone access denied. Please allow microphone access in System Preferences.")
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          error = new Error("No microphone found. Please connect a microphone.")
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          error = new Error("Microphone is in use by another application.")
        } else {
          error = err
        }
      } else {
        error = new Error("Failed to start recording")
      }

      setError(error)
      console.error("[VoiceRecording] Start error:", error)
      throw error
    }
  }, [cleanup])

  const stopRecording = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current

      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        const error = new Error("No active recording")
        setError(error)
        reject(error)
        return
      }

      // Store mimeType before stopping (some browsers clear it after stop)
      const mimeType = mediaRecorder.mimeType || "audio/webm"

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })

        // Clean up
        cleanup()
        setIsRecording(false)
        resolve(blob)
      }

      mediaRecorder.onerror = () => {
        const error = new Error("Recording error")
        setError(error)
        cleanup()
        setIsRecording(false)
        reject(error)
      }

      mediaRecorder.stop()
    })
  }, [cleanup])

  return {
    isRecording,
    error,
    audioLevel,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}

/**
 * Convert a Blob to base64 string
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = result.split(",")[1]
      if (base64) {
        resolve(base64)
      } else {
        reject(new Error("Failed to convert blob to base64"))
      }
    }
    reader.onerror = () => reject(new Error("Failed to read blob"))
    reader.readAsDataURL(blob)
  })
}

/**
 * Get audio format from mime type
 */
export function getAudioFormat(
  mimeType: string
): "webm" | "mp3" | "m4a" | "wav" | "ogg" {
  if (mimeType.includes("webm")) return "webm"
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3"
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a"
  if (mimeType.includes("wav")) return "wav"
  if (mimeType.includes("ogg")) return "ogg"
  return "webm" // Default
}
