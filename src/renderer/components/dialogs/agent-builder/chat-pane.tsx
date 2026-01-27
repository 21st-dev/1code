import { useCallback, useLayoutEffect, useRef, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAgentBuilderChat } from './hooks/use-agent-builder-chat'
import { syncMessagesWithStatusAtom } from '@/features/agents/stores/message-store'
import { IsolatedMessagesSection } from '@/features/agents/main/isolated-messages-section'
import { AgentUserMessageBubble } from '@/features/agents/ui/agent-user-message-bubble'
import { AgentToolCall } from '@/features/agents/ui/agent-tool-call'
import { AgentToolRegistry } from '@/features/agents/ui/agent-tool-registry'
import { ChatInputArea } from '@/features/agents/main/chat-input-area'
import { isPlanModeAtom } from '@/features/agents/atoms'

/**
 * Agent Builder Chat Pane
 *
 * Left pane of agent builder modal.
 * Reuses existing IsolatedMessagesSection for consistent UI and all streaming features.
 *
 * Features inherited from existing chat:
 * - Streaming text deltas
 * - Tool execution display
 * - Extended thinking UI
 * - Error handling
 * - Message rendering with markdown
 */

// Message group wrapper component
function MessageGroup({ children }: { children: React.ReactNode; isLastGroup?: boolean }) {
  return <div className="space-y-4">{children}</div>
}

export function AgentBuilderChatPane() {
  const {
    messages,
    sendMessage,
    isLoading,
    chat,
    isReady,
    stop,
    editorRef,
    subChatId,
    parentChatId,
  } = useAgentBuilderChat()

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Force agent mode in agent builder (never plan mode)
  const setIsPlanMode = useSetAtom(isPlanModeAtom)

  useEffect(() => {
    // Ensure we're always in agent mode when agent builder is mounted
    console.log('[AgentBuilder] Setting mode to agent (false)')
    setIsPlanMode(false)
  }, [setIsPlanMode])

  // Get status string for message sync
  const status = isLoading ? 'streaming' : 'ready'

  // Sync messages to global atoms (like active-chat does)
  const syncMessages = useSetAtom(syncMessagesWithStatusAtom)

  useLayoutEffect(() => {
    if (!isReady || !subChatId) return
    syncMessages({ messages, status, subChatId })
  }, [messages, status, subChatId, syncMessages, isReady])

  // Send handler for ChatInputArea
  const handleSend = useCallback(() => {
    const content = editorRef.current?.getValue?.() || ''
    console.log('[AgentBuilder] handleSend called, content:', content)
    if (!content.trim()) {
      console.log('[AgentBuilder] Content is empty, returning')
      return
    }
    console.log('[AgentBuilder] Sending message:', content)
    sendMessage(content)
    editorRef.current?.clear?.()
  }, [sendMessage, editorRef])

  // Stop handler
  const handleStop = useCallback(async () => {
    stop?.()
  }, [stop])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b">
        <h3 className="font-semibold">Agent Builder Assistant</h3>
        <p className="text-xs text-muted-foreground">
          Describe what you want your agent to do
        </p>
      </div>

      {/* Messages - REUSE EXISTING COMPONENT */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          {isReady && chat ? (
            <div className="p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <h3 className="text-lg font-semibold mb-2">Welcome to Agent Builder</h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-4">
                    Describe what you want your agent to do, and I'll help you create a custom Claude Code agent with the right tools, permissions, and instructions.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Start by typing in the input below
                  </p>
                </div>
              ) : (
                <IsolatedMessagesSection
                  key={subChatId}
                  subChatId={subChatId}
                  isMobile={false}
                  sandboxSetupStatus="ready"
                  stickyTopClass=""
                  UserBubbleComponent={AgentUserMessageBubble}
                  ToolCallComponent={AgentToolCall}
                  MessageGroupWrapper={MessageGroup}
                  toolRegistry={AgentToolRegistry}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Initializing chat...</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Input - Reuse ChatInputArea for all behaviors */}
      <div className="flex-shrink-0 border-t bg-background">
        <ChatInputArea
          editorRef={editorRef}
          fileInputRef={fileInputRef}
          onSend={handleSend}
          onForceSend={handleSend}
          onStop={handleStop}
          onApprovePlan={() => {}}
          onCompact={() => {}}
          isStreaming={isLoading}
          hasUnapprovedPlan={false}
          isCompacting={false}
          images={[]}
          files={[]}
          onAddAttachments={() => {}}
          onRemoveImage={() => {}}
          onRemoveFile={() => {}}
          isUploading={false}
          textContexts={[]}
          onRemoveTextContext={() => {}}
          messageTokenData={{ totalTokens: 0, conversationTokens: 0, systemPromptTokens: 0 }}
          subChatId={subChatId || ''}
          parentChatId={parentChatId}
          changedFiles={[]}
          hideModeToggle={true}
        />
      </div>
    </div>
  )
}
