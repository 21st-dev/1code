import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAtom, useAtomValue } from "jotai"
import { useCallback, useEffect } from "react"
import { LOCAL_ONLY_BLOCKED_MESSAGE } from "../../../shared/local-only"
import { selectedTeamIdAtom } from "../atoms"
import { remoteApi, type RemoteChat, type RemoteChatWithSubChats } from "../remote-api"
import { useLocalOnlyMode } from "./use-local-only-mode"

/**
 * Fetch user's teams and auto-select first team if none selected
 * Uses stale-while-revalidate: show cached immediately, validate in background
 */
export function useUserTeams(enabled: boolean = true) {
  const [teamId, setTeamId] = useAtom(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  const query = useQuery({
    queryKey: ["user-teams"],
    queryFn: () => remoteApi.getTeams(),
    staleTime: 5 * 60 * 1000,   // 5 min - teams rarely change
    gcTime: Infinity,           // Never garbage collect
    refetchOnMount: true,       // Revalidate if stale
    refetchOnWindowFocus: false,
    enabled: enabled && !isLocalOnly,
    retry: 1,
  })

  // Auto-select first team OR fix stale teamId
  useEffect(() => {
    if (isLocalOnly) {
      if (teamId) setTeamId(null)
      return
    }

    // Wait for successful fetch
    if (query.status !== "success" || !query.data) return

    // If user has teams
    if (query.data.length > 0) {
      // If no teamId cached, select first team
      if (!teamId) {
        setTeamId(query.data[0].id)
        return
      }

      // Validate cached teamId exists in current user's teams
      const teamExists = query.data.some((t) => t.id === teamId)
      if (!teamExists) {
        console.log("[useUserTeams] Cached teamId not found, resetting to first team")
        setTeamId(query.data[0].id)
      }
    } else {
      // User has no teams - clear stale teamId
      if (teamId) {
        console.log("[useUserTeams] User has no teams, clearing teamId")
        setTeamId(null)
      }
    }
  }, [isLocalOnly, query.status, query.data, teamId, setTeamId])

  return query
}

/**
 * Fetch all remote sandbox chats for the selected team
 * Uses stale-while-revalidate: show cached immediately, refresh in background
 */
export function useRemoteChats() {
  const teamId = useAtomValue(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  return useQuery({
    queryKey: ["remote-chats", teamId],
    queryFn: () => remoteApi.getAgentChats(teamId!),
    enabled: !!teamId && !isLocalOnly,
    staleTime: 30 * 1000,       // Consider stale after 30s
    gcTime: 30 * 60 * 1000,     // Keep in cache 30 min
    refetchOnMount: true,       // Revalidate on mount
    refetchOnWindowFocus: true, // Revalidate when window focused
    placeholderData: (prev) => prev,
  })
}

/**
 * Fetch a single remote chat with all its sub-chats
 */
export function useRemoteChat(chatId: string | null) {
  const isLocalOnly = useLocalOnlyMode()

  return useQuery({
    queryKey: ["remote-chat", chatId],
    queryFn: () => remoteApi.getAgentChat(chatId!),
    enabled: !!chatId && !isLocalOnly,
    staleTime: 60 * 1000,      // 1 minute
    gcTime: 30 * 60 * 1000,    // 30 minutes
  })
}

/**
 * Prefetch a remote chat on hover (for instant loading when clicked)
 */
export function usePrefetchRemoteChat() {
  const queryClient = useQueryClient()
  const isLocalOnly = useLocalOnlyMode()

  return useCallback(
    (chatId: string) => {
      if (isLocalOnly) return

      queryClient.prefetchQuery({
        queryKey: ["remote-chat", chatId],
        queryFn: () => remoteApi.getAgentChat(chatId),
        staleTime: 60 * 1000,
      })
    },
    [isLocalOnly, queryClient]
  )
}

/**
 * Fetch archived remote chats for the selected team
 */
export function useRemoteArchivedChats() {
  const teamId = useAtomValue(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  return useQuery({
    queryKey: ["remote-archived-chats", teamId],
    queryFn: () => remoteApi.getArchivedChats(teamId!),
    enabled: !!teamId && !isLocalOnly,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}

/**
 * Archive a remote chat
 */
export function useArchiveRemoteChat() {
  const queryClient = useQueryClient()
  const teamId = useAtomValue(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  return useMutation({
    mutationFn: (chatId: string) => {
      if (isLocalOnly) throw new Error(LOCAL_ONLY_BLOCKED_MESSAGE)
      return remoteApi.archiveChat(chatId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remote-chats", teamId] })
      queryClient.invalidateQueries({ queryKey: ["remote-archived-chats", teamId] })
    },
  })
}

/**
 * Archive multiple remote chats at once
 */
export function useArchiveRemoteChatsBatch() {
  const queryClient = useQueryClient()
  const teamId = useAtomValue(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  return useMutation({
    mutationFn: (chatIds: string[]) => {
      if (isLocalOnly) throw new Error(LOCAL_ONLY_BLOCKED_MESSAGE)
      return remoteApi.archiveChatsBatch(chatIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remote-chats", teamId] })
      queryClient.invalidateQueries({ queryKey: ["remote-archived-chats", teamId] })
    },
  })
}

/**
 * Restore a remote chat from archive
 */
export function useRestoreRemoteChat() {
  const queryClient = useQueryClient()
  const teamId = useAtomValue(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  return useMutation({
    mutationFn: (chatId: string) => {
      if (isLocalOnly) throw new Error(LOCAL_ONLY_BLOCKED_MESSAGE)
      return remoteApi.restoreChat(chatId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remote-chats", teamId] })
      queryClient.invalidateQueries({ queryKey: ["remote-archived-chats", teamId] })
    },
  })
}

/**
 * Rename a remote sub-chat
 */
export function useRenameRemoteSubChat() {
  const queryClient = useQueryClient()
  const isLocalOnly = useLocalOnlyMode()

  return useMutation({
    mutationFn: ({ subChatId, name }: { subChatId: string; name: string }) => {
      if (isLocalOnly) throw new Error(LOCAL_ONLY_BLOCKED_MESSAGE)
      return remoteApi.renameSubChat(subChatId, name)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remote-chat"] })
    },
  })
}

/**
 * Rename a remote chat (workspace)
 */
export function useRenameRemoteChat() {
  const queryClient = useQueryClient()
  const teamId = useAtomValue(selectedTeamIdAtom)
  const isLocalOnly = useLocalOnlyMode()

  return useMutation({
    mutationFn: ({ chatId, name }: { chatId: string; name: string }) => {
      if (isLocalOnly) throw new Error(LOCAL_ONLY_BLOCKED_MESSAGE)
      return remoteApi.renameChat(chatId, name)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remote-chats", teamId] })
      queryClient.invalidateQueries({ queryKey: ["remote-chat"] })
    },
  })
}
