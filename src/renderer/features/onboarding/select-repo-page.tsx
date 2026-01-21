"use client"

import { useState, useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { AnimatePresence, motion } from "motion/react"
import { createPortal } from "react-dom"

import { IconSpinner, GitHubIcon } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import { trpc } from "../../lib/trpc"
import { selectedProjectAtom } from "../agents/atoms"

const EASING_CURVE = [0.55, 0.055, 0.675, 0.19] as const
const INTERACTION_DELAY_MS = 250

export function SelectRepoPage() {
  const [, setSelectedProject] = useAtom(selectedProjectAtom)
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")
  const [mounted, setMounted] = useState(false)
  const openAtRef = useRef<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (githubDialogOpen) {
      openAtRef.current = performance.now()
      setGithubUrl("")
    }
  }, [githubDialogOpen])

  // Get tRPC utils for cache management
  const utils = trpc.useUtils()

  // Open folder mutation
  const openFolder = trpc.projects.openFolder.useMutation({
    onSuccess: (project) => {
      if (project) {
        // Optimistically update the projects list cache
        utils.projects.list.setData(undefined, (oldData) => {
          if (!oldData) return [project]
          const exists = oldData.some((p) => p.id === project.id)
          if (exists) {
            return oldData.map((p) =>
              p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p
            )
          }
          return [project, ...oldData]
        })

        setSelectedProject({
          id: project.id,
          name: project.name,
          path: project.path,
          gitRemoteUrl: project.gitRemoteUrl,
          gitProvider: project.gitProvider as
            | "github"
            | "gitlab"
            | "bitbucket"
            | null,
          gitOwner: project.gitOwner,
          gitRepo: project.gitRepo,
        })
      }
    },
  })

  // Clone from GitHub mutation
  const cloneFromGitHub = trpc.projects.cloneFromGitHub.useMutation({
    onSuccess: (project) => {
      if (project) {
        utils.projects.list.setData(undefined, (oldData) => {
          if (!oldData) return [project]
          const exists = oldData.some((p) => p.id === project.id)
          if (exists) {
            return oldData.map((p) =>
              p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p
            )
          }
          return [project, ...oldData]
        })

        setSelectedProject({
          id: project.id,
          name: project.name,
          path: project.path,
          gitRemoteUrl: project.gitRemoteUrl,
          gitProvider: project.gitProvider as
            | "github"
            | "gitlab"
            | "bitbucket"
            | null,
          gitOwner: project.gitOwner,
          gitRepo: project.gitRepo,
        })
        setGithubDialogOpen(false)
        setGithubUrl("")
      }
    },
  })

  const handleOpenFolder = async () => {
    await openFolder.mutateAsync()
  }

  const handleCloneFromGitHub = async () => {
    if (!githubUrl.trim()) return
    await cloneFromGitHub.mutateAsync({ repoUrl: githubUrl.trim() })
  }

  const handleCloseDialog = () => {
    const canInteract = performance.now() - openAtRef.current > INTERACTION_DELAY_MS
    if (!canInteract || cloneFromGitHub.isPending) return
    setGithubDialogOpen(false)
  }

  const handleAnimationComplete = () => {
    if (githubDialogOpen) {
      inputRef.current?.focus()
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <div className="w-full max-w-[440px] space-y-8 px-4">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center mx-auto w-max">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-6 h-6" fill="white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Select a repository
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose a local folder to start working with
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <button
            onClick={handleOpenFolder}
            disabled={openFolder.isPending}
            className="w-full h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {openFolder.isPending ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              "Select folder"
            )}
          </button>
          <button
            onClick={() => setGithubDialogOpen(true)}
            disabled={cloneFromGitHub.isPending}
            className="w-full h-8 px-3 bg-muted text-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-muted/80 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {cloneFromGitHub.isPending ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              <>
                <GitHubIcon className="h-4 w-4" />
                Clone from GitHub
              </>
            )}
          </button>
        </div>
      </div>

      {/* Clone from GitHub Dialog */}
      {mounted && createPortal(
        <AnimatePresence mode="wait" initial={false}>
          {githubDialogOpen && (
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
                onClick={handleCloseDialog}
                style={{ pointerEvents: "auto" }}
                data-modal="clone-github-dialog"
              />

              {/* Main Dialog */}
              <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASING_CURVE }}
                  onAnimationComplete={handleAnimationComplete}
                  className="w-[90vw] max-w-[400px] pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleCloneFromGitHub()
                    }}
                  >
                    <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden" data-canvas-dialog>
                      <div className="p-6">
                        <h2 className="text-xl font-semibold mb-4">
                          Clone from GitHub
                        </h2>

                        {/* Input */}
                        <Input
                          ref={inputRef}
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          placeholder="owner/repo or https://github.com/..."
                          className="w-full h-11 text-sm"
                          disabled={cloneFromGitHub.isPending}
                        />
                      </div>

                      {/* Footer with buttons */}
                      <div className="bg-muted p-4 flex justify-between border-t border-border rounded-b-xl">
                        <Button
                          type="button"
                          onClick={handleCloseDialog}
                          variant="ghost"
                          disabled={cloneFromGitHub.isPending}
                          className="rounded-md"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="default"
                          disabled={!githubUrl.trim() || cloneFromGitHub.isPending}
                          className="rounded-md"
                        >
                          {cloneFromGitHub.isPending ? "Cloning..." : "Clone"}
                        </Button>
                      </div>
                    </div>
                  </form>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
