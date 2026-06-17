/**
 * API bridge for desktop app
 * Wraps real tRPC calls and provides stubs for web-only features
 */

import { useMemo } from "react"
import { normalizePersistedChatMessages } from "../../shared/chat-message-normalizer"
import { trpc } from "./trpc"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>

function toDesktopAgentChat(chat: AnyObj): AnyObj {
  return {
    ...chat,
    sandbox_id: chat.sandbox_id ?? null,
    meta: chat.meta ?? null,
    created_at: chat.created_at ?? chat.createdAt,
    updated_at: chat.updated_at ?? chat.updatedAt,
    archived_at: chat.archived_at ?? chat.archivedAt,
    prUrl: chat.prUrl ?? undefined,
    prNumber: chat.prNumber ?? undefined,
  }
}

export const api = {
  agents: {
    getAgentChats: {
      useQuery: (_args?: AnyObj, _opts?: AnyObj): { data: AnyObj[]; isLoading: boolean } => {
        // Use real tRPC
        const result = trpc.chats.list.useQuery({})
        return {
          data: (result.data ?? []).map((chat: AnyObj) => toDesktopAgentChat(chat)),
          isLoading: result.isLoading,
        }
      },
    },
    getAgentChat: {
      useQuery: (args?: { chatId: string }, opts?: AnyObj): { data: AnyObj | null; isLoading: boolean } => {
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

        // Memoize transformation to prevent infinite re-renders
        const transformedData = useMemo(() => {
          if (!result.data) return null
          return {
            ...toDesktopAgentChat(result.data as AnyObj),
            // Desktop uses worktrees, not sandboxes
            sandbox_id: null,
            meta: null,
            // Map subChats to expected format
            subChats: result.data.subChats?.map((sc: AnyObj) => {
              const parsedMessages = normalizePersistedChatMessages(sc.messages, {
                sourceId: sc.id,
                onParseError: (_error, sourceId) => {
                  console.warn(
                    "[mock-api] Failed to parse messages for subChat:",
                    sourceId,
                  )
                },
              })
              return {
                ...sc,
                created_at: sc.createdAt,
                updated_at: sc.updatedAt,
                messages: parsedMessages,
                stream_id: null,
              }
            }),
          }
        }, [result.data])

        return {
          data: transformedData,
          isLoading: result.isLoading,
        }
      },
    },
    getArchivedChats: {
      useQuery: (_args?: AnyObj, _opts?: AnyObj): { data: AnyObj[]; isLoading: boolean } => {
        const result = trpc.chats.listArchived.useQuery({})
        return {
          data: (result.data ?? []).map((chat: AnyObj) => toDesktopAgentChat(chat)),
          isLoading: result.isLoading,
        }
      },
    },
    archiveChat: {
      useMutation: (opts?: {
        onMutate?: AnyFn
        onError?: AnyFn
        onSettled?: AnyFn
      }) => {
        const mutation = trpc.chats.archive.useMutation({
          onSuccess: () => opts?.onSettled?.(),
          onError: (err) => opts?.onError?.(err),
        })
        return {
          mutate: async (args?: { chatId: string }) => {
            const context = await opts?.onMutate?.(args)
            if (args?.chatId) {
              mutation.mutate({ id: args.chatId })
            }
            return context
          },
          isPending: mutation.isPending,
        }
      },
    },
    restoreChat: {
      useMutation: (opts?: {
        onMutate?: AnyFn
        onError?: AnyFn
        onSettled?: AnyFn
      }) => {
        const mutation = trpc.chats.restore.useMutation({
          onSuccess: () => opts?.onSettled?.(),
          onError: (err) => opts?.onError?.(err),
        })
        return {
          mutate: async (args?: { chatId: string }) => {
            const context = await opts?.onMutate?.(args)
            if (args?.chatId) {
              mutation.mutate({ id: args.chatId })
            }
            return context
          },
          isPending: mutation.isPending,
        }
      },
    },
    renameChat: {
      useMutation: (opts?: { onSuccess?: AnyFn; onError?: AnyFn }) => {
        const mutation = trpc.chats.rename.useMutation({
          onSuccess: (data) => opts?.onSuccess?.(data),
          onError: (err) => opts?.onError?.(err),
        })
        return {
          mutate: (args?: { chatId: string; name: string }) => {
            if (args?.chatId && args?.name) {
              mutation.mutate({ id: args.chatId, name: args.name })
            }
          },
          mutateAsync: async (args?: { chatId: string; name: string }) => {
            if (args?.chatId && args?.name) {
              return mutation.mutateAsync({ id: args.chatId, name: args.name })
            }
          },
        }
      },
    },
    renameSubChat: {
      useMutation: (opts?: {
        onSuccess?: AnyFn
        onError?: AnyFn
        onMutate?: AnyFn
      }) => {
        const mutation = trpc.chats.renameSubChat.useMutation({
          onSuccess: (data) => opts?.onSuccess?.(data),
          onError: (err) => opts?.onError?.(err),
        })
        return {
          mutate: (
            args?: { subChatId: string; name: string },
            callbacks?: { onSuccess?: AnyFn },
          ) => {
            if (args?.subChatId && args?.name) {
              mutation.mutate(
                { id: args.subChatId, name: args.name },
                { onSuccess: callbacks?.onSuccess },
              )
            }
          },
          mutateAsync: async (args?: { subChatId: string; name: string }) => {
            if (args?.subChatId && args?.name) {
              return mutation.mutateAsync({
                id: args.subChatId,
                name: args.name,
              })
            }
          },
          isPending: mutation.isPending,
        }
      },
    },
    generateSubChatName: {
      useMutation: () => {
        const mutation = trpc.chats.generateSubChatName.useMutation()
        return {
          mutateAsync: async (args: { userMessage: string; ollamaModel?: string | null }) => {
            return mutation.mutateAsync({ userMessage: args.userMessage, ollamaModel: args.ollamaModel })
          },
          isPending: mutation.isPending,
        }
      },
    },
    updateSubChatMode: {
      useMutation: (opts?: { onSuccess?: AnyFn; onError?: AnyFn }) => {
        const mutation = trpc.chats.updateSubChatMode.useMutation({
          onSuccess: (data) => opts?.onSuccess?.(data),
          onError: (err) => opts?.onError?.(err),
        })
        return {
          mutate: (args?: { subChatId: string; mode: "plan" | "agent" }) => {
            if (args?.subChatId && args?.mode) {
              mutation.mutate({ id: args.subChatId, mode: args.mode })
            }
          },
          isPending: mutation.isPending,
        }
      },
    },
    // Desktop stubs - not needed for local development
    createAgentPr: {
      useMutation: (opts?: { onSuccess?: AnyFn; onError?: AnyFn }) => ({
        mutate: (_args?: AnyObj, callbacks?: { onSuccess?: AnyFn }) => {
          // Desktop: PR creation not implemented yet
          opts?.onError?.(new Error("PR creation not available in desktop app"))
        },
        mutateAsync: async (_args?: AnyObj) => {
          throw new Error("PR creation not available in desktop app")
        },
        isPending: false,
      }),
    },
    archiveChatsBatch: {
      useMutation: (opts?: { onSuccess?: AnyFn }) => {
        const mutation = trpc.chats.archiveBatch.useMutation({
          onSuccess: () => opts?.onSuccess?.(),
        })
        return {
          mutate: (
            args?: { chatIds: string[] },
            callbacks?: { onSuccess?: AnyFn },
          ) => {
            if (args?.chatIds) {
              mutation.mutate(
                { chatIds: args.chatIds },
                { onSuccess: callbacks?.onSuccess },
              )
            }
          },
          isPending: mutation.isPending,
        }
      },
    },
  },
  useUtils: () => {
    const utils = trpc.useUtils()
    return {
      agents: {
        getAgentChats: {
          cancel: async () => utils.chats.list.cancel(),
          getData: () => utils.chats.list.getData({}),
          setData: (keyOrUpdater?: unknown, updater?: unknown) => {
            // Handle both signatures
            if (typeof keyOrUpdater === "function") {
              utils.chats.list.setData({}, keyOrUpdater as AnyFn)
            } else if (updater) {
              utils.chats.list.setData({}, updater as AnyFn)
            }
          },
          invalidate: async () => utils.chats.list.invalidate(),
        },
        getArchivedChats: {
          cancel: async () => utils.chats.listArchived.cancel(),
          getData: () => utils.chats.listArchived.getData({}),
          setData: (keyOrUpdater?: unknown, updater?: unknown) => {
            if (typeof keyOrUpdater === "function") {
              utils.chats.listArchived.setData({}, keyOrUpdater as AnyFn)
            } else if (updater) {
              utils.chats.listArchived.setData({}, updater as AnyFn)
            }
          },
          invalidate: async () => utils.chats.listArchived.invalidate(),
        },
        getAgentChat: {
          cancel: async () => {},
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
        getSubChats: {
          invalidate: async () => {},
          setData: () => {},
        },
      },
      user: {
        getProfile: {
          invalidate: async () => {},
        },
      },
      stripe: {
        getCheckoutSession: {
          invalidate: async () => {},
        },
        getUserBalance: {
          invalidate: async () => {},
        },
      },
    }
  },
  // Stubs for features not needed in desktop
  repositorySandboxes: {
    getRepositoriesWithStatus: {
      useQuery: () => ({
        data: { repositories: [] },
        isLoading: false,
        refetch: async () => ({ data: { repositories: [] } }),
      }),
    },
  },
  stripe: {
    getUserBalance: { useQuery: () => ({ data: 0, isLoading: false }) },
    createCheckoutSession: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({ url: "" }),
        isPending: false,
      }),
    },
    createBillingPortalSession: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({ url: "" }),
        isPending: false,
      }),
    },
  },
  user: {
    getProfile: { useQuery: () => ({ data: null, isLoading: false }) },
    updateProfile: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
  },
  claudeCode: {
    getClaudeCodeConnection: {
      useQuery: () => ({ data: { isConnected: true }, isLoading: false }),
    },
    connectClaudeCode: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
    disconnectClaudeCode: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
  },
  agentInvites: {
    getOrCreateInviteCode: {
      useQuery: () => ({
        data: { maxUses: 0, usesCount: 0 },
        isLoading: false,
      }),
    },
  },
}
