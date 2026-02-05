import { useCallback } from "react"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { useSetAtom } from "jotai"
import { selectedAgentChatIdAtom, desktopViewAtom } from "../atoms"
import { chatSourceModeAtom } from "../../../lib/atoms"
import type { RemoteChat } from "../../../lib/remote-api"

interface Project {
  id: string
  name: string
  path: string
  gitOwner: string | null
  gitRepo: string | null
}

export function useAutoImport() {
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setChatSourceMode = useSetAtom(chatSourceModeAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const utils = trpc.useUtils()

  const importMutation = trpc.sandboxImport.importSandboxChat.useMutation({
    onSuccess: (result) => {
      toast.success("Opened locally")

      // Invalidate list queries so sidebar updates
      utils.chats.list.invalidate()
      utils.projects.list.invalidate()

      // Switch to local chat view — let the normal architecture load the chat
      setChatSourceMode("local")
      setSelectedChatId(result.chatId)
      setDesktopView(null)
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`)
    },
  })

  const getMatchingProjects = useCallback(
    (projects: Project[], remoteChat: RemoteChat): Project[] => {
      console.log(`[OPEN-LOCALLY-MATCH] ========== MATCHING DEBUG ==========`)
      console.log(`[OPEN-LOCALLY-MATCH] Remote chat:`, {
        id: remoteChat.id,
        name: remoteChat.name,
        meta: remoteChat.meta,
      })

      if (!remoteChat.meta?.repository) {
        console.log(`[OPEN-LOCALLY-MATCH] No repository in meta, returning []`)
        return []
      }

      const [owner, repo] = remoteChat.meta.repository.split("/")
      console.log(`[OPEN-LOCALLY-MATCH] Looking for: owner="${owner}", repo="${repo}"`)

      console.log(`[OPEN-LOCALLY-MATCH] All projects (${projects.length}):`)
      projects.forEach((p, i) => {
        console.log(`[OPEN-LOCALLY-MATCH]   ${i + 1}. "${p.name}" at ${p.path}`)
        console.log(`[OPEN-LOCALLY-MATCH]      gitOwner="${p.gitOwner}", gitRepo="${p.gitRepo}"`)
        console.log(`[OPEN-LOCALLY-MATCH]      matches: ${p.gitOwner === owner && p.gitRepo === repo}`)
      })

      const matches = projects.filter((p) => p.gitOwner === owner && p.gitRepo === repo)
      console.log(`[OPEN-LOCALLY-MATCH] Found ${matches.length} matching project(s)`)
      console.log(`[OPEN-LOCALLY-MATCH] ========== END MATCHING DEBUG ==========`)

      return matches
    },
    []
  )

  const autoImport = useCallback(
    (remoteChat: RemoteChat, project: Project) => {
      if (!remoteChat.sandbox_id) {
        toast.error("This chat has no sandbox to import")
        return
      }
      importMutation.mutate({
        sandboxId: remoteChat.sandbox_id,
        remoteChatId: remoteChat.id,
        projectId: project.id,
        chatName: remoteChat.name,
      })
    },
    [importMutation]
  )

  return {
    getMatchingProjects,
    autoImport,
    isImporting: importMutation.isPending,
  }
}
