import { Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai"
import { ThemeProvider, useTheme } from "next-themes"
import { useEffect, useMemo } from "react"
import { Toaster } from "sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { ClerkLoginScreen } from "./components/clerk-login-screen"
import { TRPCProvider } from "./contexts/TRPCProvider"
import { selectedProjectAtom } from "./features/agents/atoms"
import { AgentsLayout } from "./features/layout/agents-layout"
import {
  AzureOnboardingPage,
  SelectRepoPage,
} from "./features/onboarding"
import { identify, initAnalytics, shutdown } from "./lib/analytics"
import {
  anthropicOnboardingCompletedAtom, apiKeyOnboardingCompletedAtom,
  billingMethodAtom
} from "./lib/atoms"
import { appStore } from "./lib/jotai-store"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"
import { trpc } from "./lib/trpc"
import { useClerkAuth } from "./lib/hooks/use-clerk-auth"

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
 * Main content router - decides which page to show based on onboarding state
 */
function AppContent() {
  // Check Clerk authentication first
  const { isAuthenticated, isLoading: isAuthLoading, user: clerkUser } = useClerkAuth()

  const billingMethod = useAtomValue(billingMethodAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const anthropicOnboardingCompleted = useAtomValue(
    anthropicOnboardingCompletedAtom
  )
  const setAnthropicOnboardingCompleted = useSetAtom(anthropicOnboardingCompletedAtom)
  const apiKeyOnboardingCompleted = useAtomValue(apiKeyOnboardingCompletedAtom)
  const setApiKeyOnboardingCompleted = useSetAtom(apiKeyOnboardingCompletedAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Check if Azure Foundry is configured via environment variables
  const { data: foundryConfig, isLoading: isLoadingFoundry } = trpc.debug.isFoundryConfigured.useQuery()

  // Identify user with analytics when authenticated
  useEffect(() => {
    if (clerkUser?.id) {
      identify(clerkUser.id, { 
        email: clerkUser.email, 
        name: clerkUser.name 
      })
    }
  }, [clerkUser])

  // Auto-skip onboarding when Foundry is configured
  useEffect(() => {
    if (foundryConfig?.configured) {
      console.log("[App] Foundry configured, auto-completing onboarding")
      // Set billing method to api-key (Foundry uses API key style auth)
      if (!billingMethod) {
        setBillingMethod("api-key")
      }
      // Mark onboarding as completed
      if (!apiKeyOnboardingCompleted) {
        setApiKeyOnboardingCompleted(true)
      }
      if (!anthropicOnboardingCompleted) {
        setAnthropicOnboardingCompleted(true)
      }
    }
  }, [foundryConfig?.configured, billingMethod, apiKeyOnboardingCompleted, anthropicOnboardingCompleted, setBillingMethod, setApiKeyOnboardingCompleted, setAnthropicOnboardingCompleted])

  // Migration: If user already completed Anthropic onboarding but has no billing method set,
  // automatically set it to "claude-subscription" (legacy users before billing method was added)
  useEffect(() => {
    if (!billingMethod && anthropicOnboardingCompleted) {
      setBillingMethod("claude-subscription")
    }
  }, [billingMethod, anthropicOnboardingCompleted, setBillingMethod])

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // Validated project - only valid if exists in DB
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  // Show loading while checking auth or Foundry config
  if (isAuthLoading || isLoadingFoundry) {
    return null // Or a loading spinner
  }

  // FIRST GATE: Clerk Authentication
  if (!isAuthenticated) {
    return <ClerkLoginScreen />
  }

  // If Foundry is configured, skip all billing/onboarding checks
  if (foundryConfig?.configured) {
    if (!validatedProject && !isLoadingProjects) {
      return <SelectRepoPage />
    }
    return <AgentsLayout />
  }

  // kCode uses Azure credentials - show Azure onboarding if not configured
  if (!apiKeyOnboardingCompleted) {
    return <AzureOnboardingPage />
  }

  if (!validatedProject && !isLoadingProjects) {
    return <SelectRepoPage />
  }

  return <AgentsLayout />
}

export function App() {
  // Initialize analytics on mount
  useEffect(() => {
    initAnalytics()

    // Sync analytics opt-out status to main process
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

    // Identify user if already authenticated
    const identifyUser = async () => {
      try {
        const user = await window.desktopApi?.getUser()
        if (user?.id) {
          identify(user.id, { email: user.email, name: user.name })
        }
      } catch (error) {
        console.warn("[Analytics] Failed to identify user:", error)
      }
    }
    identifyUser()

    // Cleanup on unmount
    return () => {
      shutdown()
    }
  }, [])

  return (
    <JotaiProvider store={appStore}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <VSCodeThemeProvider>
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
        </VSCodeThemeProvider>
      </ThemeProvider>
    </JotaiProvider>
  )
}
