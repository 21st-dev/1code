"use client"

import { atom } from "jotai"
import { ArrowDown, ListTree } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import {
  CheckIcon,
  ClaudeCodeIcon,
  CollapseIcon,
  CopyIcon,
  CursorIcon,
  ExpandIcon,
  IconSpinner,
  PauseIcon,
  VolumeIcon,
} from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { apiFetch } from "../../../lib/api-fetch"
import { cn } from "../../../lib/utils"
import { useHaptic } from "../hooks/use-haptic"
import { clearSubChatRuntimeCaches } from "../stores/sub-chat-runtime-cleanup"
import { useStreamingStatusStore } from "../stores/streaming-status-store"

// ============================================================================
// Stub atoms (placeholders for imports that aren't wired up yet)
// ============================================================================

export const clearSubChatSelectionAtom = atom(null, () => {})
export const isSubChatMultiSelectModeAtom = atom(false)
export const selectedSubChatIdsAtom = atom(new Set<string>())
// import { selectedTeamIdAtom } from "@/lib/atoms/team"
export const selectedTeamIdAtom = atom<string | null>(null)
// import type { PlanType } from "@/lib/config/subscription-plans"
export type PlanType = string

// ============================================================================
// Module-level caches and constants
// ============================================================================

// Module-level scroll position cache (per subChatId, session-only)
// Stores { scrollTop, scrollHeight, wasAtBottom } so we can restore position on tab switch
export const scrollPositionCache = new Map<
  string,
  { scrollTop: number; scrollHeight: number; wasAtBottom: boolean }
>()
export const mountedChatViewInnerCounts = new Map<string, number>()
export const pendingSubChatCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function clearRuntimeCachesForSubChat(subChatId: string) {
  clearSubChatRuntimeCaches(subChatId)
  scrollPositionCache.delete(subChatId)
}

/** Wait for streaming to finish by subscribing to the status store.
 *  Includes a 30s safety timeout — if the store never transitions to "ready",
 *  the promise resolves anyway to prevent hanging the UI indefinitely. */
export const STREAMING_READY_TIMEOUT_MS = 30_000

export function waitForStreamingReady(subChatId: string): Promise<void> {
  return new Promise((resolve) => {
    if (!useStreamingStatusStore.getState().isStreaming(subChatId)) {
      resolve()
      return
    }

    const timeout = setTimeout(() => {
      console.warn(
        `[waitForStreamingReady] Timed out after ${STREAMING_READY_TIMEOUT_MS}ms for subChat ${subChatId.slice(-8)}, proceeding anyway`
      )
      unsub()
      resolve()
    }, STREAMING_READY_TIMEOUT_MS)

    const unsub = useStreamingStatusStore.subscribe(
      (state) => state.statuses[subChatId],
      (status) => {
        if (status === "ready" || status === undefined) {
          clearTimeout(timeout)
          unsub()
          resolve()
        }
      }
    )
  })
}

// Exploring tools - these get grouped when 2+ consecutive
export const EXPLORING_TOOLS = new Set([
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
])

// Group consecutive exploring tools into exploring-group
export function groupExploringTools(parts: any[], nestedToolIds: Set<string>): any[] {
  const result: any[] = []
  let currentGroup: any[] = []

  for (const part of parts) {
    // Skip nested tools - they shouldn't be grouped, they render inside parent
    const isNested = part.toolCallId && nestedToolIds.has(part.toolCallId)

    if (EXPLORING_TOOLS.has(part.type) && !isNested) {
      currentGroup.push(part)
    } else {
      // Flush group if 3+
      if (currentGroup.length >= 3) {
        result.push({ type: "exploring-group", parts: currentGroup })
      } else {
        result.push(...currentGroup)
      }
      currentGroup = []
      result.push(part)
    }
  }
  // Flush remaining
  if (currentGroup.length >= 3) {
    result.push({ type: "exploring-group", parts: currentGroup })
  } else {
    result.push(...currentGroup)
  }
  return result
}

// Get the ID of the first sub-chat by creation date
export function getFirstSubChatId(
  subChats:
    | Array<{ id: string; created_at?: Date | string | null }>
    | undefined,
): string | null {
  if (!subChats?.length) return null
  const sorted = [...subChats].sort(
    (a, b) =>
      (a.created_at ? new Date(a.created_at).getTime() : 0) -
      (b.created_at ? new Date(b.created_at).getTime() : 0),
  )
  return sorted[0]?.id ?? null
}

