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
  UnarchiveIcon,
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
import { ResizableBottomPanel } from "@/components/ui/resizable-bottom-panel"
import { Chat, useChat } from "@ai-sdk/react"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ArrowDown,
  ChevronDown,
  Globe2,
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
import { useShallow } from "zustand/react/shallow"
import type { FileStatus } from "../../../../shared/changes-types"
import { isProviderProfileSource } from "../../../../shared/provider-profile-types"
import { getQueryClient } from "../../../contexts/TRPCProvider"
import { trackMessageSent } from "../../../lib/analytics"
import {
  defaultAgentModeAtom,
  isDesktopAtom, isFullscreenAtom,
  sessionInfoAtom,
  selectedOllamaModelAtom,
  soundNotificationsEnabledAtom
} from "../../../lib/atoms"
import { useResolvedHotkeyDisplay } from "../../../lib/hotkeys"
import { useI18n } from "../../../lib/i18n"
import { appStore } from "../../../lib/jotai-store"
import { api } from "../../../lib/mock-api"
import { trpc, trpcClient } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { isDesktopApp } from "../../../lib/utils/platform"
import { ChangesPanel } from "../../changes"
import { useCommitActions } from "../../changes/components/commit-input"
import { DiffCenterPeekDialog } from "../../changes/components/diff-center-peek-dialog"
import { DiffFullPageView } from "../../changes/components/diff-full-page-view"
import { DiffSidebarHeader } from "../../changes/components/diff-sidebar-header"
import { usePushAction } from "../../changes/hooks/use-push-action"
import { getStatusIndicator } from "../../changes/utils/status"
import {
  detailsSidebarOpenAtom,
  unifiedSidebarEnabledAtom,
} from "../../details-sidebar/atoms"
import { DetailsSidebar } from "../../details-sidebar/details-sidebar"
import { FileViewerSidebar } from "../../file-viewer"
import { FileSearchDialog } from "../../file-viewer/components/file-search-dialog"
import { terminalBottomHeightAtom, terminalDisplayModeAtom, terminalSidebarOpenAtomFamily } from "../../terminal/atoms"
import { TerminalBottomPanelContent, TerminalSidebar } from "../../terminal/terminal-sidebar"
import { getTerminalScopeKey } from "../../terminal/utils"
import {
  agentsChangesPanelCollapsedAtom,
  agentsChangesPanelWidthAtom,
  agentsDiffSidebarWidthAtom,
  localBrowserWorkbenchOpenAtomFamily,
  localBrowserWorkbenchWidthAtom,
  agentsPlanSidebarWidthAtom,
  agentsSubChatsSidebarModeAtom,
  agentsSubChatUnseenChangesAtom,
  agentsUnseenChangesAtom,
  clearLoading,
  compactingSubChatsAtom,
  currentPlanPathAtomFamily,
  diffActiveTabAtom,
  diffSidebarOpenAtomFamily,
  diffViewDisplayModeAtom,
  expiredUserQuestionsAtom,
  fileSearchDialogOpenAtom,
  fileViewerDisplayModeAtom,
  fileViewerOpenAtomFamily,
  fileViewerSidebarWidthAtom,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  isCreatingPrAtom,
  justCreatedIdsAtom,
  loadingSubChatsAtom,
  MODEL_ID_MAP,
  pendingBuildPlanSubChatIdAtom,
  pendingConflictResolutionMessageAtom,
  pendingLocalBrowserReportAtomFamily,
  pendingChatHistoryAtom,
  type PendingChatHistory,
  pendingMentionAtom,
  pendingPlanApprovalsAtom,
  pendingPrMessageAtom,
  pendingReviewMessageAtom,
  pendingUserQuestionsAtom,
  planEditRefetchTriggerAtomFamily,
  planSidebarOpenAtomFamily,
  QUESTIONS_SKIPPED_MESSAGE,
  selectedAgentChatIdAtom,
  selectedCommitAtom,
  selectedDiffFilePathAtom,
  setLoading,
  subChatFilesAtom,
  agentsSidebarOpenAtom,
  subChatCodexModelIdAtomFamily,
  subChatCodexModelSourceAtomFamily,
  subChatCodexThinkingAtomFamily,
  subChatClaudeModelSourceAtomFamily,
  subChatModelIdAtomFamily,
  subChatModeAtomFamily,
  suppressInputFocusAtom,
  undoStackAtom,
  workspaceDiffCacheAtomFamily,
  type AgentMode,
  type SelectedCommit
} from "../atoms"
import type { ContinueWithProviderSelection } from "../components/agent-model-selector"
import { AgentSendButton } from "../components/agent-send-button"
import type { TextSelectionSource } from "../context/text-selection-context"
import { TextSelectionProvider } from "../context/text-selection-context"
import { useAgentsFileUpload, type UploadedImage } from "../hooks/use-agents-file-upload"
import { useAgentPanelConflicts } from "../hooks/use-agent-panel-conflicts"
import { useAuthRetry } from "../hooks/use-auth-retry"
import { useChangedFilesTracking } from "../hooks/use-changed-files-tracking"
import { useDesktopNotifications } from "../hooks/use-desktop-notifications"
import { useFocusInputOnEnter } from "../hooks/use-focus-input-on-enter"
import { useHaptic } from "../hooks/use-haptic"
import { usePastedTextFiles, type PastedTextFile } from "../hooks/use-pasted-text-files"
import { usePendingAgentMessages } from "../hooks/use-pending-agent-messages"
import { useTextContextSelection } from "../hooks/use-text-context-selection"
import { useToggleFocusOnCmdEsc } from "../hooks/use-toggle-focus-on-cmd-esc"
import { useWorkspaceDiffFetch } from "../hooks/use-workspace-diff-fetch"
import { ACPChatTransport } from "../lib/acp-chat-transport"
import { formatHistoryForContext } from "../lib/export-chat"
import {
  clearSubChatDraft,
  getSubChatDraftFull
} from "../lib/drafts"
import { IPCChatTransport } from "../lib/ipc-chat-transport"
import { buildAgentMessageParts } from "../lib/message-parts"
import {
  createQueueItem, createTextPreview, generateQueueId,
  toQueuedFile,
  toQueuedImage,
  toQueuedTextContext, toQueuedDiffTextContext, toQueuedPastedText, type DiffTextContext, type SelectedTextContext
} from "../lib/queue-utils"
import { expandCustomSlashCommand } from "../lib/slash-command-expansion"
import {
  FileOpenProvider,
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
import {
  findRollbackTargetSdkUuidForUserIndex,
  isRollingBackAtom,
  syncMessagesWithStatusAtom
} from "../stores/message-store"
import { clearSubChatRuntimeCaches } from "../stores/sub-chat-runtime-cleanup"
import { useStreamingStatusStore } from "../stores/streaming-status-store"
import {
  useAgentSubChatStore,
  type SubChatMeta,
} from "../stores/sub-chat-store"
import type { DiffStats, DiffViewMode } from "../ui/agent-diff-view"
import {
  AgentDiffView,
  diffViewModeAtom,
  type AgentDiffViewRef,
  type ParsedDiffFile,
} from "../ui/agent-diff-view"
import { AgentPlanSidebar } from "../ui/agent-plan-sidebar"
import { AgentQueueIndicator } from "../ui/agent-queue-indicator"
import { AgentToolCall } from "../ui/agent-tool-call"
import { AgentToolRegistry } from "../ui/agent-tool-registry"
import { isPlanFile } from "../ui/agent-tool-utils"
import { AgentUserMessageBubble } from "../ui/agent-user-message-bubble"
import { AgentUserQuestion, type AgentUserQuestionHandle } from "../ui/agent-user-question"
import { AgentsHeaderControls } from "../ui/agents-header-controls"
import { ChatTitleEditor } from "../ui/chat-title-editor"
import { LocalBrowserWorkbench } from "../ui/local-browser-workbench"
import { MobileChatHeader } from "../ui/mobile-chat-header"
import { QuickCommentInput } from "../ui/quick-comment-input"
import { SubChatSelector } from "../ui/sub-chat-selector"
import { SubChatStatusCard } from "../ui/sub-chat-status-card"
import { SplitViewContainer } from "../ui/split-view-container"
import { TextSelectionPopover } from "../ui/text-selection-popover"
import { autoRenameAgentChat } from "../utils/auto-rename"
import { getDisplayChatName } from "../utils/chat-names"
import { generateCommitToPrMessage, generatePrMessage, generateReviewMessage } from "../utils/pr-message"
import { ChatInputArea } from "./chat-input-area"
import { IsolatedMessagesSection } from "./isolated-messages-section"
const clearSubChatSelectionAtom = atom(null, () => {})
const isSubChatMultiSelectModeAtom = atom(false)
const selectedSubChatIdsAtom = atom(new Set<string>())

function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, [])
}
// import { selectedTeamIdAtom } from "@/lib/atoms/team"
const selectedTeamIdAtom = atom<string | null>(null)
// import type { PlanType } from "@/lib/config/subscription-plans"
type PlanType = string

// Module-level scroll position cache (per subChatId, session-only)
// Stores { scrollTop, scrollHeight, wasAtBottom } so we can restore position on tab switch
const scrollPositionCache = new Map<
  string,
  { scrollTop: number; scrollHeight: number; wasAtBottom: boolean }
>()
const mountedChatViewInnerCounts = new Map<string, number>()
const pendingSubChatCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearRuntimeCachesForSubChat(subChatId: string) {
  clearSubChatRuntimeCaches(subChatId)
  scrollPositionCache.delete(subChatId)
}

import { utf8ToBase64, base64ToUtf8 } from "../utils/base64"

/** Wait for streaming to finish by subscribing to the status store.
 *  Includes a 30s safety timeout — if the store never transitions to "ready",
 *  the promise resolves anyway to prevent hanging the UI indefinitely. */
const STREAMING_READY_TIMEOUT_MS = 30_000

function waitForStreamingReady(subChatId: string): Promise<void> {
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

// Isolated scroll-to-bottom button - uses own scroll listener to avoid re-renders of parent
const ScrollToBottomButton = memo(function ScrollToBottomButton({
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
  const { t } = useI18n()
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
              aria-label={t("agent.chat.scrollToBottom")}
            >
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {t("agent.chat.scrollToBottom")}
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
        // НЕ применяем к последней группе: она всегда видна и активно стримится,
        // content-visibility на ней мешает корректному scrollHeight во время стриминга
        ...(!isLastGroup && {
          contentVisibility: "auto",
          containIntrinsicSize: "auto 200px",
        }),
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
  repository: string | undefined
  diffStats: DiffStats
  setDiffStats: React.Dispatch<React.SetStateAction<DiffStats>>
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string>
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  agentChat: { prUrl?: string | null; prNumber?: number | null } | null | undefined
  // Real-time sidebar width for responsive layout during resize
  sidebarWidth: number
  // Commit with AI
  onCommitWithAI?: () => void
  isCommittingWithAI?: boolean
  // Diff view mode
  diffMode: DiffViewMode
  setDiffMode: (mode: DiffViewMode) => void
  // Create PR callback
  onCreatePr?: () => void
  // Called after successful commit to reset diff view state
  onCommitSuccess?: () => void
  // Called after discarding/deleting changes to refresh diff
  onDiscardSuccess?: () => void
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
  onDiscardSuccess,
  subChats = [],
}: Omit<DiffSidebarContentProps, 'selectedFilePath' | 'onFileSelect' | 'onCommitSuccess' | 'initialSubChatFilter' | 'onSelectNextFile'>) {
  const { t } = useI18n()
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

  // Active tab state (Changes/History) - atom so external components can switch tabs
  const [activeTab, setActiveTab] = useAtom(diffActiveTabAtom)

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
              activeTab={activeTab}
              selectedFilePath={selectedFilePath}
              onFileSelect={handleDiffFileSelect}
              onFileOpenPinned={() => {}}
              onCreatePr={onCreatePr}
              onCommitSuccess={handleCommitSuccess}
              onDiscardSuccess={onDiscardSuccess}
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
                  {t("details.files.loading")}
                </div>
              ) : commitFiles.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  {t("changes.history.noFilesChanged")}
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
                          toast.success(t("changes.history.copiedSha"))
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
                      {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : t("changes.history.unknownDate")}
                    </div>
                  </div>

                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                    {t("changes.history.filesInCommit", {
                      count: commitFiles.length,
                    })}
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
            activeTab={activeTab}
            selectedFilePath={selectedFilePath}
            onFileSelect={handleDiffFileSelect}
            onFileOpenPinned={() => {}}
            onCreatePr={onCreatePr}
            onCommitSuccess={handleCommitSuccess}
            onDiscardSuccess={onDiscardSuccess}
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
                {t("details.files.loading")}
              </div>
            ) : commitFiles.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                {t("changes.history.noFilesChanged")}
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
                        toast.success(t("changes.history.copiedSha"))
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
                    {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : t("changes.history.unknownDate")}
                  </div>
                </div>

                <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                  {t("changes.history.filesInCommit", {
                    count: commitFiles.length,
                  })}
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
    }, 2000)
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
  repository: string | undefined
  diffStats: DiffStats
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string>
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  diffSidebarRef: React.RefObject<HTMLDivElement | null>
  agentChat: { prUrl?: string | null; prNumber?: number | null } | null | undefined
  branchData: { current: string } | undefined
  gitStatus: { pushCount?: number; pullCount?: number; hasUpstream?: boolean; ahead?: number; behind?: number; staged?: any[]; unstaged?: any[]; untracked?: any[] } | undefined
  isGitStatusLoading: boolean
  isDiffSidebarOpen: boolean
  diffDisplayMode: "side-peek" | "center-peek" | "full-page"
  diffSidebarWidth: number
  handleReview: () => void
  isReviewing: boolean
  handleCreatePrDirect: () => void
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
  diffMode: DiffViewMode
  setDiffMode: (mode: DiffViewMode) => void
  handleMarkAllViewed: () => void
  handleMarkAllUnviewed: () => void
  isDesktop: boolean
  isFullscreen: boolean
  setDiffDisplayMode: (mode: "side-peek" | "center-peek" | "full-page") => void
  handleCommitToPr: (selectedPaths?: string[]) => void
  isCommittingToPr: boolean
  subChatsWithFiles: Array<{ id: string; name: string; filePaths: string[]; fileCount: number }>
  setDiffStats: React.Dispatch<React.SetStateAction<DiffStats>>
  onDiscardSuccess?: () => void
}

