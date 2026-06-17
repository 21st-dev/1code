import { useMemo } from "react"
import type { CanonicalChatMessage } from "../../../../shared/chat-message"
import { normalizePersistedChatMessages } from "../../../../shared/chat-message-normalizer"
import { trpc } from "../../../lib/trpc"

type AnyFn = (...args: any[]) => any
type AnyObj = Record<string, any>

export type DesktopAgentSubChat = AnyObj & {
  id: string
  name?: string | null
  mode?: "plan" | "agent" | null
  created_at?: string | Date | null
  updated_at?: string | Date | null
  messages: CanonicalChatMessage[]
  stream_id: string | null
}

export type DesktopAgentChat = AnyObj & {
  id: string
  sandbox_id: null
  meta: null
  created_at: string | Date
  updated_at: string | Date
  archived_at?: string | Date | null
  prUrl?: string | null
  prNumber?: number | null
  subChats?: DesktopAgentSubChat[]
}

function toDesktopAgentChat(chat: AnyObj): DesktopAgentChat {
  return {
    ...chat,
    id: String(chat.id),
    sandbox_id: null,
    meta: null,
    created_at: chat.created_at ?? chat.createdAt ?? new Date(0).toISOString(),
    updated_at: chat.updated_at ?? chat.updatedAt ?? new Date(0).toISOString(),
    archived_at: chat.archived_at ?? chat.archivedAt,
    prUrl: chat.prUrl ?? undefined,
    prNumber: chat.prNumber ?? undefined,
  }
}

function toDesktopAgentSubChat(sc: AnyObj): DesktopAgentSubChat {
  return {
    ...sc,
    id: String(sc.id),
    created_at: sc.created_at ?? sc.createdAt,
    updated_at: sc.updated_at ?? sc.updatedAt,
    messages: normalizePersistedChatMessages(sc.messages, {
      sourceId: sc.id,
      onParseError: (_error, sourceId) => {
        console.warn(
          "[agent-chat-api] Failed to parse messages for subChat:",
          sourceId,
        )
      },
    }),
    stream_id: sc.stream_id ?? null,
  }
}

function toDesktopAgentChatWithSubChats(chat: AnyObj): DesktopAgentChat {
  return {
    ...toDesktopAgentChat(chat),
    subChats: Array.isArray(chat.subChats)
      ? chat.subChats.map((subChat: AnyObj) => toDesktopAgentSubChat(subChat))
      : [],
  }
}

function useAgentChats(
  _args?: AnyObj,
  _opts?: AnyObj,
): { data: DesktopAgentChat[]; isLoading: boolean } {
  const result = trpc.chats.list.useQuery({})
  const data = useMemo(
    () => (result.data ?? []).map((chat: AnyObj) => toDesktopAgentChat(chat)),
    [result.data],
  )
  return { data, isLoading: result.isLoading }
}

function useAgentChat(
  args?: { chatId: string },
  opts?: AnyObj,
): { data: DesktopAgentChat | null; isLoading: boolean } {
  const chatId = args?.chatId
  const result = trpc.chats.get.useQuery(
    { id: chatId! },
    {
      ...(opts ?? {}),
      enabled: !!chatId && opts?.enabled !== false,
      staleTime: opts?.staleTime ?? 0,
      gcTime: opts?.gcTime ?? 30_000,
    },
  )
  const data = useMemo(
    () => (result.data ? toDesktopAgentChatWithSubChats(result.data as AnyObj) : null),
    [result.data],
  )
  return { data, isLoading: result.isLoading }
}

function useRenameChatMutation(opts?: { onSuccess?: AnyFn; onError?: AnyFn }) {
  const mutation = trpc.chats.rename.useMutation({
    onSuccess: (data, variables, context) =>
      opts?.onSuccess?.(
        data,
        { chatId: variables.id, name: variables.name },
        context,
      ),
    onError: (error, variables, context) =>
      opts?.onError?.(
        error,
        { chatId: variables.id, name: variables.name },
        context,
      ),
  })
  return {
    mutate: (
      args?: { chatId: string; name: string },
      callbacks?: { onSuccess?: AnyFn },
    ) => {
      if (!args?.chatId || !args?.name) return
      mutation.mutate(
        { id: args.chatId, name: args.name },
        {
          onSuccess: (data, variables, context) =>
            callbacks?.onSuccess?.(
              data,
              { chatId: variables.id, name: variables.name },
              context,
            ),
        },
      )
    },
    mutateAsync: async (args?: { chatId: string; name: string }) => {
      if (!args?.chatId || !args?.name) return undefined
      return mutation.mutateAsync({ id: args.chatId, name: args.name })
    },
    isPending: mutation.isPending,
  }
}

