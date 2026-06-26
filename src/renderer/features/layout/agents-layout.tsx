import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ClaudeLoginModal } from "../../components/dialogs/claude-login-modal"
import { CodexLoginModal } from "../../components/dialogs/codex-login-modal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog"
import { ResizableSidebar } from "../../components/ui/resizable-sidebar"
import { TooltipProvider } from "../../components/ui/tooltip"
import { WindowsTitleBar } from "../../components/windows-title-bar"
import {
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  agentsSidebarOpenAtom,
  agentsSidebarWidthAtom,
  claudeLoginModalConfigAtom,
  customHotkeysAtom,
  helperApisSetupPromptDismissedAtom,
  helperApisSetupPromptPendingAtom,
  isDesktopAtom,
  isFullscreenAtom,
  kanbanViewEnabledAtom,
  modelsSettingsTargetAtom,
} from "../../lib/atoms"
import { useIsMobile } from "../../lib/hooks/use-mobile"
import { useI18n } from "../../lib/i18n"
import { trpc } from "../../lib/trpc"
import { isDesktopApp } from "../../lib/utils/platform"
import {
  desktopViewAtom,
  fileSearchDialogOpenAtom,
  newChatTargetAtom,
  selectedAgentChatIdAtom,
  selectedDraftIdAtom,
  selectedProjectAtom,
  showNewChatFormAtom,
} from "../agents/atoms"
import { QueueProcessor } from "../agents/components/queue-processor"
import { useAgentsHotkeys } from "../agents/lib/agents-hotkeys-manager"
import { toggleSearchAtom } from "../agents/search"
import { useAgentSubChatStore } from "../agents/stores/sub-chat-store"
import { AgentsContent } from "../agents/ui/agents-content"
import { SettingsSidebar } from "../settings/settings-sidebar"
import { AgentsSidebar } from "../sidebar/agents-sidebar"

// ============================================================================
// Constants
// ============================================================================

const SIDEBAR_MIN_WIDTH = 160
const SIDEBAR_MAX_WIDTH = 300
const SIDEBAR_ANIMATION_DURATION = 0
const SIDEBAR_CLOSE_HOTKEY = "⌘\\"

type WorktreeSetupEvent = {
  kind: "create-failed" | "create-timeout" | "setup-failed"
  message: string
  projectId: string
  fallback?: {
    mode: "project-directory"
    path: string
  }
}

type WorktreeSetupApprovalRequiredEvent = {
  chatId: string
  projectId: string
  worktreePath: string
  source: string
  configPath: string
  commandHash: string
  commands: string[]
}

// ============================================================================
// Component
// ============================================================================

