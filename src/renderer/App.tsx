import { Provider as JotaiProvider, useAtom, useAtomValue, useSetAtom } from "jotai"
import { ThemeProvider, useTheme } from "next-themes"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { Toaster } from "sonner"
import { getAppSurface } from "./app-surface"
import { OpenCodexStartupBlocker } from "./components/opencodex-startup-blocker"
import { TooltipProvider } from "./components/ui/tooltip"
import { TRPCProvider } from "./contexts/TRPCProvider"
import { WindowProvider, getInitialWindowParams } from "./contexts/WindowContext"
import { selectedProjectAtom, selectedAgentChatIdAtom } from "./features/agents/atoms"
import { useAgentSubChatStore } from "./features/agents/stores/sub-chat-store"
import { AgentsLayout } from "./features/layout/agents-layout"
import { BillingMethodPage, SelectRepoPage } from "./features/onboarding"
import { initAnalytics, shutdown } from "./lib/analytics"
import {
  normalizeOpenCodexBackendConfig,
  openCodexBackendConfigAtom,
} from "./lib/atoms"
import { appStore } from "./lib/jotai-store"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"
import { trpc } from "./lib/trpc"

type OpenCodexStartupState =
  | { status: "ready" }
  | {
      status: "blocked"
      reason: "packaging-preflight"
      message: string
    }

function ThemedToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  )
}

function AppContent() {
  const [backendConfig, setBackendConfig] = useAtom(openCodexBackendConfigAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const { setActiveSubChat, addToOpenSubChats, setChatId } = useAgentSubChatStore()

  useEffect(() => {
    const params = getInitialWindowParams()
    if (params.chatId) {
      console.log("[App] Opening chat from window params:", params.chatId, params.subChatId)
      setSelectedChatId(params.chatId)
      setChatId(params.chatId)
      if (params.subChatId) {
        addToOpenSubChats(params.subChatId)
        setActiveSubChat(params.subChatId)
      }
    }
  }, [setSelectedChatId, setChatId, addToOpenSubChats, setActiveSubChat])

  useEffect(() => {
    if (!window.desktopApi?.claimChat) return
    const currentChatId = appStore.get(selectedAgentChatIdAtom)
    if (!currentChatId) return
    window.desktopApi.claimChat(currentChatId).then((result) => {
      if (!result.ok) {
        setSelectedChatId(null)
      }
    })
  }, [setSelectedChatId])

  useEffect(() => {
    if (!window.desktopApi?.getOpenCodexBackendConfig) return
    let cancelled = false

    void window.desktopApi.getOpenCodexBackendConfig().then((savedConfig) => {
      if (cancelled || !savedConfig) return
      const savedKey = JSON.stringify(savedConfig)
      const localKey = JSON.stringify(backendConfig)
      if (savedKey !== localKey) {
        setBackendConfig(savedConfig)
      }
    })

    return () => {
      cancelled = true
    }
  }, [backendConfig, setBackendConfig])

  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    if (isLoadingProjects) return selectedProject
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  const appSurface = useMemo(
    () =>
      getAppSurface({
        hasBackendConfiguration: Boolean(
          normalizeOpenCodexBackendConfig(backendConfig),
        ),
        hasValidatedProject: Boolean(validatedProject),
        isProjectsLoading: isLoadingProjects,
      }),
    [backendConfig, validatedProject, isLoadingProjects],
  )

  switch (appSurface) {
    case "backend-setup":
      return <BillingMethodPage />
    case "select-repo":
      return <SelectRepoPage />
    default:
      return <AgentsLayout />
  }
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <WindowProvider>
      <JotaiProvider store={appStore}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <VSCodeThemeProvider>
            <TooltipProvider delayDuration={100}>{children}</TooltipProvider>
          </VSCodeThemeProvider>
        </ThemeProvider>
      </JotaiProvider>
    </WindowProvider>
  )
}

export function App() {
  const [startupState, setStartupState] = useState<OpenCodexStartupState | null>(null)

  useEffect(() => {
    initAnalytics()

    const syncOptOutStatus = async () => {
      try {
        const optOut =
          localStorage.getItem("preferences:analytics-opt-out") === "true"
        await window.desktopApi?.setAnalyticsOptOut(optOut)
      } catch (error) {
        console.warn("[Analytics] Failed to sync opt-out status:", error)
      }
    }
    syncOptOutStatus()

    const loadStartupState = async () => {
      if (!window.desktopApi?.getStartupState) {
        setStartupState({ status: "ready" })
        return
      }
      const state = await window.desktopApi.getStartupState()
      setStartupState(state)
    }
    loadStartupState()

    return () => {
      shutdown()
    }
  }, [])

  const retryStartupPreflight = async () => {
    if (!window.desktopApi?.retryStartupPreflight) return
    const state = await window.desktopApi.retryStartupPreflight()
    setStartupState(state)
  }

  if (startupState === null) {
    return (
      <AppShell>
        <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Checking OpenCodex startup state...
        </div>
      </AppShell>
    )
  }

  if (startupState.status === "blocked") {
    return (
      <AppShell>
        <OpenCodexStartupBlocker
          startupState={startupState}
          onRetry={retryStartupPreflight}
        />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <TRPCProvider>
        <div
          data-agents-page
          className="h-screen w-screen overflow-hidden bg-background text-foreground"
        >
          <AppContent />
        </div>
        <ThemedToaster />
      </TRPCProvider>
    </AppShell>
  )
}
