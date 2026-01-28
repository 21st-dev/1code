"use client"

import {
  stripEmojis
} from "../../../components/chat-markdown-renderer"
import { Button } from "../../../components/ui/button"
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
  VolumeIcon
} from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import {
  PromptInput,
  PromptInputActions
} from "../../../components/ui/prompt-input"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
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
  GitFork,
  ListTree,
  TerminalSquare
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import type { FileStatus } from "../../../../shared/changes-types"
import { getQueryClient } from "../../../contexts/TRPCProvider"
import { trackMessageSent } from "../../../lib/analytics"
import { apiFetch } from "../../../lib/api-fetch"
import {
  chatSourceModeAtom,
  customClaudeConfigAtom,
  defaultAgentModeAtom,
  isDesktopAtom, isFullscreenAtom,
  normalizeCustomClaudeConfig,
  selectedOllamaModelAtom,
  soundNotificationsEnabledAtom
} from "../../../lib/atoms"
import { useRemoteChat } from "../../../lib/hooks/use-remote-chats"
import { remoteApi } from "../../../lib/remote-api"
import { useFileChangeListener, useGitWatcher } from "../../../lib/hooks/use-file-change-listener"
import { appStore } from "../../../lib/jotai-store"
import { api } from "../../../lib/mock-api"
import { trpc, trpcClient } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { BUILTIN_SLASH_COMMANDS } from "../commands"
import { isDesktopApp } from "../../../lib/utils/platform"
import { useResolvedHotkeyDisplay } from "../../../lib/hotkeys"
import { ChangesPanel } from "../../changes"
import { DiffCenterPeekDialog } from "../../changes/components/diff-center-peek-dialog"
import { DiffFullPageView } from "../../changes/components/diff-full-page-view"
import { DiffSidebarHeader } from "../../changes/components/diff-sidebar-header"
import { getStatusIndicator } from "../../changes/utils/status"
import { terminalSidebarOpenAtomFamily } from "../../terminal/atoms"
import { TerminalSidebar } from "../../terminal/terminal-sidebar"
import {
  agentsChangesPanelCollapsedAtom,
  agentsChangesPanelWidthAtom,
  agentsDiffSidebarWidthAtom,
  agentsPlanSidebarWidthAtom,
  agentsPreviewSidebarOpenAtom,
  agentsPreviewSidebarWidthAtom,
  agentsSubChatsSidebarModeAtom,
  agentsSubChatUnseenChangesAtom,
  agentsUnseenChangesAtom,
  clearLoading,
  compactingSubChatsAtom,
  currentPlanPathAtomFamily,
  diffSidebarOpenAtomFamily,
  diffViewDisplayModeAtom,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  isCreatingPrAtom,
  justCreatedIdsAtom,
  lastSelectedModelIdAtom,
  loadingSubChatsAtom,
  MODEL_ID_MAP,
  pendingAuthRetryMessageAtom,
  pendingConflictResolutionMessageAtom,
  pendingBuildPlanSubChatIdAtom,
  pendingPlanApprovalsAtom,
  planEditRefetchTriggerAtomFamily,
  workspaceDiffCacheAtomFamily,
  pendingPrMessageAtom,
  pendingReviewMessageAtom,
  pendingUserQuestionsAtom,
  planSidebarOpenAtomFamily,
  QUESTIONS_SKIPPED_MESSAGE,
  selectedAgentChatIdAtom,
  selectedCommitAtom,
  selectedDiffFilePathAtom,
  setLoading,
  subChatFilesAtom,
  subChatModeAtomFamily,
  undoStackAtom,
  openLocallyChatIdAtom,
  type AgentMode,
  type SelectedCommit
} from "../atoms"
import { AgentSendButton } from "../components/agent-send-button"
import { OpenLocallyDialog } from "../components/open-locally-dialog"
import { PreviewSetupHoverCard } from "../components/preview-setup-hover-card"
import type { TextSelectionSource } from "../context/text-selection-context"
import { TextSelectionProvider } from "../context/text-selection-context"
import { useAgentsFileUpload } from "../hooks/use-agents-file-upload"
import { useAutoImport } from "../hooks/use-auto-import"
import { useChangedFilesTracking } from "../hooks/use-changed-files-tracking"
import { useDesktopNotifications } from "../hooks/use-desktop-notifications"
import { useFocusInputOnEnter } from "../hooks/use-focus-input-on-enter"
import { useHaptic } from "../hooks/use-haptic"
import { useTextContextSelection } from "../hooks/use-text-context-selection"
import { usePastedTextFiles } from "../hooks/use-pasted-text-files"
import { useToggleFocusOnCmdEsc } from "../hooks/use-toggle-focus-on-cmd-esc"
import {
  clearSubChatDraft,
  getSubChatDraftFull
} from "../lib/drafts"
import { IPCChatTransport } from "../lib/ipc-chat-transport"
import { RemoteChatTransport } from "../lib/remote-chat-transport"
import {
  createQueueItem,
  generateQueueId,
  toQueuedFile,
  toQueuedImage,
  toQueuedTextContext,
} from "../lib/queue-utils"
import {
  MENTION_PREFIXES,
  type AgentsMentionsEditorHandle,
} from "../mentions"
import {
  ChatSearchBar,
  chatSearchCurrentMatchAtom,
  SearchHighlightProvider
} from "../search"
import { agentChatStore } from "../stores/agent-chat-store"
import { EMPTY_QUEUE, useMessageQueueStore } from "../stores/message-queue-store"
import { clearSubChatCaches, isRollingBackAtom, rollbackHandlerAtom, syncMessagesWithStatusAtom } from "../stores/message-store"
import { useStreamingStatusStore } from "../stores/streaming-status-store"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import { useShallow } from "zustand/react/shallow"
import {
  AgentDiffView,
  diffViewModeAtom,
  splitUnifiedDiffByFile,
  type AgentDiffViewRef,
  type ParsedDiffFile,
} from "../ui/agent-diff-view"
import { AgentPlanSidebar } from "../ui/agent-plan-sidebar"
import { AgentPreview } from "../ui/agent-preview"
import { AgentQueueIndicator } from "../ui/agent-queue-indicator"
import { AgentToolCall } from "../ui/agent-tool-call"
import { AgentToolRegistry } from "../ui/agent-tool-registry"
import { isPlanFile } from "../ui/agent-tool-utils"
import { AgentUserMessageBubble } from "../ui/agent-user-message-bubble"
import { AgentUserQuestion, type AgentUserQuestionHandle } from "../ui/agent-user-question"
import { AgentsHeaderControls } from "../ui/agents-header-controls"
import { ChatTitleEditor } from "../ui/chat-title-editor"
import { MobileChatHeader } from "../ui/mobile-chat-header"
import { QuickCommentInput } from "../ui/quick-comment-input"
import { SubChatSelector } from "../ui/sub-chat-selector"
import { SubChatStatusCard } from "../ui/sub-chat-status-card"
import { TextSelectionPopover } from "../ui/text-selection-popover"
import { autoRenameAgentChat } from "../utils/auto-rename"
import { generateCommitToPrMessage, generatePrMessage, generateReviewMessage } from "../utils/pr-message"
import { ChatInputArea } from "./chat-input-area"
import { IsolatedMessagesSection } from "./isolated-messages-section"
import { DetailsSidebar } from "../../details-sidebar/details-sidebar"
import {
  detailsSidebarOpenAtom,
  unifiedSidebarEnabledAtom,
} from "../../details-sidebar/atoms"
const clearSubChatSelectionAtom = atom(null, () => {})
const isSubChatMultiSelectModeAtom = atom(false)
const selectedSubChatIdsAtom = atom(new Set<string>())
// import { selectedTeamIdAtom } from "@/lib/atoms/team"
const selectedTeamIdAtom = atom<string | null>(null)
// import type { PlanType } from "@/lib/config/subscription-plans"
type PlanType = string

// UTF-8 safe base64 encoding (btoa doesn't support Unicode)
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("")
  return btoa(binString)
}

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

// Rollback button component for reverting to a previous message state
function RollbackButton({
  disabled = false,
  onRollback,
  isRollingBack = false,
}: {
  disabled?: boolean
  onRollback: () => void
  isRollingBack?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onRollback}
          disabled={disabled || isRollingBack}
          tabIndex={-1}
          className={cn(
            "p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]",
            isRollingBack && "opacity-50 cursor-not-allowed",
          )}
        >
          <IconTextUndo className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isRollingBack ? "Rolling back..." : "Rollback to here"}
      </TooltipContent>
    </Tooltip>
  )
}

// Isolated scroll-to-bottom button - uses own scroll listener to avoid re-renders of parent
const ScrollToBottomButton = memo(function ScrollToBottomButton({
  containerRef,
  onScrollToBottom,
  hasStackedCards = false,
  subChatId,
  isActive = true,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  onScrollToBottom: () => void
  hasStackedCards?: boolean
  subChatId?: string
  isActive?: boolean
}) {
  const [isVisible, setIsVisible] = useState(false)

  // Keep isActive in ref for scroll event handler
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    // Skip scroll monitoring for inactive tabs (keep-alive)
    if (!isActive) return

    const container = containerRef.current
    if (!container) return

    // RAF throttle to avoid setState on every scroll event
    let rafId: number | null = null
    let lastAtBottom: boolean | null = null

    const checkVisibility = () => {
      // Skip if not active or RAF already pending
      if (!isActiveRef.current || rafId !== null) return

      rafId = requestAnimationFrame(() => {
        rafId = null
        // Double-check active state in RAF callback
        if (!isActiveRef.current) return

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
      // Skip if not active
      if (!isActiveRef.current) return

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
  }, [containerRef, subChatId, isActive])

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
                "absolute right-4 p-2 rounded-full bg-background border border-border shadow-md hover:bg-accent active:scale-[0.97] transition-colors z-20",
                hasStackedCards ? "bottom-44 sm:bottom-36" : "bottom-32 sm:bottom-24"
              )}
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

function MessageGroup({ children, isLastGroup }: MessageGroupProps) {
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
        // content-visibility: auto - браузер пропускает layout/paint для элементов вне viewport
        // Это ОГРОМНАЯ оптимизация для длинных чатов - рендерится только видимое
        contentVisibility: "auto",
        // Примерная высота для правильного скроллбара до рендеринга
        containIntrinsicSize: "auto 200px",
        // Последняя группа имеет минимальную высоту контейнера чата (минус отступ)
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

// ============================================================================
// DiffStateContext - isolates diff state management to prevent ChatView re-renders
// ============================================================================

interface DiffStateContextValue {
  selectedFilePath: string | null
  filteredSubChatId: string | null
  viewedCount: number
  handleDiffFileSelect: (file: { path: string }, category: string) => void
  handleSelectNextFile: (filePath: string) => void
  handleCommitSuccess: () => void
  handleCloseDiff: () => void
  handleViewedCountChange: (count: number) => void
  /** Ref to register a function that resets activeTab to "changes" before closing */
  resetActiveTabRef: React.MutableRefObject<(() => void) | null>
}

const DiffStateContext = createContext<DiffStateContextValue | null>(null)

function useDiffState() {
  const ctx = useContext(DiffStateContext)
  if (!ctx) throw new Error('useDiffState must be used within DiffStateProvider')
  return ctx
}

// Diff sidebar content component with responsive layout
interface DiffSidebarContentProps {
  worktreePath: string | null
  selectedFilePath: string | null
  onFileSelect: (file: { path: string }, category: string) => void
  chatId: string
  sandboxId: string | null
  repository: { owner: string; name: string } | null
  diffStats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  diffContent: string | null
  parsedFileDiffs: unknown
  prefetchedFileContents: Record<string, string> | undefined
  setDiffCollapseState: (state: Map<string, boolean>) => void
  diffViewRef: React.RefObject<{ expandAll: () => void; collapseAll: () => void; getViewedCount: () => number; markAllViewed: () => void; markAllUnviewed: () => void } | null>
  agentChat: { prUrl?: string; prNumber?: number } | null | undefined
  // Real-time sidebar width for responsive layout during resize
  sidebarWidth: number
  // Commit with AI
  onCommitWithAI?: () => void
  isCommittingWithAI?: boolean
  // Diff view mode
  diffMode: DiffModeEnum
  setDiffMode: (mode: DiffModeEnum) => void
  // Create PR callback
  onCreatePr?: () => void
  // Called after successful commit to reset diff view state
  onCommitSuccess?: () => void
  // Subchats with changed files for filtering
  subChats?: Array<{ id: string; name: string; filePaths: string[]; fileCount: number }>
  // Initial subchat filter (e.g., from Review button)
  initialSubChatFilter?: string | null
  // Callback when marking file as viewed to select next file
  onSelectNextFile?: (filePath: string) => void
}

// Memoized commit file item for History tab
const CommitFileItem = memo(function CommitFileItem({
  file,
  onClick,
}: {
  file: { path: string; status: FileStatus }
  onClick: () => void
}) {
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors",
        "hover:bg-muted/80"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 flex items-center overflow-hidden">
        {dirPath && (
          <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
            {dirPath}/
          </span>
        )}
        <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
          {fileName}
        </span>
      </div>
      <div className="shrink-0">
        {getStatusIndicator(file.status)}
      </div>
    </div>
  )
})

const DiffSidebarContent = memo(function DiffSidebarContent({
  worktreePath,
  chatId,
  sandboxId,
  repository,
  diffStats,
  setDiffStats,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  setDiffCollapseState,
  diffViewRef,
  agentChat,
  sidebarWidth,
  onCommitWithAI,
  isCommittingWithAI = false,
  diffMode,
  setDiffMode,
  onCreatePr,
  subChats = [],
}: Omit<DiffSidebarContentProps, 'selectedFilePath' | 'onFileSelect' | 'onCommitSuccess' | 'initialSubChatFilter' | 'onSelectNextFile'>) {
  // Get values from context instead of props
  const {
    selectedFilePath,
    filteredSubChatId,
    handleDiffFileSelect,
    handleSelectNextFile,
    handleCommitSuccess,
    handleViewedCountChange,
    resetActiveTabRef,
  } = useDiffState()

  // Compute initial selected file synchronously for first render
  // This prevents AgentDiffView from rendering all files before filter kicks in
  const initialSelectedFile = useMemo(() => {
    if (selectedFilePath) return selectedFilePath
    if (parsedFileDiffs && parsedFileDiffs.length > 0) {
      const firstFile = parsedFileDiffs[0]
      const filePath = firstFile.newPath !== '/dev/null' ? firstFile.newPath : firstFile.oldPath
      if (filePath && filePath !== '/dev/null') {
        return filePath
      }
    }
    return null
  }, [selectedFilePath, parsedFileDiffs])
  const [changesPanelWidth, setChangesPanelWidth] = useAtom(agentsChangesPanelWidthAtom)
  const [isChangesPanelCollapsed, setIsChangesPanelCollapsed] = useAtom(agentsChangesPanelCollapsedAtom)
  const [isResizing, setIsResizing] = useState(false)

  // Active tab state (Changes/History)
  const [activeTab, setActiveTab] = useState<"changes" | "history">("changes")

  // Register the reset function so handleCloseDiff can reset to "changes" tab before closing
  // This prevents React 19 ref cleanup issues with HistoryView's ContextMenu components
  useEffect(() => {
    resetActiveTabRef.current = () => setActiveTab("changes")
    return () => {
      resetActiveTabRef.current = null
    }
  }, [resetActiveTabRef])

  // Selected commit for History tab
  const [selectedCommit, setSelectedCommit] = useAtom(selectedCommitAtom)

  // When sidebar is narrow (< 500px), use vertical layout
  const isNarrow = sidebarWidth < 500

  // Get diff stats for collapsed header display
  const { data: diffStatus } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath && isNarrow }
  )

  // Handle resize drag
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = changesPanelWidth
      const pointerId = event.pointerId
      const handleElement = event.currentTarget as HTMLElement

      const minWidth = 200
      const maxWidth = 450

      const clampWidth = (width: number) =>
        Math.max(minWidth, Math.min(maxWidth, width))

      handleElement.setPointerCapture?.(pointerId)
      setIsResizing(true)

      const handlePointerMove = (e: PointerEvent) => {
        const delta = e.clientX - startX
        const newWidth = clampWidth(startWidth + delta)
        setChangesPanelWidth(newWidth)
      }

      const handlePointerUp = () => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", handlePointerUp)
        setIsResizing(false)
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", handlePointerUp, { once: true })
    },
    [changesPanelWidth, setChangesPanelWidth]
  )

  // Handle commit selection in History tab
  const handleCommitSelect = useCallback((commit: SelectedCommit) => {
    setSelectedCommit(commit)
    // Reset file selection when changing commits
    // The HistoryView will auto-select first file
  }, [setSelectedCommit])

  // Handle file selection in commit (History tab)
  const handleCommitFileSelect = useCallback((file: { path: string }, commitHash: string) => {
    // Set selected file path for highlighting
    handleDiffFileSelect(file, "")
  }, [handleDiffFileSelect])

  // Fetch commit files when a commit is selected
  const { data: commitFiles } = trpc.changes.getCommitFiles.useQuery(
    {
      worktreePath: worktreePath || "",
      commitHash: selectedCommit?.hash || "",
    },
    {
      enabled: !!worktreePath && !!selectedCommit,
      staleTime: 60000, // Cache for 1 minute
    }
  )

  // Fetch commit file diff when a commit is selected
  const { data: commitFileDiff } = trpc.changes.getCommitFileDiff.useQuery(
    {
      worktreePath: worktreePath || "",
      commitHash: selectedCommit?.hash || "",
      filePath: selectedFilePath || "",
    },
    {
      enabled: !!worktreePath && !!selectedCommit && !!selectedFilePath,
      staleTime: 60000, // Cache for 1 minute
    }
  )

  // Use commit diff or regular diff based on selection
  // Only use commit data when in History tab, otherwise always use regular diff
  const shouldUseCommitDiff = activeTab === "history" && selectedCommit
  const effectiveDiff = shouldUseCommitDiff && commitFileDiff ? commitFileDiff : diffContent
  const effectiveParsedFiles = shouldUseCommitDiff ? null : parsedFileDiffs
  const effectivePrefetchedContents = shouldUseCommitDiff ? {} : prefetchedFileContents

  if (isNarrow) {
    // Count changed files for collapsed header
    const changedFilesCount = diffStatus
      ? (diffStatus.staged?.length || 0) + (diffStatus.unstaged?.length || 0) + (diffStatus.untracked?.length || 0)
      : 0
    const stagedCount = diffStatus?.staged?.length || 0

    // Vertical layout: ChangesPanel on top, diff/file list below
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Top: ChangesPanel (file list + commit) */}
        {worktreePath && (
          <div className={cn(
            "flex-shrink-0 overflow-hidden flex flex-col",
            "h-[45%] min-h-[200px] border-b border-border/50"
          )}>
            <ChangesPanel
              worktreePath={worktreePath}
              selectedFilePath={selectedFilePath}
              onFileSelect={handleDiffFileSelect}
              onFileOpenPinned={() => {}}
              onCreatePr={onCreatePr}
              onCommitSuccess={handleCommitSuccess}
              subChats={subChats}
              initialSubChatFilter={filteredSubChatId}
              chatId={chatId}
              selectedCommitHash={selectedCommit?.hash}
              onCommitSelect={handleCommitSelect}
              onCommitFileSelect={handleCommitFileSelect}
              onActiveTabChange={setActiveTab}
              pushCount={diffStatus?.pushCount}
            />
          </div>
        )}
        {/* Bottom: File list (when History tab + commit selected) or AgentDiffView (diff) */}
        {/* Both views are always mounted but hidden via CSS to prevent expensive re-mounts */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {/* History view - files in commit */}
          <div className={cn(
            "absolute inset-0 overflow-y-auto",
            activeTab === "history" && selectedCommit ? "z-10" : "z-0 invisible"
          )}>
            {selectedCommit && (
              !commitFiles ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  Loading files...
                </div>
              ) : commitFiles.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  No files changed in this commit
                </div>
              ) : (
                <>
                  {/* Commit message and description */}
                  <div className="px-3 py-2 border-b border-border/50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-sm font-medium text-foreground flex-1">
                        {selectedCommit.message}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedCommit.hash)
                          toast.success('Copied SHA to clipboard')
                        }}
                        className="text-xs font-mono text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
                      >
                        {selectedCommit.shortHash}
                      </button>
                    </div>
                    {selectedCommit.description && (
                      <div className="text-xs text-foreground/80 mb-2 whitespace-pre-wrap">
                        {selectedCommit.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : 'Unknown date'}
                    </div>
                  </div>

                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                    Files in commit ({commitFiles.length})
                  </div>
                  {commitFiles.map((file) => (
                    <CommitFileItem
                      key={file.path}
                      file={file}
                      onClick={() => {}}
                    />
                  ))}
                </>
              )
            )}
          </div>
          {/* Diff view - always mounted to prevent expensive re-initialization */}
          <div className={cn(
            "absolute inset-0 overflow-hidden",
            activeTab === "history" && selectedCommit ? "z-0 invisible" : "z-10"
          )}>
            <AgentDiffView
              ref={diffViewRef}
              chatId={chatId}
              sandboxId={sandboxId}
              worktreePath={worktreePath || undefined}
              repository={repository}
              onStatsChange={setDiffStats}
              initialDiff={effectiveDiff}
              initialParsedFiles={effectiveParsedFiles}
              prefetchedFileContents={effectivePrefetchedContents}
              showFooter={false}
              onCollapsedStateChange={setDiffCollapseState}
              onSelectNextFile={handleSelectNextFile}
              onViewedCountChange={handleViewedCountChange}
              initialSelectedFile={initialSelectedFile}
            />
          </div>
        </div>
      </div>
    )
  }

  // Horizontal layout: files on left, diff on right
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: ChangesPanel (file list + commit) with resize handle */}
      {worktreePath && (
        <div
          className="h-full flex-shrink-0 relative"
          style={{ width: changesPanelWidth }}
        >
          <ChangesPanel
            worktreePath={worktreePath}
            selectedFilePath={selectedFilePath}
            onFileSelect={handleDiffFileSelect}
            onFileOpenPinned={() => {}}
            onCreatePr={onCreatePr}
            onCommitSuccess={handleCommitSuccess}
            subChats={subChats}
            initialSubChatFilter={filteredSubChatId}
            chatId={chatId}
            selectedCommitHash={selectedCommit?.hash}
            onCommitSelect={handleCommitSelect}
            onCommitFileSelect={handleCommitFileSelect}
            onActiveTabChange={setActiveTab}
            pushCount={diffStatus?.pushCount}
          />
          {/* Resize handle - styled like ResizableSidebar */}
          <div
            onPointerDown={handleResizePointerDown}
            className="absolute top-0 bottom-0 cursor-col-resize z-10"
            style={{
              right: 0,
              width: "4px",
              marginRight: "-2px",
            }}
          />
        </div>
      )}
      {/* Right: File list (when History tab) or AgentDiffView (when Changes tab) */}
      {/* Both views are always mounted but hidden via CSS to prevent expensive re-mounts */}
      <div className={cn(
        "flex-1 h-full min-w-0 overflow-hidden relative",
        "border-l border-border/50"
      )}>
        {/* History view - files in commit */}
        <div className={cn(
          "absolute inset-0 overflow-y-auto",
          activeTab === "history" && selectedCommit ? "z-10" : "z-0 invisible"
        )}>
          {selectedCommit && (
            !commitFiles ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Loading files...
              </div>
            ) : commitFiles.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No files changed in this commit
              </div>
            ) : (
              <>
                {/* Commit message and description */}
                <div className="px-3 py-2 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-sm font-medium text-foreground flex-1">
                      {selectedCommit.message}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedCommit.hash)
                        toast.success('Copied SHA to clipboard')
                      }}
                      className="text-xs font-mono text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
                    >
                      {selectedCommit.shortHash}
                    </button>
                  </div>
                  {selectedCommit.description && (
                    <div className="text-xs text-foreground/80 mb-2 whitespace-pre-wrap">
                      {selectedCommit.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : 'Unknown date'}
                  </div>
                </div>

                <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                  Files in commit ({commitFiles.length})
                </div>
                {commitFiles.map((file) => (
                  <CommitFileItem
                    key={file.path}
                    file={file}
                    onClick={() => {}}
                  />
                ))}
              </>
            )
          )}
        </div>
        {/* Diff view - always mounted to prevent expensive re-initialization */}
        <div className={cn(
          "absolute inset-0 overflow-hidden",
          activeTab === "history" && selectedCommit ? "z-0 invisible" : "z-10"
        )}>
          <AgentDiffView
            ref={diffViewRef}
            chatId={chatId}
            sandboxId={sandboxId}
            worktreePath={worktreePath || undefined}
            repository={repository}
            onStatsChange={setDiffStats}
            initialDiff={effectiveDiff}
            initialParsedFiles={effectiveParsedFiles}
            prefetchedFileContents={effectivePrefetchedContents}
            showFooter={true}
            onCollapsedStateChange={setDiffCollapseState}
            onSelectNextFile={handleSelectNextFile}
            onViewedCountChange={handleViewedCountChange}
            initialSelectedFile={initialSelectedFile}
          />
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// DiffStateProvider - manages diff state in isolation from ChatView
// This prevents ChatView from re-rendering when selected file changes
// ============================================================================