const DiffSidebarRenderer = memo(function DiffSidebarRenderer({
  worktreePath,
  chatId,
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
  handleCreatePrDirect,
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
  onDiscardSuccess,
}: DiffSidebarRendererProps) {
  // Get callbacks and state from context
  const { handleCloseDiff, viewedCount, handleViewedCountChange } = useDiffState()

  const handleReviewWithAI = useCallback(() => {
    if (diffDisplayMode !== "side-peek") {
      handleCloseDiff()
    }
    handleReview()
  }, [diffDisplayMode, handleCloseDiff, handleReview])

  const handleCreatePrWithAI = useCallback(() => {
    if (diffDisplayMode !== "side-peek") {
      handleCloseDiff()
    }
    handleCreatePr()
  }, [diffDisplayMode, handleCloseDiff, handleCreatePr])

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
          onReview={handleReviewWithAI}
          isReviewing={isReviewing}
          onCreatePr={handleCreatePrDirect}
          isCreatingPr={isCreatingPr}
          onCreatePrWithAI={handleCreatePrWithAI}
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
      ) : null}

      {/* Content: file list + diff view - vertical when narrow */}
      <DiffSidebarContent
        worktreePath={worktreePath}
        chatId={chatId}
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
        onCreatePr={handleCreatePrDirect}
        onDiscardSuccess={onDiscardSuccess}
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
  provider = "claude-code",
  isFirstSubChat,
  onAutoRename,
  onCreateNewSubChat,
  onProviderChange,
  refreshDiff,
  teamId,
  repository,
  streamId,
  isMobile = false,
  sandboxSetupStatus = "ready",
  sandboxSetupError,
  onRetrySetup,
  isSubChatsSidebarOpen = false,
  projectPath,
  isArchived = false,
  onRestoreWorkspace,
  existingPrUrl,
  isActive = true,
  isSplitPane = false,
  workspaceName,
  workspaceBranch,
  workspaceRepoName,
}: {
  chat: Chat<any>
  subChatId: string
  parentChatId: string
  provider?: "claude-code" | "codex"
  isFirstSubChat: boolean
  onAutoRename: (userMessage: string, subChatId: string) => void
  onCreateNewSubChat?: () => void
  onProviderChange?: (
    subChatId: string,
    provider: "claude-code" | "codex",
  ) => void
  refreshDiff?: () => void
  teamId?: string
  repository?: string
  streamId?: string | null
  isMobile?: boolean
  sandboxSetupStatus?: "cloning" | "ready" | "error"
  sandboxSetupError?: string
  onRetrySetup?: () => void
  isSubChatsSidebarOpen?: boolean
  projectPath?: string
  isArchived?: boolean
  onRestoreWorkspace?: () => void
  existingPrUrl?: string | null
  isActive?: boolean
  isSplitPane?: boolean
  workspaceName?: string | null
  workspaceBranch?: string | null
  workspaceRepoName?: string | null
}) {
  const { t } = useI18n()
  const hasTriggeredRenameRef = useRef(false)
  const hasTriggeredAutoGenerateRef = useRef(false)
  const isVisiblePane = isActive || isSplitPane

  // Keep isActive in ref for use in callbacks (avoid stale closures)
  const isVisiblePaneRef = useRef(isVisiblePane)
  isVisiblePaneRef.current = isVisiblePane

  // Scroll management state (like canvas chat)
  // Using only ref to avoid re-renders on scroll
  const shouldAutoScrollRef = useRef(true)
  const isAutoScrollingRef = useRef(false) // Flag to ignore scroll events caused by auto-scroll
  const isInitializingScrollRef = useRef(false) // Flag to ignore scroll events during scroll initialization (content loading)
  const scrollInitializedRef = useRef(false) // Track whether initial scroll setup has run for this pane
  const hasUnapprovedPlanRef = useRef(false) // Track unapproved plan state for scroll initialization
  const chatContainerRef = useRef<HTMLElement | null>(null)

  // Cleanup isAutoScrollingRef on unmount to prevent stuck state
  useEffect(() => {
    return () => {
      isAutoScrollingRef.current = false
    }
  }, [])

  const saveScrollPosition = useCallback(() => {
    // Skip cache writes for panes that never completed initial scroll setup.
    // Hidden keep-alive panes can otherwise persist default top-position values.
    if (!scrollInitializedRef.current) return

    const container = chatContainerRef.current
    if (!container) return

    const threshold = 50
    const wasAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
    scrollPositionCache.set(subChatId, {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      wasAtBottom,
    })
  }, [subChatId])

  // Save scroll position when tab becomes inactive or on unmount
  useEffect(() => {
    if (!isVisiblePane) {
      saveScrollPosition()
    }
    return () => {
      saveScrollPosition()
    }
  }, [isVisiblePane, saveScrollPosition])

  // Track chat container height via CSS custom property (no re-renders)
  const chatContainerObserverRef = useRef<ResizeObserver | null>(null)

  // Ref for the inner content wrapper (for ResizeObserver-based scroll-to-bottom)
  const contentWrapperRef = useRef<HTMLDivElement | null>(null)

  const editorRef = useRef<AgentsMentionsEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const questionRef = useRef<AgentUserQuestionHandle>(null)
  const prevChatKeyRef = useRef<string | null>(null)
  const prevSubChatIdRef = useRef<string | null>(null)

  // Consume pending mentions from external components (e.g. MCP widget in sidebar)
  const [pendingMention, setPendingMention] = useAtom(pendingMentionAtom)
  useEffect(() => {
    // Only active pane should consume a global pending mention.
    // This prevents duplicate insertion across keep-alive/split panes.
    if (!isActive || !pendingMention) return
    editorRef.current?.insertMention(pendingMention)
    editorRef.current?.focus()
    setPendingMention(null)
  }, [isActive, pendingMention, setPendingMention])

  const pendingLocalBrowserReportAtom = useMemo(
    () => pendingLocalBrowserReportAtomFamily(subChatId),
    [subChatId],
  )
  const [pendingLocalBrowserReport, setPendingLocalBrowserReport] = useAtom(
    pendingLocalBrowserReportAtom,
  )
  useEffect(() => {
    if (!isActive || !pendingLocalBrowserReport) return
    const current = editorRef.current?.getValue() ?? ""
    const separator = current.trim().length > 0 ? "\n\n" : ""
    editorRef.current?.setValue(`${current}${separator}${pendingLocalBrowserReport}`)
    editorRef.current?.focus()
    setPendingLocalBrowserReport(null)
  }, [
    isActive,
    pendingLocalBrowserReport,
    setPendingLocalBrowserReport,
  ])

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
    if (!isVisiblePaneRef.current) return

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
        toast.error(t("agent.chat.toast.sendMessageBeforeRenaming"))
      } else {
        toast.error(t("agent.chat.toast.failedRenameChat"))
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
          .updateSubChatName(
            subChatId,
            getDisplayChatName(subChatNameRef.current, t("chat.defaultTitle")),
          )
      }
    },
    [subChatId, t],
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
  const updateSubChatModeMutationRef = useRef(updateSubChatModeMutation)
  updateSubChatModeMutationRef.current = updateSubChatModeMutation

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
  // Caches are only cleared when no ChatViewInner instance is mounted for this sub-chat.
  useEffect(() => {
    const prevCount = mountedChatViewInnerCounts.get(subChatId) ?? 0
    const nextCount = prevCount + 1
    mountedChatViewInnerCounts.set(subChatId, nextCount)

    const pendingCleanup = pendingSubChatCleanupTimers.get(subChatId)
    if (pendingCleanup) {
      clearTimeout(pendingCleanup)
      pendingSubChatCleanupTimers.delete(subChatId)
    }

    return () => {
      const currentCount = mountedChatViewInnerCounts.get(subChatId) ?? 0
      const remainingCount = Math.max(0, currentCount - 1)
      if (remainingCount === 0) {
        mountedChatViewInnerCounts.delete(subChatId)
      } else {
        mountedChatViewInnerCounts.set(subChatId, remainingCount)
      }

      if (remainingCount > 0) {
        return
      }

      const existingTimeoutId = pendingSubChatCleanupTimers.get(subChatId)
      if (existingTimeoutId) {
        clearTimeout(existingTimeoutId)
      }

      const timeoutId = setTimeout(() => {
        pendingSubChatCleanupTimers.delete(subChatId)
        const mountedCountNow = mountedChatViewInnerCounts.get(subChatId) ?? 0

        if (mountedCountNow > 0) {
          return
        }

        const currentSubChatState = useAgentSubChatStore.getState()
        if (currentSubChatState.activeSubChatId === subChatId) return
        if (useStreamingStatusStore.getState().isStreaming(subChatId)) return
        if ((useMessageQueueStore.getState().queues[subChatId]?.length ?? 0) > 0) return

        clearRuntimeCachesForSubChat(subChatId)
      }, 100)

      pendingSubChatCleanupTimers.set(subChatId, timeoutId)
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
      updateSubChatModeMutationRef.current.mutate({ subChatId, mode: newMode })
    }
  }, [subChatId, setSubChatMode])

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
  } = useAgentsFileUpload({ chatId: parentChatId, subChatId })

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
    addChatHistoryFile,
    removePastedText,
    clearPastedTexts,
    pastedTextsRef,
    setPastedTextsFromDraft,
  } = usePastedTextFiles(subChatId)

  // Consume pending chat history file when this sub-chat is the target
  useEffect(() => {
    const pending = appStore.get(pendingChatHistoryAtom)
    if (pending && pending.subChatId === subChatId) {
      addChatHistoryFile(pending.file)
      appStore.set(pendingChatHistoryAtom, null)
    }
  }, [subChatId, addChatHistoryFile])

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
      if (savedDraft.pastedTexts.length > 0) {
        setPastedTextsFromDraft(savedDraft.pastedTexts)
      } else {
        clearPastedTexts()
      }
    } else if (
      prevSubChatIdForDraftRef.current &&
      prevSubChatIdForDraftRef.current !== subChatId
    ) {
      // Clear everything when switching to a sub-chat with no draft
      editorRef.current?.clear()
      clearAll()
      clearTextContexts()
      clearPastedTexts()
    }

    prevSubChatIdForDraftRef.current = subChatId
  }, [
    subChatId,
    parentChatId,
    setImagesFromDraft,
    setFilesFromDraft,
    setTextContextsFromDraft,
    setPastedTextsFromDraft,
    clearAll,
    clearTextContexts,
    clearPastedTexts,
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
    } else if (source.type === "file-viewer") {
      // File viewer selections are treated as code selections
      addDiffTextContext(text, source.filePath)
    }
  }, [addTextContextOriginal, addDiffTextContext])

  // Focus handler for text selection popover - focus chat input after adding to context
  const handleFocusInput = useCallback(() => {
    editorRef.current?.focus()
  }, [])

  // Listen for file-viewer "Add to Context" from the custom context menu
  useEffect(() => {
    if (!isActive) return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string
        source: TextSelectionSource
      }
      if (detail.text && detail.source) {
        addTextContext(detail.text, detail.source)
        editorRef.current?.focus()
      }
    }
    window.addEventListener("file-viewer-add-to-context", handler)
    return () => window.removeEventListener("file-viewer-add-to-context", handler)
  }, [addTextContext, isActive])

  // Listen for file-tree "Add to Chat Context" — inserts file mention chip
  useEffect(() => {
    if (!isActive) return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        id: string
        label: string
        path: string
        repository: string
        type: string
      }
      if (detail.id && detail.label) {
        editorRef.current?.insertMention({
          id: detail.id,
          label: detail.label,
          path: detail.path,
          repository: detail.repository,
          type: detail.type as "file" | "folder",
        })
        editorRef.current?.focus()
      }
    }
    window.addEventListener("file-tree-mention", handler)
    return () => window.removeEventListener("file-tree-mention", handler)
  }, [isActive])

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
      toast.success(t("agent.chat.toast.replyQueued"), {
        description: t("agent.chat.toast.replyQueuedDescription"),
      })
    } else {
      // Send directly
      sendMessageRef.current({
        role: "user",
        parts: [{ type: "text", text: message }],
      })
      toast.success(t("agent.chat.toast.replySent"))
    }

    // Clear state and selection
    setQuickCommentState(null)
    window.getSelection()?.removeAllRanges()
  }, [addToQueue, subChatId, t])

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

  usePendingAgentMessages({
    subChatId,
    isStreaming,
    sendMessage,
    setIsCreatingPr,
  })

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

  // Expired user questions (timed out but still answerable as normal messages)
  const [expiredQuestionsMap, setExpiredQuestionsMap] = useAtom(
    expiredUserQuestionsAtom,
  )
  const expiredQuestions = expiredQuestionsMap.get(subChatId) ?? null

  // Unified display questions: prefer pending (live), fall back to expired
  const displayQuestions = pendingQuestions ?? expiredQuestions
  const isQuestionExpired = !pendingQuestions && !!expiredQuestions

  // Track whether chat input has content (for custom text with questions)
  const [inputHasContent, setInputHasContent] = useState(false)

  // Memoize the last assistant message to avoid unnecessary recalculations
  const lastAssistantMessage = useMemo(
    () => messages.findLast((m) => m.role === "assistant"),
    [messages],
  )

  // Pre-compute token data for ChatInputArea to avoid passing unstable messages array.
  // Prefer the latest assistant metadata that actually includes token/context fields.
  // This keeps the indicator stable while a new assistant message is streaming.
  const messageTokenData = useMemo(() => {
    const lastAssistantWithTokenData = [...messages].reverse().find((msg) => {
      if (msg.role !== "assistant" || !msg.metadata) return false
      const metadata = msg.metadata as {
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
        cacheReadInputTokens?: number
        cacheCreationInputTokens?: number
        modelContextWindow?: number
      }

      return (
        metadata.inputTokens !== undefined ||
        metadata.outputTokens !== undefined ||
        metadata.totalTokens !== undefined ||
        metadata.cacheReadInputTokens !== undefined ||
        metadata.cacheCreationInputTokens !== undefined ||
        metadata.modelContextWindow !== undefined
      )
    })

    const metadata = lastAssistantWithTokenData?.metadata as
      | {
          inputTokens?: number
          outputTokens?: number
          totalTokens?: number
          totalCostUsd?: number
          cacheReadInputTokens?: number
          cacheCreationInputTokens?: number
          modelContextWindow?: number
        }
      | undefined

    const cacheReadInputTokens = metadata?.cacheReadInputTokens || 0
    const cacheCreationInputTokens = metadata?.cacheCreationInputTokens || 0
    const codexInputTokensFromTotal =
      metadata?.totalTokens !== undefined
        ? Math.max(0, metadata.totalTokens - (metadata?.outputTokens ?? 0))
        : undefined

    const totalInputTokens =
      provider === "codex"
        ? (codexInputTokensFromTotal ?? metadata?.inputTokens ?? 0)
        : (metadata?.inputTokens || 0) +
          cacheReadInputTokens +
          cacheCreationInputTokens
    const totalOutputTokens = metadata?.outputTokens || 0
    const totalCostUsd = metadata?.totalCostUsd || 0
    const contextWindow = metadata?.modelContextWindow

    // Keep this tied to rendered messages for memo comparator stability.
    const messageCount = messages.length

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      messageCount,
      contextWindow,
    }
  }, [messages, provider])

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

  // Helper to clear pending and expired questions for this subChat (used in callbacks)
  const clearPendingQuestionCallback = useCallback(() => {
    setPendingQuestionsMap((current) => {
      if (current.has(subChatId)) {
        const newMap = new Map(current)
        newMap.delete(subChatId)
        return newMap
      }
      return current
    })
    setExpiredQuestionsMap((current) => {
      if (current.has(subChatId)) {
        const newMap = new Map(current)
        newMap.delete(subChatId)
        return newMap
      }
      return current
    })
  }, [subChatId, setPendingQuestionsMap, setExpiredQuestionsMap])

  // Shared helpers for question answer handlers
  const formatAnswersAsText = useCallback(
    (answers: Record<string, string>): string =>
      Object.entries(answers)
        .map(([question, answer]) => `${question}: ${answer}`)
        .join("\n"),
    [t],
  )

  const clearInputAndDraft = useCallback(() => {
    editorRef.current?.clear()
    if (parentChatId) {
      clearSubChatDraft(parentChatId, subChatId)
    }
  }, [parentChatId, subChatId])

  const sendUserMessage = useCallback(async (text: string) => {
    shouldAutoScrollRef.current = true
    await sendMessageRef.current({
      role: "user",
      parts: [{ type: "text", text }],
    })
  }, [])

  const respondUserQuestionApproval = useCallback(
    async (input: {
      toolUseId: string
      approved: boolean
      message?: string
      updatedInput?: unknown
    }) => {
      if (provider === "codex") {
        await trpcClient.codex.respondToolApproval.mutate(input)
        return
      }
      await trpcClient.claude.respondToolApproval.mutate(input)
    },
    [provider],
  )

  // Handle answering questions
  const handleQuestionsAnswer = useCallback(
    async (answers: Record<string, string>) => {
      if (!displayQuestions) return

      if (isQuestionExpired) {
        // Question timed out - send answers as a normal user message
        clearPendingQuestionCallback()
        await sendUserMessage(formatAnswersAsText(answers))
      } else {
        // Question is still live - use tool approval path
        await respondUserQuestionApproval({
          toolUseId: displayQuestions.toolUseId,
          approved: true,
          updatedInput: { questions: displayQuestions.questions, answers },
        })
        clearPendingQuestionCallback()
      }
    },
    [displayQuestions, isQuestionExpired, clearPendingQuestionCallback, sendUserMessage, formatAnswersAsText, respondUserQuestionApproval],
  )

  // Handle skipping questions
  const handleQuestionsSkip = useCallback(async () => {
    if (!displayQuestions) return

    if (isQuestionExpired) {
      // Expired question - just clear the UI, no backend call needed
      clearPendingQuestionCallback()
      return
    }

    const toolUseId = displayQuestions.toolUseId

    // Clear UI immediately - don't wait for backend
    // This ensures dialog closes even if stream was already aborted
    clearPendingQuestionCallback()

    // Try to notify backend (may fail if already aborted - that's ok)
    try {
      await respondUserQuestionApproval({
        toolUseId,
        approved: false,
        message: QUESTIONS_SKIPPED_MESSAGE,
      })
    } catch {
      // Stream likely already aborted - ignore
    }
  }, [displayQuestions, isQuestionExpired, clearPendingQuestionCallback, respondUserQuestionApproval])

  // Ref to prevent double submit of question answer
  const isSubmittingQuestionAnswerRef = useRef(false)

  // Handle answering questions with custom text from input (called on Enter in input)
  const handleSubmitWithQuestionAnswer = useCallback(
    async () => {
      if (!displayQuestions) return
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
          displayQuestions.questions[displayQuestions.questions.length - 1]
        if (lastQuestion) {
          const existingAnswer = formattedAnswers[lastQuestion.question]
          if (existingAnswer) {
            // Append to existing answer
            formattedAnswers[lastQuestion.question] = `${existingAnswer}, Other: ${customText}`
          } else {
            formattedAnswers[lastQuestion.question] = `Other: ${customText}`
          }
        }

        if (isQuestionExpired) {
          // Expired: send user's custom text as-is (don't format)
          clearPendingQuestionCallback()
          clearInputAndDraft()
          // await sendUserMessage(formatAnswersAsText(formattedAnswers))
          await sendUserMessage(customText)
        } else {
          // Live: use existing tool approval flow
          await respondUserQuestionApproval({
            toolUseId: displayQuestions.toolUseId,
            approved: true,
            updatedInput: {
              questions: displayQuestions.questions,
              answers: formattedAnswers,
            },
          })
          clearPendingQuestionCallback()

          // Stop stream if currently streaming
          if (isStreamingRef.current) {
            agentChatStore.setManuallyAborted(subChatId, true)
            await stopRef.current()
            await new Promise((resolve) => setTimeout(resolve, 100))
          }

          clearInputAndDraft()
          await sendUserMessage(customText)
        }
      } finally {
        isSubmittingQuestionAnswerRef.current = false
      }
    },
    [displayQuestions, isQuestionExpired, clearPendingQuestionCallback, clearInputAndDraft, sendUserMessage, formatAnswersAsText, subChatId, respondUserQuestionApproval],
  )

  // Memoize the callback to prevent ChatInputArea re-renders
  // Only provide callback when there's a pending or expired question for this subChat
  const submitWithQuestionAnswerCallback = useMemo(
    () =>
      displayQuestions
        ? handleSubmitWithQuestionAnswer
        : undefined,
    [displayQuestions, handleSubmitWithQuestionAnswer],
  )

  useAuthRetry({
    subChatId,
    provider,
    isStreaming,
    sendMessage,
  })

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
        toast.error(t("agent.chat.toast.failedPlanApproval"))
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
      parts: [{ type: "text", text: "Implement plan" }],
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

    // Don't run until agentChat has loaded so we know the real existingPrUrl
    if (existingPrUrl === undefined) return

    // Sync ref when existingPrUrl loads (prevents re-detection on remount)
    if (existingPrUrl && !detectedPrUrlRef.current) {
      detectedPrUrlRef.current = existingPrUrl
    }

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
  }, [messages, isStreaming, parentChatId, existingPrUrl])

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
    projectPath,
  )

  // Rollback handler - triggered from user message bubble
  // Finds the last assistant message BEFORE this user message, rolls back to it,
  // and inserts the user message text into the input for easy re-sending
  const handleRollback = useCallback(
    async (userMsg: (typeof messages)[0]) => {
      if (isRollingBack) {
        toast.error(t("agent.chat.toast.rollbackInProgress"))
        return
      }
      if (isStreaming) {
        toast.error(t("agent.chat.toast.cannotRollbackStreaming"))
        return
      }

      // Find the index of this user message
      const userMsgIndex = messages.findIndex((m) => m.id === userMsg.id)
      if (userMsgIndex === -1) {
        toast.error(t("agent.chat.toast.rollbackMessageNotFound"))
        return
      }

      const sdkUuid = findRollbackTargetSdkUuidForUserIndex(
        userMsgIndex,
        messages.length,
        (index) => messages[index] as any,
      )

      if (!sdkUuid) {
        toast.error(t("agent.chat.toast.turnNotRollbackable"))
        return
      }

      // Extract raw text from user message (includes mention tokens)
      const rawText = userMsg.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") || ""

      // Parse mention tokens from text to restore text contexts, diff contexts, and pasted texts
      const restoredTextContexts: SelectedTextContext[] = []
      const restoredDiffTextContexts: DiffTextContext[] = []
      const restoredPastedTexts: PastedTextFile[] = []
      let cleanedText = rawText

      const mentionRegex = /@\[([^\]]+)\]/g
      let match: RegExpExecArray | null
      const mentionsToRemove: string[] = []

      while ((match = mentionRegex.exec(rawText)) !== null) {
        const id = match[1]

        if (id.startsWith("quote:")) {
          const content = id.slice("quote:".length)
          const sepIdx = content.indexOf(":")
          if (sepIdx !== -1) {
            const preview = content.slice(0, sepIdx)
            const encoded = content.slice(sepIdx + 1)
            let fullText = preview
            try { fullText = base64ToUtf8(encoded) } catch { /* use preview */ }
            restoredTextContexts.push({
              id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              text: fullText,
              sourceMessageId: "",
              preview: createTextPreview(fullText),
              createdAt: new Date(),
            })
          }
          mentionsToRemove.push(match[0])
        } else if (id.startsWith("diff:")) {
          const content = id.slice("diff:".length)
          const parts = content.split(":")
          if (parts.length >= 3) {
            const filePath = parts[0] || ""
            const lineNumber = parseInt(parts[1] || "0", 10) || undefined
            const preview = parts[2] || ""
            const encoded = parts.slice(3).join(":")
            let fullText = preview
            try { if (encoded) fullText = base64ToUtf8(encoded) } catch { /* use preview */ }
            restoredDiffTextContexts.push({
              id: `dtc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              text: fullText,
              filePath,
              lineNumber,
              preview: createTextPreview(fullText),
              createdAt: new Date(),
            })
          }
          mentionsToRemove.push(match[0])
        } else if (id.startsWith("pasted:")) {
          const content = id.slice("pasted:".length)
          const pipeIdx = content.lastIndexOf("|")
          if (pipeIdx !== -1) {
            const beforePipe = content.slice(0, pipeIdx)
            const filePath = content.slice(pipeIdx + 1)
            const colonIdx = beforePipe.indexOf(":")
            if (colonIdx !== -1) {
              const size = parseInt(beforePipe.slice(0, colonIdx) || "0", 10)
              const preview = beforePipe.slice(colonIdx + 1)
              restoredPastedTexts.push({
                id: `pasted_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                localRef: filePath,
                filePath,
                filename: filePath.split("/").pop() || "pasted.txt",
                byteLength: size,
                size,
                preview,
                createdAt: new Date(),
                kind: "pasted",
              })
            }
          }
          mentionsToRemove.push(match[0])
        }
      }

      for (const part of userMsg.parts || []) {
        const longTextPart = part as any
        if (longTextPart?.type !== "long-text-attachment") continue
        if (typeof longTextPart.localRef !== "string" || !longTextPart.localRef) {
          continue
        }

        const byteLength =
          typeof longTextPart.byteLength === "number" ? longTextPart.byteLength : 0
        restoredPastedTexts.push({
          id:
            longTextPart.attachmentId ||
            `pasted_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          localRef: longTextPart.localRef,
          filePath: longTextPart.localRef,
          filename: longTextPart.filename || "pasted.txt",
          byteLength,
          size: byteLength,
          preview: longTextPart.preview || longTextPart.filename || "Pasted text",
          createdAt: new Date(),
          kind: longTextPart.kind === "chatHistory" ? "chatHistory" : "pasted",
        })
      }

      // Remove mention tokens from text to get clean user text
      for (const mentionStr of mentionsToRemove) {
        cleanedText = cleanedText.replace(mentionStr, "")
      }
      cleanedText = cleanedText
        .split("\n")
        .map((line: string) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()

      // Extract images from user message for restoring into input
      const userMsgImages: UploadedImage[] = (userMsg.parts || [])
        .filter(
          (p: any) =>
            (p.type === "data-image" && p.data) ||
            (p.type === "attachment-image" && p.localRef),
        )
        .map((p: any) => ({
          id: crypto.randomUUID(),
          kind: "image" as const,
          filename: p.type === "attachment-image" ? p.filename || "image" : p.data.filename || "image",
          url:
            p.type === "attachment-image"
              ? ""
              : p.data.url || (p.data.base64Data && p.data.mediaType
                ? `data:${p.data.mediaType};base64,${p.data.base64Data}`
                : ""),
          base64Data: p.type === "data-image" ? p.data.base64Data : undefined,
          localRef: p.type === "attachment-image" ? p.localRef : undefined,
          attachmentId:
            p.type === "attachment-image" ? p.attachmentId : undefined,
          sizeBytes: p.type === "attachment-image" ? p.sizeBytes : undefined,
          width: p.type === "attachment-image" ? p.width : undefined,
          height: p.type === "attachment-image" ? p.height : undefined,
          sha256: p.type === "attachment-image" ? p.sha256 : undefined,
          mediaType: p.type === "attachment-image" ? p.mediaType : p.data.mediaType,
          isLoading: p.type === "attachment-image",
          status: p.type === "attachment-image" ? "ready" as const : undefined,
        }))

      setIsRollingBack(true)

      try {
        // Single call handles both message truncation and git rollback
        const result = await trpcClient.chats.rollbackToMessage.mutate({
          subChatId,
          sdkMessageUuid: sdkUuid,
        })

        if (!result.success) {
          toast.error(t("agent.chat.toast.failedRollbackWithMessage", {
            message: result.error,
          }))
          setIsRollingBack(false)
          return
        }

        // Update local state with truncated messages from server
        setMessages(result.messages)
        recomputeChangedFiles(result.messages)
        refreshDiff?.()

        // Restore all user message content into input
        if (cleanedText) {
          editorRef.current?.setValue(cleanedText)
        }
        if (userMsgImages.length > 0) {
          setImagesFromDraft(userMsgImages)
        }
        if (restoredTextContexts.length > 0) {
          setTextContextsFromDraft(restoredTextContexts)
        }
        if (restoredDiffTextContexts.length > 0) {
          setDiffTextContextsFromDraft(restoredDiffTextContexts)
        }
        if (restoredPastedTexts.length > 0) {
          setPastedTextsFromDraft(restoredPastedTexts)
        }
        editorRef.current?.focus()
      } catch (error) {
        console.error("[handleRollback] Error:", error)
        toast.error(t("agent.chat.toast.failedRollback"))
      } finally {
        setIsRollingBack(false)
      }
    },
    [
      isRollingBack,
      isStreaming,
      messages,
      setMessages,
      subChatId,
      recomputeChangedFiles,
      refreshDiff,
      setImagesFromDraft,
      setTextContextsFromDraft,
      setDiffTextContextsFromDraft,
      setPastedTextsFromDraft,
      t,
    ],
  )

  // Fork handler - creates a new sub-chat with messages up to this point
  // Preserves SDK session context by copying .jsonl session files
  const isForkingRef = useRef(false)
  // Keep a ref to messages so the fork callback always has the latest
  // without adding `messages` to the dependency array (which would cause
  // frequent re-creations during streaming)
  const messagesForForkRef = useRef(messages)
  messagesForForkRef.current = messages
  const handleForkFromMessage = useCallback(
    async (messageId: string) => {
      if (isStreaming || isForkingRef.current) return
      isForkingRef.current = true

      try {
        // Pass messageIndex as fallback: AI SDK generates its own message IDs
        // which differ from the server-generated IDs stored in the DB.
        // The index lets the server find the correct cutoff even when IDs don't match.
        const messageIndex = messagesForForkRef.current.findIndex(m => m.id === messageId)
        const result = await trpcClient.chats.forkSubChat.mutate({
          subChatId,
          messageId,
          ...(messageIndex !== -1 && { messageIndex }),
        })

        const newSubChat = result.subChat
        const newMode = (newSubChat.mode as "plan" | "agent") || "agent"

        // Invalidate + await ensures agentSubChats has the fork before we switch tabs
        await utils.agents.getAgentChat.invalidate({ chatId: parentChatId })

        // Update Zustand sub-chat store
        const store = useAgentSubChatStore.getState()
        store.addToAllSubChats({
          id: newSubChat.id,
          name: newSubChat.name || "Fork",
          created_at:
            newSubChat.createdAt instanceof Date
              ? newSubChat.createdAt.toISOString()
              : (newSubChat.createdAt ?? new Date().toISOString()),
          mode: newMode,
        })

        // Set mode atom for the new sub-chat
        appStore.set(subChatModeAtomFamily(newSubChat.id), newMode)
        // Inherit model preferences from source sub-chat for deterministic behavior.
        appStore.set(
          subChatModelIdAtomFamily(newSubChat.id),
          appStore.get(subChatModelIdAtomFamily(subChatId)),
        )
        appStore.set(
          subChatClaudeModelSourceAtomFamily(newSubChat.id),
          appStore.get(subChatClaudeModelSourceAtomFamily(subChatId)),
        )
        appStore.set(
          subChatCodexModelIdAtomFamily(newSubChat.id),
          appStore.get(subChatCodexModelIdAtomFamily(subChatId)),
        )
        appStore.set(
          subChatCodexModelSourceAtomFamily(newSubChat.id),
          appStore.get(subChatCodexModelSourceAtomFamily(subChatId)),
        )
        appStore.set(
          subChatCodexThinkingAtomFamily(newSubChat.id),
          appStore.get(subChatCodexThinkingAtomFamily(subChatId)),
        )

        // Open the forked sub-chat tab and switch to it
        store.addToOpenSubChats(newSubChat.id)
        store.setActiveSubChat(newSubChat.id)
      } catch (error) {
        console.error("[handleForkFromMessage] Error:", error)
        toast.error(t("agent.chat.toast.failedForkConversation"))
      } finally {
        isForkingRef.current = false
      }
    },
    [isStreaming, subChatId, parentChatId, utils, t],
  )

  // Sync local isRollingBack state to global atom (prevents multiple rollbacks across chats)
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
          // If there are pending/expired questions for this chat, skip/dismiss them instead of stopping stream
          if (displayQuestions) {
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
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, isStreaming, stop, subChatId, displayQuestions, handleQuestionsSkip])

  // Keyboard shortcut: Enter to focus input when not already focused
  useFocusInputOnEnter(editorRef, isActive)

  // Keyboard shortcut: Cmd+Esc to toggle focus/blur (without stopping generation)
  useToggleFocusOnCmdEsc(editorRef, isActive)

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

  // Initialize scroll position on mount or tab re-activation.
  // Strategy: restore saved position if user was scrolled up, otherwise scroll to bottom.
  // Uses ResizeObserver on content wrapper to catch ALL height changes (markdown rendering,
  // syntax highlighting, image loading, content-visibility reflows) — not just childList mutations.
  useLayoutEffect(() => {
    // Skip if not active (keep-alive: hidden tabs don't need scroll init)
    if (!isVisiblePane) return

    const container = chatContainerRef.current
    if (!container) return

    scrollInitializedRef.current = false
    isInitializingScrollRef.current = true

    // Check for saved scroll position from tab switch
    const savedPosition = scrollPositionCache.get(subChatId)

    if (savedPosition && !savedPosition.wasAtBottom) {
      // User was scrolled up — restore their position relative to content bottom.
      // Content may have changed height since we saved, so we offset from the bottom:
      const savedOffset = savedPosition.scrollHeight - savedPosition.scrollTop
      container.scrollTop = Math.max(0, container.scrollHeight - savedOffset)
      shouldAutoScrollRef.current = false
    } else {
      // No saved position or user was at bottom — scroll to bottom
      container.scrollTop = container.scrollHeight
      shouldAutoScrollRef.current = true
    }

    // Mark as initialized IMMEDIATELY
    scrollInitializedRef.current = true
    isInitializingScrollRef.current = false

    // ResizeObserver on content wrapper to detect any height change
    // (markdown rendering, syntax highlighting, image loads, content-visibility reflows, etc.)
    // This is more reliable than MutationObserver which only catches childList changes.
    const contentWrapper = contentWrapperRef.current
    let lastContentHeight = contentWrapper?.getBoundingClientRect().height ?? 0
    // Track the previous scrollHeight so we can adjust restored positions proportionally
    let prevScrollHeight = container.scrollHeight

    const resizeObserver = new ResizeObserver(() => {
      // Skip if not active (keep-alive: don't scroll hidden tabs)
      if (!isVisiblePaneRef.current) return

      const newContentHeight = contentWrapper?.getBoundingClientRect().height ?? 0
      if (newContentHeight === lastContentHeight) return
      lastContentHeight = newContentHeight

      if (shouldAutoScrollRef.current) {
        // Auto-scroll to bottom as content grows
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = true
          container.scrollTop = container.scrollHeight
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })
      } else {
        // User is scrolled up — maintain their relative position as content height changes
        // (e.g., syntax highlighting expanding code blocks above the viewport)
        const newScrollHeight = container.scrollHeight
        if (newScrollHeight !== prevScrollHeight && prevScrollHeight > 0) {
          const delta = newScrollHeight - prevScrollHeight
          container.scrollTop = container.scrollTop + delta
        }
      }
      prevScrollHeight = container.scrollHeight
    })

    if (contentWrapper) {
      resizeObserver.observe(contentWrapper)
    }

    return () => {
      resizeObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subChatId, isVisiblePane])

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
    if (!isVisiblePane) return
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
  }, [isVisiblePane, messages, status, subChatId])

  // Scroll to bottom when QueueProcessor auto-sends a queued message.
  // QueueProcessor runs globally and can't access scroll refs, so it
  // signals via a store trigger that we subscribe to here.
  useEffect(() => {
    const unsub = useMessageQueueStore.subscribe(
      (state) => state.queueSentTriggers[subChatId] || 0,
      (trigger) => {
        if (trigger === 0) return
        if (!isVisiblePaneRef.current) return
        shouldAutoScrollRef.current = true
        scrollToBottom()
      },
    )
    return unsub
  }, [subChatId, scrollToBottom])

  // Auto-focus input when switching to this chat (any sub-chat change)
  // Skip on mobile to prevent keyboard from opening automatically
  useEffect(() => {
    // Skip if not active (keep-alive: don't focus hidden tabs)
    if (!isActive) return
    if (isMobile) return // Don't autofocus on mobile

    // Use requestAnimationFrame to ensure DOM is ready after render
    requestAnimationFrame(() => {
      // Skip if sidebar keyboard navigation is active (user is arrowing through sidebar items)
      if (appStore.get(suppressInputFocusAtom)) {
        appStore.set(suppressInputFocusAtom, false)
        return
      }
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

    // Clear any expired questions when user sends a new message
    setExpiredQuestionsMap((current) => {
      if (current.has(subChatId)) {
        const newMap = new Map(current)
        newMap.delete(subChatId)
        return newMap
      }
      return current
    })

    // Get value from uncontrolled editor
    const inputValue = editorRef.current?.getValue() || ""
    const hasText = inputValue.trim().length > 0
    const currentImages = imagesRef.current
    const currentFiles = filesRef.current
    const currentTextContexts = textContextsRef.current
    const currentDiffTextContexts = diffTextContextsRef.current
    const currentPastedTexts = pastedTextsRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && (img.localRef || img.url))
        .length > 0
    const hasTextContexts = currentTextContexts.length > 0
    const hasDiffTextContexts = currentDiffTextContexts.length > 0
    const hasPastedTexts = currentPastedTexts.length > 0

    if (!hasText && !hasImages && !hasTextContexts && !hasDiffTextContexts && !hasPastedTexts) return

    // If streaming, add to queue instead of sending directly
    if (isStreamingRef.current) {
      const queuedImages = currentImages
        .filter((img) => !img.isLoading && (img.localRef || img.url))
        .map(toQueuedImage)
      const queuedFiles = currentFiles
        .filter((f) => !f.isLoading && f.url)
        .map(toQueuedFile)
      const queuedTextContexts = currentTextContexts.map(toQueuedTextContext)
      const queuedDiffTextContexts = currentDiffTextContexts.map(toQueuedDiffTextContext)
      const queuedPastedTexts = currentPastedTexts.map(toQueuedPastedText)

      const queuedText = await expandCustomSlashCommand(
        inputValue.trim(),
        projectPath,
      )
      const item = createQueueItem(
        generateQueueId(),
        queuedText,
        queuedImages.length > 0 ? queuedImages : undefined,
        queuedFiles.length > 0 ? queuedFiles : undefined,
        queuedTextContexts.length > 0 ? queuedTextContexts : undefined,
        queuedDiffTextContexts.length > 0 ? queuedDiffTextContexts : undefined,
        queuedPastedTexts.length > 0 ? queuedPastedTexts : undefined,
      )
      addToQueue(subChatId, item)

      // Clear input and attachments
      editorRef.current?.clear()
      if (parentChatId) {
        clearSubChatDraft(parentChatId, subChatId)
      }
      clearAll()
      clearTextContexts()
      clearDiffTextContexts()
      clearPastedTexts()
      return
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    const text = inputValue.trim()

    const finalText = await expandCustomSlashCommand(text, projectPath)

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

    const parts = buildAgentMessageParts({
      text: finalText,
      images: currentImages,
      files: currentFiles,
      textContexts: currentTextContexts,
      diffTextContexts: currentDiffTextContexts,
      pastedTexts: currentPastedTexts,
      fileContents: fileContentsRef.current.entries(),
    })

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
    projectPath,
    subChatId,
    onAutoRename,
    clearAll,
    clearTextContexts,
    clearPastedTexts,
    teamId,
    addToQueue,
    setExpiredQuestionsMap,
  ])

  // Queue handlers for sending queued messages
  const handleSendFromQueue = useCallback(async (itemId: string) => {
    const item = popItemFromQueue(subChatId, itemId)
    if (!item) return

    try {
      // Stop current stream if streaming and wait for status to become ready.
      // The server-side save block preserves sessionId on abort, so the next
      // message can resume the session with full conversation context.
      if (isStreamingRef.current) {
        await handleStop()
        await waitForStreamingReady(subChatId)
      }

      const parts = buildAgentMessageParts({
        text: item.message,
        images: item.images,
        files: item.files,
        textContexts: item.textContexts,
        diffTextContexts: item.diffTextContexts,
        pastedTexts: item.pastedTexts,
      })

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
    } catch (error) {
      console.error("[handleSendFromQueue] Error sending queued message:", error)
      // Requeue the item at the front so it isn't lost
      useMessageQueueStore.getState().prependItem(subChatId, item)
    }
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
    const currentPastedTexts = pastedTextsRef.current
    const hasImages =
      currentImages.filter((img) => !img.isLoading && (img.localRef || img.url))
        .length > 0
    const hasPastedTexts = currentPastedTexts.length > 0

    if (!hasText && !hasImages && !hasPastedTexts) return

    // Stop current stream if streaming and wait for status to become ready.
    // The server-side save block sets sessionId=null on abort, so the next
    // message starts fresh without needing an explicit cancel mutation.
    if (isStreamingRef.current) {
      await handleStop()
      await waitForStreamingReady(subChatId)
    }

    // Auto-restore archived workspace when sending a message
    if (isArchived && onRestoreWorkspace) {
      onRestoreWorkspace()
    }

    const text = inputValue.trim()

    const finalText = await expandCustomSlashCommand(text, projectPath)

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

    const parts = buildAgentMessageParts({
      text: finalText,
      images: currentImages,
      files: currentFiles,
      pastedTexts: currentPastedTexts,
    })

    // Clear attachments
    clearAll()
    clearPastedTexts()

    // Update timestamps
    useAgentSubChatStore.getState().updateSubChatTimestamp(subChatId)

    // Force scroll to bottom
    shouldAutoScrollRef.current = true
    scrollToBottom()

    try {
      await sendMessageRef.current({ role: "user", parts })
    } catch (error) {
      console.error("[handleForceSend] Error sending message:", error)
      // Restore editor content so the user can retry
      editorRef.current?.setValue(finalText)
    }
  }, [
    sandboxSetupStatus,
    isArchived,
    onRestoreWorkspace,
    parentChatId,
    projectPath,
    subChatId,
    handleStop,
    clearAll,
    clearPastedTexts,
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
    if (!isActive) return

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
  }, [isActive, scrollToBottom])

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

  // Sync messages to Jotai store for isolated rendering.
  // Each ChatViewInner writes to its own per-chat bucket.
  // Only active pane updates legacy global atoms to avoid cross-pane races/churn.
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)

  useLayoutEffect(() => {
    syncMessages({ messages, status, subChatId, updateGlobal: isActive })
  }, [messages, status, subChatId, isActive, isSplitPane, syncMessages])

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
  const shouldShowStatusCard =
    isStreaming || isCompacting || changedFilesForSubChat.length > 0
  const shouldShowStackedCards =
    !displayQuestions && (queue.length > 0 || shouldShowStatusCard)
  const handleInputProviderChange = useCallback(
    (nextProvider: "claude-code" | "codex") => {
      onProviderChange?.(subChatId, nextProvider)
    },
    [onProviderChange, subChatId],
  )

  // Continue conversation with a different provider - creates new sub-chat with history attachment
  const isContinuingRef = useRef(false)
  const handleContinueWithProvider = useCallback(
    async (
      targetProvider: "claude-code" | "codex",
      selection?: ContinueWithProviderSelection,
    ) => {
      if (isStreaming || isContinuingRef.current) return
      if (!messages || messages.length === 0) return
      isContinuingRef.current = true

      try {
        // 1. Format current messages as markdown
        const historyMarkdown = formatHistoryForContext(messages as any)

        // 2. Stage as a long text attachment in the main process
        const result = await trpcClient.files.stageLongTextAttachment.mutate({
          subChatId,
          text: historyMarkdown,
          kind: "chatHistory",
        })

        // 3. Create new sub-chat
        const newSubChat = await trpcClient.chats.createSubChat.mutate({
          chatId: parentChatId,
          name: t("chat.defaultTitle"),
          mode: subChatMode,
        })

        const newId = newSubChat.id

        // Inherit model preferences from source sub-chat for deterministic behavior.
        appStore.set(
          subChatModelIdAtomFamily(newId),
          selection?.claudeModelId ?? appStore.get(subChatModelIdAtomFamily(subChatId)),
        )
        appStore.set(
          subChatClaudeModelSourceAtomFamily(newId),
          selection?.claudeModelSource ??
            appStore.get(subChatClaudeModelSourceAtomFamily(subChatId)),
        )
        appStore.set(
          subChatCodexModelIdAtomFamily(newId),
          selection?.codexModelId ??
            appStore.get(subChatCodexModelIdAtomFamily(subChatId)),
        )
        const inheritedCodexModelSource = appStore.get(
          subChatCodexModelSourceAtomFamily(subChatId),
        )
        appStore.set(
          subChatCodexModelSourceAtomFamily(newId),
          selection?.codexModelSource ??
            (targetProvider === "codex" &&
              isProviderProfileSource(inheritedCodexModelSource)
              ? "chatgpt"
              : inheritedCodexModelSource),
        )
        appStore.set(
          subChatCodexThinkingAtomFamily(newId),
          selection?.codexThinking ??
            appStore.get(subChatCodexThinkingAtomFamily(subChatId)),
        )

        // 4. Store pending chat history for the new sub-chat to consume on mount
        const historyFile: PendingChatHistory["file"] = {
          id: result.id,
          localRef: result.localRef,
          filePath: result.filePath,
          filename: result.filename,
          byteLength: result.byteLength,
          size: result.byteLength,
          preview: subChatNameRef.current?.trim() || t("agent.pastedText.previousChat"),
          createdAt: new Date(),
          kind: "chatHistory",
        }
        appStore.set(pendingChatHistoryAtom, { subChatId: newId, file: historyFile })

        // 5. Update Zustand store and switch to new tab
        const store = useAgentSubChatStore.getState()
        store.addToAllSubChats({
          id: newId,
          name: t("chat.defaultTitle"),
          created_at: new Date().toISOString(),
          mode: subChatMode,
        })
        appStore.set(subChatModeAtomFamily(newId), subChatMode)
        store.addToOpenSubChats(newId)
        store.setActiveSubChat(newId)

        // 6. Set provider override AFTER tab switch so the outer component picks it up
        // We call onProviderChange which sets subChatProviderOverrides in the outer scope
        // The new sub-chat has 0 messages so the guard in handleProviderChange will pass
        onProviderChange?.(newId, targetProvider)
      } catch (error) {
        console.error("[handleContinueWithProvider] Error:", error)
        toast.error(t("agent.chat.toast.failedContinueProvider"))
      } finally {
        isContinuingRef.current = false
      }
    },
    [isStreaming, messages, subChatId, parentChatId, subChatMode, onProviderChange, t],
  )
  const stableHandleContinueWithProvider = useStableCallback(handleContinueWithProvider)

  return (
    <SearchHighlightProvider>
      <div className="flex flex-col flex-1 min-h-0 relative">
        {/* Text selection popover for adding text to context - only render for active tab to avoid keep-alive portal collision */}
        {isActive && (
          <TextSelectionPopover
            onAddToContext={addTextContext}
            onQuickComment={handleQuickComment}
            onFocusInput={handleFocusInput}
          />
        )}

        {/* Quick comment input */}
        {quickCommentState && (
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
            placeholder={t("chat.defaultTitle")}
            onSave={handleRenameSubChat}
            isMobile={false}
            chatId={subChatId}
            hasMessages={true} /* Always show the localized placeholder when name is empty */
          />
          {/* Workspace subtitle: repo • branch */}
          {(workspaceRepoName || workspaceBranch) && (
            <div className="max-w-2xl mx-auto px-4">
              <span className="text-xs text-muted-foreground/50 truncate block">
                {[workspaceRepoName, workspaceBranch].filter(Boolean).join(" • ")}
              </span>
            </div>
          )}
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

          // Setup ResizeObserver for --chat-container-height/width CSS variables
          // Variables are set on both the element itself and the parent (relative wrapper)
          // so siblings like ScrollToBottomButton can also access them
          if (el) {
            const parent = el.parentElement
            const observer = new ResizeObserver((entries) => {
              const { height, width } = entries[0]?.contentRect ?? {
                height: 0,
                width: 0,
              }
              el.style.setProperty("--chat-container-height", `${height}px`)
              el.style.setProperty("--chat-container-width", `${width}px`)
              parent?.style.setProperty("--chat-container-height", `${height}px`)
              parent?.style.setProperty("--chat-container-width", `${width}px`)
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
          ref={contentWrapperRef}
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
              onRollback={provider === "codex" ? undefined : handleRollback}
              onFork={provider === "codex" ? undefined : handleForkFromMessage}
            />
          </div>
        </div>
      </div>

      {/* User questions panel - shows for both live (pending) and expired (timed out) questions */}
      {displayQuestions && (
        <div className="px-4 relative z-20">
          <div className="w-full px-2 max-w-2xl mx-auto">
            <AgentUserQuestion
              ref={questionRef}
              pendingQuestions={displayQuestions}
              onAnswer={handleQuestionsAnswer}
              onSkip={handleQuestionsSkip}
              hasCustomText={inputHasContent}
            />
          </div>
        </div>
      )}

      {/* Stacked cards container - queue + status */}
      {shouldShowStackedCards && (
          <div className="px-2 -mb-6 relative z-10">
            <div className="w-full max-w-2xl mx-auto px-2">
              {/* Queue indicator card - top card */}
              {queue.length > 0 && (
                <AgentQueueIndicator
                  queue={queue}
                  onRemoveItem={handleRemoveFromQueue}
                  onSendNow={handleSendFromQueue}
                  isStreaming={isStreaming}
                  hasStatusCardBelow={shouldShowStatusCard}
                />
              )}
              {/* Status card - bottom card */}
              {shouldShowStatusCard && (
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
        onModeChange={handleModeChange}
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
        provider={provider}
        teamId={teamId}
        repository={repository}
        projectPath={projectPath}
        changedFiles={changedFilesForSubChat}
        isMobile={isMobile}
        queueLength={queue.length}
        onSendFromQueue={handleSendFromQueue}
        firstQueueItemId={queue[0]?.id}
        onInputContentChange={setInputHasContent}
        onSubmitWithQuestionAnswer={submitWithQuestionAnswerCallback}
        onProviderChange={handleInputProviderChange}
        onContinueWithProvider={stableHandleContinueWithProvider}
        isActive={isActive}
      />

        {/* Scroll to bottom button - isolated component to avoid re-renders during streaming */}
        <ScrollToBottomButton
          containerRef={chatContainerRef}
          onScrollToBottom={scrollToBottom}
          hasStackedCards={shouldShowStackedCards}
          subChatId={subChatId}
          isActive={isActive}
          isSplitPane={isSplitPane}
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
  onOpenDiff,
  onOpenTerminal,
  hideHeader = false,
}: {
  chatId: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  selectedTeamName?: string
  selectedTeamImageUrl?: string
  isMobileFullscreen?: boolean
  onBackToChats?: () => void
  onOpenDiff?: () => void
  onOpenTerminal?: () => void
  hideHeader?: boolean
}) {
  const { t } = useI18n()
  const [selectedTeamId] = useAtom(selectedTeamIdAtom)

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
  const sidebarOpen = useAtomValue(agentsSidebarOpenAtom)
  const selectedOllamaModel = useAtomValue(selectedOllamaModelAtom)
  const { data: providerConfigData } =
    trpc.claudeProviderConfig.get.useQuery()
  const hasCustomClaudeConfig = Boolean(providerConfigData?.config?.hasToken)
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

  // File viewer sidebar state - per-chat open file path
  const fileViewerAtom = useMemo(
    () => fileViewerOpenAtomFamily(chatId),
    [chatId],
  )
  const [fileViewerPath, setFileViewerPath] = useAtom(fileViewerAtom)
  const [fileViewerDisplayMode] = useAtom(fileViewerDisplayModeAtom)

  // File search dialog (Cmd+P)
  const [fileSearchOpen, setFileSearchOpen] = useAtom(fileSearchDialogOpenAtom)

  // Details sidebar state (unified sidebar that combines all right sidebars)
  const isUnifiedSidebarEnabled = useAtomValue(unifiedSidebarEnabledAtom)
  const [isDetailsSidebarOpen, setIsDetailsSidebarOpen] = useAtom(detailsSidebarOpenAtom)
  const localBrowserWorkbenchAtom = useMemo(
    () => localBrowserWorkbenchOpenAtomFamily(chatId),
    [chatId],
  )
  const [isLocalBrowserWorkbenchOpen, setIsLocalBrowserWorkbenchOpen] = useAtom(localBrowserWorkbenchAtom)
  const pendingActiveLocalBrowserReportAtom = useMemo(
    () => pendingLocalBrowserReportAtomFamily(activeSubChatIdForPlan || ""),
    [activeSubChatIdForPlan],
  )
  const setPendingActiveLocalBrowserReport = useSetAtom(pendingActiveLocalBrowserReportAtom)
  const handleInsertLocalBrowserReport = useCallback((report: string) => {
    if (!activeSubChatIdForPlan) {
      toast.error(t("agent.chat.toast.noActiveChat"))
      return
    }
    setPendingActiveLocalBrowserReport(report)
  }, [activeSubChatIdForPlan, setPendingActiveLocalBrowserReport, t])

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
  const terminalDisplayMode = useAtomValue(terminalDisplayModeAtom)

  // Keyboard shortcut: Cmd+J to toggle terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey &&
        e.code === "KeyJ"
      ) {
        e.preventDefault()
        e.stopPropagation()
        setIsTerminalSidebarOpen(!isTerminalSidebarOpen)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isTerminalSidebarOpen, setIsTerminalSidebarOpen])

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

  useAgentPanelConflicts({
    isDetailsSidebarOpen,
    isPlanSidebarOpen,
    currentPlanPath,
    isTerminalSidebarOpen,
    terminalDisplayMode,
    isDiffSidebarOpen,
    diffDisplayMode,
    setIsDetailsSidebarOpen,
    setIsPlanSidebarOpen,
    setIsTerminalSidebarOpen,
    setIsDiffSidebarOpen,
  })

  // Force narrow width when switching to side-peek mode (from dialog/fullscreen)
  useEffect(() => {
    if (diffDisplayMode === "side-peek") {
      // Set to narrow width (400px) to ensure correct layout
      appStore.set(agentsDiffSidebarWidthAtom, 400)
    }
  }, [diffDisplayMode])

  // Hide/show traffic lights based on full-page diff or full-page file viewer
  // When exiting full-page mode, restore based on sidebar state (not unconditionally true)
  useEffect(() => {
    if (!isDesktop || isFullscreen) return
    if (typeof window === "undefined" || !window.desktopApi?.setTrafficLightVisibility) return

    const isFullPageDiff = isDiffSidebarOpen && diffDisplayMode === "full-page"
    const isFullPageFileViewer = !!fileViewerPath && fileViewerDisplayMode === "full-page"
    const shouldHide = isFullPageDiff || isFullPageFileViewer
    window.desktopApi.setTrafficLightVisibility(shouldHide ? false : sidebarOpen)
  }, [isDiffSidebarOpen, diffDisplayMode, fileViewerPath, fileViewerDisplayMode, isDesktop, isFullscreen, sidebarOpen])

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

  // Track changed files across all sub-chats for filtering
  const subChatFiles = useAtomValue(subChatFilesAtom)

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
    splitPaneIds,
  } = useAgentSubChatStore(
    useShallow((state) => ({
      activeSubChatId: state.activeSubChatId,
      openSubChatIds: state.openSubChatIds,
      pinnedSubChatIds: state.pinnedSubChatIds,
      allSubChats: state.allSubChats,
      splitPaneIds: state.splitPaneIds,
    }))
  )
  const [
    subChatProviderOverrides,
    setSubChatProviderOverrides,
  ] = useState<Record<string, "claude-code" | "codex">>({})

  useEffect(() => {
    setSubChatProviderOverrides({})
  }, [chatId])

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
  const utilsRef = useRef(utils)
  utilsRef.current = utils

  // tRPC mutations for renaming
  const renameSubChatMutation = api.agents.renameSubChat.useMutation()
  const renameChatMutation = api.agents.renameChat.useMutation()
  const generateSubChatNameMutation =
    api.agents.generateSubChatName.useMutation()
  const renameSubChatMutationRef = useRef(renameSubChatMutation)
  const renameChatMutationRef = useRef(renameChatMutation)
  const generateSubChatNameMutationRef = useRef(generateSubChatNameMutation)
  renameSubChatMutationRef.current = renameSubChatMutation
  renameChatMutationRef.current = renameChatMutation
  generateSubChatNameMutationRef.current = generateSubChatNameMutation

  // PR creation loading state - using atom to allow ChatViewInner to reset it
  const [isCreatingPr, setIsCreatingPr] = useAtom(isCreatingPrAtom)
  // Review loading state
  const [isReviewing, setIsReviewing] = useState(false)
  // Subchat filter setter - used by handleReview to filter by active subchat
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)
  const setSessionInfo = useSetAtom(sessionInfoAtom)

  // Fetch local chat data only. Hosted sandbox chats are not part of the
  // desktop local-first flow.
  const { data: localAgentChat, isLoading: isLocalLoading } = api.agents.getAgentChat.useQuery(
    { chatId },
    { enabled: !!chatId },
  )

  // IMPORTANT: Must memoize to prevent infinite re-render loop
  // The inline object spread creates a new reference on every render,
  // which triggers the useEffect that calls setAllSubChats(), causing re-renders
  const agentChat = useMemo(() => localAgentChat, [localAgentChat])

  const isLoading = isLocalLoading

  // Compute if we're waiting for local chat data (used as loading gate)
  const isLocalChatLoading = isLocalLoading

  const agentSubChats = (agentChat?.subChats ?? []) as Array<{
    id: string
    name?: string | null
    mode?: "plan" | "agent" | null
    created_at?: Date | string | null
    updated_at?: Date | string | null
    messages?: any
    stream_id?: string | null
  }>
  const agentSubChatsRef = useRef(agentSubChats)
  agentSubChatsRef.current = agentSubChats

  // Workspace isolation: limit mounted tabs to prevent memory growth
  // CRITICAL: Filter by workspace to prevent rendering sub-chats from other workspaces
  // Always render: active + pinned, then fill with recent up to limit
  const MAX_MOUNTED_TABS = 3
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
    const validSplitPaneIds = splitPaneIds.filter(id => validSubChatIds.has(id))

    // Start with active (must always be mounted)
    const mustRender = new Set([activeSubChatId])

    // Split panes must always be mounted
    for (const id of validSplitPaneIds) {
      mustRender.add(id)
    }

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

    for (const id of validSplitPaneIds) {
      if (!result.includes(id)) {
        result.push(id)
      }
    }

    return result
  }, [activeSubChatId, splitPaneIds, pinnedSubChatIds, openSubChatIds, allSubChats, agentSubChats])

  // Prune chat instances from previous workspace when switching parent chat.
  // Prevents cross-workspace memory accumulation.
  const previousParentChatIdRef = useRef<string | null>(chatId)
  useEffect(() => {
    const previousParentChatId = previousParentChatIdRef.current
    if (previousParentChatId && previousParentChatId !== chatId) {
      for (const subChatId of agentChatStore.keys()) {
        if (agentChatStore.getParentChatId(subChatId) !== previousParentChatId) continue
        if (useStreamingStatusStore.getState().isStreaming(subChatId)) continue
        if ((useMessageQueueStore.getState().queues[subChatId]?.length ?? 0) > 0) continue
        agentChatStore.delete(subChatId)
        clearRuntimeCachesForSubChat(subChatId)
      }
    }
    previousParentChatIdRef.current = chatId
  }, [chatId])

  // Bound resident chat instances in memory for current workspace.
  // Keep mounted tabs and currently streaming chats; evict everything else.
  useEffect(() => {
    if (!activeSubChatId) return
    if (tabsToRender.length === 0) return

    const keep = new Set(tabsToRender)
    keep.add(activeSubChatId)
    for (const subChatId of agentChatStore.keys()) {
      if (agentChatStore.getParentChatId(subChatId) !== chatId) continue
      if (keep.has(subChatId)) continue
      if (useStreamingStatusStore.getState().isStreaming(subChatId)) continue
      if ((useMessageQueueStore.getState().queues[subChatId]?.length ?? 0) > 0) continue

      agentChatStore.delete(subChatId)
      clearRuntimeCachesForSubChat(subChatId)
    }
  }, [activeSubChatId, chatId, tabsToRender])

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

  // Direct PR creation mutation (push branch and open GitHub)
  const createPrMutation = trpc.changes.createPR.useMutation({
    onSuccess: () => {
      toast.success(t("agent.chat.toast.openingGitHubCreatePr"), { position: "top-center" })
      refetchGitStatus()
    },
    onError: (error) => {
      toast.error(error.message || t("agent.chat.toast.failedCreatePr"), { position: "top-center" })
    },
  })

  // Sync from main mutation (for resolving merge conflicts)
  const mergeFromDefaultMutation = trpc.changes.mergeFromDefault.useMutation({
    onSuccess: () => {
      toast.success(t("agent.chat.toast.branchSyncedWithMain"), { position: "top-center" })
      // Invalidate PR status to refresh mergeability
      trpcUtils.chats.getPrStatus.invalidate({ chatId })
    },
    onError: (error) => {
      toast.error(error.message || t("agent.chat.toast.failedSyncWithMain"), { position: "top-center" })
    },
  })

  const mergePrMutation = trpc.chats.mergePr.useMutation({
    onSuccess: () => {
      toast.success(t("agent.chat.toast.prMerged"), { position: "top-center" })
      // Invalidate PR status to update button state
      trpcUtils.chats.getPrStatus.invalidate({ chatId })
    },
    onError: (error) => {
      const errorMsg = error.message || t("agent.chat.toast.failedMergePr")

      // Check if it's a merge conflict error
      if (errorMsg.includes("MERGE_CONFLICT")) {
        toast.error(
          t("agent.chat.toast.prMergeConflicts"),
          {
            position: "top-center",
            duration: 8000,
            action: worktreePath ? {
              label: t("agent.chat.syncWithMain"),
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
  const restoreWorkspaceMutationRef = useRef(restoreWorkspaceMutation)
  restoreWorkspaceMutationRef.current = restoreWorkspaceMutation

  const handleRestoreWorkspace = useCallback(() => {
    restoreWorkspaceMutationRef.current.mutate({ id: chatId })
  }, [chatId])

  // Check if this workspace is archived
  const isArchived = !!agentChat?.archivedAt

  // Desktop: use worktreePath instead of sandbox
  const worktreePath = agentChat?.worktreePath as string | null
  // Desktop: original project path for MCP config lookup
  const originalProjectPath = (agentChat as any)?.project?.path as string | undefined

  // Terminal scope key: shared by project path (local mode) or isolated per workspace (worktree)
  const terminalScopeKey = useMemo(() => {
    return getTerminalScopeKey({
      branch: (agentChat as any)?.branch ?? null,
      worktreePath: worktreePath,
      id: chatId,
    })
  }, [(agentChat as any)?.branch, worktreePath, chatId])
  // Plugin MCP approval - disabled for now since official marketplace plugins
  // are trusted by default. Will re-enable when third-party plugin support is added.

  // Extract port, repository, and quick setup flag from meta
  const meta = agentChat?.meta as {
    sandboxConfig?: { port?: number }
    repository?: string
    branch?: string | null
    isQuickSetup?: boolean
  } | null
  const repository = meta?.repository

  // Check if diff button can be shown (stats available)
  // This shows the Changes button with stats in header
  const canShowDiffButton = !!worktreePath

  // Check if diff sidebar can be opened (actual diff content available)
  const canOpenDiff = !!worktreePath

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
          name: getDisplayChatName(subChat.name, t("chat.defaultTitle")),
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
  }, [allSubChats, subChatFiles, t])

  // Note: We no longer forcibly close diff sidebar when canOpenDiff is false.
  // The sidebar render is guarded by canOpenDiff, so it naturally hides.
  // Per-chat state (diffSidebarOpenAtomFamily) preserves each chat's preference.

  const { fetchDiffStats, fetchDiffStatsRef, scheduleDiffRefresh } =
    useWorkspaceDiffFetch({
      chatId,
      worktreePath,
      isDiffSidebarOpen,
      setDiffStats,
      setParsedFileDiffs,
      setPrefetchedFileContents,
      setDiffContent,
    })

  // Handle Create PR (Direct) - pushes branch and opens GitHub compare URL
  const handleCreatePrDirect = useCallback(async () => {
    if (!worktreePath) {
      toast.error(t("changes.noWorktreePath"), { position: "top-center" })
      return
    }

    setIsCreatingPr(true)
    try {
      await createPrMutation.mutateAsync({ worktreePath })
    } finally {
      setIsCreatingPr(false)
    }
  }, [worktreePath, createPrMutation, t])

  // Handle Create PR with AI - sends a message to Claude to create the PR
  const setPendingPrMessage = useSetAtom(pendingPrMessageAtom)

  const handleCreatePr = useCallback(async () => {
    if (!chatId) {
      toast.error(t("agent.chat.toast.chatIdRequired"), { position: "top-center" })
      return
    }

    setIsCreatingPr(true)
    try {
      const activeSubChatId = useAgentSubChatStore.getState().activeSubChatId
      if (!activeSubChatId) {
        toast.error(t("agent.chat.toast.noActiveChat"), { position: "top-center" })
        setIsCreatingPr(false)
        return
      }

      // Ensure the target sub-chat is focused before sending
      const store = useAgentSubChatStore.getState()
      store.addToOpenSubChats(activeSubChatId)
      store.setActiveSubChat(activeSubChatId)

      // Get PR context from backend
      const context = await trpcClient.chats.getPrContext.query({ chatId })
      if (!context) {
        toast.error(t("agent.chat.toast.couldNotGetGitContext"), { position: "top-center" })
        setIsCreatingPr(false)
        return
      }

      // Generate message and set it for ChatViewInner to send
      const message = generatePrMessage(context)
      setPendingPrMessage({ message, subChatId: activeSubChatId })
      // Don't reset isCreatingPr here - it will be reset after message is sent
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("agent.chat.toast.failedPreparePrRequest"),
        { position: "top-center" },
      )
      setIsCreatingPr(false)
    }
  }, [chatId, setPendingPrMessage, setIsCreatingPr, t])

  // Handle Commit to existing PR - sends a message to Claude to commit and push
  // selectedPaths parameter is optional - if provided, only those files will be mentioned
  const [isCommittingToPr, setIsCommittingToPr] = useState(false)
  const handleCommitToPr = useCallback(async (_selectedPaths?: string[]) => {
    if (!chatId) {
      toast.error(t("agent.chat.toast.chatIdRequired"), { position: "top-center" })
      return
    }

    try {
      setIsCommittingToPr(true)
      const activeSubChatId = useAgentSubChatStore.getState().activeSubChatId
      if (!activeSubChatId) {
        toast.error(t("agent.chat.toast.noActiveChat"), { position: "top-center" })
        setIsCommittingToPr(false)
        return
      }

      // Ensure the target sub-chat is focused before sending
      const store = useAgentSubChatStore.getState()
      store.addToOpenSubChats(activeSubChatId)
      store.setActiveSubChat(activeSubChatId)

      const context = await trpcClient.chats.getPrContext.query({ chatId })
      if (!context) {
        toast.error(t("agent.chat.toast.couldNotGetGitContext"), { position: "top-center" })
        return
      }

      const message = generateCommitToPrMessage(context)
      setPendingPrMessage({ message, subChatId: activeSubChatId })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("agent.chat.toast.failedPrepareCommitRequest"),
        { position: "top-center" },
      )
    } finally {
      setIsCommittingToPr(false)
    }
  }, [chatId, setPendingPrMessage, setIsCommittingToPr, t])

  // Handle Review - sends a message to Claude to review the diff
  const setPendingReviewMessage = useSetAtom(pendingReviewMessageAtom)

  const handleReview = useCallback(async () => {
    if (!chatId) {
      toast.error(t("agent.chat.toast.chatIdRequired"), { position: "top-center" })
      return
    }

    setIsReviewing(true)
    try {
      // Get PR context from backend
      const context = await trpcClient.chats.getPrContext.query({ chatId })
      if (!context) {
        toast.error(t("agent.chat.toast.couldNotGetGitContext"), { position: "top-center" })
        return
      }

      // Set filter to show only files from the active subchat
      if (activeSubChatId) {
        setFilteredSubChatId(activeSubChatId)
      }

      // Generate review message and set it for ChatViewInner to send
      const message = generateReviewMessage(context)
      if (activeSubChatId) {
        setPendingReviewMessage({ message, subChatId: activeSubChatId })
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("agent.chat.toast.failedStartReview"),
        { position: "top-center" },
      )
    } finally {
      setIsReviewing(false)
    }
  }, [chatId, activeSubChatId, setPendingReviewMessage, setFilteredSubChatId, t])

  // Handle Fix Conflicts - sends a message to Claude to sync with main and fix merge conflicts
  const setPendingConflictResolutionMessage = useSetAtom(pendingConflictResolutionMessageAtom)

  const handleFixConflicts = useCallback(() => {
    const message = `This PR has merge conflicts with the main branch. Please:

1. First, fetch and merge the latest changes from main branch using git commands
2. If there are any merge conflicts, resolve them carefully by keeping the correct code from both branches
3. After resolving conflicts, commit the merge
4. Push the changes to update the PR

Make sure to preserve all functionality from both branches when resolving conflicts.`

    if (activeSubChatId) {
      setPendingConflictResolutionMessage({ message, subChatId: activeSubChatId })
    }
  }, [activeSubChatId, setPendingConflictResolutionMessage])

  // Fetch branch data for diff sidebar header
  const { data: branchData } = trpc.changes.getBranches.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath }
  )

  // Fetch git status for sync counts (pushCount, pullCount, hasUpstream)
  const { data: gitStatus, refetch: refetchGitStatus, isLoading: isGitStatusLoading } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath && (isDiffSidebarOpen || isDetailsSidebarOpen), staleTime: 30000 }
  )

  const handleCommitChangesRefresh = useCallback(() => {
    refetchGitStatus()
    scheduleDiffRefresh()
  }, [refetchGitStatus, scheduleDiffRefresh])

  const {
    commit: commitChanges,
    isPending: isCommittingChanges,
  } = useCommitActions({
    worktreePath,
    chatId,
    onRefresh: handleCommitChangesRefresh,
  })

  const { push: pushBranch, isPending: isPushing } = usePushAction({
    worktreePath,
    hasUpstream: gitStatus?.hasUpstream ?? true,
    onSuccess: handleCommitChangesRefresh,
  })

  const handleCommitChanges = useCallback((selectedPaths: string[]) => {
    commitChanges({ filePaths: selectedPaths })
  }, [commitChanges])

  const handleCommitAndPush = useCallback(async (selectedPaths: string[]) => {
    const didCommit = await commitChanges({ filePaths: selectedPaths })
    if (didCommit) {
      pushBranch()
    }
  }, [commitChanges, pushBranch])

  const isCommittingCombined = isCommittingChanges || isPushing

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
    scheduleDiffRefresh()
  }, [refetchGitStatus, scheduleDiffRefresh])

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
        name: getDisplayChatName(sc.name, t("chat.defaultTitle")),
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
          name: t("chat.defaultTitle"),
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
  }, [agentChat, chatId, t])

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

  const inferProviderFromMessages = useCallback(
    (subChatId?: string): "claude-code" | "codex" => {
      if (!subChatId) return "claude-code"

      const override = subChatProviderOverrides[subChatId]
      if (override) return override

      const subChat = ((agentChat as any)?.subChats || []).find(
        (sc: any) => sc?.id === subChatId,
      ) as { messages?: any } | undefined
      const rawMessages = subChat?.messages

      let messages: any[] = []
      if (Array.isArray(rawMessages)) {
        messages = rawMessages
      } else if (typeof rawMessages === "string") {
        try {
          const parsed = JSON.parse(rawMessages)
          messages = Array.isArray(parsed) ? parsed : []
        } catch {
          messages = []
        }
      }

      for (const message of messages) {
        const provider = (message as any)?.metadata?.provider
        if (provider === "codex") {
          return "codex"
        }

        const model = (message as any)?.metadata?.model
        if (typeof model !== "string") continue
        const normalizedModel = model.toLowerCase()
        if (
          normalizedModel.includes("codex") ||
          normalizedModel.startsWith("gpt-")
        ) {
          return "codex"
        }
      }

      return "claude-code"
    },
    [agentChat, subChatProviderOverrides],
  )

  const activeSubChatProvider = useMemo(
    () => inferProviderFromMessages(activeSubChatId || undefined),
    [activeSubChatId, inferProviderFromMessages],
  )

  const { data: codexMcpConfig } = trpc.codex.getAllMcpConfig.useQuery(undefined, {
    enabled: activeSubChatProvider === "codex",
    staleTime: 5 * 60 * 1000,
  })

  const codexMcpSessionData = useMemo(() => {
    if (activeSubChatProvider !== "codex") return null
    if (!codexMcpConfig) return null

    const groups = codexMcpConfig?.groups || []
    if (groups.length === 0) {
      return {
        mcpServers: [],
        mcpTools: [],
      }
    }

    const orderedGroups = [
      ...groups.filter((group) => group.projectPath === null),
      ...groups.filter(
        (group) =>
          group.projectPath !== null &&
          !!originalProjectPath &&
          group.projectPath === originalProjectPath,
      ),
    ]

    const effectiveServers = new Map<string, (typeof groups)[number]["mcpServers"][number]>()
    for (const group of orderedGroups) {
      for (const server of group.mcpServers || []) {
        if (typeof server?.name !== "string" || server.name.length === 0) continue
        effectiveServers.set(server.name, server)
      }
    }

    const mcpServers: Array<{
      name: string
      status: "connected" | "failed" | "pending" | "needs-auth"
      serverInfo?: { name: string; version: string; icons?: Array<{ src: string }> }
      error?: string
    }> = []
    const mcpToolIds = new Set<string>()

    for (const server of effectiveServers.values()) {
      const status =
        server.status === "connected" ||
        server.status === "failed" ||
        server.status === "pending" ||
        server.status === "needs-auth"
          ? server.status
          : "failed"

      mcpServers.push({
        name: server.name,
        status,
        ...("serverInfo" in server && server.serverInfo
          ? { serverInfo: server.serverInfo }
          : {}),
        ...("error" in server && server.error ? { error: server.error } : {}),
      })

      for (const tool of Array.isArray(server.tools) ? server.tools : []) {
        const toolName =
          typeof tool === "string"
            ? tool
            : typeof tool?.name === "string"
              ? tool.name
              : null
        if (!toolName) continue
        mcpToolIds.add(`mcp__${server.name}__${toolName}`)
      }
    }

    return {
      mcpServers,
      mcpTools: [...mcpToolIds].sort((a, b) => a.localeCompare(b)),
    }
  }, [activeSubChatProvider, codexMcpConfig?.groups, originalProjectPath])

  useEffect(() => {
    if (activeSubChatProvider !== "codex" || !codexMcpSessionData) return

    setSessionInfo((prev) => {
      const nonMcpTools = (prev?.tools || []).filter(
        (tool) => !tool.startsWith("mcp__"),
      )

      return {
        tools: [...nonMcpTools, ...codexMcpSessionData.mcpTools],
        mcpServers: codexMcpSessionData.mcpServers,
        plugins: prev?.plugins || [],
        skills: prev?.skills || [],
      }
    })
  }, [activeSubChatProvider, codexMcpSessionData, setSessionInfo])

  const syncFinishedMessagesToChatCache = useCallback(
    (subChatId: string, chat: Chat<any>) => {
      const latestMessages = (chat as any)?.messages
      if (!Array.isArray(latestMessages)) return
      const latestMessagesJson = JSON.stringify(latestMessages)

      utils.agents.getAgentChat.setData({ chatId }, (old: any) => {
        if (!old?.subChats || !Array.isArray(old.subChats)) return old

        let found = false
        const subChats = old.subChats.map((sc: any) => {
          if (sc.id !== subChatId) return sc
          found = true
          return { ...sc, messages: latestMessagesJson }
        })

        return found ? { ...old, subChats } : old
      })
    },
    [chatId, utils],
  )

  // If a stream finishes after user already switched to another workspace,
  // eagerly evict this runtime chat once it's idle to avoid permanent retention.
  const pruneIfDetachedAndIdle = useCallback((subChatId: string, parentChatId: string) => {
    const currentSelectedChatId = appStore.get(selectedAgentChatIdAtom)
    if (!currentSelectedChatId || currentSelectedChatId === parentChatId) return
    if (useStreamingStatusStore.getState().isStreaming(subChatId)) return
    if ((useMessageQueueStore.getState().queues[subChatId]?.length ?? 0) > 0) return

    agentChatStore.delete(subChatId)
    clearRuntimeCachesForSubChat(subChatId)
  }, [])

  // Create or get Chat instance for a sub-chat
  const getOrCreateChat = useCallback(
    (subChatId: string): Chat<any> | null => {
      if (!worktreePath || !agentChat) {
        return null
      }

      // Create transport for the local worktree.
      // Note: Extended thinking setting is read dynamically inside the transport
      // projectPath: original project path for MCP config lookup (worktreePath is the cwd)
      const projectPath = (agentChat as any)?.project?.path as string | undefined

      // Fast path for existing chats. Only inspect messages when a local empty-chat provider override
      // might require transport recreation.
      const existing = agentChatStore.get(subChatId)
      if (existing) {
        const overrideProvider = subChatProviderOverrides[subChatId]
        if (!overrideProvider) return existing

        const existingProvider: "claude-code" | "codex" =
          (existing as any)?.transport instanceof ACPChatTransport
            ? "codex"
            : "claude-code"
        if (existingProvider === overrideProvider) return existing

        const subChatForOverride = agentSubChats.find((sc) => sc.id === subChatId)
        const rawExistingMessages = subChatForOverride?.messages
        const existingMessageCount = Array.isArray(rawExistingMessages)
          ? rawExistingMessages.length
          : typeof rawExistingMessages === "string"
            ? (() => {
                try {
                  const parsed = JSON.parse(rawExistingMessages)
                  return Array.isArray(parsed) ? parsed.length : 0
                } catch {
                  return 0
                }
              })()
            : 0

        if (existingMessageCount > 0) return existing
        agentChatStore.delete(subChatId)
      }

      // Find sub-chat data
      const subChat = agentSubChats.find((sc) => sc.id === subChatId)
      const rawMessages = subChat?.messages
      const messages = Array.isArray(rawMessages)
        ? rawMessages
        : typeof rawMessages === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(rawMessages)
                return Array.isArray(parsed) ? parsed : []
              } catch {
                return []
              }
            })()
          : []

      // Get mode from store metadata (falls back to currentMode)
      const subChatMeta = useAgentSubChatStore
        .getState()
        .allSubChats.find((sc) => sc.id === subChatId)
      const subChatMode = subChatMeta?.mode || currentMode

      const chatProvider = inferProviderFromMessages(subChatId)

      console.log("[getOrCreateChat] Transport selection", {
        subChatId: subChatId.slice(-8),
        worktreePath: worktreePath ? "exists" : "none",
      })

      let transport: IPCChatTransport | ACPChatTransport | null = null

      if (chatProvider === "codex") {
        console.log("[getOrCreateChat] Using ACPChatTransport", { provider: chatProvider })
        transport = new ACPChatTransport({
          chatId,
          subChatId,
          cwd: worktreePath,
          projectPath,
          mode: subChatMode,
          provider: "codex",
        })
      } else {
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
          syncFinishedMessagesToChatCache(subChatId, newChat)
          pruneIfDetachedAndIdle(subChatId, chatId)
        },
        // Clear loading when streaming completes (works even if component unmounted)
        onFinish: () => {
          clearLoading(setLoadingSubChats, subChatId)

          // Sync status to global store for queue processing (even when component unmounted)
          useStreamingStatusStore.getState().setStatus(subChatId, "ready")
          syncFinishedMessagesToChatCache(subChatId, newChat)

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
            }
          }

          // Show native notification if not manually aborted
          // (the hook handles focus/preference checks internally)
          if (!wasManuallyAborted) {
            notifyAgentComplete(agentChat?.name || "Agent")
          }

          // Refresh diff stats after agent finishes making changes
          fetchDiffStatsRef.current()

          pruneIfDetachedAndIdle(subChatId, chatId)

          // Note: sidebar timestamp update is handled via optimistic update in handleSend
          // No need to refetch here as it would overwrite the optimistic update with stale data
        },
      })

      agentChatStore.set(subChatId, newChat, chatId)
      // Store streamId at creation time to prevent resume during active streaming
      // tRPC refetch would update stream_id in DB, but store stays stable
      agentChatStore.setStreamId(subChatId, subChat?.stream_id || null)
      return newChat
    },
    [
      agentChat,
      worktreePath,
      chatId,
      currentMode,
      inferProviderFromMessages,
      subChatProviderOverrides,
      setSubChatUnseenChanges,
      selectedChatId,
      setUnseenChanges,
      notifyAgentComplete,
      syncFinishedMessagesToChatCache,
      pruneIfDetachedAndIdle,
    ],
  )

  const handleProviderChange = useCallback(
    (subChatId: string, nextProvider: "claude-code" | "codex") => {
      // Provider switch is only allowed for brand new sub-chats.
      const activeChat = agentChatStore.get(subChatId) as any
      let messageCount = Array.isArray(activeChat?.messages)
        ? activeChat.messages.length
        : 0

      if (messageCount === 0) {
        const subChat = agentSubChatsRef.current.find((sc) => sc.id === subChatId)
        const rawMessages = subChat?.messages
        if (Array.isArray(rawMessages)) {
          messageCount = rawMessages.length
        } else if (typeof rawMessages === "string") {
          try {
            const parsed = JSON.parse(rawMessages)
            messageCount = Array.isArray(parsed) ? parsed.length : 0
          } catch {
            messageCount = 0
          }
        }
      }

      if (messageCount > 0) return

      setSubChatProviderOverrides((prev) => ({
        ...prev,
        [subChatId]: nextProvider,
      }))

      // Force transport recreation with the newly selected provider.
      agentChatStore.delete(subChatId)
      forceUpdate({})
    },
    [],
  )

  // Handle creating a new sub-chat
  const handleCreateNewSubChat = useCallback(async () => {
    const store = useAgentSubChatStore.getState()
    const sourceSubChatId = activeSubChatId || ""
    // New sub-chats use the user's default mode preference
    const newSubChatMode = defaultAgentMode
    const newSubChatProvider = inferProviderFromMessages(activeSubChatId || undefined)

    const newSubChat = await trpcClient.chats.createSubChat.mutate({
      chatId,
      name: t("chat.defaultTitle"),
      mode: newSubChatMode,
    })
    const newId = newSubChat.id
    utils.agents.getAgentChat.invalidate({ chatId })

    // Optimistic update: add new sub-chat to React Query cache immediately.
    // This is CRITICAL for workspace isolation - without this, the new sub-chat
    // won't be in validSubChatIds and will be filtered out by tabsToRender.
    utils.agents.getAgentChat.setData({ chatId }, (old) => {
      if (!old) return old
      return {
        ...old,
        subChats: [
          ...(old.subChats || []),
          {
            id: newId,
            name: t("chat.defaultTitle"),
            mode: newSubChatMode,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            messages: null,
            stream_id: null,
          },
        ],
      }
    })

    // Track this subchat as just created for typewriter effect
    setJustCreatedIds((prev) => new Set([...prev, newId]))
    setSubChatProviderOverrides((prev) => ({
      ...prev,
      [newId]: newSubChatProvider,
    }))

    // Add to allSubChats with placeholder name
    store.addToAllSubChats({
      id: newId,
      name: t("chat.defaultTitle"),
      created_at: new Date().toISOString(),
      mode: newSubChatMode,
    })

    // Set the mode atomFamily for the new sub-chat (so currentMode reads correct value)
    appStore.set(subChatModeAtomFamily(newId), newSubChatMode)
    // Inherit model preferences from source sub-chat for deterministic behavior.
    appStore.set(
      subChatModelIdAtomFamily(newId),
      appStore.get(subChatModelIdAtomFamily(sourceSubChatId)),
    )
    appStore.set(
      subChatClaudeModelSourceAtomFamily(newId),
      appStore.get(subChatClaudeModelSourceAtomFamily(sourceSubChatId)),
    )
    appStore.set(
      subChatCodexModelIdAtomFamily(newId),
      appStore.get(subChatCodexModelIdAtomFamily(sourceSubChatId)),
    )
    appStore.set(
      subChatCodexModelSourceAtomFamily(newId),
      appStore.get(subChatCodexModelSourceAtomFamily(sourceSubChatId)),
    )
    appStore.set(
      subChatCodexThinkingAtomFamily(newId),
      appStore.get(subChatCodexThinkingAtomFamily(sourceSubChatId)),
    )

    // Add to open tabs and set as active
    store.addToOpenSubChats(newId)
    store.setActiveSubChat(newId)

    // Create empty Chat instance for the new sub-chat
    const projectPath = (agentChat as any)?.project?.path as string | undefined

    console.log("[createNewSubChat] Transport selection", {
      newId: newId.slice(-8),
      worktreePath: worktreePath ? "exists" : "none",
    })

    const chatProvider = newSubChatProvider
    let newSubChatTransport: IPCChatTransport | ACPChatTransport | null = null

    if (worktreePath) {
      if (chatProvider === "codex") {
        console.log("[createNewSubChat] Using ACPChatTransport", { provider: chatProvider })
        newSubChatTransport = new ACPChatTransport({
          chatId,
          subChatId: newId,
          cwd: worktreePath,
          projectPath,
          mode: newSubChatMode,
          provider: "codex",
        })
      } else {
        // Local worktree chat: use IPC transport
        newSubChatTransport = new IPCChatTransport({
          chatId,
          subChatId: newId,
          cwd: worktreePath,
          projectPath,
          mode: newSubChatMode,
        })
      }
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
          syncFinishedMessagesToChatCache(newId, newChat)
          pruneIfDetachedAndIdle(newId, chatId)
        },
        // Clear loading when streaming completes
        onFinish: () => {
          clearLoading(setLoadingSubChats, newId)

          // Sync status to global store for queue processing (even when component unmounted)
          useStreamingStatusStore.getState().setStatus(newId, "ready")
          syncFinishedMessagesToChatCache(newId, newChat)

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
            }
          }

          // Show native notification if not manually aborted
          // (the hook handles focus/preference checks internally)
          if (!wasManuallyAborted) {
            notifyAgentComplete(agentChat?.name || "Agent")
          }

          // Refresh diff stats after agent finishes making changes
          fetchDiffStatsRef.current()

          pruneIfDetachedAndIdle(newId, chatId)

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
    activeSubChatId,
    inferProviderFromMessages,
    utils,
    setSubChatUnseenChanges,
    selectedChatId,
    setUnseenChanges,
    notifyAgentComplete,
    syncFinishedMessagesToChatCache,
    pruneIfDetachedAndIdle,
    agentChat?.name,
    t,
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
      const firstSubChatId = getFirstSubChatId(agentSubChatsRef.current)
      const isFirst = firstSubChatId === subChatId

      autoRenameAgentChat({
        subChatId,
        parentChatId: chatId,
        userMessage,
        isFirstSubChat: isFirst,
        generateName: async (msg) => {
          return generateSubChatNameMutationRef.current.mutateAsync({
            userMessage: msg,
            ollamaModel: selectedOllamaModel,
          })
        },
        renameSubChat: async (input) => {
          await renameSubChatMutationRef.current.mutateAsync(input)
        },
        renameChat: async (input) => {
          await renameChatMutationRef.current.mutateAsync(input)
        },
        updateSubChatName: (subChatIdToUpdate, name) => {
          // Update local store
          useAgentSubChatStore
            .getState()
            .updateSubChatName(subChatIdToUpdate, name)
          // Also update query cache so init effect doesn't overwrite
          utilsRef.current.agents.getAgentChat.setData({ chatId }, (old) => {
            if (!old) return old
            const existsInCache = old.subChats.some(
              (sc: { id: string }) => sc.id === subChatIdToUpdate,
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
                    messages: "[]",
                    mode: "agent",
                    stream_id: null,
                    chat_id: chatId,
                  },
                ],
              }
            }
            return {
              ...old,
              subChats: old.subChats.map((sc: { id: string }) =>
                sc.id === subChatIdToUpdate ? { ...sc, name } : sc,
              ),
            }
          })
        },
        updateChatName: (chatIdToUpdate, name) => {
          // Optimistic update for sidebar (list query)
          // On desktop, selectedTeamId is always null, so we update unconditionally
          utilsRef.current.agents.getAgentChats.setData(
            { teamId: selectedTeamId },
            (old: Array<{ id: string; name: string | null }> | undefined) => {
              if (!old) return old
              return old.map((c: { id: string; name: string | null }) =>
                c.id === chatIdToUpdate ? { ...c, name } : c,
              )
            },
          )
          // Optimistic update for header (single chat query)
          utilsRef.current.agents.getAgentChat.setData(
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
      selectedTeamId,
      selectedOllamaModel,
    ],
  )

  // Get or create Chat instance for active sub-chat
  const activeChat = useMemo(() => {
    if (!activeSubChatId || !agentChat) {
      return null
    }
    return getOrCreateChat(activeSubChatId)
  }, [activeSubChatId, agentChat, getOrCreateChat, chatId, worktreePath])

  const stableHandleAutoRename = useStableCallback(handleAutoRename)
  const stableHandleCreateNewSubChat = useStableCallback(handleCreateNewSubChat)
  const stableHandleProviderChange = useStableCallback(handleProviderChange)
  const stableHandleRestoreWorkspace = useStableCallback(handleRestoreWorkspace)

  // Check if active sub-chat is the first one (for renaming parent chat)
  // Use agentSubChats directly to avoid race condition with store initialization
  const isFirstSubChatActive = useMemo(() => {
    if (!activeSubChatId) return false
    return getFirstSubChatId(agentSubChats) === activeSubChatId
  }, [activeSubChatId, agentSubChats])

  // Determine if chat header should be hidden
  const shouldHideChatHeader =
    hideHeader ||
    (subChatsSidebarMode === "sidebar" &&
    isDiffSidebarOpen &&
    !isMobileFullscreen)

  // No early return - let the UI render with loading state handled by activeChat check below

  return (
    <FileOpenProvider onOpenFile={setFileViewerPath}>
    <TextSelectionProvider>
    {/* File Search Dialog (Cmd+P) */}
    {worktreePath && (
      <FileSearchDialog
        open={fileSearchOpen}
        onOpenChange={setFileSearchOpen}
        projectPath={worktreePath}
        onSelectFile={setFileViewerPath}
      />
    )}
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
                      onCreateNew={stableHandleCreateNewSubChat}
                      onBackToChats={onBackToChats}
                      onOpenDiff={onOpenDiff}
                      canOpenDiff={canShowDiffButton}
                      diffStats={diffStats}
                      onOpenTerminal={onOpenTerminal}
                      canOpenTerminal={!!worktreePath}
                      isTerminalOpen={isTerminalSidebarOpen}
                      isArchived={isArchived}
                      onRestore={stableHandleRestoreWorkspace}
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
                        onCreateNew={stableHandleCreateNewSubChat}
                        isMobile={false}
                        onBackToChats={onBackToChats}
                        onOpenDiff={canOpenDiff ? () => setIsDiffSidebarOpen(true) : undefined}
                        canOpenDiff={canShowDiffButton}
                        isDiffSidebarOpen={isDiffSidebarOpen}
                        diffStats={diffStats}
                        onOpenTerminal={() => setIsTerminalSidebarOpen(true)}
                        canOpenTerminal={!!worktreePath}
                        isTerminalOpen={isTerminalSidebarOpen}
                        chatId={chatId}
                      />
                    </>
                  )}
                </div>
                {/* Local Browser Workbench Button */}
                {!isMobileFullscreen &&
                  worktreePath &&
                  !isLocalBrowserWorkbenchOpen && (
                    <Tooltip delayDuration={500}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsLocalBrowserWorkbenchOpen(true)}
                          className="h-6 w-6 p-0 hover:bg-foreground/10 transition-colors text-foreground flex-shrink-0 rounded-md ml-2"
                          aria-label={t("localBrowser.openWorkbench")}
                        >
                          <Globe2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t("localBrowser.openWorkbench")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                {/* Overview/Terminal Button - shows when sidebar is closed and worktree/sandbox exists (desktop only) */}
                {!isMobileFullscreen &&
                  worktreePath && (
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
                              aria-label={t("details.details")}
                            >
                              <IconOpenSidebarRight className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t("details.details")}
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
                              aria-label={t("agent.chat.openTerminal")}
                            >
                              <TerminalSquare className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t("agent.chat.openTerminal")}
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
                        onClick={stableHandleRestoreWorkspace}
                        disabled={restoreWorkspaceMutation.isPending}
                        className="h-6 px-2 gap-1.5 hover:bg-foreground/10 transition-colors text-foreground flex-shrink-0 rounded-md ml-2 flex items-center"
                        aria-label={t("agent.chat.restoreWorkspace")}
                      >
                        <UnarchiveIcon className="h-4 w-4" />
                        <span className="text-xs">{t("agent.chat.restore")}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t("agent.chat.restoreWorkspace")}
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
              ) : splitPaneIds.length >= 2 && !!activeSubChatId && splitPaneIds.includes(activeSubChatId) ? (
                <SplitViewContainer
                  panes={splitPaneIds.flatMap((paneId) => {
                    const chat = getOrCreateChat(paneId)
                    const isFirstSubChat = getFirstSubChatId(agentSubChats) === paneId
                    const belongsToWorkspace = agentSubChats.some(sc => sc.id === paneId) ||
                                              allSubChats.some(sc => sc.id === paneId)

                    if (!chat || !belongsToWorkspace) return []

                    return [{
                      id: paneId,
                      content: (
                        <div
                          className="h-full flex flex-col"
                          onMouseDownCapture={() => {
                            const store = useAgentSubChatStore.getState()
                            if (store.activeSubChatId !== paneId) {
                              // Mouse interaction already has an explicit target in this pane.
                              // Suppress auto-focus to avoid stealing focus from clicked controls
                              // (e.g. model selector popover trigger) on first click.
                              appStore.set(suppressInputFocusAtom, true)
                              store.setActiveSubChat(paneId)
                            }
                          }}
                        >
                          <ChatViewInner
                            chat={chat}
                            subChatId={paneId}
                            parentChatId={chatId}
                            provider={inferProviderFromMessages(paneId)}
                            isFirstSubChat={isFirstSubChat}
                            onAutoRename={stableHandleAutoRename}
                            onCreateNewSubChat={stableHandleCreateNewSubChat}
                            onProviderChange={stableHandleProviderChange}
                            teamId={selectedTeamId || undefined}
                            repository={repository}
                            streamId={agentChatStore.getStreamId(paneId)}
                            isMobile={isMobileFullscreen}
                            isSubChatsSidebarOpen={subChatsSidebarMode === "sidebar"}
                            projectPath={worktreePath || undefined}
                            isArchived={isArchived}
                            onRestoreWorkspace={stableHandleRestoreWorkspace}
                            existingPrUrl={agentChat?.prUrl}
                            isActive={paneId === activeSubChatId}
                            isSplitPane={true}
                            workspaceName={agentChat?.name ?? null}
                            workspaceBranch={agentChat?.branch ?? null}
                            workspaceRepoName={(agentChat as any)?.project?.gitRepo || (agentChat as any)?.project?.name || null}
                          />
                        </div>
                      )
                    }]
                  })}
                  hiddenTabs={
                    <>
                      {tabsToRender
                        .filter(id => !splitPaneIds.includes(id))
                        .map(subChatId => {
                          const chat = getOrCreateChat(subChatId)
                          const isFirstSubChat = getFirstSubChatId(agentSubChats) === subChatId
                          const belongsToWorkspace = agentSubChats.some(sc => sc.id === subChatId) ||
                                                    allSubChats.some(sc => sc.id === subChatId)
                          if (!chat || !belongsToWorkspace) return null
                          return (
                            <div
                              key={subChatId}
                              className="absolute inset-0 flex flex-col"
                              style={{
                                opacity: 0,
                                pointerEvents: "none",
                                contain: "layout style paint",
                              }}
                              aria-hidden
                            >
                              <ChatViewInner
                                chat={chat}
                                subChatId={subChatId}
                                parentChatId={chatId}
                                provider={inferProviderFromMessages(subChatId)}
                                isFirstSubChat={isFirstSubChat}
                                onAutoRename={stableHandleAutoRename}
                                onCreateNewSubChat={stableHandleCreateNewSubChat}
                                onProviderChange={stableHandleProviderChange}
                                teamId={selectedTeamId || undefined}
                                repository={repository}
                                streamId={agentChatStore.getStreamId(subChatId)}
                                isMobile={isMobileFullscreen}
                                isSubChatsSidebarOpen={subChatsSidebarMode === "sidebar"}
                                projectPath={worktreePath || undefined}
                                isArchived={isArchived}
                                onRestoreWorkspace={stableHandleRestoreWorkspace}
                                existingPrUrl={agentChat?.prUrl}
                                isActive={false}
                                isSplitPane={false}
                                workspaceName={agentChat?.name ?? null}
                                workspaceBranch={agentChat?.branch ?? null}
                                workspaceRepoName={(agentChat as any)?.project?.gitRepo || (agentChat as any)?.project?.name || null}
                              />
                            </div>
                          )
                        })}
                    </>
                  }
                />
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
                      provider={inferProviderFromMessages(subChatId)}
                      isFirstSubChat={isFirstSubChat}
                      onAutoRename={stableHandleAutoRename}
                      onCreateNewSubChat={stableHandleCreateNewSubChat}
                      onProviderChange={stableHandleProviderChange}
                      teamId={selectedTeamId || undefined}
                      repository={repository}
                      streamId={agentChatStore.getStreamId(subChatId)}
                      isMobile={isMobileFullscreen}
                      isSubChatsSidebarOpen={subChatsSidebarMode === "sidebar"}
                      projectPath={worktreePath || undefined}
                      isArchived={isArchived}
                      onRestoreWorkspace={stableHandleRestoreWorkspace}
                      existingPrUrl={agentChat?.prUrl}
                      isActive={isActive}
                      isSplitPane={false}
                      workspaceName={agentChat?.name ?? null}
                      workspaceBranch={agentChat?.branch ?? null}
                      workspaceRepoName={(agentChat as any)?.project?.gitRepo || (agentChat as any)?.project?.name || null}
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
                        {t("chat.placeholder.default")}
                      </div>
                      <PromptInputActions className="w-full flex-wrap gap-x-1 gap-y-1">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1">
                          {/* Mode selector placeholder */}
                          <button
                            disabled
                            className="flex max-w-[112px] min-w-0 items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground rounded-md cursor-not-allowed"
                          >
                            <AgentIcon className="h-3.5 w-3.5" />
                            <span className="truncate">{t("chat.mode.agent")}</span>
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                          </button>

                          {/* Model selector placeholder */}
                          <button
                            disabled
                            className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground rounded-md cursor-not-allowed"
                          >
                            <ClaudeCodeIcon className="h-3.5 w-3.5" />
                            <span className="truncate">
                              {hasCustomClaudeConfig ? (
                                t("agent.model.customModel")
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

        {/* Local Browser Workbench - local visual QA loop for dev servers/static previews */}
        {!isMobileFullscreen && worktreePath && (
          <ResizableSidebar
            isOpen={isLocalBrowserWorkbenchOpen}
            onClose={() => setIsLocalBrowserWorkbenchOpen(false)}
            widthAtom={localBrowserWorkbenchWidthAtom}
            minWidth={620}
            maxWidth={1100}
            side="right"
            animationDuration={0}
            initialWidth={0}
            exitWidth={0}
            showResizeTooltip={true}
            className="bg-background border-l"
            style={{ borderLeftWidth: "0.5px" }}
          >
            <LocalBrowserWorkbench
              chatId={chatId}
              worktreePath={worktreePath}
              onClose={() => setIsLocalBrowserWorkbenchOpen(false)}
              onInsertReport={handleInsertLocalBrowserReport}
            />
          </ResizableSidebar>
        )}

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
              handleCreatePrDirect={handleCreatePrDirect}
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
              isFullscreen={Boolean(isFullscreen)}
              setDiffDisplayMode={setDiffDisplayMode}
              handleCommitToPr={handleCommitToPr}
              isCommittingToPr={isCommittingToPr}
              subChatsWithFiles={subChatsWithFiles}
              setDiffStats={setDiffStats}
              onDiscardSuccess={scheduleDiffRefresh}
            />
          </DiffStateProvider>
        )}

        {/* File Viewer - opens when a file is clicked */}
        {!isMobileFullscreen && fileViewerPath && worktreePath && fileViewerDisplayMode === "side-peek" && (
          <ResizableSidebar
            isOpen={!!fileViewerPath}
            onClose={() => setFileViewerPath(null)}
            widthAtom={fileViewerSidebarWidthAtom}
            minWidth={350}
            maxWidth={900}
            side="right"
            animationDuration={0}
            initialWidth={0}
            exitWidth={0}
            showResizeTooltip={true}
            className="bg-tl-background border-l"
            style={{ borderLeftWidth: "0.5px" }}
          >
            <FileViewerSidebar
              filePath={fileViewerPath}
              projectPath={worktreePath}
              onClose={() => setFileViewerPath(null)}
            />
          </ResizableSidebar>
        )}
        {fileViewerPath && worktreePath && fileViewerDisplayMode === "center-peek" && (
          <DiffCenterPeekDialog
            isOpen={!!fileViewerPath}
            onClose={() => setFileViewerPath(null)}
          >
            <FileViewerSidebar
              filePath={fileViewerPath}
              projectPath={worktreePath}
              onClose={() => setFileViewerPath(null)}
            />
          </DiffCenterPeekDialog>
        )}
        {fileViewerPath && worktreePath && fileViewerDisplayMode === "full-page" && (
          <DiffFullPageView
            isOpen={!!fileViewerPath}
            onClose={() => setFileViewerPath(null)}
          >
            <FileViewerSidebar
              filePath={fileViewerPath}
              projectPath={worktreePath}
              onClose={() => setFileViewerPath(null)}
            />
          </DiffFullPageView>
        )}

        {/* Terminal Sidebar - shows when worktree exists (desktop only) */}
        {worktreePath && (
          <TerminalSidebar
            chatId={chatId}
            scopeKey={terminalScopeKey}
            cwd={worktreePath}
            workspaceId={chatId}
          />
        )}

        {/* Unified Details Sidebar - combines all right sidebars into one (rightmost) */}
        {isUnifiedSidebarEnabled &&
          !isMobileFullscreen &&
          worktreePath && (
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
            onCommit={worktreePath ? handleCommitChanges : undefined}
            onCommitAndPush={worktreePath ? handleCommitAndPush : undefined}
            isCommitting={isCommittingCombined}
            gitStatus={gitStatus}
            isGitStatusLoading={isGitStatusLoading}
            currentBranch={branchData?.current}
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
            onOpenFile={setFileViewerPath}
          />
        )}
      </div>

      {/* Terminal Bottom Panel — renders below the main row when displayMode is "bottom" */}
      {terminalDisplayMode === "bottom" && worktreePath && !isMobileFullscreen && (
        <ResizableBottomPanel
          isOpen={isTerminalSidebarOpen}
          onClose={() => setIsTerminalSidebarOpen(false)}
          heightAtom={terminalBottomHeightAtom}
          minHeight={150}
          maxHeight={500}
          showResizeTooltip={true}
          closeHotkey={toggleTerminalHotkey ?? undefined}
          className="bg-background border-t"
          style={{ borderTopWidth: "0.5px" }}
        >
          <TerminalBottomPanelContent
            chatId={chatId}
            scopeKey={terminalScopeKey}
            cwd={worktreePath}
            workspaceId={chatId}
            onClose={() => setIsTerminalSidebarOpen(false)}
          />
        </ResizableBottomPanel>
      )}
    </div>
    </TextSelectionProvider>
    </FileOpenProvider>
  )
}
