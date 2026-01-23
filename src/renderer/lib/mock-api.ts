/**
 * API bridge for desktop app
 * Wraps real tRPC calls and provides stubs for web-only features
 */

import { useMemo } from "react"
import { trpc, trpcClient } from "./trpc"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>

export const api = {
  agents: {
    getAgentChats: {
      useQuery: (_args?: AnyObj, _opts?: AnyObj) => {
        // Use real tRPC
        const result = trpc.chats.list.useQuery({})
        return {
          data: result.data ?? [],
          isLoading: result.isLoading,
        }
      },
    },
    getAgentChat: {
      useQuery: (args?: { chatId: string }, opts?: AnyObj) => {
        const chatId = args?.chatId
        const result = trpc.chats.get.useQuery(
          { id: chatId! },
          { enabled: !!chatId && opts?.enabled !== false },
        )

        // Memoize transformation to prevent infinite re-renders
        const transformedData = useMemo(() => {
          if (!result.data) return null
          return {
            ...result.data,
            // Desktop uses worktrees, not sandboxes
            sandbox_id: null,
            meta: null,
            // Map subChats to expected format
            subChats: result.data.subChats?.map((sc: AnyObj) => {
              let parsedMessages = []
              try {
                parsedMessages = sc.messages ? JSON.parse(sc.messages) : []
                // Transform old tool-invocation parts to new tool-{toolName} format
                parsedMessages = parsedMessages.map((msg: AnyObj) => {
                  if (!msg.parts) return msg
                  return {
                    ...msg,
                    parts: msg.parts.map((part: AnyObj) => {
                      // Migrate old "tool-invocation" type to "tool-{toolName}"
                      if (part.type === "tool-invocation" && part.toolName) {
                        return {
                          ...part,
                          type: `tool-${part.toolName}`,
                          toolCallId: part.toolCallId || part.toolInvocationId,
                          input: part.input || part.args,
                        }
                      }
                      // Normalize state field from DB format to AI SDK format
                      // DB stores: "result", "call" -> AI SDK expects: "output-available", "call"
                      if (part.type?.startsWith("tool-") && part.state) {
                        let normalizedState = part.state
                        if (part.state === "result") {
                          // Check if it was an error result
                          normalizedState =
                            part.result?.success === false
                              ? "output-error"
                              : "output-available"
                        }
                        // Also add output field from result if present (for diff display)
                        return {
                          ...part,
                          state: normalizedState,
                          output: part.output || part.result,
                        }
                      }
                      return part
                    }),
                  }
                })
              } catch {
                console.warn(
                  "[mock-api] Failed to parse messages for subChat:",
                  sc.id,
                )
                parsedMessages = []
              }
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
      useQuery: (_args?: AnyObj, _opts?: AnyObj) => {
        const result = trpc.chats.listArchived.useQuery({})
        return {
          data: result.data ?? [],
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
  usage: {
    getUserUsage: {
      useQuery: (_args?: AnyObj, _opts?: AnyObj) => ({
        // Desktop: no usage limits
        data: {
          usage: 0,
          limit: Infinity,
          planType: "desktop" as const,
          next_payment_at: null,
        },
        isLoading: false,
      }),
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
      github: {
        getSlashCommandContent: {
          fetch: async (_args?: AnyObj) => ({ content: "" }),
        },
        searchFiles: {
          cancel: async () => utils.files.search.cancel(),
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
  teams: {
    getUserTeams: { useQuery: () => ({ data: [], isLoading: false }) },
    getTeam: { useQuery: () => ({ data: null, isLoading: false }) },
    updateTeam: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
  },
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
  github: {
    getBranches: {
      useQuery: () => ({
        data: { branches: [] },
        isLoading: false,
        refetch: async () => ({ data: { branches: [] } }),
      }),
    },
    searchFiles: {
      useQuery: (
        args?: {
          teamId?: string
          repository?: string
          query?: string
          limit?: number
          sandboxId?: string
          branch?: string
          projectPath?: string
        },
        opts?: AnyObj,
      ) => {
        // Use real tRPC to search local files
        const result = trpc.files.search.useQuery(
          {
            projectPath: args?.projectPath || "",
            query: args?.query || "",
            limit: args?.limit || 50,
          },
          {
            enabled: !!args?.projectPath && opts?.enabled !== false,
            staleTime: opts?.staleTime ?? 5000,
            refetchOnWindowFocus: opts?.refetchOnWindowFocus ?? false,
            placeholderData: opts?.placeholderData,
          },
        )
        return {
          data: result.data ?? [],
          isLoading: result.isLoading,
          isFetching: result.isFetching,
          error: result.error,
        }
      },
    },
    getSlashCommands: { useQuery: () => ({ data: [], isLoading: false }) },
    getUserInstallations: { useQuery: () => ({ data: [], isLoading: false }) },
    getGithubConnection: {
      useQuery: () => ({ data: { isConnected: false }, isLoading: false }),
    },
    connectGithub: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
    disconnectGithub: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({}),
        isPending: false,
      }),
    },
    createBranch: {
      useMutation: () => ({
        mutate: () => {},
        mutateAsync: async () => ({ branch: "" }),
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