// Layout constants for chat header and sticky messages
export const CHAT_LAYOUT = {
  // Padding top for chat content
  paddingTopSidebarOpen: "pt-12", // When sidebar open (absolute header overlay)
  paddingTopSidebarClosed: "pt-4", // When sidebar closed (regular header)
  paddingTopMobile: "pt-14", // Mobile has header
  // Sticky message top position (title is now in flex above scroll, so top-0)
  stickyTopSidebarOpen: "top-0", // When sidebar open (desktop, absolute header)
  stickyTopSidebarClosed: "top-0", // When sidebar closed (desktop, flex header)
  stickyTopMobile: "top-0", // Mobile (flex header, so top-0)
  // Header padding when absolute
  headerPaddingSidebarOpen: "pt-1.5 pb-12 px-3 pl-2",
  headerPaddingSidebarClosed: "p-2 pt-1.5",
} as const

// ============================================================================
// Constants: Icons, models, agents
// ============================================================================

// Codex icon (OpenAI style)
export const CodexIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
)

// Model options for Claude Code
export const claudeModels = [
  { id: "opus", name: "Opus 4.6" },
  { id: "sonnet", name: "Sonnet 4.6" },
  { id: "haiku", name: "Haiku 4.5" },
]

// Agent providers
export const agents = [
  { id: "claude-code", name: "Claude Code", hasModels: true },
  { id: "cursor", name: "Cursor CLI", disabled: true },
  { id: "codex", name: "OpenAI Codex", disabled: true },
]

// Helper function to get agent icon
export const getAgentIcon = (agentId: string, className?: string) => {
  switch (agentId) {
    case "claude-code":
      return <ClaudeCodeIcon className={className} />
    case "cursor":
      return <CursorIcon className={className} />
    case "codex":
      return <CodexIcon className={className} />
    default:
      return null
  }
}

// ============================================================================
// Small component helpers
// ============================================================================

