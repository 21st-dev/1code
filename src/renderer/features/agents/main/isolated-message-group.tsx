"use client"

import { memo, useMemo } from "react"
import { motion } from "motion/react"
import { useAtomValue } from "jotai"
import {
  messageAtomFamily,
  assistantIdsForUserMsgAtomFamily,
  isLastUserMessageAtomFamily,
  isStreamingAtom,
} from "../stores/message-store"
import { MemoizedAssistantMessages } from "./messages-list"
import { extractTextMentions, TextMentionBlocks } from "../mentions/render-file-mentions"

// ============================================================================
// ISOLATED MESSAGE GROUP (LAYER 4)
// ============================================================================
// Renders ONE user message and its associated assistant messages.
// Subscribes to Jotai atoms for:
// - The specific user message
// - Assistant message IDs for this group
// - Whether this is the last user message
// - Streaming status
//
// Only re-renders when:
// - User message content changes (rare)
// - New assistant message is added to this group
// - This becomes/stops being the last group
// - Streaming starts/stops (for planning indicator)
// ============================================================================

interface IsolatedMessageGroupProps {
  userMsgId: string
  subChatId: string
  isMobile: boolean
  sandboxSetupStatus: "cloning" | "ready" | "error"
  stickyTopClass: string
  sandboxSetupError?: string
  onRetrySetup?: () => void
  // Components passed from parent - must be stable references
  UserBubbleComponent: React.ComponentType<{
    messageId: string
    textContent: string
    imageParts: any[]
    skipTextMentionBlocks?: boolean
  }>
  ToolCallComponent: React.ComponentType<{
    icon: any
    title: string
    isPending: boolean
    isError: boolean
  }>
  MessageGroupWrapper: React.ComponentType<{ children: React.ReactNode; isLastGroup?: boolean }>
  toolRegistry: Record<string, { icon: any; title: (args: any) => string }>
}

function areGroupPropsEqual(
  prev: IsolatedMessageGroupProps,
  next: IsolatedMessageGroupProps
): boolean {
  return (
    prev.userMsgId === next.userMsgId &&
    prev.subChatId === next.subChatId &&
    prev.isMobile === next.isMobile &&
    prev.sandboxSetupStatus === next.sandboxSetupStatus &&
  prev.stickyTopClass === next.stickyTopClass &&
  prev.sandboxSetupError === next.sandboxSetupError &&
  prev.onRetrySetup === next.onRetrySetup &&
  prev.UserBubbleComponent === next.UserBubbleComponent &&
  prev.ToolCallComponent === next.ToolCallComponent &&
  prev.MessageGroupWrapper === next.MessageGroupWrapper &&
  prev.toolRegistry === next.toolRegistry
  )
}

export const IsolatedMessageGroup = memo(function IsolatedMessageGroup({
  userMsgId,
  subChatId,
  isMobile,
  sandboxSetupStatus,
  stickyTopClass,
  sandboxSetupError,
  onRetrySetup,
  UserBubbleComponent,
  ToolCallComponent,
  MessageGroupWrapper,
  toolRegistry,
}: IsolatedMessageGroupProps) {
  // Subscribe to specific atoms - NOT the whole messages array
  const userMsg = useAtomValue(messageAtomFamily(userMsgId))
  const assistantIds = useAtomValue(assistantIdsForUserMsgAtomFamily(userMsgId))
  const isLastGroup = useAtomValue(isLastUserMessageAtomFamily(userMsgId))
  const isStreaming = useAtomValue(isStreamingAtom)

  // Extract user message content
  const rawTextContent =
    userMsg?.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n") || ""

  const imageParts =
    userMsg?.parts?.filter((p: any) => p.type === "data-image") || []

  // Extract text mentions (quote/diff) to render separately above sticky block
  // NOTE: useMemo must be called before any early returns to follow Rules of Hooks
  const { textMentions, cleanedText: textContent } = useMemo(
    () => extractTextMentions(rawTextContent),
    [rawTextContent]
  )

  if (!userMsg) return null

  // Show cloning when sandbox is being set up
  const shouldShowCloning =
    sandboxSetupStatus === "cloning" && isLastGroup && assistantIds.length === 0

  // Show setup error if sandbox setup failed
  const shouldShowSetupError =
    sandboxSetupStatus === "error" && isLastGroup && assistantIds.length === 0

  // Check if this is an image-only message (no text content)
  const isImageOnlyMessage = imageParts.length > 0 && !textContent.trim() && textMentions.length === 0

  return (
    <MessageGroupWrapper isLastGroup={isLastGroup}>
      {/* Attachments - NOT sticky (only when there's also text) */}
      {imageParts.length > 0 && !isImageOnlyMessage && (
        <div className="mb-2 pointer-events-auto">
          <UserBubbleComponent
            messageId={userMsgId}
            textContent=""
            imageParts={imageParts}
            skipTextMentionBlocks
          />
        </div>
      )}

      {/* Text mentions (quote/diff) - NOT sticky */}
      {textMentions.length > 0 && (
        <div className="mb-2 pointer-events-auto">
          <TextMentionBlocks mentions={textMentions} />
        </div>
      )}

      {/* User message text - sticky (or image-only bubble) */}
      <div
        data-user-message-id={userMsgId}
        className={`[&>div]:!mb-4 pointer-events-auto sticky z-10 ${stickyTopClass}`}
      >
        <UserBubbleComponent
          messageId={userMsgId}
          textContent={textContent}
          imageParts={isImageOnlyMessage ? imageParts : []}
          skipTextMentionBlocks={!isImageOnlyMessage}
        />

        {/* Cloning indicator */}
        {shouldShowCloning && (
          <div className="mt-4">
            <ToolCallComponent
              icon={toolRegistry["tool-cloning"]?.icon}
              title={toolRegistry["tool-cloning"]?.title({}) || "Cloning..."}
              isPending={true}
              isError={false}
            />
          </div>
        )}

        {/* Setup error with retry */}
        {shouldShowSetupError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive mb-1">
                  Failed to set up sandbox
                </p>
                {sandboxSetupError && (
                  <p className="text-xs text-destructive/80 mb-3">
                    {sandboxSetupError}
                  </p>
                )}
                {onRetrySetup && (
                  <button
                    className="px-3 py-1.5 text-xs font-medium bg-destructive/20 hover:bg-destructive/30 text-destructive rounded-md transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:ring-offset-2"
                    onClick={onRetrySetup}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Assistant messages - memoized, only re-renders when IDs change */}
      {assistantIds.length > 0 && (
        <MemoizedAssistantMessages
          assistantMsgIds={assistantIds}
          subChatId={subChatId}
          isMobile={isMobile}
          sandboxSetupStatus={sandboxSetupStatus}
        />
      )}

      {/* Planning indicator */}
      {isStreaming &&
        isLastGroup &&
        assistantIds.length === 0 &&
        sandboxSetupStatus === "ready" && (
          <div className="mt-4">
            <ToolCallComponent
              icon={toolRegistry["tool-planning"]?.icon}
              title={toolRegistry["tool-planning"]?.title({}) || "Planning..."}
              isPending={true}
              isError={false}
            />
          </div>
        )}
    </MessageGroupWrapper>
  )
}, areGroupPropsEqual)