interface DiffStateProviderProps {
  isDiffSidebarOpen: boolean
  parsedFileDiffs: ParsedDiffFile[] | null
  isDiffSidebarNarrow: boolean
  setIsDiffSidebarOpen: (open: boolean) => void
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  setDiffContent: (content: string | null) => void
  setParsedFileDiffs: (files: ParsedDiffFile[] | null) => void
  setPrefetchedFileContents: (contents: Record<string, string>) => void
  fetchDiffStats: () => void
  children: React.ReactNode
}

const DiffStateProvider = memo(function DiffStateProvider({
  isDiffSidebarOpen,
  parsedFileDiffs,
  isDiffSidebarNarrow,
  setIsDiffSidebarOpen,
  setDiffStats,
  setDiffContent,
  setParsedFileDiffs,
  setPrefetchedFileContents,
  fetchDiffStats,
  children,
}: DiffStateProviderProps) {
  // Viewed count state - kept here to avoid re-rendering ChatView
  const [viewedCount, setViewedCount] = useState(0)

  // Ref for resetting activeTab to "changes" before closing
  // This prevents React 19 ref cleanup issues with HistoryView's ContextMenu components
  const resetActiveTabRef = useRef<(() => void) | null>(null)

  // All diff-related atoms are read HERE, not in ChatView
  const [selectedFilePath, setSelectedFilePath] = useAtom(selectedDiffFilePathAtom)
  const [, setFilteredDiffFiles] = useAtom(filteredDiffFilesAtom)
  const [filteredSubChatId, setFilteredSubChatId] = useAtom(filteredSubChatIdAtom)
  const isChangesPanelCollapsed = useAtomValue(agentsChangesPanelCollapsedAtom)

  // Auto-select first file when diff sidebar opens - use useLayoutEffect for synchronous update
  // This prevents the initial render from showing all 11 files before filter kicks in
  useLayoutEffect(() => {
    if (!isDiffSidebarOpen) {
      setSelectedFilePath(null)
      setFilteredDiffFiles(null)
      return
    }

    // Determine which file to select
    let fileToSelect = selectedFilePath
    if (!fileToSelect && parsedFileDiffs && parsedFileDiffs.length > 0) {
      const firstFile = parsedFileDiffs[0]
      fileToSelect = firstFile.newPath !== '/dev/null' ? firstFile.newPath : firstFile.oldPath
      if (fileToSelect && fileToSelect !== '/dev/null') {
        setSelectedFilePath(fileToSelect)
      }
    }

    // Filter logic based on layout mode
    const shouldShowAllFiles = isDiffSidebarNarrow && isChangesPanelCollapsed

    if (shouldShowAllFiles) {
      setFilteredDiffFiles(null)
    } else if (fileToSelect) {
      setFilteredDiffFiles([fileToSelect])
    } else {
      setFilteredDiffFiles(null)
    }
  }, [isDiffSidebarOpen, selectedFilePath, parsedFileDiffs, isDiffSidebarNarrow, isChangesPanelCollapsed, setFilteredDiffFiles, setSelectedFilePath])

  // Stable callbacks
  const handleDiffFileSelect = useCallback((file: { path: string }, _category: string) => {
    setSelectedFilePath(file.path)
    setFilteredDiffFiles([file.path])
  }, [setSelectedFilePath, setFilteredDiffFiles])

  const handleSelectNextFile = useCallback((filePath: string) => {
    setSelectedFilePath(filePath)
    setFilteredDiffFiles([filePath])
  }, [setSelectedFilePath, setFilteredDiffFiles])

  const handleCommitSuccess = useCallback(() => {
    setSelectedFilePath(null)
    setFilteredDiffFiles(null)
    setParsedFileDiffs(null)
    setDiffContent(null)
    setPrefetchedFileContents({})
    setDiffStats({
      fileCount: 0,
      additions: 0,
      deletions: 0,
      isLoading: true,
      hasChanges: false,
    })
    setTimeout(() => {
      fetchDiffStats()
    }, 500)
  }, [setSelectedFilePath, setFilteredDiffFiles, setParsedFileDiffs, setDiffContent, setPrefetchedFileContents, setDiffStats, fetchDiffStats])

  const handleCloseDiff = useCallback(() => {
    // Use flushSync to reset activeTab synchronously before closing.
    // This unmounts HistoryView's ContextMenu components in a single commit,
    // preventing React 19 ref cleanup "Maximum update depth exceeded" error.
    flushSync(() => {
      resetActiveTabRef.current?.()
    })
    setIsDiffSidebarOpen(false)
    setFilteredSubChatId(null)
  }, [setIsDiffSidebarOpen, setFilteredSubChatId])

  const handleViewedCountChange = useCallback((count: number) => {
    setViewedCount(count)
  }, [])

  const contextValue = useMemo(() => ({
    selectedFilePath,
    filteredSubChatId,
    viewedCount,
    handleDiffFileSelect,
    handleSelectNextFile,
    handleCommitSuccess,
    handleCloseDiff,
    handleViewedCountChange,
    resetActiveTabRef,
  }), [selectedFilePath, filteredSubChatId, viewedCount, handleDiffFileSelect, handleSelectNextFile, handleCommitSuccess, handleCloseDiff, handleViewedCountChange])

  return (
    <DiffStateContext.Provider value={contextValue}>
      {children}
    </DiffStateContext.Provider>
  )
})

// ============================================================================
// DiffSidebarRenderer - renders the diff sidebar using context for state
// This component is inside DiffStateProvider and uses useDiffState()
// ============================================================================

interface DiffSidebarRendererProps {
  worktreePath: string | null
  chatId: string
  sandboxId: string | null
  repository: { owner: string; name: string } | null
  diffStats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string>
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  diffSidebarRef: React.RefObject<HTMLDivElement | null>
  agentChat: { prUrl?: string; prNumber?: number } | null | undefined
  branchData: { current: string } | undefined
  gitStatus: { pushCount?: number; pullCount?: number; hasUpstream?: boolean; ahead?: number; behind?: number; staged?: any[]; unstaged?: any[]; untracked?: any[] } | undefined
  isGitStatusLoading: boolean
  isDiffSidebarOpen: boolean
  diffDisplayMode: "side-peek" | "center-peek" | "full-page"
  diffSidebarWidth: number
  handleReview: () => void
  isReviewing: boolean
  handleCreatePr: () => void
  isCreatingPr: boolean
  handleMergePr: () => void
  mergePrMutation: { isPending: boolean }
  handleRefreshGitStatus: () => void
  hasPrNumber: boolean
  isPrOpen: boolean
  hasMergeConflicts: boolean
  handleFixConflicts: () => void
  handleExpandAll: () => void
  handleCollapseAll: () => void
  diffMode: DiffModeEnum
  setDiffMode: (mode: DiffModeEnum) => void
  handleMarkAllViewed: () => void
  handleMarkAllUnviewed: () => void
  isDesktop: boolean
  isFullscreen: boolean
  setDiffDisplayMode: (mode: "side-peek" | "center-peek" | "full-page") => void
  handleCommitToPr: (selectedPaths?: string[]) => void
  isCommittingToPr: boolean
  subChatsWithFiles: Array<{ id: string; name: string; filePaths: string[]; fileCount: number }>
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
}

const DiffSidebarRenderer = memo(function DiffSidebarRenderer({
  worktreePath,
  chatId,
  sandboxId,
  repository,
  diffStats,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  setDiffCollapseState,
  diffViewRef,
  diffSidebarRef,
  agentChat,
  branchData,
  gitStatus,
  isGitStatusLoading,
  isDiffSidebarOpen,
  diffDisplayMode,
  diffSidebarWidth,
  handleReview,
  isReviewing,
  handleCreatePr,
  isCreatingPr,
  handleMergePr,
  mergePrMutation,
  handleRefreshGitStatus,
  hasPrNumber,
  isPrOpen,
  hasMergeConflicts,
  handleFixConflicts,
  handleExpandAll,
  handleCollapseAll,
  diffMode,
  setDiffMode,
  handleMarkAllViewed,
  handleMarkAllUnviewed,
  isDesktop,
  isFullscreen,
  setDiffDisplayMode,
  handleCommitToPr,
  isCommittingToPr,
  subChatsWithFiles,
  setDiffStats,
}: DiffSidebarRendererProps) {
  // Get callbacks and state from context
  const { handleCloseDiff, viewedCount, handleViewedCountChange } = useDiffState()

  // Width for responsive layouts - use stored width for sidebar, fixed for dialog/fullpage
  const effectiveWidth = diffDisplayMode === "side-peek"
    ? diffSidebarWidth
    : diffDisplayMode === "center-peek"
      ? 1200
      : typeof window !== 'undefined' ? window.innerWidth : 1200

  const diffViewContent = (
    <div
      ref={diffSidebarRef}
      className="flex flex-col h-full min-w-0 overflow-hidden"
    >
      {/* Unified Header - branch selector, fetch, review, PR actions, close */}
      {worktreePath ? (
        <DiffSidebarHeader
          worktreePath={worktreePath}
          currentBranch={branchData?.current ?? ""}
          diffStats={diffStats}
          sidebarWidth={effectiveWidth}
          pushCount={gitStatus?.pushCount ?? 0}
          pullCount={gitStatus?.pullCount ?? 0}
          hasUpstream={gitStatus?.hasUpstream ?? true}
          isSyncStatusLoading={isGitStatusLoading}
          aheadOfDefault={gitStatus?.ahead ?? 0}
          behindDefault={gitStatus?.behind ?? 0}
          onReview={handleReview}
          isReviewing={isReviewing}
          onCreatePr={handleCreatePr}
          isCreatingPr={isCreatingPr}
          onCreatePrWithAI={handleCreatePr}
          isCreatingPrWithAI={isCreatingPr}
          onMergePr={handleMergePr}
          isMergingPr={mergePrMutation.isPending}
          onClose={handleCloseDiff}
          onRefresh={handleRefreshGitStatus}
          hasPrNumber={hasPrNumber}
          isPrOpen={isPrOpen}
          hasMergeConflicts={hasMergeConflicts}
          onFixConflicts={handleFixConflicts}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          viewMode={diffMode}
          onViewModeChange={setDiffMode}
          viewedCount={viewedCount}
          onMarkAllViewed={handleMarkAllViewed}
          onMarkAllUnviewed={handleMarkAllUnviewed}
          isDesktop={isDesktop}
          isFullscreen={isFullscreen}
          displayMode={diffDisplayMode}
          onDisplayModeChange={setDiffDisplayMode}
        />
      ) : sandboxId ? (
        <div className="flex items-center h-10 px-2 border-b border-border/50 bg-background flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            onClick={handleCloseDiff}
          >
            <IconCloseSidebarRight className="size-4 text-muted-foreground" />
          </Button>
          <span className="text-sm text-muted-foreground ml-2">Changes</span>
        </div>
      ) : null}

      {/* Content: file list + diff view - vertical when narrow */}
      <DiffSidebarContent
        worktreePath={worktreePath}
        chatId={chatId}
        sandboxId={sandboxId}
        repository={repository}
        diffStats={diffStats}
        setDiffStats={setDiffStats}
        diffContent={diffContent}
        parsedFileDiffs={parsedFileDiffs}
        prefetchedFileContents={prefetchedFileContents}
        setDiffCollapseState={setDiffCollapseState}
        diffViewRef={diffViewRef}
        agentChat={agentChat}
        sidebarWidth={effectiveWidth}
        onCommitWithAI={handleCommitToPr}
        isCommittingWithAI={isCommittingToPr}
        diffMode={diffMode}
        setDiffMode={setDiffMode}
        onCreatePr={handleCreatePr}
        subChats={subChatsWithFiles}
      />
    </div>
  )

  // Render based on display mode
  if (diffDisplayMode === "side-peek") {
    return (
      <ResizableSidebar
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
        widthAtom={agentsDiffSidebarWidthAtom}
        minWidth={320}
        side="right"
        animationDuration={0}
        initialWidth={0}
        exitWidth={0}
        showResizeTooltip={true}
        className="bg-background border-l"
        style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
      >
        {diffViewContent}
      </ResizableSidebar>
    )
  }

  if (diffDisplayMode === "center-peek") {
    return (
      <DiffCenterPeekDialog
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
      >
        {diffViewContent}
      </DiffCenterPeekDialog>
    )
  }

  if (diffDisplayMode === "full-page") {
    return (
      <DiffFullPageView
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
      >
        {diffViewContent}
      </DiffFullPageView>
    )
  }

  return null
})