function useRenameSubChatMutation(opts?: {
  onSuccess?: AnyFn
  onError?: AnyFn
  onMutate?: AnyFn
}) {
  const mutation = trpc.chats.renameSubChat.useMutation({
    onSuccess: (data, variables, context) =>
      opts?.onSuccess?.(
        data,
        { subChatId: variables.id, name: variables.name },
        context,
      ),
    onError: (error, variables, context) =>
      opts?.onError?.(
        error,
        { subChatId: variables.id, name: variables.name },
        context,
      ),
  })
  return {
    mutate: (
      args?: { subChatId: string; name: string },
      callbacks?: { onSuccess?: AnyFn },
    ) => {
      if (!args?.subChatId || !args?.name) return
      mutation.mutate(
        { id: args.subChatId, name: args.name },
        {
          onSuccess: (data, variables, context) =>
            callbacks?.onSuccess?.(
              data,
              { subChatId: variables.id, name: variables.name },
              context,
            ),
        },
      )
    },
    mutateAsync: async (args?: { subChatId: string; name: string }) => {
      if (!args?.subChatId || !args?.name) return undefined
      return mutation.mutateAsync({ id: args.subChatId, name: args.name })
    },
    isPending: mutation.isPending,
  }
}

function useGenerateSubChatNameMutation() {
  const mutation = trpc.chats.generateSubChatName.useMutation()
  return {
    mutateAsync: async (args: {
      userMessage: string
      ollamaModel?: string | null
    }) =>
      mutation.mutateAsync({
        userMessage: args.userMessage,
        ollamaModel: args.ollamaModel,
      }),
    isPending: mutation.isPending,
  }
}

function useUpdateSubChatModeMutation(opts?: {
  onSuccess?: AnyFn
  onError?: AnyFn
}) {
  const mutation = trpc.chats.updateSubChatMode.useMutation({
    onSuccess: (data, variables, context) =>
      opts?.onSuccess?.(
        data,
        { subChatId: variables.id, mode: variables.mode },
        context,
      ),
    onError: (error, variables, context) =>
      opts?.onError?.(
        error,
        { subChatId: variables.id, mode: variables.mode },
        context,
      ),
  })
  return {
    mutate: (args?: { subChatId: string; mode: "plan" | "agent" }) => {
      if (!args?.subChatId || !args?.mode) return
      mutation.mutate({ id: args.subChatId, mode: args.mode })
    },
    isPending: mutation.isPending,
  }
}

function useAgentChatUtils() {
  const utils = trpc.useUtils()
  return {
    agents: {
      getAgentChats: {
        cancel: async () => utils.chats.list.cancel(),
        getData: () => utils.chats.list.getData({}),
        setData: (keyOrUpdater?: unknown, updater?: unknown) => {
          if (typeof keyOrUpdater === "function") {
            utils.chats.list.setData({}, keyOrUpdater as AnyFn)
          } else if (updater) {
            utils.chats.list.setData({}, updater as AnyFn)
          }
        },
        invalidate: async () => utils.chats.list.invalidate(),
      },
      getAgentChat: {
        cancel: async (args?: { chatId: string }) => {
          if (args?.chatId) await utils.chats.get.cancel({ id: args.chatId })
        },
        getData: (args?: { chatId: string }) => {
          if (!args?.chatId) return null
          return utils.chats.get.getData({ id: args.chatId })
        },
        setData: (args?: { chatId: string }, updater?: AnyFn) => {
          if (args?.chatId && updater) {
            utils.chats.get.setData({ id: args.chatId }, updater)
          }
        },
        invalidate: async (args?: { chatId: string }) => {
          if (args?.chatId) {
            await utils.chats.get.invalidate({ id: args.chatId })
          }
        },
      },
    },
  }
}

export const agentChatApi = {
  agents: {
    getAgentChats: { useQuery: useAgentChats },
    getAgentChat: { useQuery: useAgentChat },
    renameChat: { useMutation: useRenameChatMutation },
    renameSubChat: { useMutation: useRenameSubChatMutation },
    generateSubChatName: { useMutation: useGenerateSubChatNameMutation },
    updateSubChatMode: { useMutation: useUpdateSubChatModeMutation },
  },
  useUtils: useAgentChatUtils,
}
