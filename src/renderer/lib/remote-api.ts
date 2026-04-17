/**
 * Legacy remote API wrapper kept only for deferred compatibility paths.
 */
import { remoteTrpc } from "./remote-trpc"

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
    github_repo?: string // Automation-created chats use this field
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
  async getTeams(): Promise<Team[]> {
    const teams = await remoteTrpc.teams.getUserTeams.query()
    return teams.map((t) => ({ id: t.id, name: t.name }))
  },

  async getAgentChats(teamId: string): Promise<RemoteChat[]> {
    const chats = await remoteTrpc.agents.getAgentChats.query({ teamId })
    return chats as RemoteChat[]
  },

  async getAgentChat(chatId: string): Promise<RemoteChatWithSubChats> {
    const chat = await remoteTrpc.agents.getAgentChat.query({ chatId })
    return chat as RemoteChatWithSubChats
  },

  async getArchivedChats(teamId: string): Promise<RemoteChat[]> {
    const chats = await remoteTrpc.agents.getArchivedChats.query({ teamId })
    return chats as RemoteChat[]
  },

  async archiveChat(chatId: string): Promise<void> {
    await remoteTrpc.agents.archiveChat.mutate({ chatId })
  },

  async archiveChatsBatch(chatIds: string[]): Promise<{ archivedCount: number }> {
    return await remoteTrpc.agents.archiveChatsBatch.mutate({ chatIds })
  },

  async restoreChat(chatId: string): Promise<void> {
    await remoteTrpc.agents.restoreChat.mutate({ chatId })
  },

  async renameSubChat(subChatId: string, name: string): Promise<void> {
    await remoteTrpc.agents.renameSubChat.mutate({ subChatId, name })
  },

  async renameChat(chatId: string, name: string): Promise<void> {
    await remoteTrpc.agents.renameChat.mutate({ chatId, name })
  },

  async getSandboxDiff(sandboxId: string): Promise<{ diff: string }> {
    void sandboxId
    throw new Error("OpenCodex local-native mode removed remote sandbox diff fetch.")
  },

  async getSandboxFile(sandboxId: string, path: string): Promise<{ content: string }> {
    void sandboxId
    void path
    throw new Error("OpenCodex local-native mode removed remote sandbox file fetch.")
  },
}
