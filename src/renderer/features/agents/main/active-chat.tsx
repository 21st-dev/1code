"use client"

import {
  ChatMarkdownRenderer,
  stripEmojis,
} from "../../../components/chat-markdown-renderer"
import { MemoizedTextPart } from "./memoized-text-part"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  AttachIcon,
  CheckIcon,
  ClaudeCodeIcon,
  CollapseIcon,
  CopyIcon,
  CursorIcon,
  ExpandIcon,
  IconCloseSidebarRight,
  IconOpenSidebarRight,
  IconSpinner,
  IconTextUndo,
  PauseIcon,
  PlanIcon,
  PullRequestIcon,
  VolumeIcon,
} from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import {
  PromptInput,
  PromptInputActions,
  PromptInputContextItems,
} from "../../../components/ui/prompt-input"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
// e2b API routes are used instead of useSandboxManager for agents
// import { clearSubChatSelectionAtom, isSubChatMultiSelectModeAtom, selectedSubChatIdsAtom } from "@/lib/atoms/agent-subchat-selection"
import { Chat, useChat } from "@ai-sdk/react"
import { DiffModeEnum } from "@git-diff-view/react"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ArrowDown,
  ChevronDown,
  Columns2,
  Eye,
  GitCommitHorizontal,
  GitMerge,
  ListTree,
  MoreHorizontal,
  Rows2,
  TerminalSquare,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { trackMessageSent } from "../../../lib/analytics"
import { apiFetch } from "../../../lib/api-fetch"
import { soundNotificationsEnabledAtom } from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { api } from "../../../lib/mock-api"
import { trpc, trpcClient } from "../../../lib/trpc"
import { getQueryClient } from "../../../contexts/TRPCProvider"
import { cn } from "../../../lib/utils"
import { getShortcutKey, isDesktopApp } from "../../../lib/utils/platform"
import { terminalSidebarOpenAtom } from "../../terminal/atoms"
import { TerminalSidebar } from "../../terminal/terminal-sidebar"
import {
  agentsDiffSidebarWidthAtom,
  agentsPreviewSidebarOpenAtom,
  agentsPreviewSidebarWidthAtom,
  agentsScrollPositionsAtom,
  agentsSubChatsSidebarModeAtom,
  agentsSubChatUnseenChangesAtom,
  agentsUnseenChangesAtom,
  clearLoading,
  compactingSubChatsAtom,
  diffSidebarOpenAtomFamily,
  isPlanModeAtom,
  justCreatedIdsAtom,
  lastSelectedModelIdAtom,
  loadingSubChatsAtom,
  pendingAuthRetryMessageAtom,
  pendingPrMessageAtom,
  pendingReviewMessageAtom,
  pendingUserQuestionsAtom,
  pendingPlanApprovalsAtom,
  QUESTIONS_SKIPPED_MESSAGE,
  scrollPositionsCacheStore,
  selectedAgentChatIdAtom,
  setLoading,
  subChatFilesAtom,
  undoStackAtom,
  type ScrollPositionData,
  type UndoItem,
} from "../atoms"
import {
  AgentsSlashCommand,
  COMMAND_PROMPTS,
  type SlashCommandOption,
} from "../commands"
import { AgentSendButton } from "../components/agent-send-button"
import { PreviewSetupHoverCard } from "../components/preview-setup-hover-card"
import { useAgentsFileUpload } from "../hooks/use-agents-file-upload"
import { useChangedFilesTracking } from "../hooks/use-changed-files-tracking"
import { useDesktopNotifications } from "../hooks/use-desktop-notifications"
import { useFocusInputOnEnter } from "../hooks/use-focus-input-on-enter"
import { useHaptic } from "../hooks/use-haptic"
import { useToggleFocusOnCmdEsc } from "../hooks/use-toggle-focus-on-cmd-esc"
import { IPCChatTransport } from "../lib/ipc-chat-transport"
import {
  AgentsFileMention,
  AgentsMentionsEditor,
  type AgentsMentionsEditorHandle,
  type FileMentionOption,
} from "../mentions"
import { agentChatStore } from "../stores/agent-chat-store"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import { AgentAskUserQuestionTool } from "../ui/agent-ask-user-question-tool"
import { AgentBashTool } from "../ui/agent-bash-tool"
import { AgentContextIndicator } from "../ui/agent-context-indicator"
import {
  AgentDiffView,
  diffViewModeAtom,
  splitUnifiedDiffByFile,
  type AgentDiffViewRef,
} from "../ui/agent-diff-view"
import { AgentEditTool } from "../ui/agent-edit-tool"
import { AgentExitPlanModeTool } from "../ui/agent-exit-plan-mode-tool"
import { AgentExploringGroup } from "../ui/agent-exploring-group"
import { AgentFileItem } from "../ui/agent-file-item"
import { AgentImageItem } from "../ui/agent-image-item"
import {
  AgentMessageUsage,
  type AgentMessageMetadata,
} from "../ui/agent-message-usage"
import { AgentPlanTool } from "../ui/agent-plan-tool"
import { AgentPreview } from "../ui/agent-preview"
import { AgentTaskTool } from "../ui/agent-task-tool"
import { AgentThinkingTool } from "../ui/agent-thinking-tool"
import { AgentTodoTool } from "../ui/agent-todo-tool"
import { AgentToolCall } from "../ui/agent-tool-call"
import { AgentToolRegistry, getToolStatus } from "../ui/agent-tool-registry"
import { AgentUserMessageBubble } from "../ui/agent-user-message-bubble"
import { AgentUserQuestion } from "../ui/agent-user-question"
import { AgentWebFetchTool } from "../ui/agent-web-fetch-tool"
import { AgentWebSearchCollapsible } from "../ui/agent-web-search-collapsible"
import { AgentsHeaderControls } from "../ui/agents-header-controls"
import { ChatInputArea } from "./chat-input-area"
import { MemoizedAssistantMessages } from "./messages-list"
import { ChatDataSync } from "./chat-data-sync"
import { IsolatedMessagesSection } from "./isolated-messages-section"
import { hasMessagesAtom, isStreamingAtom, hasUnapprovedPlanAtom, messageTokenDataAtom, syncMessagesWithStatusAtom } from "../stores/message-store"
import { ChatTitleEditor } from "../ui/chat-title-editor"
import { MobileChatHeader } from "../ui/mobile-chat-header"
import { PrStatusBar } from "../ui/pr-status-bar"
import { SubChatSelector } from "../ui/sub-chat-selector"
import { SubChatStatusCard } from "../ui/sub-chat-status-card"
import { autoRenameAgentChat } from "../utils/auto-rename"
import { handlePasteEvent } from "../utils/paste-text"
import { generateCommitToPrMessage, generatePrMessage, generateReviewMessage } from "../utils/pr-message"
import {
  saveSubChatDraft,
  clearSubChatDraft,
  getSubChatDraft,
} from "../lib/drafts"
const clearSubChatSelectionAtom = atom(null, () => {})
const isSubChatMultiSelectModeAtom = atom(false)
const selectedSubChatIdsAtom = atom(new Set<string>())
// import { selectedTeamIdAtom } from "@/lib/atoms/team"
const selectedTeamIdAtom = atom<string | null>(null)
// import type { PlanType } from "@/lib/config/subscription-plans"
type PlanType = string

// Exploring tools - these get grouped when 2+ consecutive
const EXPLORING_TOOLS = new Set([
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
])