// Copy button component with tooltip feedback (matches project style)
export function CopyButton({
  onCopy,
  isMobile = false,
}: {
  onCopy: () => void
  isMobile?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const { trigger: triggerHaptic } = useHaptic()

  const handleCopy = () => {
    onCopy()
    triggerHaptic("medium")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      tabIndex={-1}
      className="p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]"
    >
      <div className="relative w-3.5 h-3.5">
        <CopyIcon
          className={cn(
            "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
            copied ? "opacity-0 scale-50" : "opacity-100 scale-100",
          )}
        />
        <CheckIcon
          className={cn(
            "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
            copied ? "opacity-100 scale-100" : "opacity-0 scale-50",
          )}
        />
      </div>
    </button>
  )
}

// Play button component for TTS (text-to-speech) with streaming support
export type PlayButtonState = "idle" | "loading" | "playing"

export const PLAYBACK_SPEEDS = [1, 2, 3] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export function PlayButton({
  text,
  isMobile = false,
  playbackRate = 1,
  onPlaybackRateChange,
}: {
  text: string
  isMobile?: boolean
  playbackRate?: PlaybackSpeed
  onPlaybackRateChange?: (rate: PlaybackSpeed) => void
}) {
  const [state, setState] = useState<PlayButtonState>("idle")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const chunkCountRef = useRef(0)

  // Update playback rate when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src)
      }
    }
    if (
      mediaSourceRef.current &&
      mediaSourceRef.current.readyState === "open"
    ) {
      try {
        mediaSourceRef.current.endOfStream()
      } catch {
        // Ignore errors during cleanup
      }
    }
    audioRef.current = null
    mediaSourceRef.current = null
    sourceBufferRef.current = null
    chunkCountRef.current = 0
  }, [])

  const handlePlay = async () => {
    // If playing, stop the audio
    if (state === "playing") {
      cleanup()
      setState("idle")
      return
    }

    // If loading, cancel and reset
    if (state === "loading") {
      cleanup()
      setState("idle")
      return
    }

    // Start loading
    setState("loading")
    chunkCountRef.current = 0

    try {
      // Check if MediaSource is supported for streaming
      const supportsMediaSource =
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported("audio/mpeg")

      if (supportsMediaSource) {
        // Use streaming approach with MediaSource API
        await playWithStreaming()
      } else {
        // Fallback: wait for full response (Safari, older browsers)
        await playWithFallback()
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("[PlayButton] TTS error:", error)
      }
      cleanup()
      setState("idle")
    }
  }

  const playWithStreaming = async () => {
    const mediaSource = new MediaSource()
    mediaSourceRef.current = mediaSource

    const audio = new Audio()
    audioRef.current = audio

    audio.src = URL.createObjectURL(mediaSource)

    audio.onended = () => {
      cleanup()
      setState("idle")
    }

    audio.onerror = () => {
      cleanup()
      setState("idle")
    }

    // Track if we've already started playing
    let hasStartedPlaying = false

    // Start playback when browser has enough data (canplay event)
    audio.oncanplay = async () => {
      if (hasStartedPlaying) return
      hasStartedPlaying = true
      try {
        await audio.play()
        audio.playbackRate = playbackRate
        setState("playing")
      } catch {
        cleanup()
        setState("idle")
      }
    }

    // Wait for MediaSource to open
    await new Promise<void>((resolve, reject) => {
      mediaSource.addEventListener("sourceopen", () => resolve(), {
        once: true,
      })
      mediaSource.addEventListener(
        "error",
        () => reject(new Error("MediaSource error")),
        {
          once: true,
        },
      )
    })

    const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg")
    sourceBufferRef.current = sourceBuffer

    // Create abort controller for this request
    abortControllerRef.current = new AbortController()

    const fetchStartTime = Date.now()
    const response = await apiFetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: abortControllerRef.current.signal,
    })

    if (!response.ok) {
      throw new Error("TTS request failed")
    }

    if (!response.body) {
      throw new Error("No response body")
    }

    const reader = response.body.getReader()
    const pendingChunks: Uint8Array[] = []
    let isAppending = false

    const appendNextChunk = () => {
      if (
        isAppending ||
        pendingChunks.length === 0 ||
        !sourceBufferRef.current ||
        sourceBufferRef.current.updating
      ) {
        return
      }

      isAppending = true
      const chunk = pendingChunks.shift()!
      try {
        // Use ArrayBuffer.isView to ensure TypeScript knows this is a valid BufferSource
        const buffer = new Uint8Array(chunk.buffer.slice(0)) as BufferSource
        sourceBufferRef.current.appendBuffer(buffer)
      } catch {
        // Buffer might be full or source closed
        isAppending = false
      }
    }

    sourceBuffer.addEventListener("updateend", () => {
      isAppending = false
      appendNextChunk()
    })

    // Read stream chunks
    const processStream = async () => {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // Wait for all pending chunks to be appended
          while (pendingChunks.length > 0 || sourceBuffer.updating) {
            await new Promise((r) => setTimeout(r, 50))
          }
          if (mediaSource.readyState === "open") {
            try {
              mediaSource.endOfStream()
            } catch {
              // Ignore
            }
          }
          break
        }

        if (value) {
          chunkCountRef.current++
          pendingChunks.push(value)
          appendNextChunk()

          // Just accumulate data, don't try to play yet
          // Playback will start via canplay event listener
        }
      }
    }

    // Start processing stream - playback will start via canplay event
    processStream()
  }

  const playWithFallback = async () => {
    abortControllerRef.current = new AbortController()

    const response = await apiFetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: abortControllerRef.current.signal,
    })

    if (!response.ok) {
      throw new Error("TTS request failed")
    }

    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)

    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.onended = () => {
      cleanup()
      setState("idle")
    }

    audio.onerror = () => {
      cleanup()
      setState("idle")
    }

    await audio.play()
    // Set playback rate AFTER play() - browser resets it when setting src
    audio.playbackRate = playbackRate
    setState("playing")
  }

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return (
    <div className="relative flex items-center">
      <button
        onClick={handlePlay}
        tabIndex={-1}
        className={cn(
          "p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]",
          state === "loading" && "cursor-wait",
        )}
      >
        <div className="relative w-3.5 h-3.5">
          {state === "loading" ? (
            <IconSpinner className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : state === "playing" ? (
            <PauseIcon className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <VolumeIcon className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Speed selector - cyclic button with animation, only visible when playing */}
      {state === "playing" && (
        <button
          onClick={() => {
            const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate)
            const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length
            onPlaybackRateChange?.(PLAYBACK_SPEEDS[nextIndex])
          }}
          tabIndex={-1}
          className={cn(
            "p-1.5 rounded-md transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]",
            isMobile
              ? "opacity-100"
              : "opacity-0 group-hover/message:opacity-100",
          )}
        >
          <div className="relative w-4 h-3.5 flex items-center justify-center">
            {PLAYBACK_SPEEDS.map((speed) => (
              <span
                key={speed}
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                  speed === playbackRate
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-50",
                )}
              >
                {speed}x
              </span>
            ))}
          </div>
        </button>
      )}
    </div>
  )
}

