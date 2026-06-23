import { Provider as JotaiProvider, useSetAtom } from "jotai"
import { ThemeProvider, useTheme } from "next-themes"
import { useEffect } from "react"
import { Toaster } from "sonner"
import { IconSpinner } from "./components/ui/icons"
import { TooltipProvider } from "./components/ui/tooltip"
import { TRPCProvider } from "./contexts/TRPCProvider"
import {
  getInitialWindowParams,
  WindowProvider,
} from "./contexts/WindowContext"
import { selectedAgentChatIdAtom } from "./features/agents/atoms"
import { useAgentSubChatStore } from "./features/agents/stores/sub-chat-store"
import { AgentsLayout } from "./features/layout/agents-layout"
import {
  OnboardingSurface,
  useLegacyMigrations,
  useOnboardingFlow,
} from "./features/onboarding"
import { I18nProvider } from "./lib/i18n"
import { appStore } from "./lib/jotai-store"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"

/**
 * Custom Toaster that adapts to theme
 */
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

/**
 * Main content router. Onboarding completion is derived from the provider /
 * runtime owners (see useSetupStatus), so this is just: resolve → onboard → app.
 */
function AppContent() {
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const { setActiveSubChat, addToOpenSubChats, setChatId } =
    useAgentSubChatStore()

  // One-time migrations of credentials persisted by older app versions.
  useLegacyMigrations()

  const { step } = useOnboardingFlow()

  // Apply initial window params (chatId/subChatId) when opening via "Open in new window"
  useEffect(() => {
    const params = getInitialWindowParams()
    if (params.chatId) {
      console.log(
        "[App] Opening chat from window params:",
        params.chatId,
        params.subChatId,
      )
      setSelectedChatId(params.chatId)
      setChatId(params.chatId)
      if (params.subChatId) {
        addToOpenSubChats(params.subChatId)
        setActiveSubChat(params.subChatId)
      }
    }
  }, [setSelectedChatId, setChatId, addToOpenSubChats, setActiveSubChat])

  // Claim the initially selected chat to prevent duplicate windows.
  // For new windows opened via "Open in new window", the chat is pre-claimed by main process.
  // For restored windows (persisted localStorage), we need to claim here.
  // Read atom directly from store to avoid stale closure with empty deps.
  useEffect(() => {
    if (!window.desktopApi?.claimChat) return
    const currentChatId = appStore.get(selectedAgentChatIdAtom)
    if (!currentChatId) return
    window.desktopApi.claimChat(currentChatId).then((result) => {
      if (!result.ok) {
        // Another window already has this chat — clear our selection
        setSelectedChatId(null)
      }
    })
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (step === "loading") {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <IconSpinner className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }

  if (step === "complete") {
    return <AgentsLayout />
  }

  return <OnboardingSurface />
}

export function App() {
  return (
    <WindowProvider>
      <JotaiProvider store={appStore}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <VSCodeThemeProvider>
            <I18nProvider>
              <TooltipProvider delayDuration={100}>
                <TRPCProvider>
                  <div
                    data-agents-page
                    className="h-screen w-screen bg-background text-foreground overflow-hidden"
                  >
                    <AppContent />
                  </div>
                  <ThemedToaster />
                </TRPCProvider>
              </TooltipProvider>
            </I18nProvider>
          </VSCodeThemeProvider>
        </ThemeProvider>
      </JotaiProvider>
    </WindowProvider>
  )
}