// Inner chat component - only rendered when chat object is ready
// Memoized to prevent re-renders when parent state changes (e.g., selectedFilePath)
const ChatViewInner = memo(function ChatViewInner({
  chat,
  subChatId,
  parentChatId,
  isFirstSubChat,
  onAutoRename,
  onCreateNewSubChat,
  refreshDiff,
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
  existingPrUrl,
  isActive = true,
}: {
  chat: Chat<any>
  subChatId: string
  parentChatId: string
  isFirstSubChat: boolean
  onAutoRename: (userMessage: string, subChatId: string) => void
  onCreateNewSubChat?: () => void
  refreshDiff?: () => void
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
  existingPrUrl?: string | null
  isActive?: boolean
}) {
  const hasTriggeredRenameRef = useRef(false)
  const hasTriggeredAutoGenerateRef = useRef(false)

  // Keep isActive in ref for use in callbacks (avoid stale closures)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // Scroll management state (like canvas chat)
  // Using only ref to avoid re-renders on scroll
  const shouldAutoScrollRef = useRef(true)
  const isAutoScrollingRef = useRef(false) // Flag to ignore scroll events caused by auto-scroll
  const isInitializingScrollRef = useRef(false) // Flag to ignore scroll events during scroll initialization (content loading)
  const hasUnapprovedPlanRef = useRef(false) // Track unapproved plan state for scroll initialization
  const chatContainerRef = useRef<HTMLElement | null>(null)

  // Cleanup isAutoScrollingRef on unmount to prevent stuck state
  useEffect(() => {
    return () => {
      isAutoScrollingRef.current = false
    }
  }, [])

  // Track chat container height via CSS custom property (no re-renders)
  const chatContainerObserverRef = useRef<ResizeObserver | null>(null)

  const editorRef = useRef<AgentsMentionsEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const questionRef = useRef<AgentUserQuestionHandle>(null)
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

  // PR creation loading state - from atom to allow resetting after message sent
  const setIsCreatingPr = useSetAtom(isCreatingPrAtom)

  // Rollback state
  const [isRollingBack, setIsRollingBack] = useState(false)

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


  // Track previous scroll position to detect scroll direction
  const prevScrollTopRef = useRef(0)

  // Handle scroll events to detect user scrolling
  // Updates shouldAutoScrollRef based on scroll direction
  // Using refs only to avoid re-renders on scroll
  const handleScroll = useCallback(() => {
    // Skip scroll handling for inactive tabs (keep-alive)
    if (!isActiveRef.current) return

    const container = chatContainerRef.current
    if (!container) return

    const currentScrollTop = container.scrollTop
    const prevScrollTop = prevScrollTopRef.current
    prevScrollTopRef.current = currentScrollTop

    // Ignore scroll events during initialization (content loading)
    if (isInitializingScrollRef.current) return

    // If user scrolls UP - disable auto-scroll immediately
    // This works even during auto-scroll animation (user intent takes priority)
    if (currentScrollTop < prevScrollTop) {
      shouldAutoScrollRef.current = false
      return
    }

    // Ignore other scroll direction checks during auto-scroll animation
    if (isAutoScrollingRef.current) return

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

  // Plan mode state (per-subChat using atomFamily)
  const [subChatMode, setSubChatMode] = useAtom(subChatModeAtomFamily(subChatId))

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
      const revertedMode: AgentMode = variables.mode === "plan" ? "agent" : "plan"
      setSubChatMode(revertedMode)
      // Also update store for consistency
      useAgentSubChatStore
        .getState()
        .updateSubChatMode(variables.subChatId, revertedMode)
      console.error("Failed to update sub-chat mode:", error.message)
    },
  })

  // Sync atomFamily mode to Zustand store on mount/subChatId change
  // This ensures the sidebar shows the correct mode icon
  useEffect(() => {
    if (subChatId) {
      // Read mode directly from atomFamily to ensure we get the correct value
      const mode = appStore.get(subChatModeAtomFamily(subChatId))
      useAgentSubChatStore.getState().updateSubChatMode(subChatId, mode)
    }
  }, [subChatId])

  // NOTE: We no longer clear caches on deactivation.
  // With proper subChatId isolation, each chat's caches are separate.
  // Caches are only cleared on unmount (when tab is evicted from keep-alive pool).

  // Cleanup message caches on unmount (when tab is evicted from keep-alive)
  // CRITICAL: Use a delayed cleanup to avoid clearing caches during temporary unmount/remount
  // (e.g., React StrictMode, HMR, or parent re-render causing component remount)
  useEffect(() => {
    const currentSubChatId = subChatId
    return () => {
      // Delay cache clearing to allow remount to happen first
      // If the component remounts with the same subChatId, the sync will repopulate the atoms
      // If it truly unmounts, the timeout will clear the caches
      const timeoutId = setTimeout(() => {
        clearSubChatCaches(currentSubChatId)
      }, 100)

      // Store the timeout so it can be cancelled if the component remounts
      // We use a global map to track pending cleanups
      ;(window as any).__pendingCacheCleanups = (window as any).__pendingCacheCleanups || new Map()
      ;(window as any).__pendingCacheCleanups.set(currentSubChatId, timeoutId)
    }
  }, [subChatId])

  // Cancel pending cleanup if we remount with the same subChatId
  useEffect(() => {
    const pendingCleanups = (window as any).__pendingCacheCleanups as Map<string, number> | undefined
    if (pendingCleanups?.has(subChatId)) {
      clearTimeout(pendingCleanups.get(subChatId))
      pendingCleanups.delete(subChatId)
    }
  }, [subChatId])

  // Handle mode changes - updates atomFamily, store, and database together
  // No effect needed - this is called directly when user toggles mode
  const handleModeChange = useCallback((newMode: AgentMode) => {
    // Update atomFamily (source of truth for UI)
    setSubChatMode(newMode)

    // Update Zustand store (for other components that read from store)
    useAgentSubChatStore.getState().updateSubChatMode(subChatId, newMode)

    // Save to database (skip temp IDs that haven't been persisted yet)
    if (!subChatId.startsWith("temp-")) {
      updateSubChatModeMutation.mutate({ subChatId, mode: newMode })
    }
  }, [subChatId, setSubChatMode, updateSubChatModeMutation])

  // File/image upload hook
  const {
    images,
    files,
    handleAddAttachments,
    removeImage,
    removeFile,
    clearAll,
    isUploading,
    setImagesFromDraft,
    setFilesFromDraft,
  } = useAgentsFileUpload()

  // Text context selection hook (for selecting text from assistant messages and diff)
  const {
    textContexts,
    diffTextContexts,
    addTextContext: addTextContextOriginal,
    addDiffTextContext,
    removeTextContext,
    removeDiffTextContext,
    clearTextContexts,
    clearDiffTextContexts,
    textContextsRef,
    diffTextContextsRef,
    setTextContextsFromDraft,
    setDiffTextContextsFromDraft,
  } = useTextContextSelection()

  // Pasted text files (large pasted text saved as files)
  const {
    pastedTexts,
    addPastedText,
    removePastedText,
    clearPastedTexts,
    pastedTextsRef,
  } = usePastedTextFiles(subChatId)

  // File contents cache - stores content for file mentions (keyed by mentionId)
  // This content gets added to the prompt when sending, without showing a separate card
  const fileContentsRef = useRef<Map<string, string>>(new Map())
  const cacheFileContent = useCallback((mentionId: string, content: string) => {
    fileContentsRef.current.set(mentionId, content)
  }, [])
  const clearFileContents = useCallback(() => {
    fileContentsRef.current.clear()
  }, [])

  // Clear file contents cache when switching subChats to prevent stale data
  useEffect(() => {
    fileContentsRef.current.clear()
  }, [subChatId])

  // Quick comment state
  const [quickCommentState, setQuickCommentState] = useState<{
    selectedText: string
    source: TextSelectionSource
    rect: DOMRect
  } | null>(null)

  // Message queue for sending messages while streaming
  const queue = useMessageQueueStore((s) => s.queues[subChatId] ?? EMPTY_QUEUE)
  const addToQueue = useMessageQueueStore((s) => s.addToQueue)
  const removeFromQueue = useMessageQueueStore((s) => s.removeFromQueue)
  const popItemFromQueue = useMessageQueueStore((s) => s.popItem)

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
    // Restore full draft (text + attachments + text contexts) for new sub-chat
    const savedDraft = parentChatId
      ? getSubChatDraftFull(parentChatId, subChatId)
      : null

    if (savedDraft) {
      // Restore text
      if (savedDraft.text) {
        editorRef.current?.setValue(savedDraft.text)
      } else {
        editorRef.current?.clear()
      }
      // Restore images
      if (savedDraft.images.length > 0) {
        setImagesFromDraft(savedDraft.images)
      } else {
        clearAll()
      }
      // Restore files
      if (savedDraft.files.length > 0) {
        setFilesFromDraft(savedDraft.files)
      }
      // Restore text contexts
      if (savedDraft.textContexts.length > 0) {
        setTextContextsFromDraft(savedDraft.textContexts)
      } else {
        clearTextContexts()
      }
    } else if (
      prevSubChatIdForDraftRef.current &&
      prevSubChatIdForDraftRef.current !== subChatId
    ) {
      // Clear everything when switching to a sub-chat with no draft
      editorRef.current?.clear()
      clearAll()
      clearTextContexts()
    }

    prevSubChatIdForDraftRef.current = subChatId
  }, [
    subChatId,
    parentChatId,
    setImagesFromDraft,
    setFilesFromDraft,
    setTextContextsFromDraft,
    clearAll,
    clearTextContexts,
  ])

  // Use subChatId as stable key to prevent HMR-induced duplicate resume requests
  // resume: !!streamId to reconnect to active streams (background streaming support)
  const { messages, sendMessage, status, stop, regenerate, setMessages } = useChat({
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

  const isStreaming = status === "streaming" || status === "submitted"

  // Ref for isStreaming to use in callbacks/effects that need fresh value
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming

  // Track compacting status from SDK
  const compactingSubChats = useAtomValue(compactingSubChatsAtom)
  const isCompacting = compactingSubChats.has(subChatId)

  // Desktop/fullscreen state for window drag region
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)

  // Handler to trigger manual context compaction
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

  // Wrapper for addTextContext that handles TextSelectionSource
  const addTextContext = useCallback((text: string, source: TextSelectionSource) => {
    if (source.type === "assistant-message") {
      addTextContextOriginal(text, source.messageId)
    } else if (source.type === "diff") {
      addDiffTextContext(text, source.filePath, source.lineNumber, source.lineType)
    } else if (source.type === "tool-edit") {
      // Tool edit selections are treated as code selections (similar to diff)
      addDiffTextContext(text, source.filePath)
    } else if (source.type === "plan") {
      // Plan selections are treated as code selections (similar to diff)
      addDiffTextContext(text, source.planPath)
    }
  }, [addTextContextOriginal, addDiffTextContext])

  // Focus handler for text selection popover - focus chat input after adding to context
  const handleFocusInput = useCallback(() => {
    editorRef.current?.focus()
  }, [])

  // Handler for quick comment trigger from popover
  const handleQuickComment = useCallback((text: string, source: TextSelectionSource, rect: DOMRect) => {
    setQuickCommentState({ selectedText: text, source, rect })
  }, [])

  // Handler for quick comment submission
  const handleQuickCommentSubmit = useCallback((comment: string, selectedText: string, source: TextSelectionSource) => {
    // Format message with mention token + comment
    const preview = selectedText.slice(0, 50).replace(/[:\[\]]/g, "")
    const encodedText = utf8ToBase64(selectedText)

    let mentionToken: string
    if (source.type === "diff") {
      const lineNum = source.lineNumber || 0
      mentionToken = `@[${MENTION_PREFIXES.DIFF}${source.filePath}:${lineNum}:${preview}:${encodedText}]`
    } else if (source.type === "tool-edit") {
      // Tool edit is treated as code/diff context
      mentionToken = `@[${MENTION_PREFIXES.DIFF}${source.filePath}:0:${preview}:${encodedText}]`
    } else {
      mentionToken = `@[${MENTION_PREFIXES.QUOTE}${preview}:${encodedText}]`
    }

    const message = `${mentionToken} ${comment}`

    // If streaming, add to queue
    if (isStreamingRef.current) {
      const item = createQueueItem(generateQueueId(), message)
      addToQueue(subChatId, item)
      toast.success("Reply queued", { description: "Will be sent when current response completes" })
    } else {
      // Send directly
      sendMessageRef.current({
        role: "user",
        parts: [{ type: "text", text: message }],
      })
      toast.success("Reply sent")
    }

    // Clear state and selection
    setQuickCommentState(null)
    window.getSelection()?.removeAllRanges()
  }, [addToQueue, subChatId])

  // Handler for quick comment cancel
  const handleQuickCommentCancel = useCallback(() => {
    setQuickCommentState(null)
  }, [])

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

      // Reset creating PR state after message is sent
      setIsCreatingPr(false)
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

  // Watch for pending conflict resolution message and send it
  const [pendingConflictMessage, setPendingConflictMessage] = useAtom(
    pendingConflictResolutionMessageAtom,
  )

  useEffect(() => {
    if (pendingConflictMessage && !isStreaming) {
      // Clear the pending message immediately to prevent double-sending
      setPendingConflictMessage(null)

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingConflictMessage }],
      })
    }
  }, [pendingConflictMessage, isStreaming, sendMessage, setPendingConflictMessage])

  // Handle pending "Build plan" from sidebar (atom - effect is defined after handleApprovePlan)
  const [pendingBuildPlanSubChatId, setPendingBuildPlanSubChatId] = useAtom(
    pendingBuildPlanSubChatIdAtom,
  )

  // Pending user questions from AskUserQuestion tool
  const [pendingQuestionsMap, setPendingQuestionsMap] = useAtom(
    pendingUserQuestionsAtom,
  )
  // Get pending questions for this specific subChat
  const pendingQuestions = pendingQuestionsMap.get(subChatId) ?? null

  // Track whether chat input has content (for custom text with questions)
  const [inputHasContent, setInputHasContent] = useState(false)

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
      if (pendingQuestions) {
        const timeout = setTimeout(() => {
          // Re-check if still showing the same question (might have been cleared by other means)
          setPendingQuestionsMap((current) => {
            if (current.has(subChatId)) {
              const newMap = new Map(current)
              newMap.delete(subChatId)
              return newMap
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
  }, [isStreaming, subChatId, pendingQuestions, setPendingQuestionsMap])

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


    // Helper to clear pending question for this subChat
    const clearPendingQuestion = () => {
      setPendingQuestionsMap((current) => {
        if (current.has(subChatId)) {
          const newMap = new Map(current)
          newMap.delete(subChatId)
          return newMap
        }
        return current
      })
    }

    // If streaming and we already have a pending question for this chat, keep it
    // (transport will manage it via chunks)
    if (isStreaming && pendingQuestions) {
      // But if the question in messages is already answered, clear the atom
      if (!pendingQuestionPart) {
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
          clearPendingQuestion()
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
      if (pendingQuestions) {
        clearPendingQuestion()
      }
    } else {
      // No pending question - clear if belongs to this sub-chat
      if (pendingQuestions) {
        clearPendingQuestion()
      }
    }
  }, [subChatId, lastAssistantMessage, isStreaming, pendingQuestions, setPendingQuestionsMap])

  // Helper to clear pending question for this subChat (used in callbacks)
  const clearPendingQuestionCallback = useCallback(() => {
    setPendingQuestionsMap((current) => {
      if (current.has(subChatId)) {
        const newMap = new Map(current)
        newMap.delete(subChatId)
        return newMap
      }
      return current
    })
  }, [subChatId, setPendingQuestionsMap])

  // Handle answering questions
  const handleQuestionsAnswer = useCallback(
    async (answers: Record<string, string>) => {
      if (!pendingQuestions) return
      await trpcClient.claude.respondToolApproval.mutate({
        toolUseId: pendingQuestions.toolUseId,
        approved: true,
        updatedInput: { questions: pendingQuestions.questions, answers },
      })
      clearPendingQuestionCallback()
    },
    [pendingQuestions, clearPendingQuestionCallback],
  )

  // Handle skipping questions
  const handleQuestionsSkip = useCallback(async () => {
    if (!pendingQuestions) return
    const toolUseId = pendingQuestions.toolUseId

    // Clear UI immediately - don't wait for backend
    // This ensures dialog closes even if stream was already aborted
    clearPendingQuestionCallback()

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
  }, [pendingQuestions, clearPendingQuestionCallback])

  // Ref to prevent double submit of question answer
  const isSubmittingQuestionAnswerRef = useRef(false)

  // Handle answering questions with custom text from input (called on Enter in input)
  const handleSubmitWithQuestionAnswer = useCallback(
    async () => {
      if (!pendingQuestions) return
      if (isSubmittingQuestionAnswerRef.current) return
      isSubmittingQuestionAnswerRef.current = true

      try {
        // 1. Get custom text from input
        const customText = editorRef.current?.getValue()?.trim() || ""
        if (!customText) {
          isSubmittingQuestionAnswerRef.current = false
          return
        }

        // 2. Get already selected answers from question component
        const selectedAnswers = questionRef.current?.getAnswers() || {}
        const formattedAnswers: Record<string, string> = { ...selectedAnswers }

        // 3. Add custom text to the last question as "Other"
        const lastQuestion =
          pendingQuestions.questions[pendingQuestions.questions.length - 1]
        if (lastQuestion) {
          const existingAnswer = formattedAnswers[lastQuestion.question]
          if (existingAnswer) {
            // Append to existing answer
            formattedAnswers[lastQuestion.question] = `${existingAnswer}, Other: ${customText}`
          } else {
            formattedAnswers[lastQuestion.question] = `Other: ${customText}`
          }
        }

        // 4. Submit tool response with all answers
        await trpcClient.claude.respondToolApproval.mutate({
          toolUseId: pendingQuestions.toolUseId,
          approved: true,
          updatedInput: {
            questions: pendingQuestions.questions,
            answers: formattedAnswers,
          },
        })
        clearPendingQuestionCallback()

        // 5. Stop stream if currently streaming
        if (isStreamingRef.current) {
          agentChatStore.setManuallyAborted(subChatId, true)
          await stopRef.current()
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        // 6. Clear input
        editorRef.current?.clear()
        if (parentChatId) {
          clearSubChatDraft(parentChatId, subChatId)
        }

        // 7. Send custom text as a new user message
        shouldAutoScrollRef.current = true
        await sendMessageRef.current({
          role: "user",
          parts: [{ type: "text", text: customText }],
        })
      } finally {
        isSubmittingQuestionAnswerRef.current = false
      }
    },
    [pendingQuestions, clearPendingQuestionCallback, subChatId, parentChatId],
  )

  // Memoize the callback to prevent ChatInputArea re-renders
  // Only provide callback when there's a pending question for this subChat
  const submitWithQuestionAnswerCallback = useMemo(
    () =>
      pendingQuestions
        ? handleSubmitWithQuestionAnswer
        : undefined,
    [pendingQuestions, handleSubmitWithQuestionAnswer],
  )

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

  // Handle plan approval - sends "Build plan" message and switches to agent mode
  const handleApprovePlan = useCallback(() => {
    // Update store mode synchronously BEFORE sending (transport reads from store)
    useAgentSubChatStore.getState().updateSubChatMode(subChatId, "agent")

    // Sync mode to database for sidebar indicator (getPendingPlanApprovals)
    if (!subChatId.startsWith("temp-")) {
      updateSubChatModeMutation.mutate({ subChatId, mode: "agent" })
    }

    // Update atomFamily state (for UI) - this also syncs to store via effect
    setSubChatMode("agent")

    // Enable auto-scroll and immediately scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    // Send "Build plan" message (now in agent mode)
    sendMessageRef.current({
      role: "user",
      parts: [{ type: "text", text: "Build plan" }],
    })
  }, [subChatId, setSubChatMode, scrollToBottom, updateSubChatModeMutation])

  // Handle pending "Build plan" from sidebar
  useEffect(() => {
    // Only trigger if this is the target sub-chat and we're active
    if (pendingBuildPlanSubChatId === subChatId && isActive) {
      setPendingBuildPlanSubChatId(null) // Clear immediately to prevent double-trigger
      handleApprovePlan()
    }
  }, [pendingBuildPlanSubChatId, subChatId, isActive, setPendingBuildPlanSubChatId, handleApprovePlan])

  // Detect PR URLs in assistant messages and store them
  // Initialize with existing PR URL to prevent duplicate toast on re-mount
  const detectedPrUrlRef = useRef<string | null>(existingPrUrl ?? null)

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
            // Invalidate the agentChat query to refetch with new PR info
            utils.agents.getAgentChat.invalidate({ chatId: parentChatId })
          })

        break // Only process first PR URL found
      }
    }
  }, [messages, isStreaming, parentChatId])

  // Track plan Edit completions to trigger sidebar refetch
  const triggerPlanEditRefetch = useSetAtom(
    useMemo(() => planEditRefetchTriggerAtomFamily(subChatId), [subChatId])
  )
  const lastPlanEditCountRef = useRef(0)

  useEffect(() => {
    // Count completed plan Edits
    let completedPlanEdits = 0
    for (const msg of messages) {
      if (msg.role !== "assistant" || !(msg as any).parts) continue
      for (const part of (msg as any).parts as any[]) {
        if (
          part.type === "tool-Edit" &&
          part.state !== "input-streaming" &&
          part.state !== "pending" &&
          isPlanFile(part.input?.file_path || "")
        ) {
          completedPlanEdits++
        }
      }
    }

    // Trigger refetch if count increased (new Edit completed)
    if (completedPlanEdits > lastPlanEditCountRef.current) {
      lastPlanEditCountRef.current = completedPlanEdits
      triggerPlanEditRefetch()
    }
  }, [messages, triggerPlanEditRefetch])

  const { changedFiles: changedFilesForSubChat, recomputeChangedFiles } = useChangedFilesTracking(
    messages,
    subChatId,
    isStreaming,
    parentChatId,
  )

  // Rollback handler - truncates messages to the clicked assistant message and restores git state
  // The SDK UUID from the last assistant message will be used for resumeSessionAt on next send
  const handleRollback = useCallback(
    async (assistantMsg: (typeof messages)[0]) => {
      if (isRollingBack) {
        toast.error("Rollback already in progress")
        return
      }
      if (isStreaming) {
        toast.error("Cannot rollback while streaming")
        return
      }

      const sdkUuid = (assistantMsg.metadata as any)?.sdkMessageUuid
      if (!sdkUuid) {
        toast.error("Cannot rollback: message has no SDK UUID")
        return
      }

      setIsRollingBack(true)

      try {
        // Single call handles both message truncation and git rollback
        const result = await trpcClient.chats.rollbackToMessage.mutate({
          subChatId,
          sdkMessageUuid: sdkUuid,
        })

        if (!result.success) {
          toast.error(`Failed to rollback: ${result.error}`)
          setIsRollingBack(false)
          return
        }

        // Update local state with truncated messages from server
        setMessages(result.messages)
        recomputeChangedFiles(result.messages)
        refreshDiff?.()
      } catch (error) {
        console.error("[handleRollback] Error:", error)
        toast.error("Failed to rollback")
      } finally {
        setIsRollingBack(false)
      }
    },
    [
      isRollingBack,
      isStreaming,
      setMessages,
      subChatId,
      recomputeChangedFiles,
      refreshDiff,
    ],
  )

  // Expose rollback handler/state via atoms for message action bar
  const setRollbackHandler = useSetAtom(rollbackHandlerAtom)
  useEffect(() => {
    setRollbackHandler(() => handleRollback)
    return () => setRollbackHandler(null)
  }, [handleRollback, setRollbackHandler])

  const setIsRollingBackAtom = useSetAtom(isRollingBackAtom)
  useEffect(() => {
    setIsRollingBackAtom(isRollingBack)
  }, [isRollingBack, setIsRollingBackAtom])

  // ESC, Ctrl+C and Cmd+Shift+Backspace handler for stopping stream
  useEffect(() => {
    // Skip keyboard handlers for inactive tabs (keep-alive)
    if (!isActive) return

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
          if (pendingQuestions) {
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
  }, [isActive, isStreaming, stop, subChatId, pendingQuestions, handleQuestionsSkip])

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

  // Ref to track if initial scroll has been set for this sub-chat
  const scrollInitializedRef = useRef(false)

  // Track if this tab has been initialized (for keep-alive)
  const hasInitializedRef = useRef(false)

  // Initialize scroll position on mount (only once per tab with keep-alive)
  // Strategy: wait for content to stabilize, then scroll to bottom ONCE
  // No jumping around - just wait and scroll when ready
  useLayoutEffect(() => {
    // Skip if not active (keep-alive: hidden tabs don't need scroll init)
    if (!isActive) return

    const container = chatContainerRef.current
    if (!container) return

    // With keep-alive, only initialize once per tab mount
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    // Reset on sub-chat change
    scrollInitializedRef.current = false
    isInitializingScrollRef.current = true

    // IMMEDIATE scroll to bottom - no waiting
    container.scrollTop = container.scrollHeight
    shouldAutoScrollRef.current = true

    // Mark as initialized IMMEDIATELY
    scrollInitializedRef.current = true
    isInitializingScrollRef.current = false

    // MutationObserver for async content (images, code blocks loading after initial render)
    const observer = new MutationObserver((mutations) => {
      // Skip if not active (keep-alive: don't scroll hidden tabs)
      if (!isActive) return
      if (!shouldAutoScrollRef.current) return

      // Check if content was added
      const hasAddedContent = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      )

      if (hasAddedContent) {
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      }
    })

    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subChatId, isActive])

  // Attach scroll listener (separate effect)
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [handleScroll])

  // Auto scroll to bottom when messages change during streaming
  // Only kicks in after content fills the viewport (overflow behavior)
  useEffect(() => {
    // Skip if not active (keep-alive: don't scroll hidden tabs)
    if (!isActive) return
    // Skip if scroll not yet initialized
    if (!scrollInitializedRef.current) return

    // Auto-scroll during streaming if user hasn't scrolled up
    if (shouldAutoScrollRef.current && status === "streaming") {
      const container = chatContainerRef.current
      if (container) {
        // Always scroll during streaming if auto-scroll is enabled
        // (user can disable by scrolling up)
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      }
    }
  }, [isActive, messages, status, subChatId])

  // Auto-focus input when switching to this chat (any sub-chat change)
  // Skip on mobile to prevent keyboard from opening automatically
  useEffect(() => {
    // Skip if not active (keep-alive: don't focus hidden tabs)
    if (!isActive) return
    if (isMobile) return // Don't autofocus on mobile

    // Use requestAnimationFrame to ensure DOM is ready after render
    requestAnimationFrame(() => {
      editorRef.current?.focus()
    })
  }, [isActive, subChatId, isMobile])

  // Refs for handleSend to avoid recreating callback on every messages change
  const messagesLengthRef = useRef(messages.length)
  messagesLengthRef.current = messages.length
  const subChatModeRef = useRef(subChatMode)
  subChatModeRef.current = subChatMode
  const imagesRef = useRef(images)
  imagesRef.current = images
  const filesRef = useRef(files)
  filesRef.current = files

  const handleSend = useCallback(async () => {
    // Block sending while sandbox is still being set up
    if (sandboxSetupStatus !== "ready") {
      return
    }

    // Get value from uncontrolled editor
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const currentImages = imagesRef.current
    const currentFiles = filesRef.current
    const currentTextContexts = textContextsRef.current
    const currentPastedTexts = pastedTextsRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && img.url).length > 0
    const hasTextContexts = currentTextContexts.length > 0
    const hasPastedTexts = currentPastedTexts.length > 0

    if (!hasText && !hasImages && !hasTextContexts && !hasPastedTexts) return

    // If streaming, add to queue instead of sending directly
    if (isStreamingRef.current) {
      const queuedImages = currentImages
        .filter((img) => !img.isLoading && img.url)
        .map(toQueuedImage)
      const queuedFiles = currentFiles
        .filter((f) => !f.isLoading && f.url)
        .map(toQueuedFile)
      const queuedTextContexts = currentTextContexts.map(toQueuedTextContext)

      const item = createQueueItem(
        generateQueueId(),
        inputValue.trim(),
        queuedImages.length > 0 ? queuedImages : undefined,
        queuedFiles.length > 0 ? queuedFiles : undefined,
        queuedTextContexts.length > 0 ? queuedTextContexts : undefined
      )
      addToQueue(subChatId, item)

      // Clear input and attachments
      editorRef.current?.clear()
      if (parentChatId) {
        clearSubChatDraft(parentChatId, subChatId)
      }
      clearAll()
      clearTextContexts()
      return
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    const text = inputValue.trim()

    // Expand custom slash commands with arguments (e.g. "/Apex my argument")
    // This mirrors the logic in new-chat-form.tsx
    let finalText = text
    const slashMatch = text.match(/^\/(\S+)\s*(.*)$/s)
    if (slashMatch) {
      const [, commandName, args] = slashMatch
      const builtinNames = new Set(
        BUILTIN_SLASH_COMMANDS.map((cmd) => cmd.name),
      )
      if (!builtinNames.has(commandName)) {
        try {
          const commands = await trpcClient.commands.list.query({
            projectPath,
          })
          const cmd = commands.find(
            (c) => c.name.toLowerCase() === commandName.toLowerCase(),
          )
          if (cmd) {
            const { content } = await trpcClient.commands.getContent.query({
              path: cmd.path,
            })
            finalText = content.replace(/\$ARGUMENTS/g, args.trim())
          }
        } catch (error) {
          console.error("Failed to expand custom slash command:", error)
        }
      }
    }

    // Clear editor and draft from localStorage
    editorRef.current?.clear()
    if (parentChatId) {
      clearSubChatDraft(parentChatId, subChatId)
    }

    // Track message sent
    trackMessageSent({
      workspaceId: subChatId,
      messageLength: finalText.length,
      mode: subChatModeRef.current,
    })

    // Trigger auto-rename on first message in a new sub-chat
    if (messagesLengthRef.current === 0 && !hasTriggeredRenameRef.current) {
      hasTriggeredRenameRef.current = true
      onAutoRename(finalText || "Image message", subChatId)
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

    // Add text contexts as mention tokens
    const currentDiffTextContexts = diffTextContextsRef.current
    let mentionPrefix = ""

    if (currentTextContexts.length > 0 || currentDiffTextContexts.length > 0 || currentPastedTexts.length > 0) {
      const quoteMentions = currentTextContexts.map((tc) => {
        const preview = tc.preview.replace(/[:\[\]]/g, "") // Sanitize preview
        const encodedText = utf8ToBase64(tc.text) // Base64 encode full text
        return `@[${MENTION_PREFIXES.QUOTE}${preview}:${encodedText}]`
      })

      const diffMentions = currentDiffTextContexts.map((dtc) => {
        const preview = dtc.preview.replace(/[:\[\]]/g, "") // Sanitize preview
        const encodedText = utf8ToBase64(dtc.text) // Base64 encode full text
        const lineNum = dtc.lineNumber || 0
        return `@[${MENTION_PREFIXES.DIFF}${dtc.filePath}:${lineNum}:${preview}:${encodedText}]`
      })

      // Add pasted text as pasted mentions (format: pasted:size:preview|filepath)
      // Using | as separator since filepath can contain colons
      const pastedTextMentions = currentPastedTexts.map((pt) => {
        // Sanitize preview to remove special characters that break mention parsing
        const sanitizedPreview = pt.preview.replace(/[:\[\]|]/g, "")
        return `@[${MENTION_PREFIXES.PASTED}${pt.size}:${sanitizedPreview}|${pt.filePath}]`
      })

      mentionPrefix = [...quoteMentions, ...diffMentions, ...pastedTextMentions].join(" ") + " "
    }

    if (finalText || mentionPrefix) {
      parts.push({ type: "text", text: mentionPrefix + (finalText || "") })
    }

    // Add cached file contents as hidden parts (sent to agent but not displayed in UI)
    // These are from dropped text files - content is embedded so agent sees it immediately
    if (fileContentsRef.current.size > 0) {
      for (const [mentionId, content] of fileContentsRef.current.entries()) {
        // Extract file path from mentionId (file:local:path or file:external:path)
        const filePath = mentionId.replace(/^file:(local|external):/, "")
        parts.push({
          type: "file-content",
          filePath,
          content,
        })
      }
    }

    clearAll()
    clearTextContexts()
    clearDiffTextContexts()
    clearPastedTexts()
    clearFileContents()

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

    // Enable auto-scroll and immediately scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    await sendMessageRef.current({ role: "user", parts })
  }, [
    sandboxSetupStatus,
    isArchived,
    onRestoreWorkspace,
    parentChatId,
    subChatId,
    onAutoRename,
    clearAll,
    clearTextContexts,
    clearPastedTexts,
    teamId,
    addToQueue,
  ])

  // Queue handlers for sending queued messages
  const handleSendFromQueue = useCallback(async (itemId: string) => {
    const item = popItemFromQueue(subChatId, itemId)
    if (!item) return

    // Stop current stream if streaming and wait for status to become ready
    if (isStreamingRef.current) {
      await handleStop()
      // Wait for status to become "ready" (max 2 seconds)
      const maxWait = 2000
      const pollInterval = 50
      let waited = 0
      while (isStreamingRef.current && waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
        waited += pollInterval
      }
    }

    // Build message parts from queued item
    const parts: any[] = [
      ...(item.images || []).map((img) => ({
        type: "data-image" as const,
        data: {
          url: img.url,
          mediaType: img.mediaType,
          filename: img.filename,
          base64Data: img.base64Data,
        },
      })),
      ...(item.files || []).map((f) => ({
        type: "data-file" as const,
        data: {
          url: f.url,
          mediaType: f.mediaType,
          filename: f.filename,
          size: f.size,
        },
      })),
    ]

    // Add text contexts as mention tokens
    let mentionPrefix = ""
    if (item.textContexts && item.textContexts.length > 0) {
      const quoteMentions = item.textContexts.map((tc) => {
        const preview = tc.text.slice(0, 50).replace(/[:\[\]]/g, "") // Create and sanitize preview
        const encodedText = utf8ToBase64(tc.text) // Base64 encode full text
        return `@[${MENTION_PREFIXES.QUOTE}${preview}:${encodedText}]`
      })
      mentionPrefix = quoteMentions.join(" ") + " "
    }

    // Add diff text contexts as mention tokens
    if (item.diffTextContexts && item.diffTextContexts.length > 0) {
      const diffMentions = item.diffTextContexts.map((dtc) => {
        const preview = dtc.text.slice(0, 50).replace(/[:\[\]]/g, "") // Create and sanitize preview
        const encodedText = utf8ToBase64(dtc.text) // Base64 encode full text
        const lineNum = dtc.lineNumber || 0
        return `@[${MENTION_PREFIXES.DIFF}${dtc.filePath}:${lineNum}:${preview}:${encodedText}]`
      })
      mentionPrefix += diffMentions.join(" ") + " "
    }

    if (item.message || mentionPrefix) {
      parts.push({ type: "text", text: mentionPrefix + (item.message || "") })
    }

    // Track message sent
    trackMessageSent({
      workspaceId: subChatId,
      messageLength: item.message.length,
      mode: subChatModeRef.current,
    })

    // Update timestamps
    useAgentSubChatStore.getState().updateSubChatTimestamp(subChatId)

    // Enable auto-scroll and immediately scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    await sendMessageRef.current({ role: "user", parts })
  }, [subChatId, popItemFromQueue, handleStop])

  const handleRemoveFromQueue = useCallback((itemId: string) => {
    removeFromQueue(subChatId, itemId)
  }, [subChatId, removeFromQueue])

  // Force send - stop stream and send immediately, bypassing queue (Opt+Enter)
  const handleForceSend = useCallback(async () => {
    // Block sending while sandbox is still being set up
    if (sandboxSetupStatus !== "ready") {
      return
    }

    // Get value from uncontrolled editor
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const currentImages = imagesRef.current
    const currentFiles = filesRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && img.url).length > 0

    if (!hasText && !hasImages) return

    // Stop current stream if streaming and wait for status to become ready
    if (isStreamingRef.current) {
      await handleStop()
      // Wait for status to become "ready" (max 2 seconds)
      const maxWait = 2000
      const pollInterval = 50
      let waited = 0
      while (isStreamingRef.current && waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
        waited += pollInterval
      }
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    const text = inputValue.trim()

    // Expand custom slash commands with arguments (e.g. "/Apex my argument")
    let finalText = text
    const slashMatch = text.match(/^\/(\S+)\s*(.*)$/s)
    if (slashMatch) {
      const [, commandName, args] = slashMatch
      const builtinNames = new Set(
        BUILTIN_SLASH_COMMANDS.map((cmd) => cmd.name),
      )
      if (!builtinNames.has(commandName)) {
        try {
          const commands = await trpcClient.commands.list.query({
            projectPath,
          })
          const cmd = commands.find(
            (c) => c.name.toLowerCase() === commandName.toLowerCase(),
          )
          if (cmd) {
            const { content } = await trpcClient.commands.getContent.query({
              path: cmd.path,
            })
            finalText = content.replace(/\$ARGUMENTS/g, args.trim())
          }
        } catch (error) {
          console.error("Failed to expand custom slash command:", error)
        }
      }
    }

    // Clear editor and draft from localStorage
    editorRef.current?.clear()
    if (parentChatId) {
      clearSubChatDraft(parentChatId, subChatId)
    }

    // Track message sent
    trackMessageSent({
      workspaceId: subChatId,
      messageLength: finalText.length,
      mode: subChatModeRef.current,
    })

    // Build message parts
    const parts: any[] = [
      ...currentImages
        .filter((img) => !img.isLoading && img.url)
        .map((img) => ({
          type: "data-image" as const,
          data: {
            url: img.url,
            mediaType: img.mediaType,
            filename: img.filename,
            base64Data: img.base64Data,
          },
        })),
      ...currentFiles
        .filter((f) => !f.isLoading && f.url)
        .map((f) => ({
          type: "data-file" as const,
          data: {
            url: f.url,
            mediaType: f.mediaType,
            filename: f.filename,
            size: f.size,
          },
        })),
    ]

    if (finalText) {
      parts.push({ type: "text", text: finalText })
    }

    // Clear attachments
    clearAll()

    // Update timestamps
    useAgentSubChatStore.getState().updateSubChatTimestamp(subChatId)

    // Force scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    await sendMessageRef.current({ role: "user", parts })
  }, [
    sandboxSetupStatus,
    isArchived,
    onRestoreWorkspace,
    parentChatId,
    subChatId,
    handleStop,
    clearAll,
  ])

  // NOTE: Auto-processing of queue is now handled globally by QueueProcessor
  // component in agents-layout.tsx. This ensures queues continue processing
  // even when user navigates to different sub-chats or workspaces.

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

  // Check if there's an unapproved plan (in plan mode with completed ExitPlanMode)
  const hasUnapprovedPlan = useMemo(() => {
    // If already in agent mode, plan is approved (mode is the source of truth)
    if (subChatMode !== "plan") return false

    // Look for completed ExitPlanMode in messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]

      // If assistant message with completed ExitPlanMode, we found an unapproved plan
      if (msg.role === "assistant" && msg.parts) {
        const exitPlanPart = msg.parts.find(
          (p: any) => p.type === "tool-ExitPlanMode"
        )
        // Check if ExitPlanMode is completed (has output, even if empty)
        if (exitPlanPart && exitPlanPart.output !== undefined) {
          return true
        }
      }
    }
    return false
  }, [messages, subChatMode])

  // Keep ref in sync for use in initializeScroll (which runs in useLayoutEffect)
  hasUnapprovedPlanRef.current = hasUnapprovedPlan

  // Update pending plan approvals atom for sidebar indicators
  const setPendingPlanApprovals = useSetAtom(pendingPlanApprovalsAtom)
  useEffect(() => {
    setPendingPlanApprovals((prev: Map<string, string>) => {
      const newMap = new Map(prev)
      if (hasUnapprovedPlan) {
        newMap.set(subChatId, parentChatId)
      } else {
        newMap.delete(subChatId)
      }
      // Only return new map if it changed
      if (newMap.size !== prev.size || ![...newMap.keys()].every((id) => prev.has(id))) {
        return newMap
      }
      return prev
    })
  }, [hasUnapprovedPlan, subChatId, parentChatId, setPendingPlanApprovals])

  // Keyboard shortcut: Cmd+Enter to approve plan
  useEffect(() => {
    if (!isActive) return

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
  }, [isActive, hasUnapprovedPlan, isStreaming, handleApprovePlan])

  // Cmd/Ctrl + Arrow Down to scroll to bottom (works even when focused in input)
  // But don't intercept if input has content - let native cursor navigation work
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowDown" &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        // Don't intercept if input has content - let native cursor navigation work
        const inputValue = editorRef.current?.getValue() || ""
        if (inputValue.trim().length > 0) {
          return
        }

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
      setPendingPlanApprovals((prev: Map<string, string>) => {
        if (prev.has(subChatId)) {
          const newMap = new Map(prev)
          newMap.delete(subChatId)
          return newMap
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
  // CRITICAL: Only sync from the ACTIVE tab to prevent overwriting global atoms
  // Each tab has its own useChat() instance, but global atoms (messageIdsAtom, etc.) are shared.
  // Only the active tab should update these global atoms.
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)
  useLayoutEffect(() => {
    // Skip syncing for inactive tabs - they shouldn't update global atoms
    if (!isActive) return
    syncMessages({ messages, status, subChatId })
  }, [messages, status, subChatId, syncMessages, isActive])

  // Sync status to global streaming status store for queue processing
  const setStreamingStatus = useStreamingStatusStore((s) => s.setStatus)
  useEffect(() => {
    setStreamingStatus(subChatId, status as "ready" | "streaming" | "submitted" | "error")
  }, [subChatId, status, setStreamingStatus])

  // Chat search - scroll to current match
  // Use ref to track scroll lock and prevent race conditions
  const searchScrollLockRef = useRef<number>(0)
  const currentSearchMatch = useAtomValue(chatSearchCurrentMatchAtom)
  useEffect(() => {
    if (!currentSearchMatch) return

    const container = chatContainerRef.current
    if (!container) return

    // Increment lock to cancel any pending scroll operations
    const currentLock = ++searchScrollLockRef.current

    // Use double requestAnimationFrame + small delay to ensure DOM has updated with new highlights
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          // Check if this scroll operation is still valid (not superseded by newer one)
          if (searchScrollLockRef.current !== currentLock) return

          // First try to find the highlight mark
          let targetElement: Element | null = container.querySelector(".search-highlight-current")

          // If no highlight mark, find the message element with matching data attributes
          if (!targetElement) {
            const selector = `[data-message-id="${currentSearchMatch.messageId}"][data-part-index="${currentSearchMatch.partIndex}"]`
            targetElement = container.querySelector(selector)
          }

          if (targetElement) {
            // Check if this is inside a sticky user message container
            const stickyParent = targetElement.closest("[data-user-message-id]")
            if (stickyParent) {
              const messageGroupWrapper = stickyParent.parentElement
              if (messageGroupWrapper) {
                messageGroupWrapper.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
                return
              }
            }

            targetElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        }, 50)
      })
    })
  }, [currentSearchMatch])

  // Calculate top offset for search bar based on sub-chat selector
  const searchBarTopOffset = isSubChatsSidebarOpen ? "52px" : undefined

  return (
    <SearchHighlightProvider>
      <div className="flex flex-col flex-1 min-h-0 relative">
        {/* Text selection popover for adding text to context - only render for active tab to prevent portaled popovers from inactive tabs capturing clicks */}
        {isActive && (
          <TextSelectionPopover
            onAddToContext={addTextContext}
            onQuickComment={handleQuickComment}
            onFocusInput={handleFocusInput}
          />
        )}

        {/* Quick comment input - only render for active tab to prevent portal escaping pointerEvents isolation */}
        {isActive && quickCommentState && (
          <QuickCommentInput
            selectedText={quickCommentState.selectedText}
            source={quickCommentState.source}
            rect={quickCommentState.rect}
            onSubmit={handleQuickCommentSubmit}
            onCancel={handleQuickCommentCancel}
          />
        )}

        {/* Chat search bar */}
        <ChatSearchBar messages={messages} topOffset={searchBarTopOffset} />

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
          // Cleanup previous observer
          if (chatContainerObserverRef.current) {
            chatContainerObserverRef.current.disconnect()
            chatContainerObserverRef.current = null
          }

          chatContainerRef.current = el

          // Setup ResizeObserver for --chat-container-height CSS variable
          if (el) {
            const observer = new ResizeObserver((entries) => {
              const height = entries[0]?.contentRect.height ?? 0
              el.style.setProperty("--chat-container-height", `${height}px`)
            })
            observer.observe(el)
            chatContainerObserverRef.current = observer
          }
        }}
        className="flex-1 overflow-y-auto w-full relative allow-text-selection outline-none"
        tabIndex={-1}
        data-chat-container
      >
        <div
          className="px-2 max-w-2xl mx-auto -mb-4 space-y-4"
          style={{
            paddingBottom: "32px",
          }}
        >
          <div>
            {/* ISOLATED: Messages rendered via Jotai atom subscription
                Each component subscribes to specific atoms and only re-renders when those change
                KEY: Force remount on subChatId change to ensure fresh atom reads after syncMessages */}
            <IsolatedMessagesSection
              key={subChatId}
              subChatId={subChatId}
              chatId={parentChatId}
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
      {pendingQuestions && (
        <div className="px-4 relative z-20">
          <div className="w-full px-2 max-w-2xl mx-auto">
            <AgentUserQuestion
              ref={questionRef}
              pendingQuestions={pendingQuestions}
              onAnswer={handleQuestionsAnswer}
              onSkip={handleQuestionsSkip}
              hasCustomText={inputHasContent}
            />
          </div>
        </div>
      )}

      {/* Stacked cards container - queue + status */}
      {!pendingQuestions &&
        (queue.length > 0 || changedFilesForSubChat.length > 0) && (
          <div className="px-2 -mb-6 relative z-10">
            <div className="w-full max-w-2xl mx-auto px-2">
              {/* Queue indicator card - top card */}
              {queue.length > 0 && (
                <AgentQueueIndicator
                  queue={queue}
                  onRemoveItem={handleRemoveFromQueue}
                  onSendNow={handleSendFromQueue}
                  isStreaming={isStreaming}
                  hasStatusCardBelow={changedFilesForSubChat.length > 0}
                />
              )}
              {/* Status card - bottom card, only when there are changed files */}
              {changedFilesForSubChat.length > 0 && (
                <SubChatStatusCard
                  chatId={parentChatId}
                  subChatId={subChatId}
                  isStreaming={isStreaming}
                  isCompacting={isCompacting}
                  changedFiles={changedFilesForSubChat}
                  worktreePath={projectPath}
                  onStop={handleStop}
                  hasQueueCardAbove={queue.length > 0}
                />
              )}
            </div>
          </div>
        )}

      {/* Input - isolated component to prevent re-renders */}
      <ChatInputArea
        editorRef={editorRef}
        fileInputRef={fileInputRef}
        onSend={handleSend}
        onForceSend={handleForceSend}
        onStop={handleStop}
        onCompact={handleCompact}
        onCreateNewSubChat={onCreateNewSubChat}
        isStreaming={isStreaming}
        isCompacting={isCompacting}
        images={images}
        files={files}
        onAddAttachments={handleAddAttachments}
        onRemoveImage={removeImage}
        onRemoveFile={removeFile}
        isUploading={isUploading}
        textContexts={textContexts}
        onRemoveTextContext={removeTextContext}
        diffTextContexts={diffTextContexts}
        onRemoveDiffTextContext={removeDiffTextContext}
        pastedTexts={pastedTexts}
        onAddPastedText={addPastedText}
        onRemovePastedText={removePastedText}
        onCacheFileContent={cacheFileContent}
        messageTokenData={messageTokenData}
        subChatId={subChatId}
        parentChatId={parentChatId}
        teamId={teamId}
        repository={repository}
        sandboxId={sandboxId}
        projectPath={projectPath}
        changedFiles={changedFilesForSubChat}
        isMobile={isMobile}
        queueLength={queue.length}
        onSendFromQueue={handleSendFromQueue}
        firstQueueItemId={queue[0]?.id}
        onInputContentChange={setInputHasContent}
        onSubmitWithQuestionAnswer={submitWithQuestionAnswerCallback}
      />

        {/* Scroll to bottom button - isolated component to avoid re-renders during streaming */}
        <ScrollToBottomButton
          containerRef={chatContainerRef}
          onScrollToBottom={scrollToBottom}
          hasStackedCards={!pendingQuestions && (queue.length > 0 || changedFilesForSubChat.length > 0)}
          subChatId={subChatId}
          isActive={isActive}
        />
      </div>
    </SearchHighlightProvider>
  )
})

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

  // Get active sub-chat ID from store for mode tracking (reactive)
  const activeSubChatIdForMode = useAgentSubChatStore((state) => state.activeSubChatId)
  // Use per-subChat mode atom - falls back to "agent" if no active sub-chat
  const subChatModeAtom = useMemo(
    () => subChatModeAtomFamily(activeSubChatIdForMode || ""),
    [activeSubChatIdForMode],
  )
  const [subChatMode] = useAtom(subChatModeAtom)
  // Default mode for new sub-chats (used as fallback when no active sub-chat)
  const defaultAgentMode = useAtomValue(defaultAgentModeAtom)
  // Current mode - use subChatMode when there's an active sub-chat, otherwise use user's default preference
  const currentMode: AgentMode = activeSubChatIdForMode ? subChatMode : defaultAgentMode

  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)
  const customClaudeConfig = useAtomValue(customClaudeConfigAtom)
  const selectedOllamaModel = useAtomValue(selectedOllamaModelAtom)
  const normalizedCustomClaudeConfig =
    normalizeCustomClaudeConfig(customClaudeConfig)
  const hasCustomClaudeConfig = Boolean(normalizedCustomClaudeConfig)
  const setLoadingSubChats = useSetAtom(loadingSubChatsAtom)
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const setUnseenChanges = useSetAtom(agentsUnseenChangesAtom)
  const setSubChatUnseenChanges = useSetAtom(agentsSubChatUnseenChangesAtom)
  const setJustCreatedIds = useSetAtom(justCreatedIdsAtom)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const setUndoStack = useSetAtom(undoStackAtom)
  const setSelectedFilePath = useSetAtom(selectedDiffFilePathAtom)
  const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)
  const { notifyAgentComplete } = useDesktopNotifications()

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
  // Subscribe to activeSubChatId for plan sidebar (needs to update when switching sub-chats)
  const activeSubChatIdForPlan = useAgentSubChatStore((state) => state.activeSubChatId)

  // Per-subChat plan sidebar state - each sub-chat remembers its own open/close state
  const planSidebarAtom = useMemo(
    () => planSidebarOpenAtomFamily(activeSubChatIdForPlan || ""),
    [activeSubChatIdForPlan],
  )
  const [isPlanSidebarOpen, setIsPlanSidebarOpen] = useAtom(planSidebarAtom)
  const currentPlanPathAtom = useMemo(
    () => currentPlanPathAtomFamily(activeSubChatIdForPlan || ""),
    [activeSubChatIdForPlan],
  )
  const [currentPlanPath, setCurrentPlanPath] = useAtom(currentPlanPathAtom)

  // Details sidebar state (unified sidebar that combines all right sidebars)
  const isUnifiedSidebarEnabled = useAtomValue(unifiedSidebarEnabledAtom)
  const [isDetailsSidebarOpen, setIsDetailsSidebarOpen] = useAtom(detailsSidebarOpenAtom)

  // Resolved hotkeys for tooltips
  const toggleDetailsHotkey = useResolvedHotkeyDisplay("toggle-details")
  const toggleTerminalHotkey = useResolvedHotkeyDisplay("toggle-terminal")

  // Close plan sidebar when switching to a sub-chat that has no plan
  const prevSubChatIdRef = useRef(activeSubChatIdForPlan)
  useEffect(() => {
    if (prevSubChatIdRef.current !== activeSubChatIdForPlan) {
      // Sub-chat changed - if new one has no plan path, close sidebar
      if (!currentPlanPath) {
        setIsPlanSidebarOpen(false)
      }
      prevSubChatIdRef.current = activeSubChatIdForPlan
    }
  }, [activeSubChatIdForPlan, currentPlanPath, setIsPlanSidebarOpen])
  const setPendingBuildPlanSubChatId = useSetAtom(pendingBuildPlanSubChatIdAtom)

  // Read plan edit refetch trigger from atom (set by ChatViewInner when Edit completes)
  const planEditRefetchTriggerAtom = useMemo(
    () => planEditRefetchTriggerAtomFamily(activeSubChatIdForPlan || ""),
    [activeSubChatIdForPlan],
  )
  const planEditRefetchTrigger = useAtomValue(planEditRefetchTriggerAtom)

  // Handler for plan sidebar "Build plan" button
  // Uses getState() to get fresh activeSubChatId (avoids stale closure)
  const handleApprovePlanFromSidebar = useCallback(() => {
    const activeSubChatId = useAgentSubChatStore.getState().activeSubChatId
    if (activeSubChatId) {
      setPendingBuildPlanSubChatId(activeSubChatId)
    }
  }, [setPendingBuildPlanSubChatId])

  // Per-chat terminal sidebar state - each chat remembers its own open/close state
  const terminalSidebarAtom = useMemo(
    () => terminalSidebarOpenAtomFamily(chatId),
    [chatId],
  )
  const [isTerminalSidebarOpen, setIsTerminalSidebarOpen] = useAtom(terminalSidebarAtom)

  // Mutual exclusion: Details sidebar vs Plan/Terminal/Diff(side-peek) sidebars
  // When one opens, close the conflicting ones and remember for restoration

  // Track what was auto-closed and by whom for restoration
  const autoClosedStateRef = useRef<{
    // What closed Details
    detailsClosedBy: "plan" | "terminal" | "diff" | null
    // What Details closed
    planClosedByDetails: boolean
    terminalClosedByDetails: boolean
    diffClosedByDetails: boolean
  }>({
    detailsClosedBy: null,
    planClosedByDetails: false,
    terminalClosedByDetails: false,
    diffClosedByDetails: false,
  })

  // Track previous states to detect opens/closes
  const prevSidebarStatesRef = useRef({
    details: isDetailsSidebarOpen,
    plan: isPlanSidebarOpen && !!currentPlanPath,
    terminal: isTerminalSidebarOpen,
  })

  useEffect(() => {
    const prev = prevSidebarStatesRef.current
    const auto = autoClosedStateRef.current
    const isPlanOpen = isPlanSidebarOpen && !!currentPlanPath

    // Detect state changes
    const detailsJustOpened = isDetailsSidebarOpen && !prev.details
    const detailsJustClosed = !isDetailsSidebarOpen && prev.details
    const planJustOpened = isPlanOpen && !prev.plan
    const planJustClosed = !isPlanOpen && prev.plan
    const terminalJustOpened = isTerminalSidebarOpen && !prev.terminal
    const terminalJustClosed = !isTerminalSidebarOpen && prev.terminal

    // Details opened → close conflicting sidebars and remember
    if (detailsJustOpened) {
      if (isPlanOpen) {
        auto.planClosedByDetails = true
        setIsPlanSidebarOpen(false)
      }
      if (isTerminalSidebarOpen) {
        auto.terminalClosedByDetails = true
        setIsTerminalSidebarOpen(false)
      }
    }
    // Details closed → restore what it closed
    else if (detailsJustClosed) {
      if (auto.planClosedByDetails) {
        auto.planClosedByDetails = false
        setIsPlanSidebarOpen(true)
      }
      if (auto.terminalClosedByDetails) {
        auto.terminalClosedByDetails = false
        setIsTerminalSidebarOpen(true)
      }
    }
    // Plan opened → close Details and remember
    else if (planJustOpened && isDetailsSidebarOpen) {
      auto.detailsClosedBy = "plan"
      setIsDetailsSidebarOpen(false)
    }
    // Plan closed → restore Details if we closed it
    else if (planJustClosed && auto.detailsClosedBy === "plan") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    }
    // Terminal opened → close Details and remember
    else if (terminalJustOpened && isDetailsSidebarOpen) {
      auto.detailsClosedBy = "terminal"
      setIsDetailsSidebarOpen(false)
    }
    // Terminal closed → restore Details if we closed it
    else if (terminalJustClosed && auto.detailsClosedBy === "terminal") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    }

    prevSidebarStatesRef.current = {
      details: isDetailsSidebarOpen,
      plan: isPlanOpen,
      terminal: isTerminalSidebarOpen,
    }
  }, [
    isDetailsSidebarOpen,
    isPlanSidebarOpen,
    currentPlanPath,
    isTerminalSidebarOpen,
    setIsDetailsSidebarOpen,
    setIsPlanSidebarOpen,
    setIsTerminalSidebarOpen,
  ])

  // Diff data cache - stored in atoms to persist across workspace switches
  const diffCacheAtom = useMemo(
    () => workspaceDiffCacheAtomFamily(chatId),
    [chatId],
  )
  const [diffCache, setDiffCache] = useAtom(diffCacheAtom)

  // Extract diff data from cache
  const diffStats = diffCache.diffStats
  const parsedFileDiffs = diffCache.parsedFileDiffs as ParsedDiffFile[] | null
  const prefetchedFileContents = diffCache.prefetchedFileContents
  const diffContent = diffCache.diffContent

  // Smart setters that update the cache
  const setDiffStats = useCallback((val: any) => {
    setDiffCache((prev) => {
      const newVal = typeof val === 'function' ? val(prev.diffStats) : val
      // Only update if something changed
      if (
        prev.diffStats.fileCount === newVal.fileCount &&
        prev.diffStats.additions === newVal.additions &&
        prev.diffStats.deletions === newVal.deletions &&
        prev.diffStats.isLoading === newVal.isLoading &&
        prev.diffStats.hasChanges === newVal.hasChanges
      ) {
        return prev // Return same reference to prevent re-render
      }
      return { ...prev, diffStats: newVal }
    })
  }, [setDiffCache])

  const setParsedFileDiffs = useCallback((files: ParsedDiffFile[] | null) => {
    setDiffCache((prev) => ({ ...prev, parsedFileDiffs: files as any }))
  }, [setDiffCache])

  const setPrefetchedFileContents = useCallback((contents: Record<string, string>) => {
    setDiffCache((prev) => ({ ...prev, prefetchedFileContents: contents }))
  }, [setDiffCache])

  const setDiffContent = useCallback((content: string | null) => {
    setDiffCache((prev) => ({ ...prev, diffContent: content }))
  }, [setDiffCache])
  const [diffMode, setDiffMode] = useAtom(diffViewModeAtom)
  const [diffDisplayMode, setDiffDisplayMode] = useAtom(diffViewDisplayModeAtom)
  const subChatsSidebarMode = useAtomValue(agentsSubChatsSidebarModeAtom)


  // Force narrow width when switching to side-peek mode (from dialog/fullscreen)
  useEffect(() => {
    if (diffDisplayMode === "side-peek") {
      // Set to narrow width (400px) to ensure correct layout
      appStore.set(agentsDiffSidebarWidthAtom, 400)
    }
  }, [diffDisplayMode])

  // Handle Diff + Details sidebar conflict (side-peek mode only)
  // - If Diff opens in side-peek while Details is open: switch Diff to center-peek (dialog) mode
  // - If user manually switches Diff to side-peek while Details is open: close Details and remember
  // - If Details opens while Diff is in side-peek mode: close Diff and remember
  const prevDiffStateRef = useRef<{ isOpen: boolean; mode: string; detailsOpen: boolean }>({
    isOpen: isDiffSidebarOpen,
    mode: diffDisplayMode,
    detailsOpen: isDetailsSidebarOpen,
  })
  // Flag to skip center-peek switch when restoring Diff after Details closes
  const isRestoringDiffRef = useRef(false)
  useEffect(() => {
    const prev = prevDiffStateRef.current
    const auto = autoClosedStateRef.current
    const isNowSidePeek = isDiffSidebarOpen && diffDisplayMode === "side-peek"
    const wasSidePeek = prev.isOpen && prev.mode === "side-peek"
    const detailsJustOpened = isDetailsSidebarOpen && !prev.detailsOpen
    const detailsJustClosed = !isDetailsSidebarOpen && prev.detailsOpen
    const diffSidePeekJustClosed = wasSidePeek && !isNowSidePeek

    if (isNowSidePeek && isDetailsSidebarOpen) {
      // Details just opened while Diff is in side-peek → close Diff and remember
      if (detailsJustOpened) {
        auto.diffClosedByDetails = true
        setIsDiffSidebarOpen(false)
      }
      // Diff just opened in side-peek mode → switch to dialog (don't close Details)
      // Skip if we're restoring Diff after Details closed
      else if (!prev.isOpen && !isRestoringDiffRef.current) {
        setDiffDisplayMode("center-peek")
      }
      // User manually switched to side-peek while Diff was already open → close Details and remember
      else if (prev.isOpen && prev.mode !== "side-peek") {
        auto.detailsClosedBy = "diff"
        setIsDetailsSidebarOpen(false)
      }
    }
    // Diff side-peek closed → restore Details if we closed it
    else if (diffSidePeekJustClosed && auto.detailsClosedBy === "diff") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    }
    // Details closed → restore Diff if we closed it (in side-peek mode, not switching to dialog)
    else if (detailsJustClosed && auto.diffClosedByDetails) {
      auto.diffClosedByDetails = false
      isRestoringDiffRef.current = true
      setIsDiffSidebarOpen(true)
      // Reset flag after state update
      requestAnimationFrame(() => {
        isRestoringDiffRef.current = false
      })
    }

    prevDiffStateRef.current = { isOpen: isDiffSidebarOpen, mode: diffDisplayMode, detailsOpen: isDetailsSidebarOpen }
  }, [isDiffSidebarOpen, diffDisplayMode, isDetailsSidebarOpen, setDiffDisplayMode, setIsDetailsSidebarOpen, setIsDiffSidebarOpen])

  // Hide traffic lights when full-page diff is open (they would overlap with content)
  useEffect(() => {
    if (!isDesktop || isFullscreen) return
    if (typeof window === "undefined" || !window.desktopApi?.setTrafficLightVisibility) return

    if (isDiffSidebarOpen && diffDisplayMode === "full-page") {
      window.desktopApi.setTrafficLightVisibility(false)
    }
  }, [isDiffSidebarOpen, diffDisplayMode, isDesktop, isFullscreen])

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

  // Compute isNarrow for filtering logic (same threshold as DiffSidebarContent)
  const isDiffSidebarNarrow = diffSidebarWidth < 500

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

  // Get sub-chat state from store (reactive subscription for tabsToRender)
  const {
    activeSubChatId,
    openSubChatIds,
    pinnedSubChatIds,
    allSubChats,
  } = useAgentSubChatStore(
    useShallow((state) => ({
      activeSubChatId: state.activeSubChatId,
      openSubChatIds: state.openSubChatIds,
      pinnedSubChatIds: state.pinnedSubChatIds,
      allSubChats: state.allSubChats,
    }))
  )

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

  // tRPC utils for optimistic cache updates
  const utils = api.useUtils()

  // tRPC mutations for renaming
  const renameSubChatMutation = api.agents.renameSubChat.useMutation()
  const renameChatMutation = api.agents.renameChat.useMutation()
  const generateSubChatNameMutation =
    api.agents.generateSubChatName.useMutation()

  // PR creation loading state - using atom to allow ChatViewInner to reset it
  const [isCreatingPr, setIsCreatingPr] = useAtom(isCreatingPrAtom)
  // Review loading state
  const [isReviewing, setIsReviewing] = useState(false)
  // Subchat filter setter - used by handleReview to filter by active subchat
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)

  // Determine if we're in sandbox mode
  const chatSourceMode = useAtomValue(chatSourceModeAtom)

  // Fetch chat data from local or remote based on mode
  const { data: localAgentChat, isLoading: isLocalLoading } = api.agents.getAgentChat.useQuery(
    { chatId },
    { enabled: !!chatId && chatSourceMode === "local" },
  )

  const { data: remoteAgentChat, isLoading: isRemoteLoading } = useRemoteChat(
    chatSourceMode === "sandbox" ? chatId : null,
  )

  // Use the appropriate data source
  // IMPORTANT: Must memoize to prevent infinite re-render loop
  // The inline object spread creates a new reference on every render,
  // which triggers the useEffect that calls setAllSubChats(), causing re-renders
  const agentChat = useMemo(() => {
    if (chatSourceMode === "sandbox") {
      if (!remoteAgentChat) return null
      return {
        ...remoteAgentChat,
        // Transform remote chat to match local structure
        createdAt: new Date(remoteAgentChat.created_at),
        updatedAt: new Date(remoteAgentChat.updated_at),
        archivedAt: null,
        projectId: null,
        worktreePath: null,
        branch: null,
        baseBranch: null,
        prUrl: null,
        prNumber: null,
        sandbox_id: remoteAgentChat.sandbox_id,
        sandboxId: remoteAgentChat.sandbox_id,
        isRemote: true,
        // Preserve stats from remote chat for diff display
        remoteStats: remoteAgentChat.stats,
        subChats: remoteAgentChat.subChats?.map(sc => ({
          ...sc,
          created_at: new Date(sc.created_at),
          updated_at: new Date(sc.updated_at),
        })) ?? [],
      }
    }
    return localAgentChat
  }, [chatSourceMode, remoteAgentChat, localAgentChat])

  const isLoading = chatSourceMode === "sandbox" ? isRemoteLoading : isLocalLoading

  // Compute if we're waiting for local chat data (used as loading gate)
  const isLocalChatLoading = chatSourceMode === "local" && isLocalLoading

  // Projects query for "Open Locally" functionality
  const { data: projects } = trpc.projects.list.useQuery()

  // Open Locally dialog state
  const [openLocallyDialogOpen, setOpenLocallyDialogOpen] = useState(false)

  // Auto-import hook for "Open Locally"
  const { getMatchingProjects, autoImport, isImporting } = useAutoImport()

  // Handler for "Open Locally" button in header
  const handleOpenLocally = useCallback(() => {
    if (!remoteAgentChat) return

    const matchingProjects = getMatchingProjects(projects ?? [], remoteAgentChat)

    if (matchingProjects.length === 1) {
      // Auto-import: single match found
      autoImport(remoteAgentChat, matchingProjects[0]!)
    } else {
      // Show dialog: 0 or 2+ matches
      setOpenLocallyDialogOpen(true)
    }
  }, [remoteAgentChat, projects, getMatchingProjects, autoImport])

  // Determine if "Open Locally" button should show
  const showOpenLocally = chatSourceMode === "sandbox" && !!remoteAgentChat

  // Get matching projects for dialog (only computed when needed)
  const openLocallyMatchingProjects = useMemo(() => {
    if (!remoteAgentChat) return []
    return getMatchingProjects(projects ?? [], remoteAgentChat)
  }, [remoteAgentChat, projects, getMatchingProjects])

  const agentSubChats = (agentChat?.subChats ?? []) as Array<{
    id: string
    name?: string | null
    mode?: "plan" | "agent" | null
    created_at?: Date | string | null
    updated_at?: Date | string | null
    messages?: any
    stream_id?: string | null
  }>

  // Workspace isolation: limit mounted tabs to prevent memory growth
  // CRITICAL: Filter by workspace to prevent rendering sub-chats from other workspaces
  // Always render: active + pinned, then fill with recent up to limit
  const MAX_MOUNTED_TABS = 5
  const tabsToRender = useMemo(() => {
    if (!activeSubChatId) return []

    // Combine server data (agentSubChats) with local store (allSubChats) for validation.
    // This handles:
    // 1. Race condition where setChatId resets allSubChats but activeSubChatId loads from localStorage
    // 2. Optimistic updates when creating new sub-chats (new sub-chat is in allSubChats but not in agentSubChats yet)
    //
    // By combining both sources, we validate against all known sub-chats from both server and local state.
    const validSubChatIds = new Set([
      ...agentSubChats.map(sc => sc.id),
      ...allSubChats.map(sc => sc.id),
    ])

    // If active sub-chat doesn't belong to this workspace → return []
    // This prevents rendering sub-chats from another workspace during race condition
    if (!validSubChatIds.has(activeSubChatId)) {
      return []
    }

    // Filter openSubChatIds and pinnedSubChatIds to only valid IDs for this workspace
    const validOpenIds = openSubChatIds.filter(id => validSubChatIds.has(id))
    const validPinnedIds = pinnedSubChatIds.filter(id => validSubChatIds.has(id))

    // Start with active (must always be mounted)
    const mustRender = new Set([activeSubChatId])

    // Add pinned tabs (only valid ones)
    for (const id of validPinnedIds) {
      mustRender.add(id)
    }

    // If we have room, add recent tabs from openSubChatIds (only valid ones)
    if (mustRender.size < MAX_MOUNTED_TABS) {
      const remaining = MAX_MOUNTED_TABS - mustRender.size
      const recentTabs = validOpenIds
        .filter(id => !mustRender.has(id))
        .slice(-remaining) // Take the most recent (end of array)

      for (const id of recentTabs) {
        mustRender.add(id)
      }
    }

    // Return tabs to render
    // Always include activeSubChatId even if not in validOpenIds (handles race condition
    // where openSubChatIds from localStorage doesn't include the active tab yet)
    const result = validOpenIds.filter(id => mustRender.has(id))
    if (!result.includes(activeSubChatId)) {
      result.unshift(activeSubChatId)
    }
    return result
  }, [activeSubChatId, pinnedSubChatIds, openSubChatIds, allSubChats, agentSubChats])

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
  const prMergeable = prStatusData?.pr?.mergeable
  const hasMergeConflicts = prMergeable === "CONFLICTING"
  // PR is open if state is explicitly "open" or "draft"
  // When PR status is still loading, assume open to avoid showing wrong button
  const isPrOpen = hasPrNumber && (isPrStatusLoading || prState === "open" || prState === "draft")

  // Merge PR mutation
  const trpcUtils = trpc.useUtils()

  // Sync from main mutation (for resolving merge conflicts)
  const mergeFromDefaultMutation = trpc.changes.mergeFromDefault.useMutation({
    onSuccess: () => {
      toast.success("Branch synced with main. You can now merge the PR.", { position: "top-center" })
      // Invalidate PR status to refresh mergeability
      trpcUtils.chats.getPrStatus.invalidate({ chatId })
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync with main", { position: "top-center" })
    },
  })

  const mergePrMutation = trpc.chats.mergePr.useMutation({
    onSuccess: () => {
      toast.success("PR merged successfully!", { position: "top-center" })
      // Invalidate PR status to update button state
      trpcUtils.chats.getPrStatus.invalidate({ chatId })
    },
    onError: (error) => {
      const errorMsg = error.message || "Failed to merge PR"

      // Check if it's a merge conflict error
      if (errorMsg.includes("MERGE_CONFLICT")) {
        toast.error(
          "PR has merge conflicts. Sync with main to resolve.",
          {
            position: "top-center",
            duration: 8000,
            action: worktreePath ? {
              label: "Sync with Main",
              onClick: () => {
                mergeFromDefaultMutation.mutate({ worktreePath, useRebase: false })
              },
            } : undefined,
          }
        )
      } else {
        toast.error(errorMsg, { position: "top-center" })
      }
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

  // Listen for file changes from Claude Write/Edit tools and invalidate git status
  useFileChangeListener(worktreePath)

  // Subscribe to GitWatcher for real-time file system monitoring (chokidar on main process)
  useGitWatcher(worktreePath)

  // Extract port, repository, and quick setup flag from meta
  const meta = agentChat?.meta as {
    sandboxConfig?: { port?: number }
    repository?: string
    branch?: string | null
    isQuickSetup?: boolean
  } | null
  const repository = meta?.repository

  // Remote info for Details sidebar (when worktreePath is null but sandboxId exists)
  const remoteInfo = useMemo(() => {
    if (worktreePath || !sandboxId) return null
    return {
      repository: meta?.repository,
      branch: meta?.branch,
      sandboxId,
    }
  }, [worktreePath, sandboxId, meta?.repository, meta?.branch])

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

  // Check if diff button can be shown (stats available)
  // This shows the Changes button with stats in header
  const canShowDiffButton = !!worktreePath || !!sandboxId

  // Check if diff sidebar can be opened (actual diff content available)
  // Desktop remote chats (sandboxId without worktree) cannot open diff sidebar - only stats in header
  const canOpenDiff = !!worktreePath || (!!sandboxId && !isDesktopApp())

  // Create list of subchats with changed files for filtering
  // Only include subchats that have uncommitted changes, sorted by most recent first
  const subChatsWithFiles = useMemo(() => {
    const result: Array<{
      id: string
      name: string
      filePaths: string[]
      fileCount: number
      updatedAt: string
    }> = []

    // Only include subchats that have files (uncommitted changes)
    for (const subChat of allSubChats) {
      const files = subChatFiles.get(subChat.id) || []
      if (files.length > 0) {
        result.push({
          id: subChat.id,
          name: subChat.name || "New Chat",
          filePaths: files.map((f) => f.filePath),
          fileCount: files.length,
          updatedAt: subChat.updated_at || subChat.created_at || "",
        })
      }
    }

    // Sort by most recent first
    result.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return 0
      if (!a.updatedAt) return 1
      if (!b.updatedAt) return -1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    return result
  }, [allSubChats, subChatFiles])

  // Close preview sidebar if preview becomes unavailable
  useEffect(() => {
    if (!canOpenPreview && isPreviewSidebarOpen) {
      setIsPreviewSidebarOpen(false)
    }
  }, [canOpenPreview, isPreviewSidebarOpen, setIsPreviewSidebarOpen])

  // Note: We no longer forcibly close diff sidebar when canOpenDiff is false.
  // The sidebar render is guarded by canOpenDiff, so it naturally hides.
  // Per-chat state (diffSidebarOpenAtomFamily) preserves each chat's preference.

  // Fetch diff stats - extracted as callback for reuse in onFinish
  const fetchDiffStatsDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingDiffRef = useRef(false)

  const fetchDiffStats = useCallback(async () => {
    console.log("[fetchDiffStats] Called with:", { worktreePath, sandboxId, chatId, isDesktop: isDesktopApp() })

    // Desktop uses worktreePath, web uses sandboxId
    // Don't reset stats if worktreePath is temporarily undefined - just skip the fetch
    // This prevents the button from becoming disabled when component re-renders
    if (!worktreePath && !sandboxId) {
      console.log("[fetchDiffStats] Skipping - no worktreePath or sandboxId")
      return
    }

    // Prevent duplicate parallel fetches
    if (isFetchingDiffRef.current) {
      console.log("[fetchDiffStats] Skipping - already fetching")
      return
    }
    isFetchingDiffRef.current = true
    console.log("[fetchDiffStats] Starting fetch...")

    try {
      // Desktop: use new getParsedDiff endpoint (all-in-one: parsing + file contents)
      if (worktreePath && chatId) {
        const result = await trpcClient.chats.getParsedDiff.query({ chatId })

        if (result.files.length > 0) {
          // Store parsed files directly (already parsed on server)
          setParsedFileDiffs(result.files)

          // Store prefetched file contents
          setPrefetchedFileContents(result.fileContents)

          // Set diff content to null since we have parsed files
          // (AgentDiffView will use parsedFileDiffs when available)
          setDiffContent(null)

          setDiffStats({
            fileCount: result.files.length,
            additions: result.totalAdditions,
            deletions: result.totalDeletions,
            isLoading: false,
            hasChanges: result.files.length > 0,
          })
        } else {
          setDiffStats({
            fileCount: 0,
            additions: 0,
            deletions: 0,
            isLoading: false,
            hasChanges: false,
          })
          // Use empty array instead of null to signal "no changes" vs "still loading"
          setParsedFileDiffs([])
          setPrefetchedFileContents({})
          setDiffContent(null)
        }
        return
      }

      // Desktop without chat (viewing main repo directly)
      if (worktreePath && !chatId) {
        // TODO: Need to add endpoint that accepts worktreePath directly
        return
      }

      // Remote sandbox: use stats from chat data (desktop) or fetch diff (web)
      if (sandboxId) {
        console.log("[fetchDiffStats] Sandbox mode - sandboxId:", sandboxId)

        // Desktop app: use stats already provided in chat data
        // The diff sidebar won't work for remote chats (no worktree), but stats will show
        if (isDesktopApp()) {
          const remoteStats = (agentChat as any)?.remoteStats
          console.log("[fetchDiffStats] Desktop remote chat - using remoteStats:", remoteStats)

          if (remoteStats) {
            setDiffStats({
              fileCount: remoteStats.fileCount,
              additions: remoteStats.additions,
              deletions: remoteStats.deletions,
              isLoading: false,
              hasChanges: remoteStats.fileCount > 0,
            })
          } else {
            setDiffStats({
              fileCount: 0,
              additions: 0,
              deletions: 0,
              isLoading: false,
              hasChanges: false,
            })
          }
          // No parsed files for remote chats - diff view not available
          setParsedFileDiffs([])
          setPrefetchedFileContents({})
          setDiffContent(null)
          return
        }

        // Web: use relative fetch to get actual diff
        let rawDiff: string | null = null
        const response = await fetch(`/api/agents/sandbox/${sandboxId}/diff`)
        if (!response.ok) {
          setDiffStats((prev) => ({ ...prev, isLoading: false }))
          return
        }
        const data = await response.json()
        rawDiff = data.diff || null

        // Store raw diff for AgentDiffView
        console.log("[fetchDiffStats] Setting diff content, length:", rawDiff?.length ?? 0)
        setDiffContent(rawDiff)

        if (rawDiff && rawDiff.trim()) {
          // Parse diff to get file list and stats (client-side for web)
          console.log("[fetchDiffStats] Parsing diff...")
          const parsedFiles = splitUnifiedDiffByFile(rawDiff)
          console.log("[fetchDiffStats] Parsed files:", parsedFiles.length, "files")
          setParsedFileDiffs(parsedFiles)

          let additions = 0
          let deletions = 0
          for (const file of parsedFiles) {
            additions += file.additions
            deletions += file.deletions
          }

          console.log("[fetchDiffStats] Setting stats:", { fileCount: parsedFiles.length, additions, deletions })
          setDiffStats({
            fileCount: parsedFiles.length,
            additions,
            deletions,
            isLoading: false,
            hasChanges: parsedFiles.length > 0,
          })
        } else {
          console.log("[fetchDiffStats] No diff content, setting empty stats")
          setDiffStats({
            fileCount: 0,
            additions: 0,
            deletions: 0,
            isLoading: false,
            hasChanges: false,
          })
          // Use empty array instead of null to signal "no changes" vs "still loading"
          setParsedFileDiffs([])
          setPrefetchedFileContents({})
        }
      }
    } catch (error) {
      console.error("[fetchDiffStats] Error:", error)
      setDiffStats((prev) => ({ ...prev, isLoading: false }))
    } finally {
      console.log("[fetchDiffStats] Done")
      isFetchingDiffRef.current = false
    }
  }, [worktreePath, sandboxId, chatId, agentChat]) // Note: activeSubChatId removed - diff is same for whole chat

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

  // Refresh diff stats when diff sidebar opens (background refresh - don't block UI)
  // Keep existing data visible while fetching, only update if data changed
  useEffect(() => {
    if (isDiffSidebarOpen) {
      // Fetch in background - existing parsedFileDiffs will be shown immediately
      fetchDiffStats()
    }
  }, [isDiffSidebarOpen, fetchDiffStats])

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
        setIsCreatingPr(false)
        return
      }

      // Generate message and set it for ChatViewInner to send
      const message = generatePrMessage(context)
      setPendingPrMessage(message)
      // Don't reset isCreatingPr here - it will be reset after message is sent
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare PR request",
        { position: "top-center" },
      )
      setIsCreatingPr(false)
    }
  }, [chatId, setPendingPrMessage])

  // Handle Commit to existing PR - sends a message to Claude to commit and push
  // selectedPaths parameter is optional - if provided, only those files will be mentioned
  const [isCommittingToPr, setIsCommittingToPr] = useState(false)
  const handleCommitToPr = useCallback(async (_selectedPaths?: string[]) => {
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

      // Set filter to show only files from the active subchat
      if (activeSubChatId) {
        setFilteredSubChatId(activeSubChatId)
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
  }, [chatId, activeSubChatId, setPendingReviewMessage, setFilteredSubChatId])

  // Handle Fix Conflicts - sends a message to Claude to sync with main and fix merge conflicts
  const setPendingConflictResolutionMessage = useSetAtom(pendingConflictResolutionMessageAtom)

  const handleFixConflicts = useCallback(() => {
    const message = `This PR has merge conflicts with the main branch. Please:

1. First, fetch and merge the latest changes from main branch using git commands
2. If there are any merge conflicts, resolve them carefully by keeping the correct code from both branches
3. After resolving conflicts, commit the merge
4. Push the changes to update the PR

Make sure to preserve all functionality from both branches when resolving conflicts.`

    setPendingConflictResolutionMessage(message)
  }, [setPendingConflictResolutionMessage])

  // Fetch branch data for diff sidebar header
  const { data: branchData } = trpc.changes.getBranches.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath }
  )

  // Fetch git status for sync counts (pushCount, pullCount, hasUpstream)
  const { data: gitStatus, refetch: refetchGitStatus, isLoading: isGitStatusLoading } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath && isDiffSidebarOpen, staleTime: 30000 }
  )

  // Refetch git status and diff stats when window gains focus
  useEffect(() => {
    if (!worktreePath || !isDiffSidebarOpen) return

    const handleWindowFocus = () => {
      // Refetch git status
      refetchGitStatus()
      // Refetch diff stats to get latest changes
      fetchDiffStats()
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [worktreePath, isDiffSidebarOpen, refetchGitStatus, fetchDiffStats])

  // Sync parsedFileDiffs with git status - clear diff data when all files are committed
  // This fixes the issue where diff sidebar shows stale files after external git commit
  useEffect(() => {
    if (!gitStatus || isGitStatusLoading) return

    // Check if git status shows no uncommitted changes
    const hasUncommittedChanges =
      (gitStatus.staged?.length ?? 0) > 0 ||
      (gitStatus.unstaged?.length ?? 0) > 0 ||
      (gitStatus.untracked?.length ?? 0) > 0

    // If git shows no changes but we still have parsedFileDiffs, clear them
    if (!hasUncommittedChanges && parsedFileDiffs && parsedFileDiffs.length > 0) {
      console.log('[active-chat] Git status empty but parsedFileDiffs has files, refreshing diff data')
      setParsedFileDiffs([])
      setPrefetchedFileContents({})
      setDiffContent(null)
      setDiffStats({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        isLoading: false,
        hasChanges: false,
      })
    }
  }, [gitStatus, isGitStatusLoading, parsedFileDiffs])

  // Stable callbacks for DiffSidebarHeader to prevent re-renders
  const handleRefreshGitStatus = useCallback(() => {
    refetchGitStatus()
  }, [refetchGitStatus])

  const handleExpandAll = useCallback(() => {
    diffViewRef.current?.expandAll()
  }, [])

  const handleCollapseAll = useCallback(() => {
    diffViewRef.current?.collapseAll()
  }, [])

  const handleMarkAllViewed = useCallback(() => {
    diffViewRef.current?.markAllViewed()
  }, [])

  const handleMarkAllUnviewed = useCallback(() => {
    diffViewRef.current?.markAllUnviewed()
  }, [])

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

    // Initialize atomFamily mode for each sub-chat from database
    // This ensures new chats with mode="plan" use the correct mode
    for (const sc of dbSubChats) {
      if (sc.mode) {
        appStore.set(subChatModeAtomFamily(sc.id), sc.mode)
      }
    }

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

  // Auto-detect plan path from ACTIVE sub-chat messages when sub-chat changes
  // This ensures the plan sidebar shows the correct plan for the active sub-chat only
  useEffect(() => {
    if (!agentSubChats || agentSubChats.length === 0 || !activeSubChatIdForPlan) {
      setCurrentPlanPath(null)
      return
    }

    // Find the active sub-chat
    const activeSubChat = agentSubChats.find(sc => sc.id === activeSubChatIdForPlan)
    if (!activeSubChat) {
      setCurrentPlanPath(null)
      return
    }

    // Find last plan file path from active sub-chat only
    let lastPlanPath: string | null = null
    const messages = (activeSubChat.messages as any[]) || []
    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      const parts = msg.parts || []
      for (const part of parts) {
        if (
          part.type === "tool-Write" &&
          isPlanFile(part.input?.file_path || "")
        ) {
          lastPlanPath = part.input.file_path
        }
      }
    }

    setCurrentPlanPath(lastPlanPath)
  }, [agentSubChats, activeSubChatIdForPlan, setCurrentPlanPath])

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

      // Get mode from store metadata (falls back to currentMode)
      const subChatMeta = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === subChatId)
      const subChatMode = subChatMeta?.mode || currentMode

      // Create transport based on chat type (local worktree vs remote sandbox)
      // Note: Extended thinking setting is read dynamically inside the transport
      // projectPath: original project path for MCP config lookup (worktreePath is the cwd)
      const projectPath = (agentChat as any)?.project?.path as string | undefined
      const chatSandboxId = (agentChat as any)?.sandboxId || (agentChat as any)?.sandbox_id
      const chatSandboxUrl = chatSandboxId ? `https://3003-${chatSandboxId}.e2b.app` : null
      const isRemoteChat = !!(agentChat as any)?.isRemote || !!chatSandboxId

      console.log("[getOrCreateChat] Transport selection", {
        subChatId: subChatId.slice(-8),
        isRemoteChat,
        chatSandboxId,
        chatSandboxUrl,
        worktreePath: worktreePath ? "exists" : "none",
      })

      let transport: IPCChatTransport | RemoteChatTransport | null = null

      if (isRemoteChat && chatSandboxUrl) {
        // Remote sandbox chat: use HTTP SSE transport
        const subChatName = subChat?.name || "Chat"
        const modelString = MODEL_ID_MAP[selectedModelId]
        console.log("[getOrCreateChat] Using RemoteChatTransport", { sandboxUrl: chatSandboxUrl, model: modelString })
        transport = new RemoteChatTransport({
          chatId,
          subChatId,
          subChatName,
          sandboxUrl: chatSandboxUrl,
          mode: subChatMode,
          model: modelString,
        })
      } else if (worktreePath) {
        // Local worktree chat: use IPC transport
        transport = new IPCChatTransport({
          chatId,
          subChatId,
          cwd: worktreePath,
          projectPath,
          mode: subChatMode,
        })
      }

      if (!transport) {
        console.error("[getOrCreateChat] No transport available")
        return null
      }

      const newChat = new Chat<any>({
        id: subChatId,
        messages,
        transport,
        onError: () => {
          // Sync status to global store on error (allows queue to continue)
          useStreamingStatusStore.getState().setStatus(subChatId, "ready")
        },
        // Clear loading when streaming completes (works even if component unmounted)
        onFinish: () => {
          clearLoading(setLoadingSubChats, subChatId)

          // Sync status to global store for queue processing (even when component unmounted)
          useStreamingStatusStore.getState().setStatus(subChatId, "ready")

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
      currentMode,
      setSubChatUnseenChanges,
      selectedChatId,
      setUnseenChanges,
      notifyAgentComplete,
    ],
  )

  // Handle creating a new sub-chat
  const handleCreateNewSubChat = useCallback(async () => {
    const store = useAgentSubChatStore.getState()
    // New sub-chats use the user's default mode preference
    const newSubChatMode = defaultAgentMode

    // Check if this is a remote sandbox chat
    const isRemoteChat = !!(agentChat as any)?.isRemote

    let newId: string

    if (isRemoteChat) {
      // Sandbox mode: lazy creation (web app pattern)
      // Sub-chat will be persisted on first message via RemoteChatTransport UPSERT
      newId = crypto.randomUUID()
    } else {
      // Local mode: create sub-chat in DB first to get the real ID
      const newSubChat = await trpcClient.chats.createSubChat.mutate({
        chatId,
        name: "New Chat",
        mode: newSubChatMode,
      })
      newId = newSubChat.id
      utils.agents.getAgentChat.invalidate({ chatId })

      // Optimistic update: add new sub-chat to React Query cache immediately
      // This is CRITICAL for workspace isolation - without this, the new sub-chat
      // won't be in validSubChatIds and will be filtered out by tabsToRender
      utils.agents.getAgentChat.setData({ chatId }, (old) => {
        if (!old) return old
        return {
          ...old,
          subChats: [
            ...(old.subChats || []),
            {
              id: newId,
              name: "New Chat",
              mode: newSubChatMode,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: null,
              stream_id: null,
            },
          ],
        }
      })
    }

    // Track this subchat as just created for typewriter effect
    setJustCreatedIds((prev) => new Set([...prev, newId]))

    // Add to allSubChats with placeholder name
    store.addToAllSubChats({
      id: newId,
      name: "New Chat",
      created_at: new Date().toISOString(),
      mode: newSubChatMode,
    })

    // Set the mode atomFamily for the new sub-chat (so currentMode reads correct value)
    appStore.set(subChatModeAtomFamily(newId), newSubChatMode)

    // Add to open tabs and set as active
    store.addToOpenSubChats(newId)
    store.setActiveSubChat(newId)

    // Create empty Chat instance for the new sub-chat
    const projectPath = (agentChat as any)?.project?.path as string | undefined
    const newSubChatSandboxId = (agentChat as any)?.sandboxId || (agentChat as any)?.sandbox_id
    const newSubChatSandboxUrl = newSubChatSandboxId ? `https://3003-${newSubChatSandboxId}.e2b.app` : null
    const isNewSubChatRemote = !!(agentChat as any)?.isRemote || !!newSubChatSandboxId

    console.log("[createNewSubChat] Transport selection", {
      newId: newId.slice(-8),
      isNewSubChatRemote,
      newSubChatSandboxId,
      newSubChatSandboxUrl,
    })

    let newSubChatTransport: IPCChatTransport | RemoteChatTransport | null = null

    if (isNewSubChatRemote && newSubChatSandboxUrl) {
      // Remote sandbox chat: use HTTP SSE transport
      const modelString = MODEL_ID_MAP[selectedModelId]
      console.log("[createNewSubChat] Using RemoteChatTransport", { model: modelString })
      newSubChatTransport = new RemoteChatTransport({
        chatId,
        subChatId: newId,
        subChatName: "New Chat",
        sandboxUrl: newSubChatSandboxUrl,
        mode: subChatMode,
        model: modelString,
      })
    } else if (worktreePath) {
      // Local worktree chat: use IPC transport
      newSubChatTransport = new IPCChatTransport({
        chatId,
        subChatId: newId,
        cwd: worktreePath,
        projectPath,
        mode: newSubChatMode,
      })
    }

    if (newSubChatTransport) {
      const transport = newSubChatTransport

      const newChat = new Chat<any>({
        id: newId,
        messages: [],
        transport,
        onError: () => {
          // Sync status to global store on error (allows queue to continue)
          useStreamingStatusStore.getState().setStatus(newId, "ready")
        },
        // Clear loading when streaming completes
        onFinish: () => {
          clearLoading(setLoadingSubChats, newId)

          // Sync status to global store for queue processing (even when component unmounted)
          useStreamingStatusStore.getState().setStatus(newId, "ready")

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
    defaultAgentMode,
    utils,
    setSubChatUnseenChanges,
    selectedChatId,
    setUnseenChanges,
    notifyAgentComplete,
    agentChat?.isRemote,
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

  // NOTE: Desktop notifications for pending questions are now triggered directly
  // in ipc-chat-transport.ts when the ask-user-question chunk arrives.
  // This prevents duplicate notifications from multiple ChatView instances.

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

        // Toggle diff sidebar
        setIsDiffSidebarOpen(!isDiffSidebarOpen)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isDiffSidebarOpen])

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
          return generateSubChatNameMutation.mutateAsync({ userMessage: msg, ollamaModel: selectedOllamaModel })
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
      selectedOllamaModel,
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
    <TextSelectionProvider>
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
                      canOpenDiff={canShowDiffButton}
                      diffStats={diffStats}
                      onOpenTerminal={onOpenTerminal}
                      canOpenTerminal={!!worktreePath}
                      isArchived={isArchived}
                      onRestore={handleRestoreWorkspace}
                      onOpenLocally={handleOpenLocally}
                      showOpenLocally={showOpenLocally}
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
                        onOpenDiff={canOpenDiff ? () => setIsDiffSidebarOpen(true) : undefined}
                        canOpenDiff={canShowDiffButton}
                        isDiffSidebarOpen={isDiffSidebarOpen}
                        diffStats={diffStats}
                        onOpenTerminal={() => setIsTerminalSidebarOpen(true)}
                        canOpenTerminal={!!worktreePath}
                        chatId={chatId}
                      />
                      {/* Open Locally button - desktop only, sandbox mode */}
                      {showOpenLocally && (
                        <Tooltip delayDuration={500}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleOpenLocally}
                              disabled={isImporting}
                              className="h-6 px-2 gap-1.5 text-xs font-medium ml-2"
                            >
                              {isImporting ? (
                                <IconSpinner className="h-3 w-3 animate-spin" />
                              ) : (
                                <GitFork className="h-3 w-3" />
                              )}
                              Fork Locally
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Continue this session on your local machine
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}
                </div>
                {/* Open Preview Button - shows when preview is closed (desktop only, local mode only) */}
                {!isMobileFullscreen &&
                  !isPreviewSidebarOpen &&
                  sandboxId &&
                  chatSourceMode === "local" &&
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
                {/* Overview/Terminal Button - shows when sidebar is closed and worktree/sandbox exists (desktop only) */}
                {!isMobileFullscreen &&
                  (worktreePath || sandboxId) && (
                    isUnifiedSidebarEnabled ? (
                      // Details button for unified sidebar
                      !isDetailsSidebarOpen && (
                        <Tooltip delayDuration={500}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setIsDetailsSidebarOpen(true)}
                              className="h-6 w-6 p-0 hover:bg-foreground/10 transition-colors text-foreground flex-shrink-0 rounded-md ml-2"
                              aria-label="View details"
                            >
                              <IconOpenSidebarRight className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            View details
                            {toggleDetailsHotkey && <Kbd>{toggleDetailsHotkey}</Kbd>}
                          </TooltipContent>
                        </Tooltip>
                      )
                    ) : (
                      // Terminal button for legacy sidebars
                      !isTerminalSidebarOpen && (
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
                            {toggleTerminalHotkey && <Kbd>{toggleTerminalHotkey}</Kbd>}
                          </TooltipContent>
                        </Tooltip>
                      )
                    )
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

          {/* Chat Content - Keep-alive: render all open tabs, hide inactive with CSS */}
          {tabsToRender.length > 0 && agentChat ? (
            <div className="relative flex-1 min-h-0">
              {/* Loading gate: prevent getOrCreateChat() from caching empty messages before data is ready */}
              {isLocalChatLoading ? (
                <div className="flex items-center justify-center h-full">
                  <IconSpinner className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                tabsToRender.map(subChatId => {
                const chat = getOrCreateChat(subChatId)
                const isActive = subChatId === activeSubChatId
                const isFirstSubChat = getFirstSubChatId(agentSubChats) === subChatId

                // Defense in depth: double-check workspace ownership
                // Use agentSubChats (server data) as primary source, fall back to allSubChats for optimistic updates
                // This fixes the race condition where allSubChats is empty after setChatId but before setAllSubChats
                const belongsToWorkspace = agentSubChats.some(sc => sc.id === subChatId) ||
                                          allSubChats.some(sc => sc.id === subChatId)

                if (!chat || !belongsToWorkspace) return null

                return (
                  <div
                    key={subChatId}
                    className="absolute inset-0 flex flex-col"
                    style={{
                      // GPU-accelerated visibility switching (нативное ощущение)
                      // transform + opacity быстрее чем visibility для GPU
                      transform: isActive ? "translateZ(0)" : "translateZ(0) scale(0.98)",
                      opacity: isActive ? 1 : 0,
                      // Prevent pointer events on hidden tabs
                      pointerEvents: isActive ? "auto" : "none",
                      // GPU layer hints
                      willChange: "transform, opacity",
                      // Изолируем layout - изменения внутри не влияют на другие табы
                      contain: "layout style paint",
                    }}
                    aria-hidden={!isActive}
                  >
                    <ChatViewInner
                      chat={chat}
                      subChatId={subChatId}
                      parentChatId={chatId}
                      isFirstSubChat={isFirstSubChat}
                      onAutoRename={handleAutoRename}
                      onCreateNewSubChat={handleCreateNewSubChat}
                      teamId={selectedTeamId || undefined}
                      repository={repository}
                      streamId={agentChatStore.getStreamId(subChatId)}
                      isMobile={isMobileFullscreen}
                      isSubChatsSidebarOpen={subChatsSidebarMode === "sidebar"}
                      sandboxId={sandboxId || undefined}
                      projectPath={worktreePath || undefined}
                      isArchived={isArchived}
                      onRestoreWorkspace={handleRestoreWorkspace}
                      existingPrUrl={agentChat?.prUrl}
                      isActive={isActive}
                    />
                  </div>
                )
              })
              )}
            </div>
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
                              {hasCustomClaudeConfig ? (
                                "Custom Model"
                              ) : (
                                <>
                                  Sonnet{" "}
                                  <span className="text-muted-foreground">
                                    4.5
                                  </span>
                                </>
                              )}
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

        {/* Plan Sidebar - shows plan files on the right (leftmost right sidebar) */}
        {/* Only show when we have an active sub-chat with a plan */}
        {!isMobileFullscreen && activeSubChatIdForPlan && (
          <ResizableSidebar
            isOpen={isPlanSidebarOpen && !!currentPlanPath}
            onClose={() => setIsPlanSidebarOpen(false)}
            widthAtom={agentsPlanSidebarWidthAtom}
            minWidth={400}
            maxWidth={800}
            side="right"
            animationDuration={0}
            initialWidth={0}
            exitWidth={0}
            showResizeTooltip={true}
            className="bg-tl-background border-l"
            style={{ borderLeftWidth: "0.5px" }}
          >
            <AgentPlanSidebar
              chatId={activeSubChatIdForPlan}
              planPath={currentPlanPath}
              onClose={() => setIsPlanSidebarOpen(false)}
              onBuildPlan={handleApprovePlanFromSidebar}
              refetchTrigger={planEditRefetchTrigger}
              mode={currentMode}
            />
          </ResizableSidebar>
        )}

        {/* Diff View - hidden on mobile fullscreen and when diff is not available */}
        {/* Supports three display modes: side-peek (sidebar), center-peek (dialog), full-page */}
        {/* Wrapped in DiffStateProvider to isolate diff state and prevent ChatView re-renders */}
        {canOpenDiff && !isMobileFullscreen && (
          <DiffStateProvider
            isDiffSidebarOpen={isDiffSidebarOpen}
            parsedFileDiffs={parsedFileDiffs}
            isDiffSidebarNarrow={isDiffSidebarNarrow}
            setIsDiffSidebarOpen={setIsDiffSidebarOpen}
            setDiffStats={setDiffStats}
            setDiffContent={setDiffContent}
            setParsedFileDiffs={setParsedFileDiffs}
            setPrefetchedFileContents={setPrefetchedFileContents}
            fetchDiffStats={fetchDiffStats}
          >
            <DiffSidebarRenderer
              worktreePath={worktreePath}
              chatId={chatId}
              sandboxId={sandboxId}
              repository={repository}
              diffStats={diffStats}
              diffContent={diffContent}
              parsedFileDiffs={parsedFileDiffs}
              prefetchedFileContents={prefetchedFileContents}
              setDiffCollapseState={setDiffCollapseState}
              diffViewRef={diffViewRef}
              diffSidebarRef={diffSidebarRef}
              agentChat={agentChat}
              branchData={branchData}
              gitStatus={gitStatus}
              isGitStatusLoading={isGitStatusLoading}
              isDiffSidebarOpen={isDiffSidebarOpen}
              diffDisplayMode={diffDisplayMode}
              diffSidebarWidth={diffSidebarWidth}
              handleReview={handleReview}
              isReviewing={isReviewing}
              handleCreatePr={handleCreatePr}
              isCreatingPr={isCreatingPr}
              handleMergePr={handleMergePr}
              mergePrMutation={mergePrMutation}
              handleRefreshGitStatus={handleRefreshGitStatus}
              hasPrNumber={hasPrNumber}
              isPrOpen={isPrOpen}
              hasMergeConflicts={hasMergeConflicts}
              handleFixConflicts={handleFixConflicts}
              handleExpandAll={handleExpandAll}
              handleCollapseAll={handleCollapseAll}
              diffMode={diffMode}
              setDiffMode={setDiffMode}
              handleMarkAllViewed={handleMarkAllViewed}
              handleMarkAllUnviewed={handleMarkAllUnviewed}
              isDesktop={isDesktop}
              isFullscreen={isFullscreen}
              setDiffDisplayMode={setDiffDisplayMode}
              handleCommitToPr={handleCommitToPr}
              isCommittingToPr={isCommittingToPr}
              subChatsWithFiles={subChatsWithFiles}
              setDiffStats={setDiffStats}
            />
          </DiffStateProvider>
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

        {/* Open Locally Dialog - for importing sandbox chats to local */}
        <OpenLocallyDialog
          isOpen={openLocallyDialogOpen}
          onClose={() => setOpenLocallyDialogOpen(false)}
          remoteChat={remoteAgentChat ?? null}
          matchingProjects={openLocallyMatchingProjects}
          allProjects={projects ?? []}
          remoteSubChatId={activeSubChatId}
        />

        {/* Unified Details Sidebar - combines all right sidebars into one (rightmost) */}
        {/* Show for both local (worktreePath) and remote (sandboxId) chats */}
        {isUnifiedSidebarEnabled && !isMobileFullscreen && (worktreePath || sandboxId) && (
          <DetailsSidebar
            chatId={chatId}
            worktreePath={worktreePath}
            planPath={currentPlanPath}
            mode={currentMode}
            onBuildPlan={handleApprovePlanFromSidebar}
            planRefetchTrigger={planEditRefetchTrigger}
            activeSubChatId={activeSubChatIdForPlan}
            isPlanSidebarOpen={isPlanSidebarOpen && !!currentPlanPath}
            isTerminalSidebarOpen={isTerminalSidebarOpen}
            isDiffSidebarOpen={isDiffSidebarOpen}
            diffDisplayMode={diffDisplayMode}
            canOpenDiff={canOpenDiff}
            setIsDiffSidebarOpen={setIsDiffSidebarOpen}
            diffStats={diffStats}
            parsedFileDiffs={parsedFileDiffs}
            onCommit={handleCommitToPr}
            isCommitting={isCommittingToPr}
            onExpandTerminal={() => setIsTerminalSidebarOpen(true)}
            onExpandPlan={() => setIsPlanSidebarOpen(true)}
            onExpandDiff={() => setIsDiffSidebarOpen(true)}
            onFileSelect={(filePath) => {
              // Set the selected file path
              setSelectedFilePath(filePath)
              // Set filtered files to just this file
              setFilteredDiffFiles([filePath])
              // Open the diff sidebar
              setIsDiffSidebarOpen(true)
            }}
            remoteInfo={remoteInfo}
            isRemoteChat={!!remoteInfo}
          />
        )}
      </div>
    </div>
    </TextSelectionProvider>
  )
}
