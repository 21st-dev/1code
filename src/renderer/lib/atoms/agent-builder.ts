import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// ============ MODAL STATE ============

/**
 * Controls agent builder modal visibility
 */
export const agentBuilderModalOpenAtom = atom<boolean>(false)

/**
 * Active sub-chat ID for the current agent builder session
 * Each session creates a new sub-chat that persists in the database
 */
export const agentBuilderSubChatIdAtom = atom<string | null>(null)

// ============ AGENT EDITING STATE ============

/**
 * Agent being edited (for modification mode)
 * Set when user right-clicks existing agent -> "Modify Agent"
 */
export const agentBuilderEditingAgentAtom = atom<{
  id: string
  name: string
} | null>(null)

/**
 * Mode: create new agent or modify existing
 */
export const agentBuilderModeAtom = atom<'create' | 'modify'>('create')

// ============ WORKFLOW STATE ============

/**
 * Current phase of the agent building workflow
 * Note: 'review' phase removed - agent files are created automatically during generation
 */
export type AgentBuilderPhase = 'describe' | 'research' | 'generate'
export const agentBuilderPhaseAtom = atom<AgentBuilderPhase>('describe')

/**
 * Draft agent data extracted from conversation
 * Updated automatically as the assistant generates requirements and agent.md
 */
export interface AgentDraft {
  name: string
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  requirements: string[] // Formalized requirements from Phase 2
  researchNotes: string[] // Research findings from Phase 3
  rawMarkdown: string // Full agent.md content for preview
  creationChatId?: string // Chat ID that created this agent (for database relationship)
}

export const agentBuilderDraftAtom = atom<AgentDraft | null>(null)

// ============ PREFERENCES (PERSISTED) ============

/**
 * Agent source: user agents or project agents
 * Persisted across sessions
 */
export const agentBuilderSourceAtom = atomWithStorage<'user' | 'project'>(
  'agent-builder:source',
  'project'
)
