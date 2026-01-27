import { useAtom } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chat } from '@ai-sdk/react'
import { useChat } from '@ai-sdk/react'
import type { AgentsMentionsEditorHandle } from '@/features/agents/mentions'
import {
  agentBuilderSubChatIdAtom,
  agentBuilderEditingAgentAtom,
  agentBuilderDraftAtom,
  agentBuilderPhaseAtom,
  agentBuilderSourceAtom,
  agentBuilderModeAtom,
  agentBuilderModalOpenAtom,
  selectedProjectAtom,
} from '@/lib/atoms'
import { trpcClient } from '@/lib/trpc'
import { InternalAgentPrompts } from '@/lib/internal-agent-prompts'
import { IPCChatTransport } from '@/features/agents/lib/ipc-chat-transport'
import { agentChatStore } from '@/features/agents/stores/agent-chat-store'
import { createId } from '@/features/agents/lib/create-id'
import { AgentBuilderResponseParser } from '@/lib/agent-builder/response-parser'

/**
 * Agent Builder Chat Hook
 *
 * Fully reuses existing chat infrastructure (IPCChatTransport, useChat, MessagesList)
 * to provide streaming chat with the agent builder assistant.
 *
 * Key features:
 * - Creates isolated Chat instance with agent builder system prompt
 * - Streams responses via existing tRPC claude.chat subscription
 * - Parses assistant responses to extract draft updates
 * - Tracks phase transitions (describe -> research -> generate)
 * - Agent files are created automatically by assistant using Write tool (no approval needed)
 */
export function useAgentBuilderChat() {
  const [subChatId, setSubChatId] = useAtom(agentBuilderSubChatIdAtom)
  const [editingAgent] = useAtom(agentBuilderEditingAgentAtom)
  const [draft, setDraft] = useAtom(agentBuilderDraftAtom)
  const [phase, setPhase] = useAtom(agentBuilderPhaseAtom)
  const [source] = useAtom(agentBuilderSourceAtom)
  const [mode] = useAtom(agentBuilderModeAtom)
  const [isOpen, setIsOpen] = useAtom(agentBuilderModalOpenAtom)

  const [chat, setChat] = useState<Chat<any> | null>(null)
  const [parentChatId] = useState('agent-builder-workspace')
  const [selectedProject] = useAtom(selectedProjectAtom)

  // Ref for ChatInputArea editor
  const editorRef = useRef<AgentsMentionsEditorHandle>(null)

  // Initialize chat when modal opens
  useEffect(() => {
    // Require a selected project to work with
    if (!isOpen || !selectedProject) return

    // If already initialized, skip
    if (subChatId && chat) return

    const initChat = async () => {
      // Generate new sub-chat ID
      const newSubChatId = createId()

      // Inject subChatId into system prompt for tracking which chat created the agent
      const systemPromptWithChatId = InternalAgentPrompts.AGENT_CREATION_PROTOCOL.replace(
        /\{subChatId\}/g,
        newSubChatId
      )

      // Create IPCChatTransport (reuses existing infrastructure)
      const transport = new IPCChatTransport({
        chatId: parentChatId,
        subChatId: newSubChatId,
        cwd: selectedProject.path,
        projectPath: selectedProject.path,
        mode: 'agent', // Use 'agent' mode for full permissions
        model: 'claude-sonnet-4-5', // TODO: Read from settings
        systemPrompt: systemPromptWithChatId,
      })

      // Create Chat instance (reuses AI SDK integration)
      const newChat = new Chat<any>({
        transport,
        messages: [], // Start with empty messages (system prompt injected via backend)
        sessionId: undefined, // Fresh session
      })

      // Store chat instance (reuses existing pattern)
      agentChatStore.set(newSubChatId, newChat, parentChatId)

      setSubChatId(newSubChatId)
      setChat(newChat)
    }

    initChat()
  }, [isOpen, selectedProject, mode, subChatId, chat])

  // Build useChat options conditionally
  // Only include 'chat' parameter when we have a real chat instance
  const useChatOptions = useMemo(() => {
    const options: any = {
      id: subChatId || '',
      resume: false, // Always start fresh for agent builder
      experimental_throttle: 50,
    }

    // Only add chat parameter if we have a real chat instance
    if (chat) {
      options.chat = chat
    }

    return options
  }, [chat, subChatId])

  // Use existing useChat hook for all chat functionality
  // Always call this hook to maintain consistent hook order
  const {
    messages,
    sendMessage: sendChatMessage,
    status,
    stop,
  } = useChat(useChatOptions)

  // Check if we're ready (have real chat and subChatId)
  const isReady = !!(chat && subChatId)

  // Wrap sendMessage to handle potential errors
  const sendMessage = useCallback(
    async (content: string) => {
      if (!chat || !subChatId) return

      try {
        // Send message using existing infrastructure
        // Note: sendChatMessage expects an object with 'text' property
        await sendChatMessage({ text: content })
        // Note: Draft parsing happens in effect that watches messages
      } catch (error) {
        console.error('[AgentBuilder] Send message error:', error)
      }
    },
    [chat, subChatId, sendChatMessage]
  )

  // Watch for new assistant messages and parse for draft updates
  useEffect(() => {
    if (messages.length === 0) return

    const lastMessage = messages[messages.length - 1]
    console.log('[AgentBuilder Hook] Message received, role:', lastMessage.role, 'has content:', !!lastMessage.content)

    if (lastMessage.role !== 'assistant') return
    if (!lastMessage.content) return

    // Ensure content is a string before parsing
    let content: string
    if (typeof lastMessage.content === 'string') {
      content = lastMessage.content
    } else if (Array.isArray(lastMessage.content)) {
      // Handle array of content blocks (from streaming)
      content = lastMessage.content
        .map(block => {
          if (typeof block === 'string') return block
          if (block && typeof block === 'object' && 'text' in block) return block.text
          return JSON.stringify(block)
        })
        .join('')
    } else {
      content = JSON.stringify(lastMessage.content)
    }

    console.log('[AgentBuilder Hook] Processing content, length:', content.length)

    // Parse response for draft updates using response parser
    const parsed = AgentBuilderResponseParser.parse(content, draft)

    console.log('[AgentBuilder Hook] Parse result:', {
      hasDraft: !!parsed.draft,
      hasPhase: !!parsed.phase,
      phase: parsed.phase,
      draftName: parsed.draft?.name,
    })

    if (parsed.draft) {
      console.log('[AgentBuilder Hook] Setting draft:', parsed.draft)
      setDraft(parsed.draft)
    }
    if (parsed.phase) {
      console.log('[AgentBuilder Hook] Setting phase:', parsed.phase)
      setPhase(parsed.phase)
    }
  }, [messages, draft, setDraft, setPhase])

  return {
    messages: isReady ? messages : [],
    sendMessage,
    isLoading: status === 'streaming',
    chat,
    stop,
    isReady,
    editorRef,
    subChatId,
    parentChatId,
  }
}
