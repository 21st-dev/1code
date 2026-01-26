/**
 * Remote API - wrapper around tRPC client for web backend
 * Provides clean interface for fetching remote sandbox data
 */
import { remoteTrpc } from "./remote-trpc"

// Remote tRPC client uses dynamic backend routes; cast to any to avoid strict typing errors
const remoteTrpcAny = remoteTrpc as any

// API base URL - dynamically fetched from main process
let API_BASE: string | null = null

async function getApiBase(): Promise<string> {
  if (!API_BASE) {
    API_BASE = await window.desktopApi?.getApiBaseUrl() || "https://21st.dev"
  }
  return API_BASE
}

// Re-export types for convenience
export type Team = {
  id: string
  name: string
  slug?: string
}

export type RemoteChat = {
  id: string
  name: string
  sandbox_id: string | null
  meta: {
    repository?: string
    branch?: string | null
    originalSandboxId?: string | null
    isQuickSetup?: boolean
    isPublicImport?: boolean
  } | null
  created_at: string
  updated_at: string
  stats: { fileCount: number; additions: number; deletions: number } | null
}

export type RemoteSubChat = {
  id: string
  name: string
  mode: string
  messages: unknown[]
  stream_id: string | null
  created_at: string
  updated_at: string
}

export type RemoteChatWithSubChats = RemoteChat & {
  subChats: RemoteSubChat[]
}

export const remoteApi = {
  /**
   * Fetch user's teams (same as web)
   */
  async getTeams(): Promise<Team[]> {
    const teams = await remoteTrpcAny.teams.getUserTeams.query()
    return teams.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))
  },

  /**
   * Fetch all agent chats for a team (same as web)
   */
  async getAgentChats(teamId: string): Promise<RemoteChat[]> {
    const chats = await remoteTrpcAny.agents.getAgentChats.query({ teamId })
    return chats as RemoteChat[]
  },

  /**
   * Fetch a single agent chat with all sub-chats (same as web)
   */
  async getAgentChat(chatId: string): Promise<RemoteChatWithSubChats> {
    const chat = await remoteTrpcAny.agents.getAgentChat.query({ chatId })
    return chat as RemoteChatWithSubChats
  },

  /**
   * Fetch archived chats for a team (same as web)
   */
  async getArchivedChats(teamId: string): Promise<RemoteChat[]> {
    const chats = await remoteTrpcAny.agents.getArchivedChats.query({ teamId })
    return chats as RemoteChat[]
  },

  /**
   * Archive a chat
   */
  async archiveChat(chatId: string): Promise<void> {
    await remoteTrpcAny.agents.archiveChat.mutate({ chatId })
  },

  /**
   * Archive multiple chats at once
   */
  async archiveChatsBatch(chatIds: string[]): Promise<{ archivedCount: number }> {
    return await remoteTrpcAny.agents.archiveChatsBatch.mutate({ chatIds })
  },

  /**
   * Restore a chat from archive
   */
  async restoreChat(chatId: string): Promise<void> {
    await remoteTrpcAny.agents.restoreChat.mutate({ chatId })
  },

  /**
   * Rename a sub-chat
   */
  async renameSubChat(subChatId: string, name: string): Promise<void> {
    await remoteTrpcAny.agents.renameSubChat.mutate({ subChatId, name })
  },

  /**
   * Rename a chat (workspace)
   */
  async renameChat(chatId: string, name: string): Promise<void> {
    await remoteTrpcAny.agents.renameChat.mutate({ chatId, name })
  },

  /**
   * Get diff from a sandbox (via REST endpoint with signedFetch)
   */
  async getSandboxDiff(sandboxId: string): Promise<{ diff: string }> {
    if (!window.desktopApi?.signedFetch) {
      throw new Error("Desktop API not available")
    }
    const apiBase = await getApiBase()
    const result = await window.desktopApi.signedFetch(
      `${apiBase}/api/agents/sandbox/${sandboxId}/diff`
    )
    if (!result.ok) {
      throw new Error(result.error || `Failed to fetch diff: ${result.status}`)
    }
    return result.data as { diff: string }
  },

  /**
   * Get file content from a sandbox (via REST endpoint with signedFetch)
   */
  async getSandboxFile(sandboxId: string, path: string): Promise<{ content: string }> {
    if (!window.desktopApi?.signedFetch) {
      throw new Error("Desktop API not available")
    }
    const apiBase = await getApiBase()
    const result = await window.desktopApi.signedFetch(
      `${apiBase}/api/agents/sandbox/${sandboxId}/files?path=${encodeURIComponent(path)}`
    )
    if (!result.ok) {
      throw new Error(result.error || `Failed to fetch file: ${result.status}`)
    }
    return result.data as { content: string }
  },
}