// Group consecutive exploring tools into exploring-group
function groupExploringTools(parts: any[], nestedToolIds: Set<string>): any[] {
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
function getFirstSubChatId(
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

// Find the first NEW assistant message after the last known one
// Used for smart scroll: when returning to a chat where streaming finished,
// scroll to the start of the new response instead of bottom
function findFirstNewAssistantMessage(
  messages: Array<{ id: string; role: string }>,
  lastKnownAssistantMsgId?: string,
): string | undefined {
  if (!lastKnownAssistantMsgId) {
    // No previous assistant message - find first one
    return messages.find((m) => m.role === "assistant")?.id
  }

  // Find index of last known message
  const lastKnownIndex = messages.findIndex(
    (m) => m.id === lastKnownAssistantMsgId,
  )
  if (lastKnownIndex === -1) return undefined

  // Find first assistant message after that
  for (let i = lastKnownIndex + 1; i < messages.length; i++) {
    if (messages[i]?.role === "assistant") {
      return messages[i]?.id
    }
  }

  return undefined
}

// Layout constants for chat header and sticky messages
const CHAT_LAYOUT = {
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

// Codex icon (OpenAI style)
const CodexIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
)

// Model options for Claude Code
const claudeModels = [
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
]

// Agent providers
const agents = [
  { id: "claude-code", name: "Claude Code", hasModels: true },
  { id: "cursor", name: "Cursor CLI", disabled: true },
  { id: "codex", name: "OpenAI Codex", disabled: true },
]

// Helper function to get agent icon
const getAgentIcon = (agentId: string, className?: string) => {
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

// Copy button component with tooltip feedback (matches project style)
function CopyButton({
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
type PlayButtonState = "idle" | "loading" | "playing"

const PLAYBACK_SPEEDS = [1, 2, 3] as const
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

function PlayButton({
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
const ScrollToBottomButton = memo(function ScrollToBottomButton({
  containerRef,
  onScrollToBottom,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  onScrollToBottom: () => void
}) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const checkVisibility = () => {
      const threshold = 50
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        threshold
      setIsVisible(!atBottom)
    }

    // Check initial state
    checkVisibility()

    container.addEventListener("scroll", checkVisibility, { passive: true })
    return () => container.removeEventListener("scroll", checkVisibility)
  }, [containerRef])

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
              className="absolute bottom-24 right-4 p-2 rounded-full bg-background border border-border shadow-md hover:bg-accent active:scale-[0.97] transition-colors z-20"
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
}

function MessageGroup({ children }: MessageGroupProps) {
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
    <div ref={groupRef} className="relative">
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

function CollapsibleSteps({
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

// Inner chat component - only rendered when chat object is ready
function ChatViewInner({
  chat,
  subChatId,
  parentChatId,
  isFirstSubChat,
  onAutoRename,
  onCreateNewSubChat,
  teamId,
  repository,
  streamId,
  isMobile = false,
  sandboxSetupStatus = "ready",
  sandboxSetupError,
  onRetrySetup,
  isSubChatsSidebarOpen = false,
  sandboxId,
  projectPath,
  isArchived = false,
  onRestoreWorkspace,
}: {
  chat: Chat<any>
  subChatId: string
  parentChatId: string
  isFirstSubChat: boolean
  onAutoRename: (userMessage: string, subChatId: string) => void
  onCreateNewSubChat?: () => void
  teamId?: string
  repository?: string
  streamId?: string | null
  isMobile?: boolean
  sandboxSetupStatus?: "cloning" | "ready" | "error"
  sandboxSetupError?: string
  onRetrySetup?: () => void
  isSubChatsSidebarOpen?: boolean
  sandboxId?: string
  projectPath?: string
  isArchived?: boolean
  onRestoreWorkspace?: () => void
}) {
  const hasTriggeredRenameRef = useRef(false)
  const hasTriggeredAutoGenerateRef = useRef(false)

  // Scroll management state (like canvas chat)
  // Using only ref to avoid re-renders on scroll
  const shouldAutoScrollRef = useRef(true)
  const isAutoScrollingRef = useRef(false) // Flag to ignore scroll events caused by auto-scroll
  const chatContainerRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<AgentsMentionsEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevChatKeyRef = useRef<string | null>(null)
  const prevSubChatIdRef = useRef<string | null>(null)

  // TTS playback rate state (persists across messages and sessions via localStorage)
  const [ttsPlaybackRate, setTtsPlaybackRate] = useState<PlaybackSpeed>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tts-playback-rate")
      if (saved && PLAYBACK_SPEEDS.includes(Number(saved) as PlaybackSpeed)) {
        return Number(saved) as PlaybackSpeed
      }
    }
    return 1
  })

  // Save playback rate to localStorage when it changes
  const handlePlaybackRateChange = useCallback((rate: PlaybackSpeed) => {
    setTtsPlaybackRate(rate)
    localStorage.setItem("tts-playback-rate", String(rate))
  }, [])

  // Check if user is at bottom of chat (like canvas)
  const isAtBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return true
    const threshold = 50 // pixels from bottom
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    )
  }, [])

  // Scroll position persistence (like canvas)
  // Atom is used for localStorage persistence, but we also need a module-level cache
  // for synchronous access during tab switches (atom updates are async)
  const [scrollPositions, setScrollPositions] = useAtom(
    agentsScrollPositionsAtom,
  )

  // Skip auto-scroll immediately after restore (state update is async, so use ref)
  const justRestoredRef = useRef(false)

  // Track current scroll position in ref (for saving on cleanup - container ref may point to new container)
  const currentScrollTopRef = useRef(0)
  // Track current scrollHeight for validation
  const currentScrollHeightRef = useRef(0)
  // Track current status for save cleanup (to know if we were streaming when leaving)
  const currentStatusRef = useRef<string>("ready")
  // Track last assistant message ID for smart scroll restoration
  const lastAssistantMsgIdRef = useRef<string | undefined>(undefined)

  // Track previous scroll position to detect scroll direction
  const prevScrollTopRef = useRef(0)

  // Handle scroll events to detect user scrolling
  // Updates shouldAutoScrollRef and tracks position in ref for cleanup
  // Using refs only to avoid re-renders on scroll
  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return

    const currentScrollTop = container.scrollTop
    const prevScrollTop = prevScrollTopRef.current
    prevScrollTopRef.current = currentScrollTop

    // Always track current position (for cleanup to use)
    currentScrollTopRef.current = currentScrollTop
    currentScrollHeightRef.current = container.scrollHeight

    // Ignore scroll events caused by auto-scroll - only react to user scrolling
    if (isAutoScrollingRef.current) return

    // If user scrolls UP - disable auto-scroll immediately (no threshold!)
    if (currentScrollTop < prevScrollTop) {
      shouldAutoScrollRef.current = false
      return
    }

    // If user scrolls DOWN and reaches bottom - enable auto-scroll
    shouldAutoScrollRef.current = isAtBottom()
  }, [isAtBottom])

  // Scroll to bottom handler with ease-in-out animation
  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return

    isAutoScrollingRef.current = true
    shouldAutoScrollRef.current = true

    const start = container.scrollTop
    const duration = 300 // ms
    const startTime = performance.now()

    // Ease-in-out cubic function
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeInOutCubic(progress)

      // Calculate end on each frame to handle dynamic content
      const end = container.scrollHeight - container.clientHeight
      container.scrollTop = start + (end - start) * easedProgress

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      } else {
        // Ensure we're at the absolute bottom
        container.scrollTop = container.scrollHeight
        isAutoScrollingRef.current = false
      }
    }

    requestAnimationFrame(animateScroll)
  }, [])

  // tRPC utils for cache invalidation
  const utils = api.useUtils()

  // Get sub-chat name from store
  const subChatName = useAgentSubChatStore(
    (state) => state.allSubChats.find((sc) => sc.id === subChatId)?.name || "",
  )

  // Mutation for renaming sub-chat
  const renameSubChatMutation = api.agents.renameSubChat.useMutation({
    onError: (error) => {
      if (error.data?.code === "NOT_FOUND") {
        toast.error("Send a message first before renaming this chat")
      } else {
        toast.error("Failed to rename chat")
      }
    },
  })

  // Handler for renaming sub-chat
  // Using ref for mutation to avoid callback recreation
  const renameSubChatMutationRef = useRef(renameSubChatMutation)
  renameSubChatMutationRef.current = renameSubChatMutation
  const subChatNameRef = useRef(subChatName)
  subChatNameRef.current = subChatName

  const handleRenameSubChat = useCallback(
    async (newName: string) => {
      // Optimistic update in store
      useAgentSubChatStore.getState().updateSubChatName(subChatId, newName)

      // Save to database
      try {
        await renameSubChatMutationRef.current.mutateAsync({
          subChatId,
          name: newName,
        })
      } catch {
        // Revert on error (toast shown by mutation onError)
        useAgentSubChatStore
          .getState()
          .updateSubChatName(subChatId, subChatNameRef.current || "New Chat")
      }
    },
    [subChatId],
  )

  // Plan mode state (read from global atom)
  const [isPlanMode, setIsPlanMode] = useAtom(isPlanModeAtom)

  // Mutation for updating sub-chat mode in database
  const updateSubChatModeMutation = api.agents.updateSubChatMode.useMutation({
    onSuccess: () => {
      // Invalidate to refetch with new mode from DB
      utils.agents.getAgentChat.invalidate({ chatId: parentChatId })
    },
    onError: (error, variables) => {
      // Don't revert if sub-chat not found in DB - it may not be persisted yet
      // This is expected for new sub-chats that haven't been saved to DB
      if (error.message === "Sub-chat not found") {
        console.warn("Sub-chat not found in DB, keeping local mode state")
        return
      }

      // Revert local state on error to maintain sync with database
      const subChat = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === variables.subChatId)
      if (subChat) {
        // Revert to previous mode
        const revertedMode = variables.mode === "plan" ? "agent" : "plan"
        useAgentSubChatStore
          .getState()
          .updateSubChatMode(variables.subChatId, revertedMode)
        // Update ref BEFORE setIsPlanMode to prevent useEffect from triggering
        lastIsPlanModeRef.current = revertedMode === "plan"
        setIsPlanMode(revertedMode === "plan")
      }
      console.error("Failed to update sub-chat mode:", error.message)
    },
  })

  // Track last initialized sub-chat to prevent re-initialization
  const lastInitializedRef = useRef<string | null>(null)

  // Initialize mode from sub-chat metadata ONLY when switching sub-chats
  useEffect(() => {
    if (subChatId && subChatId !== lastInitializedRef.current) {
      const subChat = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === subChatId)

      if (subChat?.mode) {
        setIsPlanMode(subChat.mode === "plan")
      }
      lastInitializedRef.current = subChatId
    }
    // Dependencies: Only subChatId - setIsPlanMode is stable, useAgentSubChatStore is external
  }, [subChatId, setIsPlanMode])

  // Track last mode to detect actual user changes (not store updates)
  const lastIsPlanModeRef = useRef<boolean>(isPlanMode)

  // Update mode for current sub-chat when USER changes isPlanMode
  useEffect(() => {
    // Skip if isPlanMode didn't actually change
    if (lastIsPlanModeRef.current === isPlanMode) {
      return
    }

    const newMode = isPlanMode ? "plan" : "agent"

    lastIsPlanModeRef.current = isPlanMode

    if (subChatId) {
      // Update local store immediately (optimistic update)
      useAgentSubChatStore.getState().updateSubChatMode(subChatId, newMode)

      // Save to database with error handling to maintain consistency
      if (!subChatId.startsWith("temp-")) {
        updateSubChatModeMutation.mutate({ subChatId, mode: newMode })
      }
    }
    // Dependencies: updateSubChatModeMutation.mutate is stable, useAgentSubChatStore is external
  }, [isPlanMode, subChatId, updateSubChatModeMutation.mutate])

  // File/image upload hook
  const {
    images,
    files,
    handleAddAttachments,
    removeImage,
    removeFile,
    clearAll,
    isUploading,
  } = useAgentsFileUpload()

  // Plan approval pending state (for tool approval loading)
  const [planApprovalPending, setPlanApprovalPending] = useState<
    Record<string, boolean>
  >({})

  // Track chat changes for rename trigger reset
  const chatRef = useRef<Chat<any> | null>(null)

  if (prevSubChatIdRef.current !== subChatId) {
    hasTriggeredRenameRef.current = false // Reset on sub-chat change
    hasTriggeredAutoGenerateRef.current = false // Reset auto-generate on sub-chat change
    prevSubChatIdRef.current = subChatId
  }
  chatRef.current = chat

  // Restore draft when subChatId changes (switching between sub-chats)
  const prevSubChatIdForDraftRef = useRef<string | null>(null)
  useEffect(() => {
    // Restore draft for new sub-chat - read directly from localStorage
    const savedDraft = parentChatId ? getSubChatDraft(parentChatId, subChatId) : null

    if (savedDraft) {
      editorRef.current?.setValue(savedDraft)
    } else if (prevSubChatIdForDraftRef.current && prevSubChatIdForDraftRef.current !== subChatId) {
      editorRef.current?.clear()
    }

    prevSubChatIdForDraftRef.current = subChatId
  }, [subChatId, parentChatId])

  // Use subChatId as stable key to prevent HMR-induced duplicate resume requests
  // resume: !!streamId to reconnect to active streams (background streaming support)
  const { messages, sendMessage, status, stop, regenerate } = useChat({
    id: subChatId,
    chat,
    resume: !!streamId,
    experimental_throttle: 50,  // Throttle updates to reduce re-renders during streaming
  })

  // Refs for useChat functions to keep callbacks stable across renders
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage
  const stopRef = useRef(stop)
  stopRef.current = stop

  // Stream debug: log status changes and scroll to plan/response start when streaming finishes
  const prevStatusRef = useRef(status)
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted"
    const nowFinished = status !== "streaming" && status !== "submitted"
    const streamingJustFinished = wasStreaming && nowFinished

    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status
    }

    // When streaming finishes and user was following along (auto-scroll enabled),
    // scroll to the start of the response/plan instead of staying at bottom
    if (streamingJustFinished && shouldAutoScrollRef.current) {
      requestAnimationFrame(() => {
        const container = chatContainerRef.current
        if (!container) return

        // Find the last assistant message element
        const allAssistantEls = container.querySelectorAll("[data-assistant-message-id]")
        const lastAssistantElement = allAssistantEls[allAssistantEls.length - 1]
        if (!lastAssistantElement) return

        // Check if it has a collapsed steps section OR a plan section
        const hasCollapsedSection = lastAssistantElement.querySelector("[data-collapsible-steps]")
        const hasPlanSection = lastAssistantElement.querySelector("[data-plan-section]")

        if (hasCollapsedSection || hasPlanSection) {
          // Scroll to the start of this response
          const rect = lastAssistantElement.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const scrollPos = container.scrollTop + (rect.top - containerRect.top) - 120 // 120px padding
          container.scrollTop = Math.max(0, scrollPos)
          currentScrollTopRef.current = container.scrollTop
          shouldAutoScrollRef.current = false
        }
      })
    }
  }, [status, subChatId, messages.length])

  const isStreaming = status === "streaming" || status === "submitted"

  // Track compacting status from SDK
  const compactingSubChats = useAtomValue(compactingSubChatsAtom)
  const isCompacting = compactingSubChats.has(subChatId)

  // Handler to trigger manual context compaction
  // Ref for isStreaming to keep handleCompact stable
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming

  const handleCompact = useCallback(() => {
    if (isStreamingRef.current) return // Can't compact while streaming
    sendMessageRef.current({
      role: "user",
      parts: [{ type: "text", text: "/compact" }],
    })
  }, [])

  // Handler to stop streaming - memoized to prevent ChatInputArea re-renders
  const handleStop = useCallback(async () => {
    // Mark as manually aborted to prevent completion sound
    agentChatStore.setManuallyAborted(subChatId, true)
    await stopRef.current()
    // Call DELETE endpoint to cancel server-side stream
    await fetch(
      `/api/agents/chat?id=${encodeURIComponent(subChatId)}`,
      { method: "DELETE", credentials: "include" },
    )
  }, [subChatId])

  // Keep refs updated for scroll save cleanup to use
  useEffect(() => {
    currentStatusRef.current = status
    // Find last assistant message ID
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant")
    lastAssistantMsgIdRef.current = lastAssistantMsg?.id
  }, [status, messages])

  // Sync loading status to atom for UI indicators
  // When streaming starts, set loading. When it stops, clear loading.
  // Unseen changes, sound notification, and sidebar refresh are handled in onFinish callback
  const setLoadingSubChats = useSetAtom(loadingSubChatsAtom)

  useEffect(() => {
    const storedParentChatId = agentChatStore.getParentChatId(subChatId)
    if (!storedParentChatId) return

    if (isStreaming) {
      setLoading(setLoadingSubChats, subChatId, storedParentChatId)
    } else {
      clearLoading(setLoadingSubChats, subChatId)
    }
  }, [isStreaming, subChatId, setLoadingSubChats])

  // Watch for pending PR message and send it
  const [pendingPrMessage, setPendingPrMessage] = useAtom(pendingPrMessageAtom)

  useEffect(() => {
    if (pendingPrMessage && !isStreaming) {
      // Clear the pending message immediately to prevent double-sending
      setPendingPrMessage(null)

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingPrMessage }],
      })
    }
  }, [pendingPrMessage, isStreaming, sendMessage, setPendingPrMessage])

  // Watch for pending Review message and send it
  const [pendingReviewMessage, setPendingReviewMessage] = useAtom(
    pendingReviewMessageAtom,
  )

  useEffect(() => {
    if (pendingReviewMessage && !isStreaming) {
      // Clear the pending message immediately to prevent double-sending
      setPendingReviewMessage(null)

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingReviewMessage }],
      })
    }
  }, [pendingReviewMessage, isStreaming, sendMessage, setPendingReviewMessage])

  // Pending user questions from AskUserQuestion tool
  const [pendingQuestions, setPendingQuestions] = useAtom(
    pendingUserQuestionsAtom,
  )

  // Memoize the last assistant message to avoid unnecessary recalculations
  const lastAssistantMessage = useMemo(
    () => messages.findLast((m) => m.role === "assistant"),
    [messages],
  )

  // Pre-compute token data for ChatInputArea to avoid passing unstable messages array
  // This prevents ChatInputArea from re-rendering on every streaming chunk
  const messageTokenData = useMemo(() => {
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCostUsd = 0
    for (const msg of messages) {
      if (msg.metadata) {
        totalInputTokens += msg.metadata.inputTokens || 0
        totalOutputTokens += msg.metadata.outputTokens || 0
        totalCostUsd += msg.metadata.totalCostUsd || 0
      }
    }
    return { totalInputTokens, totalOutputTokens, totalCostUsd, messageCount: messages.length }
  }, [messages])

  // Track previous streaming state to detect stream stop
  const prevIsStreamingRef = useRef(isStreaming)
  // Track if we recently stopped streaming (to prevent sync effect from restoring)
  const recentlyStoppedStreamRef = useRef(false)

  // Clear pending questions when streaming is aborted
  // This effect runs when isStreaming transitions from true to false
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current
    prevIsStreamingRef.current = isStreaming

    // Detect streaming stop transition
    if (wasStreaming && !isStreaming) {
      // Mark that we recently stopped streaming
      recentlyStoppedStreamRef.current = true
      // Clear the flag after a delay
      const flagTimeout = setTimeout(() => {
        recentlyStoppedStreamRef.current = false
      }, 500)

      // Streaming just stopped - if there's a pending question for this chat,
      // clear it after a brief delay (backend already handled the abort)
      if (pendingQuestions?.subChatId === subChatId) {
        const timeout = setTimeout(() => {
          // Re-check if still showing the same question (might have been cleared by other means)
          setPendingQuestions((current) => {
            if (current?.subChatId === subChatId) {
              return null
            }
            return current
          })
        }, 150) // Small delay to allow for race conditions with transport chunks
        return () => {
          clearTimeout(timeout)
          clearTimeout(flagTimeout)
        }
      }
      return () => clearTimeout(flagTimeout)
    }
  }, [isStreaming, subChatId, pendingQuestions?.subChatId, pendingQuestions?.toolUseId, setPendingQuestions])

  // Sync pending questions with messages state
  // This handles: 1) restoring on chat switch, 2) clearing when question is answered/timed out
  useEffect(() => {
    // Check if there's a pending AskUserQuestion in the last assistant message
    const pendingQuestionPart = lastAssistantMessage?.parts?.find(
      (part: any) =>
        part.type === "tool-AskUserQuestion" &&
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "result" &&
        part.input?.questions,
    ) as any | undefined


    // If streaming and we already have a pending question for this chat, keep it
    // (transport will manage it via chunks)
    if (isStreaming && pendingQuestions?.subChatId === subChatId) {
      // But if the question in messages is already answered, clear the atom
      if (pendingQuestions && !pendingQuestionPart) {
        // Check if the specific toolUseId is now answered
        const answeredPart = lastAssistantMessage?.parts?.find(
          (part: any) =>
            part.type === "tool-AskUserQuestion" &&
            part.toolCallId === pendingQuestions.toolUseId &&
            (part.state === "output-available" ||
              part.state === "output-error" ||
              part.state === "result"),
        )
        if (answeredPart) {
          setPendingQuestions(null)
        }
      }
      return
    }

    // Not streaming - DON'T restore pending questions from messages
    // If stream is not active, the question is either:
    // 1. Already answered (state would be "output-available")
    // 2. Interrupted/aborted (should not show dialog)
    // 3. Timed out (should not show dialog)
    // We only show the question dialog during active streaming when
    // the backend is waiting for user response.
    if (pendingQuestionPart) {
      // Don't restore - if there's an existing pending question for this chat, clear it
      if (pendingQuestions?.subChatId === subChatId) {
        setPendingQuestions(null)
      }
    } else {
      // No pending question - clear if belongs to this sub-chat
      if (pendingQuestions?.subChatId === subChatId) {
        setPendingQuestions(null)
      }
    }
  }, [subChatId, lastAssistantMessage, isStreaming, pendingQuestions, setPendingQuestions])

  // Handle answering questions
  const handleQuestionsAnswer = useCallback(
    async (answers: Record<string, string>) => {
      if (!pendingQuestions) return
      await trpcClient.claude.respondToolApproval.mutate({
        toolUseId: pendingQuestions.toolUseId,
        approved: true,
        updatedInput: { questions: pendingQuestions.questions, answers },
      })
      setPendingQuestions(null)
    },
    [pendingQuestions, setPendingQuestions],
  )

  // Handle skipping questions
  const handleQuestionsSkip = useCallback(async () => {
    if (!pendingQuestions) return
    const toolUseId = pendingQuestions.toolUseId

    // Clear UI immediately - don't wait for backend
    // This ensures dialog closes even if stream was already aborted
    setPendingQuestions(null)

    // Try to notify backend (may fail if already aborted - that's ok)
    try {
      await trpcClient.claude.respondToolApproval.mutate({
        toolUseId,
        approved: false,
        message: QUESTIONS_SKIPPED_MESSAGE,
      })
    } catch {
      // Stream likely already aborted - ignore
    }
  }, [pendingQuestions, setPendingQuestions])

  // Watch for pending auth retry message (after successful OAuth flow)
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(
    pendingAuthRetryMessageAtom,
  )

  useEffect(() => {
    // Only retry when:
    // 1. There's a pending message
    // 2. readyToRetry is true (set by modal on OAuth success)
    // 3. We're in the correct chat
    // 4. Not currently streaming
    if (
      pendingAuthRetry &&
      pendingAuthRetry.readyToRetry &&
      pendingAuthRetry.subChatId === subChatId &&
      !isStreaming
    ) {
      // Clear the pending message immediately to prevent double-sending
      setPendingAuthRetry(null)

      // Build message parts
      const parts: Array<
        { type: "text"; text: string } | { type: "data-image"; data: any }
      > = [{ type: "text", text: pendingAuthRetry.prompt }]

      // Add images if present
      if (pendingAuthRetry.images && pendingAuthRetry.images.length > 0) {
        for (const img of pendingAuthRetry.images) {
          parts.push({
            type: "data-image",
            data: {
              base64Data: img.base64Data,
              mediaType: img.mediaType,
              filename: img.filename,
            },
          })
        }
      }

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts,
      })
    }
  }, [
    pendingAuthRetry,
    isStreaming,
    sendMessage,
    setPendingAuthRetry,
    subChatId,
  ])

  const handlePlanApproval = useCallback(
    async (toolUseId: string, approved: boolean) => {
      if (!toolUseId) return
      setPlanApprovalPending((prev) => ({ ...prev, [toolUseId]: true }))
      try {
        await trpcClient.claude.respondToolApproval.mutate({
          toolUseId,
          approved,
        })
      } catch (error) {
        console.error("[plan-approval] Failed to respond:", error)
        toast.error("Failed to send plan approval. Please try again.")
      } finally {
        setPlanApprovalPending((prev) => {
          const next = { ...prev }
          delete next[toolUseId]
          return next
        })
      }
    },
    [],
  )

  // Handle plan approval - sends "Implement plan" message and switches to agent mode
  const handleApprovePlan = useCallback(() => {
    // Update store mode synchronously BEFORE sending (transport reads from store)
    useAgentSubChatStore.getState().updateSubChatMode(subChatId, "agent")

    // Update React state (for UI)
    setIsPlanMode(false)

    // Send "Implement plan" message (now in agent mode)
    sendMessageRef.current({
      role: "user",
      parts: [{ type: "text", text: "Implement plan" }],
    })
  }, [subChatId, setIsPlanMode])

  // Detect PR URLs in assistant messages and store them
  const detectedPrUrlRef = useRef<string | null>(null)

  useEffect(() => {
    // Only check after streaming ends
    if (isStreaming) return

    // Look through messages for PR URLs
    for (const msg of messages) {
      if (msg.role !== "assistant") continue

      // Extract text content from message
      const textContent =
        msg.parts
          ?.filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join(" ") || ""

      // Match GitHub PR URL pattern
      const prUrlMatch = textContent.match(
        /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/,
      )

      if (prUrlMatch && prUrlMatch[0] !== detectedPrUrlRef.current) {
        const prUrl = prUrlMatch[0]
        const prNumber = parseInt(prUrlMatch[1], 10)

        // Store to prevent duplicate calls
        detectedPrUrlRef.current = prUrl

        // Update database
        trpcClient.chats.updatePrInfo
          .mutate({ chatId: parentChatId, prUrl, prNumber })
          .then(() => {
            toast.success(`PR #${prNumber} created!`, {
              position: "top-center",
            })
            // Invalidate the agentChat query to refetch with new PR info
            utils.agents.getAgentChat.invalidate({ chatId: parentChatId })
          })

        break // Only process first PR URL found
      }
    }
  }, [messages, isStreaming, parentChatId])

  // Track changed files from Edit/Write tool calls
  // Only recalculates after streaming ends (not during streaming)
  const { changedFiles: changedFilesForSubChat } = useChangedFilesTracking(
    messages,
    subChatId,
    isStreaming,
    parentChatId,
  )

  // ESC, Ctrl+C and Cmd+Shift+Backspace handler for stopping stream
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      let shouldStop = false
      let shouldSkipQuestions = false

      // Check for Escape key without modifiers (works even from input fields, like terminal Ctrl+C)
      // Ignore if Cmd/Ctrl is pressed (reserved for Cmd+Esc to focus input)
      if (
        e.key === "Escape" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        isStreaming
      ) {
        const target = e.target as HTMLElement

        // Allow ESC to propagate if it originated from a modal/dialog/dropdown
        const isInsideOverlay = target.closest(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-state="open"]',
        )

        // Also check if any dialog/modal is open anywhere in the document (not just at event target)
        // This prevents stopping stream when settings dialog is open but not focused
        const hasOpenDialog = document.querySelector(
          '[role="dialog"][aria-modal="true"], [data-modal="agents-settings"]',
        )

        if (!isInsideOverlay && !hasOpenDialog) {
          // If there are pending questions for this chat, skip them instead of stopping stream
          if (pendingQuestions?.subChatId === subChatId) {
            shouldSkipQuestions = true
          } else {
            shouldStop = true
          }
        }
      }

      // Check for Ctrl+C (only Ctrl, not Cmd on Mac)
      if (e.ctrlKey && !e.metaKey && e.code === "KeyC") {
        if (!isStreaming) return

        const selection = window.getSelection()
        const hasSelection = selection && selection.toString().length > 0

        // If there's a text selection, let browser handle copy
        if (hasSelection) return

        shouldStop = true
      }

      // Check for Cmd+Shift+Backspace (Mac) or Ctrl+Shift+Backspace (Windows/Linux)
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key === "Backspace" &&
        isStreaming
      ) {
        shouldStop = true
      }

      if (shouldSkipQuestions) {
        e.preventDefault()
        await handleQuestionsSkip()
      } else if (shouldStop) {
        e.preventDefault()
        // Mark as manually aborted to prevent completion sound
        agentChatStore.setManuallyAborted(subChatId, true)
        await stop()
        // Call DELETE endpoint to cancel server-side stream
        await fetch(`/api/agents/chat?id=${encodeURIComponent(subChatId)}`, {
          method: "DELETE",
          credentials: "include",
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isStreaming, stop, subChatId, pendingQuestions, handleQuestionsSkip])

  // Keyboard shortcut: Enter to focus input when not already focused
  useFocusInputOnEnter(editorRef)

  // Keyboard shortcut: Cmd+Esc to toggle focus/blur (without stopping generation)
  useToggleFocusOnCmdEsc(editorRef)

  // Auto-trigger AI response when we have initial message but no response yet
  // Also trigger auto-rename for initial sub-chat with pre-populated message
  // IMPORTANT: Skip if there's an active streamId (prevents double-generation on resume)
  useEffect(() => {
    if (
      messages.length === 1 &&
      status === "ready" &&
      !streamId &&
      !hasTriggeredAutoGenerateRef.current
    ) {
      hasTriggeredAutoGenerateRef.current = true
      // Trigger rename for pre-populated initial message (from createAgentChat)
      if (!hasTriggeredRenameRef.current && isFirstSubChat) {
        const firstMsg = messages[0]
        if (firstMsg?.role === "user") {
          const textPart = firstMsg.parts?.find((p: any) => p.type === "text")
          if (textPart && "text" in textPart) {
            hasTriggeredRenameRef.current = true
            onAutoRename(textPart.text, subChatId)
          }
        }
      }
      regenerate()
    }
  }, [
    status,
    messages,
    regenerate,
    isFirstSubChat,
    onAutoRename,
    streamId,
    subChatId,
  ])

  // Ref to track if scroll has been restored for this sub-chat
  const scrollRestoredRef = useRef(false)

  // Save scroll position when LEAVING this tab (useLayoutEffect for synchronous save before unmount)
  useLayoutEffect(() => {
    const currentSubChatId = subChatId
    const currentMessageCount = messages.length

    return () => {
      // Save position synchronously before unmount
      const container = chatContainerRef.current
      if (!container) return

      // Don't save position during streaming - will show bottom on return
      const isCurrentlyStreaming =
        currentStatusRef.current === "streaming" ||
        currentStatusRef.current === "submitted"
      if (isCurrentlyStreaming) return

      const scrollData: ScrollPositionData = {
        scrollTop: currentScrollTopRef.current,
        scrollHeight: currentScrollHeightRef.current || container.scrollHeight,
        messageCount: currentMessageCount,
        wasStreaming: false,
        lastAssistantMsgId: lastAssistantMsgIdRef.current,
      }
      // Save to SYNCHRONOUS cache first (for immediate reads on next tab switch)
      scrollPositionsCacheStore.set(currentSubChatId, scrollData)
      // Also save to atom for localStorage persistence
      setScrollPositions((prev) => ({
        ...prev,
        [currentSubChatId]: scrollData,
      }))
    }
  }, [subChatId, messages.length, setScrollPositions])

  // Restore scroll position on mount with content-ready detection
  useLayoutEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    // Reset tracking refs on sub-chat change
    scrollRestoredRef.current = false

    // Read saved position data - FIRST from synchronous cache, then fallback to atom
    // The cache is updated synchronously in cleanup, while atom updates are async
    const cachedData = scrollPositionsCacheStore.get(subChatId)
    const atomData = scrollPositions[subChatId]
    const savedData = cachedData ?? atomData

    // Function to attempt scroll restoration
    const restoreScroll = (source: string): boolean => {
      if (scrollRestoredRef.current) return true

      const currentContainer = chatContainerRef.current
      if (!currentContainer) return false

      // During streaming - show bottom by default (user can still scroll freely)
      if (status === "streaming" || status === "submitted") {
        currentContainer.scrollTop = currentContainer.scrollHeight
        currentScrollTopRef.current = currentContainer.scrollHeight
        shouldAutoScrollRef.current = true
        scrollRestoredRef.current = true
        return true
      }

      // Has saved position data - restore it
      if (savedData !== undefined) {
        const canRestore = currentContainer.scrollHeight >= savedData.scrollTop

        if (canRestore) {
          currentContainer.scrollTop = savedData.scrollTop
          currentScrollTopRef.current = savedData.scrollTop
          currentScrollHeightRef.current = currentContainer.scrollHeight
          scrollRestoredRef.current = true
          justRestoredRef.current = true
          shouldAutoScrollRef.current = isAtBottom()
          return true
        }
      } else if (currentContainer.scrollHeight > currentContainer.clientHeight) {
        // No saved position but has content - check for Response/Plan block to scroll to
        const allAssistantEls = currentContainer.querySelectorAll("[data-assistant-message-id]")
        const lastAssistantElement = allAssistantEls[allAssistantEls.length - 1]

        if (lastAssistantElement) {
          const hasCollapsedSection = lastAssistantElement.querySelector("[data-collapsible-steps]")
          const hasPlanSection = lastAssistantElement.querySelector("[data-plan-section]")

          if (hasCollapsedSection || hasPlanSection) {
            // Scroll to start of Response/Plan block
            const rect = lastAssistantElement.getBoundingClientRect()
            const containerRect = currentContainer.getBoundingClientRect()
            const scrollPos = currentContainer.scrollTop + (rect.top - containerRect.top) - 120
            currentContainer.scrollTop = Math.max(0, scrollPos)
            currentScrollTopRef.current = currentContainer.scrollTop
            scrollRestoredRef.current = true
            shouldAutoScrollRef.current = false
            return true
          }
        }

        // No Response/Plan block - scroll to bottom
        currentContainer.scrollTop = currentContainer.scrollHeight
        currentScrollTopRef.current = currentContainer.scrollHeight
        scrollRestoredRef.current = true
        shouldAutoScrollRef.current = true
        return true
      } else if (messages.length === 0) {
        // Empty chat - mark as restored (nothing to scroll)
        scrollRestoredRef.current = true
        shouldAutoScrollRef.current = true
        return true
      }

      return false
    }

    // Try immediate restoration
    if (restoreScroll("immediate")) return

    // If not restored, use ResizeObserver to wait for content to render
    let attempts = 0
    const maxAttempts = 15 // More attempts for slow renders

    const resizeObserver = new ResizeObserver(() => {
      attempts++
      if (restoreScroll(`ResizeObserver(${attempts})`) || attempts >= maxAttempts) {
        resizeObserver.disconnect()
      }
    })

    resizeObserver.observe(container)

    // Also try with rAF chain as fallback
    const tryWithRAF = (count: number) => {
      if (scrollRestoredRef.current || count >= 5) return

      requestAnimationFrame(() => {
        if (restoreScroll(`rAF(${count})`)) return
        tryWithRAF(count + 1)
      })
    }

    requestAnimationFrame(() => tryWithRAF(0))

    return () => {
      resizeObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subChatId]) // Only trigger on sub-chat change, not on messages change

  // Attach scroll listener (separate effect)
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [handleScroll])

  // Track previous subChatId to skip auto-scroll on tab switch
  const prevSubChatIdForAutoScrollRef = useRef<string | null>(null)

  // Auto scroll to bottom when messages change (only if user is at bottom)
  // Skip on tab switch and right after restore
  useEffect(() => {
    const isTabSwitch =
      prevSubChatIdForAutoScrollRef.current !== null &&
      prevSubChatIdForAutoScrollRef.current !== subChatId
    prevSubChatIdForAutoScrollRef.current = subChatId

    if (isTabSwitch) return

    // Skip if we just restored scroll position (prevents interference with restoration)
    if (justRestoredRef.current) {
      justRestoredRef.current = false
      return
    }

    // Skip if scroll restoration is still in progress (ResizeObserver may still be working)
    if (!scrollRestoredRef.current) return

    // Auto-scroll during streaming if user hasn't scrolled up
    // shouldAutoScrollRef is set to false when user scrolls UP (see handleScroll)
    // No need to check isAtBottom() here - if shouldAutoScrollRef is true, we follow the stream
    if (shouldAutoScrollRef.current && status === "streaming") {
      const container = chatContainerRef.current
      if (container) {
        requestAnimationFrame(() => {
          // Set flag to ignore the scroll event this will trigger
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          // Reset flag after scroll event has been processed
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      }
    }
  }, [messages, status, subChatId]) // Note: shouldAutoScroll intentionally not in deps - we only want to scroll on message/status changes, not when user scrolls to bottom

  // Auto-focus input when switching to this chat (any sub-chat change)
  // Skip on mobile to prevent keyboard from opening automatically
  useEffect(() => {
    if (isMobile) return // Don't autofocus on mobile

    // Use requestAnimationFrame to ensure DOM is ready after render
    requestAnimationFrame(() => {
      editorRef.current?.focus()
    })
  }, [subChatId, isMobile])

  // Refs for handleSend to avoid recreating callback on every messages change
  const messagesLengthRef = useRef(messages.length)
  messagesLengthRef.current = messages.length
  const isPlanModeRef = useRef(isPlanMode)
  isPlanModeRef.current = isPlanMode
  const imagesRef = useRef(images)
  imagesRef.current = images
  const filesRef = useRef(files)
  filesRef.current = files

  const handleSend = useCallback(async () => {
    // Block sending while sandbox is still being set up
    if (sandboxSetupStatus !== "ready") {
      return
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    // Get value from uncontrolled editor
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const currentImages = imagesRef.current
    const currentFiles = filesRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && img.url).length > 0

    if (!hasText && !hasImages) return

    const text = inputValue.trim()
    // Clear editor and draft from localStorage
    editorRef.current?.clear()
    if (parentChatId) {
      clearSubChatDraft(parentChatId, subChatId)
    }

    // Track message sent
    trackMessageSent({
      workspaceId: subChatId,
      messageLength: text.length,
      mode: isPlanModeRef.current ? "plan" : "agent",
    })

    // Trigger auto-rename on first message in a new sub-chat
    if (messagesLengthRef.current === 0 && !hasTriggeredRenameRef.current) {
      hasTriggeredRenameRef.current = true
      onAutoRename(text || "Image message", subChatId)
    }

    // Build message parts: images first, then files, then text
    // Include base64Data for API transmission
    const parts: any[] = [
      ...currentImages
        .filter((img) => !img.isLoading && img.url)
        .map((img) => ({
          type: "data-image" as const,
          data: {
            url: img.url,
            mediaType: img.mediaType,
            filename: img.filename,
            base64Data: img.base64Data, // Include base64 data for Claude API
          },
        })),
      ...currentFiles
        .filter((f) => !f.isLoading && f.url)
        .map((f) => ({
          type: "data-file" as const,
          data: {
            url: f.url,
            mediaType: (f as any).mediaType,
            filename: f.filename,
            size: f.size,
          },
        })),
    ]

    if (text) {
      parts.push({ type: "text", text })
    }

    clearAll()

    // Optimistic update: immediately update chat's updated_at and resort array for instant sidebar resorting
    if (teamId) {
      const now = new Date()
      utils.agents.getAgentChats.setData({ teamId }, (old: any) => {
        if (!old) return old
        // Update the timestamp and sort by updated_at descending
        const updated = old.map((c: any) =>
          c.id === parentChatId ? { ...c, updated_at: now } : c,
        )
        return updated.sort(
          (a: any, b: any) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
      })
    }

    // Desktop app: Optimistic update for chats.list to update sidebar immediately
    const queryClient = getQueryClient()
    if (queryClient) {
      const now = new Date()
      const queries = queryClient.getQueryCache().getAll()
      const chatsListQuery = queries.find(q =>
        Array.isArray(q.queryKey) &&
        Array.isArray(q.queryKey[0]) &&
        q.queryKey[0][0] === 'chats' &&
        q.queryKey[0][1] === 'list'
      )
      if (chatsListQuery) {
        queryClient.setQueryData(chatsListQuery.queryKey, (old: any[] | undefined) => {
          if (!old) return old
          // Update the timestamp and sort by updatedAt descending
          const updated = old.map((c: any) =>
            c.id === parentChatId ? { ...c, updatedAt: now } : c,
          )
          return updated.sort(
            (a: any, b: any) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )
        })
      }
    }

    // Optimistically update sub-chat timestamp to move it to top
    useAgentSubChatStore.getState().updateSubChatTimestamp(subChatId)

    // Force scroll to bottom when sending a message
    shouldAutoScrollRef.current = true
    const container = chatContainerRef.current
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }

    await sendMessageRef.current({ role: "user", parts })
  }, [
    sandboxSetupStatus,
    isArchived,
    onRestoreWorkspace,
    parentChatId,
    subChatId,
    onAutoRename,
    clearAll,
    teamId,
  ])

  // Helper to get message text content
  const getMessageTextContent = (msg: any): string => {
    return (
      msg.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") || ""
    )
  }

  // Helper to copy message content
  const copyMessageContent = (msg: any) => {
    const textContent = getMessageTextContent(msg)
    if (textContent) {
      navigator.clipboard.writeText(stripEmojis(textContent))
    }
  }

  // Check if there's an unapproved plan (ExitPlanMode without subsequent "Implement plan")
  const hasUnapprovedPlan = useMemo(() => {
    // Traverse messages from end to find unapproved ExitPlanMode
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]

      // If user message says "Implement plan", plan is already approved
      if (msg.role === "user") {
        const text = msg.parts?.find((p: any) => p.type === "text")?.text || ""
        if (text.trim().toLowerCase() === "implement plan") {
          return false
        }
      }

      // If assistant message with ExitPlanMode, we found an unapproved plan
      if (msg.role === "assistant") {
        const exitPlanPart = msg.parts?.find(
          (p: any) => p.type === "tool-ExitPlanMode",
        )
        if (exitPlanPart?.output?.plan) {
          return true
        }
      }
    }
    return false
  }, [messages])

  // Update pending plan approvals atom for sidebar indicators
  const setPendingPlanApprovals = useSetAtom(pendingPlanApprovalsAtom)
  useEffect(() => {
    setPendingPlanApprovals((prev: Set<string>) => {
      const newSet = new Set(prev)
      if (hasUnapprovedPlan) {
        newSet.add(subChatId)
      } else {
        newSet.delete(subChatId)
      }
      // Only return new set if it changed
      if (newSet.size !== prev.size || ![...newSet].every((id) => prev.has(id))) {
        return newSet
      }
      return prev
    })
  }, [hasUnapprovedPlan, subChatId, setPendingPlanApprovals])

  // Keyboard shortcut: Cmd+Enter to approve plan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        e.metaKey &&
        !e.shiftKey &&
        hasUnapprovedPlan &&
        !isStreaming
      ) {
        e.preventDefault()
        handleApprovePlan()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [hasUnapprovedPlan, isStreaming, handleApprovePlan])

  // Cmd/Ctrl + Arrow Down to scroll to bottom (works even when focused in input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowDown" &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault()
        scrollToBottom()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [scrollToBottom])

  // Clean up pending plan approval when unmounting
  useEffect(() => {
    return () => {
      setPendingPlanApprovals((prev: Set<string>) => {
        if (prev.has(subChatId)) {
          const newSet = new Set(prev)
          newSet.delete(subChatId)
          return newSet
        }
        return prev
      })
    }
  }, [subChatId, setPendingPlanApprovals])

  // Compute sticky top class for user messages
  const stickyTopClass = isMobile
    ? CHAT_LAYOUT.stickyTopMobile
    : isSubChatsSidebarOpen
      ? CHAT_LAYOUT.stickyTopSidebarOpen
      : CHAT_LAYOUT.stickyTopSidebarClosed

  // Sync messages to Jotai store for isolated rendering
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)
  useLayoutEffect(() => {
    syncMessages({ messages, status })
  }, [messages, status, syncMessages])

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Chat title - flex above scroll area (desktop only) */}
      {!isMobile && (
        <div
          className={cn(
            "flex-shrink-0 pb-2",
            isSubChatsSidebarOpen ? "pt-[52px]" : "pt-2",
          )}
        >
          <ChatTitleEditor
            name={subChatName}
            placeholder="New Chat"
            onSave={handleRenameSubChat}
            isMobile={false}
            chatId={subChatId}
            hasMessages={messages.length > 0}
          />
        </div>
      )}

      {/* Messages */}
      <div
        ref={(el) => {
          chatContainerRef.current = el
        }}
        className="flex-1 overflow-y-auto w-full relative allow-text-selection outline-none"
        tabIndex={-1}
        data-chat-container
      >
        <div className="px-2 max-w-2xl mx-auto -mb-4 pb-8 space-y-4">
          <div>
            {/* ISOLATED: Messages rendered via Jotai atom subscription
                Each component subscribes to specific atoms and only re-renders when those change */}
            <IsolatedMessagesSection
              subChatId={subChatId}
              isMobile={isMobile}
              sandboxSetupStatus={sandboxSetupStatus}
              stickyTopClass={stickyTopClass}
              sandboxSetupError={sandboxSetupError}
              onRetrySetup={onRetrySetup}
              UserBubbleComponent={AgentUserMessageBubble}
              ToolCallComponent={AgentToolCall}
              MessageGroupWrapper={MessageGroup}
              toolRegistry={AgentToolRegistry}
            />
          </div>
        </div>
      </div>

      {/* User questions panel - shows when AskUserQuestion tool is called */}
      {/* Only show if the pending question belongs to THIS sub-chat */}
      {pendingQuestions && pendingQuestions.subChatId === subChatId && (
        <div className="px-4 relative z-20">
          <div className="w-full px-2 max-w-2xl mx-auto">
            <AgentUserQuestion
              pendingQuestions={pendingQuestions}
              onAnswer={handleQuestionsAnswer}
              onSkip={handleQuestionsSkip}
            />
          </div>
        </div>
      )}

      {/* Sub-chat status card - pinned above input */}
      {(isStreaming || changedFilesForSubChat.length > 0) &&
        !(pendingQuestions?.subChatId === subChatId) && (
          <div className="px-2 -mb-6 relative z-0">
            <div className="w-full max-w-2xl mx-auto px-2">
              <SubChatStatusCard
                chatId={parentChatId}
                isStreaming={isStreaming}
                isCompacting={isCompacting}
                changedFiles={changedFilesForSubChat}
                worktreePath={projectPath}
                onStop={handleStop}
              />
            </div>
          </div>
        )}

      {/* Input - isolated component to prevent re-renders */}
      <ChatInputArea
        editorRef={editorRef}
        fileInputRef={fileInputRef}
        onSend={handleSend}
        onStop={handleStop}
        onApprovePlan={handleApprovePlan}
        onCompact={handleCompact}
        onCreateNewSubChat={onCreateNewSubChat}
        isStreaming={isStreaming}
        hasUnapprovedPlan={hasUnapprovedPlan}
        isCompacting={isCompacting}
        images={images}
        files={files}
        onAddAttachments={handleAddAttachments}
        onRemoveImage={removeImage}
        onRemoveFile={removeFile}
        isUploading={isUploading}
        messageTokenData={messageTokenData}
        subChatId={subChatId}
        parentChatId={parentChatId}
        teamId={teamId}
        repository={repository}
        sandboxId={sandboxId}
        projectPath={projectPath}
        changedFiles={changedFilesForSubChat}
        isMobile={isMobile}
      />

      {/* Scroll to bottom button - isolated component to avoid re-renders during streaming */}
      <ScrollToBottomButton
        containerRef={chatContainerRef}
        onScrollToBottom={scrollToBottom}
      />
    </div>
  )
}

