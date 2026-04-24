import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAtom, useAtomValue } from "jotai"
import { useCallback, useEffect } from "react"
import { selectedTeamIdAtom } from "../atoms"
import { remoteApi, type RemoteChat, type RemoteChatWithSubChats } from "../remote-api"

/**
 * Fetch user's teams and auto-select first team if none selected
 * Uses stale-while-revalidate: show cached immediately, validate in background
 */
export function useUserTeams(enabled: boolean = true) {
  const [teamId, setTeamId] = useAtom(selectedTeamIdAtom)

  const query = useQuery({
    queryKey: ["user-teams"],
    queryFn: () => remoteApi.getTeams(),
    staleTime: 5 * 60 * 1000,   // 5 min - teams rarely change
    gcTime: Infinity,           // Never garbage collect
    refetchOnMount: true,       // Revalidate if stale
    refetchOnWindowFocus: false,
    enabled,
    retry: 1,
  })

  // Auto-select first team OR fix stale teamId
  useEffect(() => {
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
  }, [query.status, query.data, teamId, setTeamId])

  return query
}

/**
 * Fetch all remote sandbox chats for the selected team
 * Uses stale-while-revalidate: show cached immediately, refresh in background
 */
export function useRemoteChats() {
  const teamId = useAtomValue(selectedTeamIdAtom)

  return useQuery({
    queryKey: ["remote-chats", teamId],
    queryFn: () => remoteApi.getAgentChats(teamId!),
    enabled: !!teamId,
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
  return useQuery({
    queryKey: ["remote-chat", chatId],
    queryFn: () => remoteApi.getAgentChat(chatId!),
    enabled: !!chatId,
    staleTime: 60 * 1000,      // 1 minute
    gcTime: 30 * 60 * 1000,    // 30 minutes
  })
}

/**
 * Prefetch a remote chat on hover (for instant loading when clicked)
 */
export function usePrefetchRemoteChat() {
  const queryClient = useQueryClient()

  return useCallback(
    (chatId: string) => {
      queryClient.prefetchQuery({
        queryKey: ["remote-chat", chatId],
        queryFn: () => remoteApi.getAgentChat(chatId),
        staleTime: 60 * 1000,
      })
    },
    [queryClient]
  )
}

/**
 * Fetch archived remote chats for the selected team
 */
export function useRemoteArchivedChats(enabled: boolean = true) {
  const teamId = useAtomValue(selectedTeamIdAtom)

  return useQuery({
    queryKey: ["remote-archived-chats", teamId],
    queryFn: () => remoteApi.getArchivedChats(teamId!),
    enabled: enabled && !!teamId,
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

  return useMutation({
    mutationFn: (chatId: string) => remoteApi.archiveChat(chatId),
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

  return useMutation({
    mutationFn: (chatIds: string[]) => remoteApi.archiveChatsBatch(chatIds),
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

  return useMutation({
    mutationFn: (chatId: string) => remoteApi.restoreChat(chatId),
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

  return useMutation({
    mutationFn: ({ subChatId, name }: { subChatId: string; name: string }) =>
      remoteApi.renameSubChat(subChatId, name),
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

  return useMutation({
    mutationFn: ({ chatId, name }: { chatId: string; name: string }) =>
      remoteApi.renameChat(chatId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remote-chats", teamId] })
      queryClient.invalidateQueries({ queryKey: ["remote-chat"] })
    },
  })
}
