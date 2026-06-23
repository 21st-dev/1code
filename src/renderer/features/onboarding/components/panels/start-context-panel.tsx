"use client"

import { useAtom, useSetAtom } from "jotai"
import { useState } from "react"
import { toast } from "sonner"
import {
  FolderIcon,
  GitHubIcon,
  IconChatBubble,
  IconSpinner,
} from "../../../../components/ui/icons"
import { Input } from "../../../../components/ui/input"
import { repoOnboardingSkippedAtom } from "../../../../lib/atoms"
import { useI18n } from "../../../../lib/i18n"
import { trpc } from "../../../../lib/trpc"
import { cn } from "../../../../lib/utils"
import { selectedProjectAtom } from "../../../agents/atoms"

/**
 * Start-context section: open a project, clone from GitHub, or defer to Quick
 * chat. Enabled only once a usable AI path is configured.
 */
export function StartContextPanel({
  disabled = false,
}: {
  disabled?: boolean
}) {
  const { t } = useI18n()
  const [, setSelectedProject] = useAtom(selectedProjectAtom)
  const setRepoOnboardingSkipped = useSetAtom(repoOnboardingSkippedAtom)
  const [showClonePage, setShowClonePage] = useState(false)
  const [githubUrl, setGithubUrl] = useState("")
  const utils = trpc.useUtils()

  const openFolder = trpc.projects.openFolder.useMutation({
    onSuccess: (project) => {
      if (!project) return
      utils.projects.list.setData(undefined, (oldData) => {
        if (!oldData) return [project]
        const exists = oldData.some((p) => p.id === project.id)
        if (exists) {
          return oldData.map((p) =>
            p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p,
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
      setRepoOnboardingSkipped(false)
    },
  })

  const cloneFromGitHub = trpc.projects.cloneFromGitHub.useMutation({
    onSuccess: (project) => {
      if (!project) return
      utils.projects.list.setData(undefined, (oldData) => {
        if (!oldData) return [project]
        const exists = oldData.some((p) => p.id === project.id)
        if (exists) {
          return oldData.map((p) =>
            p.id === project.id ? { ...p, updatedAt: project.updatedAt } : p,
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
      setRepoOnboardingSkipped(false)
      setShowClonePage(false)
      setGithubUrl("")
    },
  })

  const handleOpenFolder = async () => {
    try {
      const project = await openFolder.mutateAsync()
      if (!project) {
        toast.info(t("chat.selectRepoCancelled"))
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("chat.selectRepoFailed"),
      )
    }
  }

  const handleCloneFromGitHub = async () => {
    if (!githubUrl.trim()) return
    await cloneFromGitHub.mutateAsync({ repoUrl: githubUrl.trim() })
  }

  const handleQuickChat = () => {
    setRepoOnboardingSkipped(true)
  }

  if (disabled) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-border bg-muted/25 p-6">
        <p className="max-w-[320px] text-center text-sm leading-6 text-muted-foreground">
          {t("onboarding.startContext.connectFirst")}
        </p>
      </div>
    )
  }

  if (showClonePage) {
    return (
      <div className="mx-auto max-w-[520px] space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground">
            <GitHubIcon className="w-4 h-4 text-background" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {t("onboarding.repo.cloneTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("onboarding.repo.cloneSubtitle")}
            </p>
          </div>
        </div>
        <div className="relative">
          <Input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && githubUrl.trim()) {
                handleCloneFromGitHub()
              }
            }}
            placeholder="owner/repo"
            className="pr-10"
            autoFocus
            disabled={cloneFromGitHub.isPending}
          />
          {cloneFromGitHub.isPending && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <IconSpinner className="h-4 w-4" />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("onboarding.repo.cloneExample")}
        </p>
        <button
          type="button"
          onClick={() => {
            setShowClonePage(false)
            setGithubUrl("")
          }}
          disabled={cloneFromGitHub.isPending}
          className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {t("common.back")}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="mb-5">
        <h2 className="text-sm font-semibold">
          {t("onboarding.section.startContext")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("onboarding.startContext.quickChatHint")}
        </p>
      </div>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={handleOpenFolder}
          disabled={openFolder.isPending}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-md border border-foreground/20 bg-foreground px-4 text-left text-background shadow-sm transition-[background-color,transform] duration-150 hover:bg-foreground/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {openFolder.isPending ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background/15">
              <IconSpinner className="h-4 w-4" />
            </span>
          ) : (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background/15">
                <FolderIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {t("onboarding.repo.selectFolder")}
                </span>
                <span className="block truncate text-xs opacity-75">
                  {t("onboarding.repo.selectSubtitle")}
                </span>
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowClonePage(true)}
          disabled={cloneFromGitHub.isPending}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-md border border-border bg-muted/35 px-4 text-left transition-[background-color,border-color,transform] duration-150 hover:border-foreground/20 hover:bg-muted/55 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-foreground">
            <GitHubIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {t("onboarding.repo.cloneTitle")}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {t("onboarding.repo.cloneSubtitle")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={handleQuickChat}
          className={cn(
            "flex min-h-[56px] w-full items-center gap-3 rounded-md border border-border/70 px-4 text-left transition-[background-color,color,border-color,transform] duration-150 hover:border-foreground/20 hover:bg-muted/30 active:scale-[0.99] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <IconChatBubble className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {t("onboarding.startContext.quickChat")}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {t("onboarding.startContext.quickChatHint")}
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}