// Chat View wrapper - handles loading and creates chat object
export function ChatView({
  chatId,
  isSidebarOpen,
  onToggleSidebar,
  selectedTeamName,
  selectedTeamImageUrl,
  isMobileFullscreen = false,
  onBackToChats,
  onOpenPreview,
  onOpenDiff,
  onOpenTerminal,
}: {
  chatId: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  selectedTeamName?: string
  selectedTeamImageUrl?: string
  isMobileFullscreen?: boolean
  onBackToChats?: () => void
  onOpenPreview?: () => void
  onOpenDiff?: () => void
  onOpenTerminal?: () => void
}) {
  const [selectedTeamId] = useAtom(selectedTeamIdAtom)
  const [selectedModelId] = useAtom(lastSelectedModelIdAtom)
  const [isPlanMode] = useAtom(isPlanModeAtom)
  const setLoadingSubChats = useSetAtom(loadingSubChatsAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const setUnseenChanges = useSetAtom(agentsUnseenChangesAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)
  const setJustCreatedIds = useSetAtom(justCreatedIdsAtom)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const setUndoStack = useSetAtom(undoStackAtom)
  const { notifyAgentComplete, notifyAgentNeedsInput, notifyPlanReady } = useDesktopNotifications()

  // Check if any chat has unseen changes
  const hasAnyUnseenChanges = unseenChanges.size > 0
  const [, forceUpdate] = useState({})
  const [isPreviewSidebarOpen, setIsPreviewSidebarOpen] = useAtom(
    agentsPreviewSidebarOpenAtom,
  )
  // Per-chat diff sidebar state - each chat remembers its own open/close state
  const diffSidebarAtom = useMemo(
    () => diffSidebarOpenAtomFamily(chatId),
    [chatId],
  )
  const [isDiffSidebarOpen, setIsDiffSidebarOpen] = useAtom(diffSidebarAtom)
  const [isTerminalSidebarOpen, setIsTerminalSidebarOpen] = useAtom(
    terminalSidebarOpenAtom,
  )
  const [diffStats, setDiffStats] = useState({
    fileCount: 0,
    additions: 0,
    deletions: 0,
    isLoading: true,
    hasChanges: false,
  })
  // Store raw diff content to pass to AgentDiffView (avoids double fetch)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  // Store pre-parsed file diffs (avoids double parsing in AgentDiffView)
  const [parsedFileDiffs, setParsedFileDiffs] = useState<ReturnType<
    typeof splitUnifiedDiffByFile
  > | null>(null)
  // Store prefetched file contents for instant diff view opening
  const [prefetchedFileContents, setPrefetchedFileContents] = useState<
    Record<string, string>
  >({})
  const [diffMode, setDiffMode] = useAtom(diffViewModeAtom)
  const subChatsSidebarMode = useAtomValue(agentsSubChatsSidebarModeAtom)

  // Track diff sidebar width for responsive header
  const storedDiffSidebarWidth = useAtomValue(agentsDiffSidebarWidthAtom)
  const diffSidebarRef = useRef<HTMLDivElement>(null)
  const diffViewRef = useRef<AgentDiffViewRef>(null)
  const [diffSidebarWidth, setDiffSidebarWidth] = useState(
    storedDiffSidebarWidth,
  )
  // Track if all diff files are collapsed/expanded for button disabled states
  const [diffCollapseState, setDiffCollapseState] = useState({
    allCollapsed: false,
    allExpanded: true,
  })

  // ResizeObserver to track diff sidebar width in real-time (atom only updates after resize ends)
  useEffect(() => {
    if (!isDiffSidebarOpen) {
      return
    }

    let observer: ResizeObserver | null = null
    let rafId: number | null = null

    const checkRef = () => {
      const element = diffSidebarRef.current
      if (!element) {
        // Retry if ref not ready yet
        rafId = requestAnimationFrame(checkRef)
        return
      }

      // Set initial width
      setDiffSidebarWidth(element.offsetWidth || storedDiffSidebarWidth)

      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width
          if (width > 0) {
            setDiffSidebarWidth(width)
          }
        }
      })

      observer.observe(element)
    }

    checkRef()

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
    }
  }, [isDiffSidebarOpen, storedDiffSidebarWidth])

  // Track changed files across all sub-chats for throttled diff refresh
  const subChatFiles = useAtomValue(subChatFilesAtom)
  // Initialize to Date.now() to prevent double-fetch on mount
  // (the "mount" effect already fetches, throttle should wait)
  const lastDiffFetchTimeRef = useRef<number>(Date.now())
  const DIFF_THROTTLE_MS = 2000 // Max 1 fetch per 2 seconds

  // Clear "unseen changes" when chat is opened
  useEffect(() => {
    setUnseenChanges((prev: Set<string>) => {
      if (prev.has(chatId)) {
        const next = new Set(prev)
        next.delete(chatId)
        return next
      }
      return prev
    })
  }, [chatId, setUnseenChanges])

  // Get sub-chat state from store
  const activeSubChatId = useAgentSubChatStore((state) => state.activeSubChatId)

  // Clear sub-chat "unseen changes" indicator when sub-chat becomes active
  useEffect(() => {
    if (!activeSubChatId) return
    setSubChatUnseenChanges((prev: Set<string>) => {
      if (prev.has(activeSubChatId)) {
        const next = new Set(prev)
        next.delete(activeSubChatId)
        return next
      }
      return prev
    })
  }, [activeSubChatId, setSubChatUnseenChanges])
  const allSubChats = useAgentSubChatStore((state) => state.allSubChats)

  // tRPC utils for optimistic cache updates
  const utils = api.useUtils()

  // tRPC mutations for renaming
  const renameSubChatMutation = api.agents.renameSubChat.useMutation()
  const renameChatMutation = api.agents.renameChat.useMutation()
  const generateSubChatNameMutation =
    api.agents.generateSubChatName.useMutation()

  // PR creation loading state
  const [isCreatingPr, setIsCreatingPr] = useState(false)
  // Review loading state
  const [isReviewing, setIsReviewing] = useState(false)

  const { data: agentChat, isLoading } = api.agents.getAgentChat.useQuery(
    { chatId },
    { enabled: !!chatId },
  )
  const agentSubChats = (agentChat?.subChats ?? []) as Array<{
    id: string
    name?: string | null
    mode?: "plan" | "agent" | null
    created_at?: Date | string | null
    updated_at?: Date | string | null
    messages?: any
    stream_id?: string | null
  }>

  // Get PR status when PR exists (for checking if it's open/merged/closed)
  const hasPrNumber = !!agentChat?.prNumber
  const { data: prStatusData, isLoading: isPrStatusLoading } = trpc.chats.getPrStatus.useQuery(
    { chatId },
    {
      enabled: hasPrNumber,
      refetchInterval: 30000, // Poll every 30 seconds
    }
  )
  const prState = prStatusData?.pr?.state as "open" | "draft" | "merged" | "closed" | undefined
  // PR is open if state is explicitly "open" or "draft"
  // When PR status is still loading, assume open to avoid showing wrong button
  const isPrOpen = hasPrNumber && (isPrStatusLoading || prState === "open" || prState === "draft")

  // Merge PR mutation
  const trpcUtils = trpc.useUtils()
  const mergePrMutation = trpc.chats.mergePr.useMutation({
    onSuccess: () => {
      toast.success("PR merged successfully!", { position: "top-center" })
      // Invalidate PR status to update button state
      trpcUtils.chats.getPrStatus.invalidate({ chatId })
    },
    onError: (error) => {
      toast.error(error.message || "Failed to merge PR", { position: "top-center" })
    },
  })

  const handleMergePr = useCallback(() => {
    mergePrMutation.mutate({ chatId, method: "squash" })
  }, [chatId, mergePrMutation])

  // Restore archived workspace mutation (silent - no toast)
  const restoreWorkspaceMutation = trpc.chats.restore.useMutation({
    onSuccess: (restoredChat) => {
      if (restoredChat) {
        // Update the main chat list cache
        trpcUtils.chats.list.setData({}, (oldData) => {
          if (!oldData) return [restoredChat]
          if (oldData.some((c) => c.id === restoredChat.id)) return oldData
          return [restoredChat, ...oldData]
        })
      }
      // Invalidate both lists to refresh
      trpcUtils.chats.list.invalidate()
      trpcUtils.chats.listArchived.invalidate()
      // Invalidate this chat's data to update isArchived state
      utils.agents.getAgentChat.invalidate({ chatId })
    },
  })

  const handleRestoreWorkspace = useCallback(() => {
    restoreWorkspaceMutation.mutate({ id: chatId })
  }, [chatId, restoreWorkspaceMutation])

  // Check if this workspace is archived
  const isArchived = !!agentChat?.archivedAt

  // Get user usage data for credit checks
  const { data: usageData } = api.usage.getUserUsage.useQuery()

  // Desktop: use worktreePath instead of sandbox
  const worktreePath = agentChat?.worktreePath as string | null
  // Desktop: original project path for MCP config lookup
  const originalProjectPath = (agentChat as any)?.project?.path as string | undefined
  // Fallback for web: use sandbox_id
  const sandboxId = agentChat?.sandbox_id
  const sandboxUrl = sandboxId ? `https://3003-${sandboxId}.e2b.app` : null
  // Desktop uses worktreePath, web uses sandboxUrl
  const chatWorkingDir = worktreePath || sandboxUrl

  // Extract port, repository, and quick setup flag from meta
  const meta = agentChat?.meta as {
    sandboxConfig?: { port?: number }
    repository?: string
    isQuickSetup?: boolean
  } | null
  const repository = meta?.repository

  // Track if we've already triggered sandbox setup for this chat
  // Check if this is a quick setup (no preview available)
  const isQuickSetup = meta?.isQuickSetup || !meta?.sandboxConfig?.port
  const previewPort = meta?.sandboxConfig?.port ?? 3000

  // Check if preview can be opened (sandbox with port exists and not quick setup)
  const canOpenPreview = !!(
    sandboxId &&
    !isQuickSetup &&
    meta?.sandboxConfig?.port
  )

  // Check if diff can be opened (worktree for desktop, sandbox for web)
  const canOpenDiff = !!worktreePath || !!sandboxId

  // Close preview sidebar if preview becomes unavailable
  useEffect(() => {
    if (!canOpenPreview && isPreviewSidebarOpen) {
      setIsPreviewSidebarOpen(false)
    }
  }, [canOpenPreview, isPreviewSidebarOpen, setIsPreviewSidebarOpen])

  // Note: We no longer forcibly close diff sidebar when canOpenDiff is false.
  // The sidebar render is guarded by canOpenDiff, so it naturally hides.
  // Per-chat state (diffSidebarOpenAtomFamily) preserves each chat's preference.

  // DEBUG: Early return to isolate infinite loop - PHASE 3

  // Fetch diff stats - extracted as callback for reuse in onFinish
  const fetchDiffStatsDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingDiffRef = useRef(false)

  const fetchDiffStats = useCallback(async () => {
    // Desktop uses worktreePath, web uses sandboxId
    if (!worktreePath && !sandboxId) {
      setDiffStats({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        isLoading: false,
        hasChanges: false,
      })
      setDiffContent(null)
      return
    }

    // Prevent duplicate parallel fetches
    if (isFetchingDiffRef.current) {
      return
    }
    isFetchingDiffRef.current = true

    try {
      let rawDiff: string | null = null

      // Desktop: use tRPC to get diff from worktree
      if (worktreePath && chatId) {
        const result = await trpcClient.chats.getDiff.query({ chatId })
        rawDiff = result.diff
      }
      // Web fallback: use sandbox API
      else if (sandboxId) {
        const response = await fetch(`/api/agents/sandbox/${sandboxId}/diff`)
        if (!response.ok) {
          setDiffStats((prev) => ({ ...prev, isLoading: false }))
          return
        }
        const data = await response.json()
        rawDiff = data.diff || null
      }

      // Store raw diff for AgentDiffView
      setDiffContent(rawDiff)

      if (rawDiff && rawDiff.trim()) {
        // Parse diff to get file list and stats
        const parsedFiles = splitUnifiedDiffByFile(rawDiff)

        // Store parsed files to avoid re-parsing in AgentDiffView
        setParsedFileDiffs(parsedFiles)

        let additions = 0
        let deletions = 0
        for (const file of parsedFiles) {
          additions += file.additions
          deletions += file.deletions
        }

        setDiffStats({
          fileCount: parsedFiles.length,
          additions,
          deletions,
          isLoading: false,
          hasChanges: additions > 0 || deletions > 0,
        })

        // Desktop: prefetch file contents for instant diff view opening
        // Limit prefetch to prevent overwhelming the system with too many files
        const MAX_PREFETCH_FILES = 20
        const filesToPrefetch = parsedFiles.slice(0, MAX_PREFETCH_FILES)

        if (worktreePath && filesToPrefetch.length > 0) {
          // Capture current chatId for race condition check
          const currentChatId = chatId

          // Build list of files to fetch (filter out /dev/null)
          const filesToFetch = filesToPrefetch
            .map((file) => {
              const filePath =
                file.newPath && file.newPath !== "/dev/null"
                  ? file.newPath
                  : file.oldPath
              if (!filePath || filePath === "/dev/null") return null
              return { key: file.key, filePath }
            })
            .filter((f): f is { key: string; filePath: string } => f !== null)

          if (filesToFetch.length > 0) {
            // Single batch IPC call instead of multiple individual calls
            trpcClient.changes.readMultipleWorkingFiles
              .query({
                worktreePath,
                files: filesToFetch,
              })
              .then((results) => {
                // Check if we're still on the same chat (prevent race condition)
                // Note: sub-chat doesn't matter - file contents are same for whole chat
                if (currentChatId !== chatId) {
                  return
                }

                const contents: Record<string, string> = {}
                for (const [key, result] of Object.entries(results)) {
                  if (result.ok) {
                    contents[key] = result.content
                  }
                }
                setPrefetchedFileContents(contents)
              })
              .catch((err) => {
                console.warn("[prefetch] Failed to batch prefetch files:", err)
              })
          }
        }
      } else {
        setDiffStats({
          fileCount: 0,
          additions: 0,
          deletions: 0,
          isLoading: false,
          hasChanges: false,
        })
        setParsedFileDiffs(null)
        setPrefetchedFileContents({})
      }
    } catch {
      setDiffStats((prev) => ({ ...prev, isLoading: false }))
    } finally {
      isFetchingDiffRef.current = false
    }
  }, [worktreePath, sandboxId, chatId]) // Note: activeSubChatId removed - diff is same for whole chat

  // Debounced version for calling after stream ends
  const fetchDiffStatsDebounced = useCallback(() => {
    if (fetchDiffStatsDebounceRef.current) {
      clearTimeout(fetchDiffStatsDebounceRef.current)
    }
    fetchDiffStatsDebounceRef.current = setTimeout(() => {
      fetchDiffStats()
    }, 500) // 500ms debounce to avoid spamming if multiple streams end
  }, [fetchDiffStats])

  // Ref to hold the latest fetchDiffStatsDebounced for use in onFinish callbacks
  const fetchDiffStatsRef = useRef(fetchDiffStatsDebounced)
  useEffect(() => {
    fetchDiffStatsRef.current = fetchDiffStatsDebounced
  }, [fetchDiffStatsDebounced])

  // Fetch diff stats on mount and when worktreePath/sandboxId changes
  useEffect(() => {
    fetchDiffStats()
  }, [fetchDiffStats])

  // Calculate total file count across all sub-chats for change detection
  const totalSubChatFileCount = useMemo(() => {
    let count = 0
    subChatFiles.forEach((files) => {
      count += files.length
    })
    return count
  }, [subChatFiles])

  // Throttled refetch when sub-chat files change (agent edits/writes files)
  // This keeps the top-right diff sidebar in sync with the bottom "Generated X files" bar
  useEffect(() => {
    // Skip if no files tracked yet (initial state)
    if (totalSubChatFileCount === 0) return

    const now = Date.now()
    const timeSinceLastFetch = now - lastDiffFetchTimeRef.current

    if (timeSinceLastFetch >= DIFF_THROTTLE_MS) {
      // Enough time passed, fetch immediately
      lastDiffFetchTimeRef.current = now
      fetchDiffStats()
    } else {
      // Schedule fetch for when throttle window ends
      const delay = DIFF_THROTTLE_MS - timeSinceLastFetch
      const timer = setTimeout(() => {
        lastDiffFetchTimeRef.current = Date.now()
        fetchDiffStats()
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [totalSubChatFileCount, fetchDiffStats])

  // Handle Create PR - sends a message to Claude to create the PR
  const setPendingPrMessage = useSetAtom(pendingPrMessageAtom)

  const handleCreatePr = useCallback(async () => {
    if (!chatId) {
      toast.error("Chat ID is required", { position: "top-center" })
      return
    }

    setIsCreatingPr(true)
    try {
      // Get PR context from backend
      const context = await trpcClient.chats.getPrContext.query({ chatId })
      if (!context) {
        toast.error("Could not get git context", { position: "top-center" })
        return
      }

      // Generate message and set it for ChatViewInner to send
      const message = generatePrMessage(context)
      setPendingPrMessage(message)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare PR request",
        { position: "top-center" },
      )
    } finally {
      setIsCreatingPr(false)
    }
  }, [chatId, setPendingPrMessage])

  // Handle Commit to existing PR - sends a message to Claude to commit and push
  const [isCommittingToPr, setIsCommittingToPr] = useState(false)
  const handleCommitToPr = useCallback(async () => {
    if (!chatId) {
      toast.error("Chat ID is required", { position: "top-center" })
      return
    }

    try {
      setIsCommittingToPr(true)
      const context = await trpcClient.chats.getPrContext.query({ chatId })
      if (!context) {
        toast.error("Could not get git context", { position: "top-center" })
        return
      }

      const message = generateCommitToPrMessage(context)
      setPendingPrMessage(message)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare commit request",
        { position: "top-center" },
      )
    } finally {
      setIsCommittingToPr(false)
    }
  }, [chatId, setPendingPrMessage])

  // Handle Review - sends a message to Claude to review the diff
  const setPendingReviewMessage = useSetAtom(pendingReviewMessageAtom)

  const handleReview = useCallback(async () => {
    if (!chatId) {
      toast.error("Chat ID is required", { position: "top-center" })
      return
    }

    setIsReviewing(true)
    try {
      // Get PR context from backend
      const context = await trpcClient.chats.getPrContext.query({ chatId })
      if (!context) {
        toast.error("Could not get git context", { position: "top-center" })
        return
      }

      // Generate review message and set it for ChatViewInner to send
      const message = generateReviewMessage(context)
      setPendingReviewMessage(message)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start review",
        { position: "top-center" },
      )
    } finally {
      setIsReviewing(false)
    }
  }, [chatId, setPendingReviewMessage])

  // Initialize store when chat data loads
  useEffect(() => {
    if (!agentChat) return

    const store = useAgentSubChatStore.getState()

    // Only initialize if chatId changed
    if (store.chatId !== chatId) {
      store.setChatId(chatId)
    }

    // Re-get fresh state after setChatId may have loaded from localStorage
    const freshState = useAgentSubChatStore.getState()

    // Get sub-chats from DB (like Canvas - no isPersistedInDb flag)
    // Build a map of existing local sub-chats to preserve their created_at if DB doesn't have it
    const existingSubChatsMap = new Map(
      freshState.allSubChats.map((sc) => [sc.id, sc]),
    )

    const dbSubChats: SubChatMeta[] = agentSubChats.map((sc) => {
      const existingLocal = existingSubChatsMap.get(sc.id)
      const createdAt =
        typeof sc.created_at === "string"
          ? sc.created_at
          : sc.created_at?.toISOString()
      const updatedAt =
        typeof sc.updated_at === "string"
          ? sc.updated_at
          : sc.updated_at?.toISOString()
      return {
        id: sc.id,
        name: sc.name || "New Chat",
        // Prefer DB timestamp, fall back to local timestamp, then current time
        created_at:
          createdAt ?? existingLocal?.created_at ?? new Date().toISOString(),
        updated_at: updatedAt ?? existingLocal?.updated_at,
        mode:
          (sc.mode as "plan" | "agent" | undefined) ||
          existingLocal?.mode ||
          "agent",
      }
    })
    const dbSubChatIds = new Set(dbSubChats.map((sc) => sc.id))

    // Start with DB sub-chats
    const allSubChats: SubChatMeta[] = [...dbSubChats]

    // For each open tab ID that's NOT in DB, add placeholder (like Canvas)
    // This prevents losing tabs during race conditions
    const currentOpenIds = freshState.openSubChatIds
    currentOpenIds.forEach((id) => {
      if (!dbSubChatIds.has(id)) {
        allSubChats.push({
          id,
          name: "New Chat",
          created_at: new Date().toISOString(),
        })
      }
    })

    freshState.setAllSubChats(allSubChats)

    // All open tabs are now valid (we created placeholders for non-DB ones)
    const validOpenIds = currentOpenIds

    if (validOpenIds.length === 0 && allSubChats.length > 0) {
      // No valid open tabs, open the first sub-chat
      freshState.addToOpenSubChats(allSubChats[0].id)
      freshState.setActiveSubChat(allSubChats[0].id)
    } else if (validOpenIds.length > 0) {
      // Validate active tab is in open tabs
      const currentActive = freshState.activeSubChatId
      if (!currentActive || !validOpenIds.includes(currentActive)) {
        freshState.setActiveSubChat(validOpenIds[0])
      }
    }
  }, [agentChat, chatId])

  // Create or get Chat instance for a sub-chat
  const getOrCreateChat = useCallback(
    (subChatId: string): Chat<any> | null => {
      // Desktop uses worktreePath, web uses sandboxUrl
      if (!chatWorkingDir || !agentChat) {
        return null
      }

      // Return existing chat if we have it
      const existing = agentChatStore.get(subChatId)
      if (existing) {
        return existing
      }

      // Find sub-chat data
      const subChat = agentSubChats.find((sc) => sc.id === subChatId)
      const messages = (subChat?.messages as any[]) || []

      // Get mode from store metadata (falls back to current isPlanMode)
      const subChatMeta = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === subChatId)
      const subChatMode = subChatMeta?.mode || (isPlanMode ? "plan" : "agent")

      // Desktop: use IPCChatTransport for local Claude Code execution
      // Note: Extended thinking setting is read dynamically inside the transport
      // projectPath: original project path for MCP config lookup (worktreePath is the cwd)
      const projectPath = (agentChat as any)?.project?.path as string | undefined
      const transport = worktreePath
        ? new IPCChatTransport({
            chatId,
            subChatId,
            cwd: worktreePath,
            projectPath,
            mode: subChatMode,
          })
        : null // Web transport not supported in desktop app

      if (!transport) {
        console.error("[getOrCreateChat] No transport available")
        return null
      }

      const newChat = new Chat<any>({
        id: subChatId,
        messages,
        transport,
        onError: () => {
          // Error handling
        },
        // Clear loading when streaming completes (works even if component unmounted)
        onFinish: () => {
          clearLoading(setLoadingSubChats, subChatId)

          // Check if this was a manual abort (ESC/Ctrl+C) - skip sound if so
          const wasManuallyAborted =
            agentChatStore.wasManuallyAborted(subChatId)
          agentChatStore.clearManuallyAborted(subChatId)

          // Get CURRENT values at runtime (not stale closure values)
          const currentActiveSubChatId =
            useAgentSubChatStore.getState().activeSubChatId
          const currentSelectedChatId = appStore.get(selectedAgentChatIdAtom)

          const isViewingThisSubChat = currentActiveSubChatId === subChatId
          const isViewingThisChat = currentSelectedChatId === chatId

          if (!isViewingThisSubChat) {
            setSubChatUnseenChanges((prev: Set<string>) => {
              const next = new Set(prev)
              next.add(subChatId)
              return next
            })
          }

          // Also mark parent chat as unseen if user is not viewing it
          if (!isViewingThisChat) {
            setUnseenChanges((prev: Set<string>) => {
              const next = new Set(prev)
              next.add(chatId)
              return next
            })

            // Play completion sound only if NOT manually aborted and sound is enabled
            if (!wasManuallyAborted) {
              const isSoundEnabled = appStore.get(soundNotificationsEnabledAtom)
              if (isSoundEnabled) {
                try {
                  const audio = new Audio("./sound.mp3")
                  audio.volume = 1.0
                  audio.play().catch(() => {})
                } catch {
                  // Ignore audio errors
                }
              }

              // Show native notification (desktop app, when window not focused)
              notifyAgentComplete(agentChat?.name || "Agent")
            }
          }

          // Refresh diff stats after agent finishes making changes
          fetchDiffStatsRef.current()

          // Note: sidebar timestamp update is handled via optimistic update in handleSend
          // No need to refetch here as it would overwrite the optimistic update with stale data
        },
      })

      agentChatStore.set(subChatId, newChat, chatId)
      // Store streamId at creation time to prevent resume during active streaming
      // tRPC refetch would update stream_id in DB, but store stays stable
      agentChatStore.setStreamId(subChatId, subChat?.stream_id || null)
      forceUpdate({}) // Trigger re-render to use new chat
      return newChat
    },
    [
      agentChat,
      chatWorkingDir,
      worktreePath,
      chatId,
      isPlanMode,
      setSubChatUnseenChanges,
      selectedChatId,
      setUnseenChanges,
      notifyAgentComplete,
    ],
  )

  // Handle creating a new sub-chat
  const handleCreateNewSubChat = useCallback(async () => {
    const store = useAgentSubChatStore.getState()
    const subChatMode = isPlanMode ? "plan" : "agent"

    // Create sub-chat in DB first to get the real ID
    const newSubChat = await trpcClient.chats.createSubChat.mutate({
      chatId,
      name: "New Chat",
      mode: subChatMode,
    })
    const newId = newSubChat.id

    // Track this subchat as just created for typewriter effect
    setJustCreatedIds((prev) => new Set([...prev, newId]))

    // Add to allSubChats with placeholder name
    store.addToAllSubChats({
      id: newId,
      name: "New Chat",
      created_at: new Date().toISOString(),
      mode: subChatMode,
    })

    // Add to open tabs and set as active
    store.addToOpenSubChats(newId)
    store.setActiveSubChat(newId)

    // Create empty Chat instance for the new sub-chat
    if (worktreePath) {
      // Desktop: use IPCChatTransport for local Claude Code execution
      // Note: Extended thinking setting is read dynamically inside the transport
      // projectPath: original project path for MCP config lookup (worktreePath is the cwd)
      const projectPath = (agentChat as any)?.project?.path as string | undefined
      const transport = new IPCChatTransport({
        chatId,
        subChatId: newId,
        cwd: worktreePath,
        projectPath,
        mode: subChatMode,
      })

      const newChat = new Chat<any>({
        id: newId,
        messages: [],
        transport,
        // Clear loading when streaming completes
        onFinish: () => {
          clearLoading(setLoadingSubChats, newId)

          // Check if this was a manual abort (ESC/Ctrl+C) - skip sound if so
          const wasManuallyAborted = agentChatStore.wasManuallyAborted(newId)
          agentChatStore.clearManuallyAborted(newId)

          // Get CURRENT values at runtime (not stale closure values)
          const currentActiveSubChatId =
            useAgentSubChatStore.getState().activeSubChatId
          const currentSelectedChatId = appStore.get(selectedAgentChatIdAtom)

          const isViewingThisSubChat = currentActiveSubChatId === newId
          const isViewingThisChat = currentSelectedChatId === chatId

          if (!isViewingThisSubChat) {
            setSubChatUnseenChanges((prev: Set<string>) => {
              const next = new Set(prev)
              next.add(newId)
              return next
            })
          }

          // Also mark parent chat as unseen if user is not viewing it
          if (!isViewingThisChat) {
            setUnseenChanges((prev: Set<string>) => {
              const next = new Set(prev)
              next.add(chatId)
              return next
            })

            // Play completion sound only if NOT manually aborted and sound is enabled
            if (!wasManuallyAborted) {
              const isSoundEnabled = appStore.get(soundNotificationsEnabledAtom)
              if (isSoundEnabled) {
                try {
                  const audio = new Audio("./sound.mp3")
                  audio.volume = 1.0
                  audio.play().catch(() => {})
                } catch {
                  // Ignore audio errors
                }
              }

              // Show native notification (desktop app, when window not focused)
              notifyAgentComplete(agentChat?.name || "Agent")
            }
          }

          // Refresh diff stats after agent finishes making changes
          fetchDiffStatsRef.current()

          // Note: sidebar timestamp update is handled via optimistic update in handleSend
          // No need to refetch here as it would overwrite the optimistic update with stale data
        },
      })
      agentChatStore.set(newId, newChat, chatId)
      agentChatStore.setStreamId(newId, null) // New chat has no active stream
      forceUpdate({}) // Trigger re-render
    }
  }, [
    worktreePath,
    chatId,
    isPlanMode,
    setSubChatUnseenChanges,
    selectedChatId,
    setUnseenChanges,
    notifyAgentComplete,
    agentChat?.name,
  ])

  // Keyboard shortcut: New sub-chat
  // Web: Opt+Cmd+T (browser uses Cmd+T for new tab)
  // Desktop: Cmd+T
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isDesktop = isDesktopApp()

      // Desktop: Cmd+T (without Alt)
      if (isDesktop && e.metaKey && e.code === "KeyT" && !e.altKey) {
        e.preventDefault()
        handleCreateNewSubChat()
        return
      }

      // Web: Opt+Cmd+T (with Alt)
      if (e.altKey && e.metaKey && e.code === "KeyT") {
        e.preventDefault()
        handleCreateNewSubChat()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleCreateNewSubChat])

  // desktop notification for pending user questions (when window is not focused)
  const pendingUserQuestions = useAtomValue(pendingUserQuestionsAtom)
  const prevPendingQuestionsRef = useRef<typeof pendingUserQuestions>(null)
  useEffect(() => {
    // only trigger on new question appearing, not on every re-render
    const hadQuestion = !!prevPendingQuestionsRef.current
    const hasQuestion = !!pendingUserQuestions
    prevPendingQuestionsRef.current = pendingUserQuestions

    if (!hadQuestion && hasQuestion) {
      notifyAgentNeedsInput(agentChat?.name || "Agent")
    }
  }, [pendingUserQuestions, notifyAgentNeedsInput, agentChat?.name])

  // Multi-select state for sub-chats (for Cmd+W bulk close)
  const selectedSubChatIds = useAtomValue(selectedSubChatIdsAtom)
  const isSubChatMultiSelectMode = useAtomValue(isSubChatMultiSelectModeAtom)
  const clearSubChatSelection = useSetAtom(clearSubChatSelectionAtom)

  // Helper to add sub-chat to undo stack
  const addSubChatToUndoStack = useCallback((subChatId: string) => {
    const timeoutId = setTimeout(() => {
      setUndoStack((prev) => prev.filter(
        (item) => !(item.type === "subchat" && item.subChatId === subChatId)
      ))
    }, 10000)

    setUndoStack((prev) => [...prev, {
      type: "subchat",
      subChatId,
      chatId,
      timeoutId,
    }])
  }, [chatId, setUndoStack])

  // Keyboard shortcut: Close active sub-chat (or bulk close if multi-select mode)
  // Web: Opt+Cmd+W (browser uses Cmd+W to close tab)
  // Desktop: Cmd+W
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isDesktop = isDesktopApp()

      // Desktop: Cmd+W (without Alt)
      const isDesktopShortcut =
        isDesktop &&
        e.metaKey &&
        e.code === "KeyW" &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey
      // Web: Opt+Cmd+W (with Alt)
      const isWebShortcut = e.altKey && e.metaKey && e.code === "KeyW"

      if (isDesktopShortcut || isWebShortcut) {
        e.preventDefault()

        const store = useAgentSubChatStore.getState()

        // If multi-select mode, bulk close selected sub-chats
        if (isSubChatMultiSelectMode && selectedSubChatIds.size > 0) {
          const idsToClose = Array.from(selectedSubChatIds)
          const remainingOpenIds = store.openSubChatIds.filter(
            (id) => !idsToClose.includes(id),
          )

          // Don't close all tabs via hotkey - user should use sidebar dialog for last tab
          if (remainingOpenIds.length > 0) {
            idsToClose.forEach((id) => {
              store.removeFromOpenSubChats(id)
              addSubChatToUndoStack(id)
            })
          }
          clearSubChatSelection()
          return
        }

        // Otherwise close active sub-chat
        const activeId = store.activeSubChatId
        const openIds = store.openSubChatIds

        // Only close if we have more than one tab open and there's an active tab
        // removeFromOpenSubChats automatically switches to the last remaining tab
        if (activeId && openIds.length > 1) {
          store.removeFromOpenSubChats(activeId)
          addSubChatToUndoStack(activeId)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isSubChatMultiSelectMode, selectedSubChatIds, clearSubChatSelection, addSubChatToUndoStack])

  // Keyboard shortcut: Navigate between sub-chats
  // Web: Opt+Cmd+[ and Opt+Cmd+] (browser uses Cmd+[ for back)
  // Desktop: Cmd+[ and Cmd+]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isDesktop = isDesktopApp()

      // Check for previous sub-chat shortcut ([ key)
      const isPrevDesktop =
        isDesktop &&
        e.metaKey &&
        e.code === "BracketLeft" &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey
      const isPrevWeb = e.altKey && e.metaKey && e.code === "BracketLeft"

      if (isPrevDesktop || isPrevWeb) {
        e.preventDefault()

        const store = useAgentSubChatStore.getState()
        const activeId = store.activeSubChatId
        const openIds = store.openSubChatIds

        // Only navigate if we have multiple tabs
        if (openIds.length <= 1) return

        // If no active tab, select first one
        if (!activeId) {
          store.setActiveSubChat(openIds[0])
          return
        }

        // Find current index
        const currentIndex = openIds.indexOf(activeId)

        if (currentIndex === -1) {
          // Current tab not found, select first
          store.setActiveSubChat(openIds[0])
          return
        }

        // Navigate to previous tab (cycle to end if at start)
        const nextIndex =
          currentIndex - 1 < 0 ? openIds.length - 1 : currentIndex - 1
        const nextId = openIds[nextIndex]

        if (nextId) {
          store.setActiveSubChat(nextId)
        }
      }

      // Check for next sub-chat shortcut (] key)
      const isNextDesktop =
        isDesktop &&
        e.metaKey &&
        e.code === "BracketRight" &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey
      const isNextWeb = e.altKey && e.metaKey && e.code === "BracketRight"

      if (isNextDesktop || isNextWeb) {
        e.preventDefault()

        const store = useAgentSubChatStore.getState()
        const activeId = store.activeSubChatId
        const openIds = store.openSubChatIds

        // Only navigate if we have multiple tabs
        if (openIds.length <= 1) return

        // If no active tab, select first one
        if (!activeId) {
          store.setActiveSubChat(openIds[0])
          return
        }

        // Find current index
        const currentIndex = openIds.indexOf(activeId)

        if (currentIndex === -1) {
          // Current tab not found, select first
          store.setActiveSubChat(openIds[0])
          return
        }

        // Navigate to next tab (cycle to start if at end)
        const nextIndex = (currentIndex + 1) % openIds.length
        const nextId = openIds[nextIndex]

        if (nextId) {
          store.setActiveSubChat(nextId)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Keyboard shortcut: Cmd + D to toggle diff sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd (Meta) + D (without Alt/Shift)
      if (
        e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey &&
        e.code === "KeyD"
      ) {
        e.preventDefault()
        e.stopPropagation()

        // Toggle: close if open, open if has changes
        if (isDiffSidebarOpen) {
          setIsDiffSidebarOpen(false)
        } else if (diffStats.hasChanges) {
          setIsDiffSidebarOpen(true)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [diffStats.hasChanges, isDiffSidebarOpen])

  // Keyboard shortcut: Create PR (preview)
  // Web: Opt+Cmd+P (browser uses Cmd+P for print)
  // Desktop: Cmd+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isDesktop = isDesktopApp()

      // Desktop: Cmd+P (without Alt)
      const isDesktopShortcut =
        isDesktop &&
        e.metaKey &&
        e.code === "KeyP" &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey
      // Web: Opt+Cmd+P (with Alt)
      const isWebShortcut = e.altKey && e.metaKey && e.code === "KeyP"

      if (isDesktopShortcut || isWebShortcut) {
        e.preventDefault()
        e.stopPropagation()

        // Only create PR if there are changes and not already creating
        if (diffStats.hasChanges && !isCreatingPr) {
          handleCreatePr()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [diffStats.hasChanges, isCreatingPr, handleCreatePr])

  // Keyboard shortcut: Cmd + Shift + E to restore archived workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        e.code === "KeyE"
      ) {
        if (isArchived && !restoreWorkspaceMutation.isPending) {
          e.preventDefault()
          e.stopPropagation()
          handleRestoreWorkspace()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isArchived, restoreWorkspaceMutation.isPending, handleRestoreWorkspace])

  // Handle auto-rename for sub-chat and parent chat
  // Receives subChatId as param to avoid stale closure issues
  const handleAutoRename = useCallback(
    (userMessage: string, subChatId: string) => {
      // Check if this is the first sub-chat using agentSubChats directly
      // to avoid race condition with store initialization
      const firstSubChatId = getFirstSubChatId(agentSubChats)
      const isFirst = firstSubChatId === subChatId

      autoRenameAgentChat({
        subChatId,
        parentChatId: chatId,
        userMessage,
        isFirstSubChat: isFirst,
        generateName: async (msg) => {
          return generateSubChatNameMutation.mutateAsync({ userMessage: msg })
        },
        renameSubChat: async (input) => {
          await renameSubChatMutation.mutateAsync(input)
        },
        renameChat: async (input) => {
          await renameChatMutation.mutateAsync(input)
        },
        updateSubChatName: (subChatIdToUpdate, name) => {
          // Update local store
          useAgentSubChatStore
            .getState()
            .updateSubChatName(subChatIdToUpdate, name)
          // Also update query cache so init effect doesn't overwrite
          utils.agents.getAgentChat.setData({ chatId }, (old) => {
            if (!old) return old
            const existsInCache = old.subChats.some(
              (sc) => sc.id === subChatIdToUpdate,
            )
            if (!existsInCache) {
              // Sub-chat not in cache yet (DB save still in flight) - add it
              return {
                ...old,
                subChats: [
                  ...old.subChats,
                  {
                    id: subChatIdToUpdate,
                    name,
                    created_at: new Date(),
                    updated_at: new Date(),
                    messages: [],
                    mode: "agent",
                    stream_id: null,
                    chat_id: chatId,
                  },
                ],
              }
            }
            return {
              ...old,
              subChats: old.subChats.map((sc) =>
                sc.id === subChatIdToUpdate ? { ...sc, name } : sc,
              ),
            }
          })
        },
        updateChatName: (chatIdToUpdate, name) => {
          // Optimistic update for sidebar (list query)
          // On desktop, selectedTeamId is always null, so we update unconditionally
          utils.agents.getAgentChats.setData(
            { teamId: selectedTeamId },
            (old) => {
              if (!old) return old
              return old.map((c) =>
                c.id === chatIdToUpdate ? { ...c, name } : c,
              )
            },
          )
          // Optimistic update for header (single chat query)
          utils.agents.getAgentChat.setData(
            { chatId: chatIdToUpdate },
            (old) => {
              if (!old) return old
              return { ...old, name }
            },
          )
        },
      })
    },
    [
      chatId,
      agentSubChats,
      generateSubChatNameMutation,
      renameSubChatMutation,
      renameChatMutation,
      selectedTeamId,
      utils.agents.getAgentChats,
      utils.agents.getAgentChat,
    ],
  )

  // Get or create Chat instance for active sub-chat
  const activeChat = useMemo(() => {
    if (!activeSubChatId || !agentChat) {
      return null
    }
    return getOrCreateChat(activeSubChatId)
  }, [activeSubChatId, agentChat, getOrCreateChat, chatId, chatWorkingDir])

  // Check if active sub-chat is the first one (for renaming parent chat)
  // Use agentSubChats directly to avoid race condition with store initialization
  const isFirstSubChatActive = useMemo(() => {
    if (!activeSubChatId) return false
    return getFirstSubChatId(agentSubChats) === activeSubChatId
  }, [activeSubChatId, agentSubChats])

  // Determine if chat header should be hidden
  const shouldHideChatHeader =
    subChatsSidebarMode === "sidebar" &&
    isPreviewSidebarOpen &&
    isDiffSidebarOpen &&
    !isMobileFullscreen

  // No early return - let the UI render with loading state handled by activeChat check below

  return (
    <div className="flex h-full flex-col">
      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Chat Panel */}
        <div
          className="flex-1 flex flex-col overflow-hidden relative"
          style={{ minWidth: "350px" }}
        >
          {/* SubChatSelector header - absolute when sidebar open (desktop only), regular div otherwise */}
          {!shouldHideChatHeader && (
            <div
              className={cn(
                "relative z-20 pointer-events-none",
                // Mobile: always flex; Desktop: absolute when sidebar open, flex when closed
                !isMobileFullscreen && subChatsSidebarMode === "sidebar"
                  ? `absolute top-0 left-0 right-0 ${CHAT_LAYOUT.headerPaddingSidebarOpen}`
                  : `flex-shrink-0 ${CHAT_LAYOUT.headerPaddingSidebarClosed}`,
              )}
            >
              {/* Gradient background - only when not absolute */}
              {(isMobileFullscreen || subChatsSidebarMode !== "sidebar") && (
                <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-transparent" />
              )}
              <div className="pointer-events-auto flex items-center justify-between relative">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {/* Mobile header - simplified with chat name as trigger */}
                  {isMobileFullscreen ? (
                    <MobileChatHeader
                      onCreateNew={handleCreateNewSubChat}
                      onBackToChats={onBackToChats}
                      onOpenPreview={onOpenPreview}
                      canOpenPreview={canOpenPreview}
                      onOpenDiff={onOpenDiff}
                      canOpenDiff={canOpenDiff}
                      diffStats={diffStats}
                      onOpenTerminal={onOpenTerminal}
                      canOpenTerminal={!!worktreePath}
                      isArchived={isArchived}
                      onRestore={handleRestoreWorkspace}
                    />
                  ) : (
                    <>
                      {/* Header controls - desktop only */}
                      <AgentsHeaderControls
                        isSidebarOpen={isSidebarOpen}
                        onToggleSidebar={onToggleSidebar}
                        hasUnseenChanges={hasAnyUnseenChanges}
                        isSubChatsSidebarOpen={
                          subChatsSidebarMode === "sidebar"
                        }
                      />
                      <SubChatSelector
                        onCreateNew={handleCreateNewSubChat}
                        isMobile={false}
                        onBackToChats={onBackToChats}
                        onOpenPreview={onOpenPreview}
                        canOpenPreview={canOpenPreview}
                        onOpenDiff={() => setIsDiffSidebarOpen(true)}
                        canOpenDiff={canOpenDiff}
                        isDiffSidebarOpen={isDiffSidebarOpen}
                        diffStats={diffStats}
                      />
                    </>
                  )}
                </div>
                {/* Open Preview Button - shows when preview is closed (desktop only) */}
                {!isMobileFullscreen &&
                  !isPreviewSidebarOpen &&
                  sandboxId &&
                  (canOpenPreview ? (
                    <Tooltip delayDuration={500}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsPreviewSidebarOpen(true)}
                          className="h-6 w-6 p-0 hover:bg-foreground/10 transition-colors text-foreground flex-shrink-0 rounded-md ml-2"
                          aria-label="Open preview"
                        >
                          <IconOpenSidebarRight className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open preview</TooltipContent>
                    </Tooltip>
                  ) : (
                    <PreviewSetupHoverCard>
                      <span className="inline-flex ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled
                          className="h-6 w-6 p-0 text-muted-foreground flex-shrink-0 rounded-md cursor-not-allowed pointer-events-none"
                          aria-label="Preview not available"
                        >
                          <IconOpenSidebarRight className="h-4 w-4" />
                        </Button>
                      </span>
                    </PreviewSetupHoverCard>
                  ))}
                {/* Terminal Button - shows when terminal is closed and worktree exists (desktop only) */}
                {!isMobileFullscreen &&
                  !isTerminalSidebarOpen &&
                  worktreePath && (
                    <Tooltip delayDuration={500}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsTerminalSidebarOpen(true)}
                          className="h-6 w-6 p-0 hover:bg-foreground/10 transition-colors text-foreground flex-shrink-0 rounded-md ml-2"
                          aria-label="Open terminal"
                        >
                          <TerminalSquare className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Open terminal
                        <Kbd>⌘J</Kbd>
                      </TooltipContent>
                    </Tooltip>
                  )}
                {/* Restore Button - shows when viewing archived workspace (desktop only) */}
                {!isMobileFullscreen && isArchived && (
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        onClick={handleRestoreWorkspace}
                        disabled={restoreWorkspaceMutation.isPending}
                        className="h-6 px-2 gap-1.5 hover:bg-foreground/10 transition-colors text-foreground flex-shrink-0 rounded-md ml-2 flex items-center"
                        aria-label="Restore workspace"
                      >
                        <IconTextUndo className="h-4 w-4" />
                        <span className="text-xs">Restore</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Restore workspace
                      <Kbd>⇧⌘E</Kbd>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          )}

          {/* Chat Content */}
          {activeChat && activeSubChatId ? (
            <ChatViewInner
              key={activeSubChatId}
              chat={activeChat}
              subChatId={activeSubChatId}
              parentChatId={chatId}
              isFirstSubChat={isFirstSubChatActive}
              onAutoRename={handleAutoRename}
              onCreateNewSubChat={handleCreateNewSubChat}
              teamId={selectedTeamId || undefined}
              repository={repository}
              streamId={agentChatStore.getStreamId(activeSubChatId)}
              isMobile={isMobileFullscreen}
              isSubChatsSidebarOpen={subChatsSidebarMode === "sidebar"}
              sandboxId={sandboxId || undefined}
              projectPath={worktreePath || undefined}
              isArchived={isArchived}
              onRestoreWorkspace={handleRestoreWorkspace}
            />
          ) : (
            <>
              {/* Empty chat area - no loading indicator */}
              <div className="flex-1" />

              {/* Disabled input while loading */}
              <div className="px-2 pb-2">
                <div className="w-full max-w-2xl mx-auto">
                  <div className="relative w-full">
                    <PromptInput
                      className="border bg-input-background relative z-10 p-2 rounded-xl opacity-50 pointer-events-none"
                      maxHeight={200}
                    >
                      <div className="p-1 text-muted-foreground text-sm">
                        Plan, @ for context, / for commands
                      </div>
                      <PromptInputActions className="w-full">
                        <div className="flex items-center gap-0.5 flex-1 min-w-0">
                          {/* Mode selector placeholder */}
                          <button
                            disabled
                            className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground rounded-md cursor-not-allowed"
                          >
                            <AgentIcon className="h-3.5 w-3.5" />
                            <span>Agent</span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                          </button>

                          {/* Model selector placeholder */}
                          <button
                            disabled
                            className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground rounded-md cursor-not-allowed"
                          >
                            <ClaudeCodeIcon className="h-3.5 w-3.5" />
                            <span>
                              Sonnet{" "}
                              <span className="text-muted-foreground">4.5</span>
                            </span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                          </button>
                        </div>
                        <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                          {/* Attach button placeholder */}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled
                            className="h-7 w-7 rounded-sm cursor-not-allowed"
                          >
                            <AttachIcon className="h-4 w-4" />
                          </Button>

                          {/* Send button */}
                          <div className="ml-1">
                            <AgentSendButton
                              disabled={true}
                              onClick={() => {}}
                            />
                          </div>
                        </div>
                      </PromptInputActions>
                    </PromptInput>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Diff Sidebar - hidden on mobile fullscreen and when diff is not available */}
        {canOpenDiff && !isMobileFullscreen && (
          <ResizableSidebar
            isOpen={isDiffSidebarOpen}
            onClose={() => setIsDiffSidebarOpen(false)}
            widthAtom={agentsDiffSidebarWidthAtom}
            minWidth={350}
            side="right"
            animationDuration={0}
            initialWidth={0}
            exitWidth={0}
            showResizeTooltip={true}
            className="bg-background border-l"
            style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
          >
            <div
              ref={diffSidebarRef}
              className="flex flex-col h-full min-w-0 overflow-hidden"
            >
              {/* Header with stats, toggle and close button */}
              <div className="flex items-center justify-between pl-3 pr-1.5 h-10 bg-background flex-shrink-0 border-b border-border/50 overflow-hidden">
                {/* Left: Stats - truncates when space is limited */}
                <div className="flex items-center gap-2 min-w-0 flex-shrink overflow-hidden">
                  {!diffStats.isLoading && diffStats.hasChanges && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
                      <span className="font-mono truncate">
                        {diffStats.fileCount} file
                        {diffStats.fileCount !== 1 ? "s" : ""}
                      </span>
                      {(diffStats.additions > 0 || diffStats.deletions > 0) && (
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{diffStats.additions}
                          </span>
                          <span className="text-red-600 dark:text-red-400">
                            -{diffStats.deletions}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Right: Review (when space) + Create PR + View toggle + More menu + Close button */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Review button - visible when sidebar is wide enough (>=420px) */}
                  {diffStats.hasChanges && diffSidebarWidth >= 420 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={handleReview}
                          disabled={isReviewing}
                          className="h-7 px-2.5 text-xs gap-1.5 transition-transform duration-150 active:scale-[0.97] rounded-md"
                        >
                          {isReviewing ? (
                            <IconSpinner className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>{isReviewing ? "Reviewing..." : "Review"}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>
                        <span>Get AI code review</span>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Create PR / Merge / Commit button - dynamic based on PR state */}
                  {/*
                    Button logic:
                    1. No PR exists + has changes → "Create PR"
                    2. PR is open/draft + no changes → "Merge"
                    3. PR is open/draft + has changes → "Commit" (to push to existing PR)
                    4. PR is merged/closed + has changes → "Create PR" (for new PR)
                    5. PR is merged/closed + no changes → nothing (just show status in PrStatusBar)
                  */}
                  {/* Show Create PR when: no PR exists, OR PR is merged/closed with new changes */}
                  {diffStats.hasChanges && (!hasPrNumber || (hasPrNumber && !isPrOpen)) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleCreatePr}
                          disabled={isCreatingPr}
                          className="h-7 px-2.5 text-xs gap-1.5 transition-transform duration-150 active:scale-[0.97] rounded-md"
                        >
                          {isCreatingPr ? (
                            <IconSpinner className="w-3.5 h-3.5" />
                          ) : (
                            <PullRequestIcon className="w-3.5 h-3.5" />
                          )}
                          <span className="whitespace-nowrap">
                            {isCreatingPr ? "Creating..." : "Create PR"}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>
                        Create a Pull Request
                        <Kbd>{getShortcutKey("preview")}</Kbd>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Show Merge when PR is open/draft and no new changes */}
                  {hasPrNumber && isPrOpen && !diffStats.hasChanges && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleMergePr}
                          disabled={mergePrMutation.isPending}
                          className="h-7 px-2.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white transition-transform duration-150 active:scale-[0.97] rounded-md"
                        >
                          {mergePrMutation.isPending ? (
                            <IconSpinner className="w-3.5 h-3.5" />
                          ) : (
                            <GitMerge className="w-3.5 h-3.5" />
                          )}
                          <span className="whitespace-nowrap">
                            {mergePrMutation.isPending ? "Merging..." : "Merge"}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>
                        Merge Pull Request (squash)
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Show Commit when PR is open/draft but there are new uncommitted changes */}
                  {hasPrNumber && isPrOpen && diffStats.hasChanges && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleCommitToPr}
                          disabled={isCommittingToPr}
                          className="h-7 px-2.5 text-xs gap-1.5 transition-transform duration-150 active:scale-[0.97] rounded-md"
                        >
                          {isCommittingToPr ? (
                            <IconSpinner className="w-3.5 h-3.5" />
                          ) : (
                            <GitCommitHorizontal className="w-3.5 h-3.5" />
                          )}
                          <span className="whitespace-nowrap">
                            {isCommittingToPr ? "Committing..." : "Commit"}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8}>
                        Commit changes and push to PR
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* View toggle - visible when sidebar is wide enough (>=480px) */}
                  {diffSidebarWidth >= 480 && (
                    <div className="relative bg-muted rounded-md h-7 p-0.5 flex">
                      <div
                        className="absolute inset-y-0.5 rounded bg-background shadow transition-all duration-200 ease-in-out"
                        style={{
                          width: "calc(50% - 2px)",
                          left:
                            diffMode === DiffModeEnum.Split
                              ? "2px"
                              : "calc(50%)",
                        }}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setDiffMode(DiffModeEnum.Split)}
                            className="relative z-[2] px-1.5 h-full flex items-center justify-center transition-colors duration-200 rounded text-muted-foreground"
                          >
                            <Columns2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8}>
                          Split view
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setDiffMode(DiffModeEnum.Unified)}
                            className="relative z-[2] px-1.5 h-full flex items-center justify-center transition-colors duration-200 rounded text-muted-foreground"
                          >
                            <Rows2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8}>
                          Unified view
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  {/* More menu (three dots) - shown when sidebar is narrow or many files */}
                  {(diffSidebarWidth < 480 || diffStats.fileCount > 10) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-7 w-7 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md flex-shrink-0"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={4}
                        className="w-40"
                      >
                        {/* Review option - shown only when hidden in header (<420px) */}
                        {diffStats.hasChanges && diffSidebarWidth < 420 && (
                          <DropdownMenuItem
                            onClick={handleReview}
                            disabled={isReviewing}
                            className="gap-2"
                          >
                            {isReviewing ? (
                              <IconSpinner className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isReviewing ? "Reviewing..." : "Review"}
                            </span>
                          </DropdownMenuItem>
                        )}
                        {/* View mode submenu - only show when toggle is hidden in header */}
                        {diffSidebarWidth < 480 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="gap-2">
                              {diffMode === DiffModeEnum.Split ? (
                                <Columns2 className="w-3.5 h-3.5" />
                              ) : (
                                <Rows2 className="w-3.5 h-3.5" />
                              )}
                              <span>View</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent
                              sideOffset={6}
                              alignOffset={-4}
                              className="min-w-0"
                            >
                              <DropdownMenuItem
                                onClick={() => setDiffMode(DiffModeEnum.Split)}
                                className="relative pl-6 gap-1.5"
                              >
                                {diffMode === DiffModeEnum.Split && (
                                  <span className="absolute left-1.5 flex h-3.5 w-3.5 items-center justify-center">
                                    <CheckIcon className="h-3 w-3" />
                                  </span>
                                )}
                                <Columns2 className="w-3.5 h-3.5" />
                                <span>Split</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setDiffMode(DiffModeEnum.Unified)
                                }
                                className="relative pl-6 gap-1.5"
                              >
                                {diffMode === DiffModeEnum.Unified && (
                                  <span className="absolute left-1.5 flex h-3.5 w-3.5 items-center justify-center">
                                    <CheckIcon className="h-3 w-3" />
                                  </span>
                                )}
                                <Rows2 className="w-3.5 h-3.5" />
                                <span>Unified</span>
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}
                        {/* Expand/Collapse - shown when many files */}
                        {diffStats.fileCount > 10 && (
                          <>
                            <DropdownMenuItem
                              onClick={() => diffViewRef.current?.expandAll()}
                              disabled={diffCollapseState.allExpanded}
                              className="gap-2"
                            >
                              <ExpandIcon className="w-3.5 h-3.5" />
                              <span>Expand all</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => diffViewRef.current?.collapseAll()}
                              disabled={diffCollapseState.allCollapsed}
                              className="gap-2"
                            >
                              <CollapseIcon className="w-3.5 h-3.5" />
                              <span>Collapse all</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {/* Close button */}
                  <Button
                    variant="ghost"
                    className="h-7 w-7 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md flex-shrink-0"
                    onClick={() => setIsDiffSidebarOpen(false)}
                  >
                    <IconCloseSidebarRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              {/* Diff Content */}
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                {/* PR Status Bar - show when PR exists */}
                {agentChat?.prUrl && agentChat?.prNumber && (
                  <PrStatusBar
                    chatId={chatId}
                    prUrl={agentChat.prUrl}
                    prNumber={agentChat.prNumber}
                  />
                )}
                {/* Diff View */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AgentDiffView
                    ref={diffViewRef}
                    chatId={chatId}
                    sandboxId={sandboxId}
                    worktreePath={worktreePath || undefined}
                    repository={repository}
                    onStatsChange={setDiffStats}
                    initialDiff={diffContent}
                    initialParsedFiles={parsedFileDiffs}
                    prefetchedFileContents={prefetchedFileContents}
                    showFooter={true}
                    onCollapsedStateChange={setDiffCollapseState}
                  />
                </div>
              </div>
            </div>
          </ResizableSidebar>
        )}

        {/* Preview Sidebar - hidden on mobile fullscreen and when preview is not available */}
        {canOpenPreview && !isMobileFullscreen && (
          <ResizableSidebar
            isOpen={isPreviewSidebarOpen}
            onClose={() => setIsPreviewSidebarOpen(false)}
            widthAtom={agentsPreviewSidebarWidthAtom}
            minWidth={350}
            side="right"
            animationDuration={0}
            initialWidth={0}
            exitWidth={0}
            showResizeTooltip={true}
            className="bg-tl-background border-l"
            style={{ borderLeftWidth: "0.5px" }}
          >
            {isQuickSetup ? (
              <div className="flex flex-col h-full">
                {/* Header with close button */}
                <div className="flex items-center justify-end px-3 h-10 bg-tl-background flex-shrink-0 border-b border-border/50">
                  <Button
                    variant="ghost"
                    className="h-7 w-7 p-0 hover:bg-muted transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] rounded-md"
                    onClick={() => setIsPreviewSidebarOpen(false)}
                  >
                    <IconCloseSidebarRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                {/* Content */}
                <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
                  <div className="text-muted-foreground mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-50"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Preview not available
                  </p>
                  <p className="text-xs text-muted-foreground/70 max-w-[200px]">
                    Set up this repository to enable live preview
                  </p>
                </div>
              </div>
            ) : (
              <AgentPreview
                chatId={chatId}
                sandboxId={sandboxId}
                port={previewPort}
                repository={repository}
                hideHeader={false}
                onClose={() => setIsPreviewSidebarOpen(false)}
              />
            )}
          </ResizableSidebar>
        )}

        {/* Terminal Sidebar - shows when worktree exists (desktop only) */}
        {worktreePath && (
          <TerminalSidebar
            chatId={chatId}
            cwd={worktreePath}
            workspaceId={chatId}
          />
        )}
      </div>
    </div>
  )
}
