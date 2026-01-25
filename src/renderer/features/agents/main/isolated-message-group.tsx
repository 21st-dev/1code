"use client"

import { memo, useMemo } from "react"
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
  chatId: string
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
    prev.chatId === next.chatId &&
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
  chatId,
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
  // Note: file-content parts are hidden from UI but sent to agent
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
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <span>
                Failed to set up sandbox
                {sandboxSetupError ? `: ${sandboxSetupError}` : ""}
              </span>
              {onRetrySetup && (
                <button
                  className="px-2 py-1 text-sm hover:bg-destructive/20 rounded"
                  onClick={onRetrySetup}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Assistant messages - memoized, only re-renders when IDs change */}
      {assistantIds.length > 0 && (
        <MemoizedAssistantMessages
          assistantMsgIds={assistantIds}
          subChatId={subChatId}
          chatId={chatId}
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
