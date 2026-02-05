"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "../../../components/ui/button"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { useSetAtom } from "jotai"
import { selectedAgentChatIdAtom, desktopViewAtom } from "../atoms"
import { chatSourceModeAtom } from "../../../lib/atoms"
import type { RemoteChat } from "../../../lib/remote-api"
import { Folder, Download, Check } from "lucide-react"

interface Project {
  id: string
  name: string
  path: string
  gitOwner: string | null
  gitRepo: string | null
}

interface OpenLocallyDialogProps {
  isOpen: boolean
  onClose: () => void
  remoteChat: RemoteChat | null
  matchingProjects: Project[]
  allProjects: Project[]
  remoteSubChatId: string | null
}

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const
const INTERACTION_DELAY_MS = 250

export function OpenLocallyDialog({
  isOpen,
  onClose,
  remoteChat,
  matchingProjects,
  allProjects,
  remoteSubChatId,
}: OpenLocallyDialogProps) {
  const [mounted, setMounted] = useState(false)
  const openAtRef = useRef<number>(0)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setChatSourceMode = useSetAtom(chatSourceModeAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const utils = trpc.useUtils()

  // For multiple projects view
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Mutations
  const locateMutation = trpc.projects.locateAndAddProject.useMutation()

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
      onClose()
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`)
    },
  })

  const pickDestMutation = trpc.projects.pickCloneDestination.useMutation()

  const cloneMutation = trpc.sandboxImport.cloneFromSandbox.useMutation({
    onSuccess: (result) => {
      toast.success("Cloned and opened locally")

      // Invalidate list queries so sidebar updates
      utils.chats.list.invalidate()
      utils.projects.list.invalidate()

      // Switch to local chat view — let the normal architecture load the chat
      setChatSourceMode("local")
      setSelectedChatId(result.chatId)
      setDesktopView(null)
      onClose()
    },
    onError: (error) => {
      toast.error(`Clone failed: ${error.message}`)
    },
  })

  const isAnyLoading = importMutation.isPending || locateMutation.isPending ||
    pickDestMutation.isPending || cloneMutation.isPending

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      openAtRef.current = performance.now()
      setSelectedProjectId(null)
    }
  }, [isOpen])

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        const canInteract = performance.now() - openAtRef.current > INTERACTION_DELAY_MS
        if (canInteract && !isAnyLoading) {
          onClose()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, isAnyLoading, onClose])

  const handleClose = useCallback(() => {
    const canInteract = performance.now() - openAtRef.current > INTERACTION_DELAY_MS
    if (!canInteract || isAnyLoading) return
    onClose()
  }, [isAnyLoading, onClose])

  // Handler: Locate existing project
  const handleLocateProject = useCallback(async () => {
    if (!remoteChat?.meta?.repository) return

    const [owner, repo] = remoteChat.meta.repository.split("/")
    if (!owner || !repo) return

    const result = await locateMutation.mutateAsync({
      expectedOwner: owner,
      expectedRepo: repo,
    })

    if (result.success && result.project) {
      // Now import into this project
      importMutation.mutate({
        sandboxId: remoteChat.sandbox_id!,
        remoteChatId: remoteChat.id,
        remoteSubChatId: remoteSubChatId ?? undefined,
        projectId: result.project.id,
        chatName: remoteChat.name,
      })
    } else if (result.reason === "wrong-repo") {
      toast.error(`That folder is ${result.found}, not ${owner}/${repo}`)
    }
    // canceled = do nothing
  }, [remoteChat, remoteSubChatId, locateMutation, importMutation])

  // Handler: Clone from sandbox
  const handleCloneFromSandbox = useCallback(async () => {
    if (!remoteChat?.meta?.repository || !remoteChat.sandbox_id) return

    const [, repo] = remoteChat.meta.repository.split("/")
    if (!repo) return

    // Pick destination
    const destResult = await pickDestMutation.mutateAsync({ suggestedName: repo })
    if (!destResult.success || !destResult.targetPath) return

    // Clone
    toast.info("Cloning repository... this may take a while")
    cloneMutation.mutate({
      sandboxId: remoteChat.sandbox_id,
      remoteChatId: remoteChat.id,
      remoteSubChatId: remoteSubChatId ?? undefined,
      chatName: remoteChat.name,
      targetPath: destResult.targetPath,
    })
  }, [remoteChat, remoteSubChatId, pickDestMutation, cloneMutation])

  // Handler: Select project from list
  const handleSelectProject = useCallback(() => {
    if (!selectedProjectId || !remoteChat?.sandbox_id) return

    importMutation.mutate({
      sandboxId: remoteChat.sandbox_id,
      remoteChatId: remoteChat.id,
      remoteSubChatId: remoteSubChatId ?? undefined,
      projectId: selectedProjectId,
      chatName: remoteChat.name,
    })
  }, [selectedProjectId, remoteChat, remoteSubChatId, importMutation])

  if (!mounted) return null

  const portalTarget = typeof document !== "undefined" ? document.body : null
  if (!portalTarget) return null

  const mode = matchingProjects.length === 0 ? "no-projects" : "multiple-projects"
  const repository = remoteChat?.meta?.repository

  return createPortal(
    <AnimatePresence mode="wait" initial={false}>
      {isOpen && remoteChat && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: 0.18, ease: EASING_CURVE },
            }}
            exit={{
              opacity: 0,
              pointerEvents: "none" as const,
              transition: { duration: 0.15, ease: EASING_CURVE },
            }}
            className="fixed inset-0 z-[45] bg-black/25"
            onClick={handleClose}
            style={{ pointerEvents: "auto" }}
            data-modal="open-locally"
          />

          {/* Main Dialog */}
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASING_CURVE }}
              className="w-[90vw] max-w-[400px] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="bg-background rounded-2xl border shadow-2xl overflow-hidden"
                data-canvas-dialog
              >
                {mode === "no-projects" ? (
                  // No matching projects view
                  <>
                    <div className="p-6">
                      <h2 className="text-lg font-semibold mb-2">Project not found locally</h2>
                      <p className="text-sm text-muted-foreground mb-5">
                        This sandbox is working on{" "}
                        <code className="px-1.5 py-0.5 bg-muted rounded text-foreground text-xs">
                          {repository}
                        </code>
                        , but we couldn't find it on your machine.
                      </p>

                      <div className="space-y-2">
                        {/* Option 1: Locate existing clone */}
                        <button
                          onClick={handleLocateProject}
                          disabled={isAnyLoading}
                          className="w-full p-3 rounded-lg text-left bg-muted/50 hover:bg-muted transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-background border">
                              <Folder className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">I have it cloned</div>
                              <div className="text-xs text-muted-foreground">
                                Point us to your local copy
                              </div>
                            </div>
                          </div>
                        </button>

                        {/* Option 2: Clone from sandbox */}
                        <button
                          onClick={handleCloneFromSandbox}
                          disabled={isAnyLoading}
                          className="w-full p-3 rounded-lg text-left bg-muted/50 hover:bg-muted transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-background border">
                              <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">Clone from sandbox</div>
                              <div className="text-xs text-muted-foreground">
                                Download the repository (may take a while)
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Loading indicator */}
                      {isAnyLoading && (
                        <div className="mt-4 text-xs text-muted-foreground text-center">
                          {locateMutation.isPending && "Opening folder picker..."}
                          {pickDestMutation.isPending && "Opening folder picker..."}
                          {importMutation.isPending && "Importing..."}
                          {cloneMutation.isPending && "Cloning repository..."}
                        </div>
                      )}
                    </div>

                    {/* Footer with Cancel */}
                    <div className="bg-muted/50 px-6 py-4 flex justify-end border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClose}
                        disabled={isAnyLoading}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  // Multiple matching projects view
                  <>
                    <div className="p-6">
                      <h2 className="text-lg font-semibold mb-2">Multiple copies found</h2>
                      <p className="text-sm text-muted-foreground mb-5">
                        You have{" "}
                        <code className="px-1.5 py-0.5 bg-muted rounded text-foreground text-xs">
                          {repository}
                        </code>{" "}
                        in multiple locations. Which one should we use?
                      </p>

                      <div className="space-y-2">
                        {matchingProjects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                              selectedProjectId === project.id
                                ? "bg-muted ring-1 ring-primary"
                                : "bg-muted/50 hover:bg-muted"
                            }`}
                            onClick={() => setSelectedProjectId(project.id)}
                          >
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                selectedProjectId === project.id
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/30"
                              }`}
                            >
                              {selectedProjectId === project.id && (
                                <Check className="w-2.5 h-2.5 text-primary-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{project.name}</div>
                              <div className="text-xs text-muted-foreground font-mono truncate">
                                {project.path}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-muted/50 px-6 py-4 flex justify-between border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClose}
                        disabled={isAnyLoading}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSelectProject}
                        disabled={!selectedProjectId || isAnyLoading}
                      >
                        {importMutation.isPending ? "Opening..." : "Open Locally"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}