// Isolated scroll-to-bottom button - uses own scroll listener to avoid re-renders of parent
export const ScrollToBottomButton = memo(function ScrollToBottomButton({
  containerRef,
  onScrollToBottom,
  hasStackedCards = false,
  subChatId,
  isActive = true,
  isSplitPane = false,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  onScrollToBottom: () => void
  hasStackedCards?: boolean
  subChatId?: string
  isActive?: boolean
  isSplitPane?: boolean
}) {
  const [isVisible, setIsVisible] = useState(false)
  const shouldMonitor = isActive || isSplitPane

  // Keep current monitoring state in ref for scroll event handler
  const shouldMonitorRef = useRef(shouldMonitor)
  shouldMonitorRef.current = shouldMonitor

  useEffect(() => {
    // Skip scroll monitoring for tabs that are not visible (keep-alive)
    if (!shouldMonitor) return

    const container = containerRef.current
    if (!container) return

    // RAF throttle to avoid setState on every scroll event
    let rafId: number | null = null
    let lastAtBottom: boolean | null = null

    const checkVisibility = () => {
      // Skip if tab is not visible or RAF already pending
      if (!shouldMonitorRef.current || rafId !== null) return

      rafId = requestAnimationFrame(() => {
        rafId = null
        // Double-check current monitoring state in RAF callback
        if (!shouldMonitorRef.current) return

        const threshold = 50
        const atBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight <=
          threshold

        // Only update state if value actually changed
        if (lastAtBottom !== atBottom) {
          lastAtBottom = atBottom
          setIsVisible(!atBottom)
        }
      })
    }

    // Check initial state after a short delay to allow scroll position to be set
    // This handles the case when entering a sub-chat that's scrolled to a specific position
    const timeoutId = setTimeout(() => {
      // Skip if tab is not visible
      if (!shouldMonitorRef.current) return

      // Direct check for initial state (no RAF needed)
      const threshold = 50
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        threshold
      lastAtBottom = atBottom
      setIsVisible(!atBottom)
    }, 50)

    container.addEventListener("scroll", checkVisibility, { passive: true })
    return () => {
      clearTimeout(timeoutId)
      if (rafId !== null) cancelAnimationFrame(rafId)
      container.removeEventListener("scroll", checkVisibility)
    }
  }, [containerRef, subChatId, shouldMonitor])

  return (
    <AnimatePresence>
      {isVisible && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <motion.button
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={onScrollToBottom}
              className={cn(
                "absolute p-2 rounded-full bg-background border border-border shadow-md hover:bg-accent active:scale-[0.97] transition-[color,background-color,bottom] duration-200 z-20",
              )}
              style={{
                right: "0.75rem",
                // Wide screen (container > 48rem): button sits in bottom-right corner
                // Narrow screen (container <= 48rem): button lifts above the input
                bottom: "clamp(0.75rem, (48rem - var(--chat-container-width, 0px)) * 1000, calc(var(--chat-input-height, 4rem) + 1rem))",
              }}
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Scroll to bottom
            <span className="inline-flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>
                <ArrowDown className="h-3 w-3" />
              </Kbd>
            </span>
          </TooltipContent>
        </Tooltip>
      )}
    </AnimatePresence>
  )
})

// Message group wrapper - measures user message height for sticky todo positioning
interface MessageGroupProps {
  children: React.ReactNode
  isLastGroup?: boolean
}

export function MessageGroup({ children, isLastGroup }: MessageGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null)
  const userMessageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const groupEl = groupRef.current
    if (!groupEl) return

    // Find the actual bubble element (not the wrapper which includes gradient)
    const bubbleEl = groupEl.querySelector('[data-user-bubble]') as HTMLDivElement | null
    if (!bubbleEl) return

    userMessageRef.current = bubbleEl

    const updateHeight = () => {
      const height = bubbleEl.offsetHeight
      // Set CSS variable directly on DOM - no React state, no re-renders
      groupEl.style.setProperty('--user-message-height', `${height}px`)
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(bubbleEl)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={groupRef}
      className="relative"
      style={{
        // content-visibility: auto - browser skips layout/paint for elements outside viewport
        // This is a HUGE optimization for long chats - only visible content is rendered
        // NOT applied to the last group: it's always visible and actively streaming,
        // content-visibility on it interferes with correct scrollHeight during streaming
        ...(!isLastGroup && {
          contentVisibility: "auto",
          containIntrinsicSize: "auto 200px",
        }),
        // Last group has minimum height of the chat container (minus padding)
        ...(isLastGroup && { minHeight: "calc(var(--chat-container-height) - 32px)" }),
      }}
      data-last-group={isLastGroup || undefined}
    >
      {children}
    </div>
  )
}

// Collapsible steps component for intermediate content before final response
interface CollapsibleStepsProps {
  stepsCount: number
  children: React.ReactNode
  defaultExpanded?: boolean
}

export function CollapsibleSteps({
  stepsCount,
  children,
  defaultExpanded = false,
}: CollapsibleStepsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  if (stepsCount === 0) return null

  return (
    <div className="mb-2" data-collapsible-steps="true">
      {/* Header row - styled like AgentToolCall with expand icon on right */}
      <div
        className="flex items-center justify-between rounded-md py-0.5 px-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ListTree className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-medium whitespace-nowrap">
            {stepsCount} {stepsCount === 1 ? "step" : "steps"}
          </span>
        </div>
        <button
          className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
        >
          <div className="relative w-4 h-4">
            <ExpandIcon
              className={cn(
                "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
              )}
            />
            <CollapseIcon
              className={cn(
                "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
              )}
            />
          </div>
        </button>
      </div>
      {isExpanded && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  )
}
