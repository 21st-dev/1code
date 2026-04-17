import { ACPChatTransport } from "./acp-chat-transport"
import { IPCChatTransport } from "./ipc-chat-transport"
import { RemoteChatTransport } from "./remote-chat-transport"

type OpenCodexLocalProvider = "claude-code" | "codex"

type OpenCodexChatTransportMode = "plan" | "agent"

type CreateOpenCodexChatTransportParams = {
  chatId: string
  subChatId: string
  subChatName: string
  mode: OpenCodexChatTransportMode
  provider: OpenCodexLocalProvider
  worktreePath?: string | null
  projectPath?: string
  sandboxUrl?: string | null
  isRemoteChat: boolean
  remoteModel?: string
}

export type OpenCodexChatTransport =
  | ACPChatTransport
  | IPCChatTransport
  | RemoteChatTransport

export function createOpenCodexChatTransport(
  params: CreateOpenCodexChatTransportParams,
): OpenCodexChatTransport | null {
  if (params.isRemoteChat && params.sandboxUrl) {
    return new RemoteChatTransport({
      chatId: params.chatId,
      subChatId: params.subChatId,
      subChatName: params.subChatName,
      sandboxUrl: params.sandboxUrl,
      mode: params.mode,
      model: params.remoteModel,
    })
  }

  if (!params.worktreePath) {
    return null
  }

  if (params.provider === "codex") {
    return new ACPChatTransport({
      chatId: params.chatId,
      subChatId: params.subChatId,
      cwd: params.worktreePath,
      projectPath: params.projectPath,
      mode: params.mode,
      provider: "codex",
    })
  }

  return new IPCChatTransport({
    chatId: params.chatId,
    subChatId: params.subChatId,
    cwd: params.worktreePath,
    projectPath: params.projectPath,
    mode: params.mode,
  })
}
