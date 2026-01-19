"use client"

import { useState } from "react"
import { useAtom } from "jotai"

import { IconSpinner, GitHubIcon } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { trpc } from "../../lib/trpc"
import { selectedProjectAtom } from "../agents/atoms"

export function SelectRepoPage() {
  const [, setSelectedProject] = useAtom(selectedProjectAtom)
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")

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
            className="w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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

      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Clone from GitHub</DialogTitle>
            <DialogDescription>
              Enter a GitHub repository URL or owner/repo
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCloneFromGitHub()
            }}
            className="flex flex-col gap-4"
          >
            <Input
              placeholder="owner/repo or https://github.com/..."
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGithubDialogOpen(false)}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!githubUrl.trim() || cloneFromGitHub.isPending}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {cloneFromGitHub.isPending ? "Cloning..." : "Clone"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