export function AgentsLayout() {
  // No useHydrateAtoms - desktop doesn't need SSR, atomWithStorage handles persistence
  const isMobile = useIsMobile()
  const { t } = useI18n()

  // Global desktop/fullscreen state - initialized here at root level
  const [isDesktop, setIsDesktop] = useAtom(isDesktopAtom)
  const [isFullscreen, setIsFullscreen] = useAtom(isFullscreenAtom)

  // Initialize isDesktop on mount
  useEffect(() => {
    setIsDesktop(isDesktopApp())
  }, [setIsDesktop])

  // Subscribe to fullscreen changes from Electron
  useEffect(() => {
    if (
      !isDesktop ||
      typeof window === "undefined" ||
      !window.desktopApi?.windowIsFullscreen
    )
      return

    // Get initial fullscreen state
    window.desktopApi.windowIsFullscreen().then(setIsFullscreen)

    // In dev mode, HMR breaks IPC event subscriptions, so we poll instead
    const isDev = import.meta.env.DEV
    if (isDev) {
      const interval = setInterval(() => {
        window.desktopApi?.windowIsFullscreen?.().then(setIsFullscreen)
      }, 300)
      return () => clearInterval(interval)
    }

    // In production, use events (more efficient)
    const unsubscribe = window.desktopApi.onFullscreenChange?.(setIsFullscreen)
    return unsubscribe
  }, [isDesktop, setIsFullscreen])

  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const [sidebarWidth, setSidebarWidth] = useAtom(agentsSidebarWidthAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setModelsSettingsTarget = useSetAtom(modelsSettingsTargetAtom)
  const [helperApisPromptPending, setHelperApisPromptPending] = useAtom(
    helperApisSetupPromptPendingAtom,
  )
  const [helperApisPromptDismissed, setHelperApisPromptDismissed] = useAtom(
    helperApisSetupPromptDismissedAtom,
  )
  const desktopView = useAtomValue(desktopViewAtom)
  const setFileSearchDialogOpen = useSetAtom(fileSearchDialogOpenAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setNewChatTarget = useSetAtom(newChatTargetAtom)
  const kanbanViewEnabled = useAtomValue(kanbanViewEnabledAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const claudeLoginModalConfig = useAtomValue(claudeLoginModalConfigAtom)

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()
  const utils = trpc.useUtils()
  const { data: subChatTitleProviderData } =
    trpc.localApiProviderConfig.get.useQuery({ purpose: "sub_chat_title" })
  const { data: commitMessageProviderData } =
    trpc.localApiProviderConfig.get.useQuery({ purpose: "commit_message" })

  // Validated project - only valid if exists in DB
  // While loading, trust localStorage value to prevent clearing on app restart
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker and clearing
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

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
    },
  })

  const openProjectPickerForNewWorkspace = useCallback(async () => {
    if (openFolder.isPending) return

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
  }, [openFolder, t])

  const openHelperApisSettings = useCallback(() => {
    setSettingsActiveTab("models")
    setModelsSettingsTarget("helper-apis")
    setSettingsDialogOpen(true)
    setSidebarOpen(true)
  }, [
    setModelsSettingsTarget,
    setSettingsActiveTab,
    setSettingsDialogOpen,
    setSidebarOpen,
  ])

  const helperApisProviderStateKnown =
    subChatTitleProviderData !== undefined &&
    commitMessageProviderData !== undefined
  const helperApisFullyConfigured = Boolean(
    subChatTitleProviderData?.config?.hasToken &&
      commitMessageProviderData?.config?.hasToken,
  )

  useEffect(() => {
    if (!helperApisPromptPending) return

    if (helperApisPromptDismissed) {
      setHelperApisPromptPending(false)
      return
    }

    if (!helperApisProviderStateKnown) return

    setHelperApisPromptPending(false)
    if (helperApisFullyConfigured) return

    setHelperApisPromptDismissed(true)
    toast.info(t("toast.models.helperApisPrompt.title"), {
      description: t("toast.models.helperApisPrompt.description"),
      duration: 12000,
      action: {
        label: t("toast.models.helperApisPrompt.action"),
        onClick: openHelperApisSettings,
      },
    })
  }, [
    helperApisFullyConfigured,
    helperApisPromptDismissed,
    helperApisPromptPending,
    helperApisProviderStateKnown,
    openHelperApisSettings,
    setHelperApisPromptDismissed,
    setHelperApisPromptPending,
    t,
  ])

  // Clear invalid project from storage (only after loading completes)
  useEffect(() => {
    if (
      selectedProject &&
      projects &&
      !isLoadingProjects &&
      !validatedProject
    ) {
      setSelectedProject(null)
    }
  }, [
    selectedProject,
    projects,
    isLoadingProjects,
    validatedProject,
    setSelectedProject,
  ])

  // Show/hide native traffic lights based on sidebar and fullscreen state
  // This also re-syncs visibility when leaving fullscreen.
  // When settings view is active, don't control traffic lights here —
  // SettingsSidebar manages its own visibility (always hidden).
  const isSettingsView = desktopView === "settings"
  useEffect(() => {
    if (!isDesktop) return
    if (isSettingsView) return // SettingsSidebar handles its own traffic light state
    if (
      typeof window === "undefined" ||
      !window.desktopApi?.setTrafficLightVisibility
    )
      return

    window.desktopApi.setTrafficLightVisibility(sidebarOpen)
  }, [sidebarOpen, isDesktop, isFullscreen, isSettingsView])

  const setChatId = useAgentSubChatStore((state) => state.setChatId)
  const [pendingWorktreeSetupApproval, setPendingWorktreeSetupApproval] =
    useState<WorktreeSetupApprovalRequiredEvent | null>(null)
  const approveWorktreeSetupMutation =
    trpc.worktreeConfig.approveAndRunSetup.useMutation({
      onSuccess: (result) => {
        if (result.success) {
          toast.success(t("toast.worktree.setupCompleted"), {
            description: t("toast.worktree.setupCompletedDescription", {
              count: result.commandsRun,
            }),
          })
          return
        }

        toast.error(t("toast.worktree.setupFailed"), {
          description: result.errors[0] || undefined,
          duration: 10000,
        })
      },
      onError: (error) => {
        toast.error(t("toast.worktree.setupFailed"), {
          description: error.message,
          duration: 10000,
        })
      },
    })

  // Track if this is the initial load - skip auto-open on first load to respect saved state
  const isInitialLoadRef = useRef(true)

  // Auto-open sidebar when project is selected, close when no project
  // Skip on initial load to preserve user's saved sidebar preference
  useEffect(() => {
    if (!projects) return // Don't change sidebar state while loading

    // On initial load, just mark as loaded and don't change sidebar state
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      return
    }

    // After initial load, react to project changes
    if (validatedProject) {
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }, [validatedProject, projects, setSidebarOpen])

  // Worktree setup failures from main process
  useEffect(() => {
    if (typeof window === "undefined") return
    const desktopApi = window.desktopApi as any
    if (!desktopApi?.onWorktreeSetupFailed) return

    const unsubscribe = desktopApi.onWorktreeSetupFailed(
      (payload: WorktreeSetupEvent) => {
        const errorMessage = payload.message.replace(/\s+/g, " ").trim()
        const hasProjectDirectoryFallback =
          payload.fallback?.mode === "project-directory"
        const fallbackDescription = hasProjectDirectoryFallback
          ? t("toast.worktree.runningInProjectDirectory", {
              path: payload.fallback?.path ?? "",
            })
          : null
        const description = [errorMessage, fallbackDescription]
          .filter(Boolean)
          .join(" ")

        if (payload.kind === "create-timeout") {
          toast.warning(t("toast.worktree.checkoutTimedOut"), {
            description: description || fallbackDescription || undefined,
            duration: 12000,
          })
          return
        }

        if (payload.kind === "create-failed") {
          toast.error(t("toast.worktree.creationFailed"), {
            description: description || fallbackDescription || undefined,
            duration: 12000,
          })
          return
        }

        toast.error(t("toast.worktree.setupFailed"), {
          description: errorMessage || undefined,
          duration: 10000,
          action: {
            label: t("toast.worktree.openSettings"),
            onClick: () => {
              const projectMatch = projects?.find(
                (project) => project.id === payload.projectId,
              )
              if (projectMatch) {
                setSelectedProject(projectMatch as any)
              }
              setSettingsActiveTab("projects")
              setSettingsDialogOpen(true)
            },
          },
        })
      },
    )

    return unsubscribe
  }, [
    projects,
    setSelectedProject,
    setSettingsActiveTab,
    setSettingsDialogOpen,
    t,
  ])

  useEffect(() => {
    if (typeof window === "undefined") return
    const desktopApi = window.desktopApi
    if (!desktopApi?.onWorktreeSetupApprovalRequired) return

    const unsubscribe = desktopApi.onWorktreeSetupApprovalRequired(
      (payload) => {
        setPendingWorktreeSetupApproval(payload)
      },
    )

    return unsubscribe
  }, [])

  // Clear sub-chat store when no chat is selected
  useEffect(() => {
    if (!selectedChatId) {
      setChatId(null)
    }
  }, [selectedChatId, setChatId])

  // Chat search toggle
  const toggleChatSearch = useSetAtom(toggleSearchAtom)

  // Custom hotkeys config
  const customHotkeysConfig = useAtomValue(customHotkeysAtom)

  // Initialize hotkeys manager
  useAgentsHotkeys({
    setSelectedChatId,
    setSelectedDraftId,
    setShowNewChatForm,
    setDesktopView,
    setNewChatTarget,
    setSidebarOpen,
    setSettingsActiveTab,
    setFileSearchDialogOpen,
    toggleChatSearch,
    openProjectPickerForNewWorkspace,
    selectedChatId,
    hasSelectedProject: Boolean(validatedProject),
    customHotkeysConfig,
    kanbanViewEnabled,
  })

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [setSidebarOpen])

  const handleApproveWorktreeSetup = useCallback(() => {
    if (!pendingWorktreeSetupApproval) return
    const request = pendingWorktreeSetupApproval
    setPendingWorktreeSetupApproval(null)
    approveWorktreeSetupMutation.mutate({
      chatId: request.chatId,
      commandHash: request.commandHash,
    })
  }, [approveWorktreeSetupMutation, pendingWorktreeSetupApproval])

  return (
    <TooltipProvider delayDuration={300}>
      {/* Global queue processor - handles message queues for all sub-chats */}
      <QueueProcessor />
      <ClaudeLoginModal
        hideCustomModelSettingsLink={
          claudeLoginModalConfig.hideCustomModelSettingsLink
        }
        autoStartAuth={claudeLoginModalConfig.autoStartAuth}
      />
      <CodexLoginModal />
      <AlertDialog
        open={Boolean(pendingWorktreeSetupApproval)}
        onOpenChange={(open) => {
          if (!open) setPendingWorktreeSetupApproval(null)
        }}
      >
        <AlertDialogContent className="w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("toast.worktree.setupApprovalTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("toast.worktree.setupApprovalDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody className="space-y-3">
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">
                {t("toast.worktree.setupApprovalSource")}
              </span>
              <span className="min-w-0 truncate font-mono">
                {pendingWorktreeSetupApproval?.source}
              </span>
              <span className="text-muted-foreground">
                {t("toast.worktree.setupApprovalPath")}
              </span>
              <span className="min-w-0 truncate font-mono">
                {pendingWorktreeSetupApproval?.configPath}
              </span>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5 whitespace-pre-wrap break-words">
              {(pendingWorktreeSetupApproval?.commands ?? [])
                .map((command) => `$ ${command}`)
                .join("\n")}
            </pre>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("toast.worktree.setupApprovalSkip")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveWorktreeSetup}>
              {t("toast.worktree.setupApprovalRun")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col w-full h-full relative overflow-hidden bg-background select-none">
        {/* Windows Title Bar (only shown on Windows with frameless window) */}
        <WindowsTitleBar />
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - switches between chat list and settings nav */}
          <ResizableSidebar
            isOpen={!isMobile && sidebarOpen}
            onClose={handleCloseSidebar}
            widthAtom={agentsSidebarWidthAtom}
            minWidth={SIDEBAR_MIN_WIDTH}
            maxWidth={SIDEBAR_MAX_WIDTH}
            side="left"
            closeHotkey={SIDEBAR_CLOSE_HOTKEY}
            animationDuration={SIDEBAR_ANIMATION_DURATION}
            initialWidth={0}
            exitWidth={0}
            showResizeTooltip={!isSettingsView}
            className="overflow-hidden bg-background border-r"
            style={{ borderRightWidth: "0.5px" }}
          >
            {isSettingsView ? (
              <SettingsSidebar />
            ) : (
              <AgentsSidebar
                onToggleSidebar={handleCloseSidebar}
                onNewWorkspaceProjectPicker={openProjectPickerForNewWorkspace}
                isNewWorkspaceProjectPickerPending={openFolder.isPending}
              />
            )}
          </ResizableSidebar>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            <AgentsContent />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
