import { Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useMemo } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { TRPCProvider } from "./contexts/TRPCProvider";
import {
  WindowProvider,
  getInitialWindowParams,
} from "./contexts/WindowContext";
import {
  selectedProjectAtom,
  selectedAgentChatIdAtom,
} from "./features/agents/atoms";
import { useAgentSubChatStore } from "./features/agents/stores/sub-chat-store";
import { AgentsLayout } from "./features/layout/agents-layout";
import {
  AnthropicOnboardingPage,
  ApiKeyOnboardingPage,
  BillingMethodPage,
  CliConfigDetectedPage,
  SelectRepoPage,
} from "./features/onboarding";
import { identify, initAnalytics, shutdown } from "./lib/analytics";
import {
  anthropicOnboardingCompletedAtom,
  apiKeyOnboardingCompletedAtom,
  billingMethodAtom,
  cliConfigDetectedShownAtom,
} from "./lib/atoms";
import { appStore } from "./lib/jotai-store";
import { VSCodeThemeProvider } from "./lib/themes/theme-provider";
import { useTrayEvents } from "./lib/tray-events";
import { trpc } from "./lib/trpc";

/**
 * Custom Toaster that adapts to theme
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  );
}

/**
 * Main content router - decides which page to show based on onboarding state
 */
function AppContent() {
  const billingMethod = useAtomValue(billingMethodAtom);
  const setBillingMethod = useSetAtom(billingMethodAtom);
  const anthropicOnboardingCompleted = useAtomValue(
    anthropicOnboardingCompletedAtom,
  );
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  );
  const apiKeyOnboardingCompleted = useAtomValue(apiKeyOnboardingCompletedAtom);
  const setApiKeyOnboardingCompleted = useSetAtom(
    apiKeyOnboardingCompletedAtom,
  );
  const cliConfigDetectedShown = useAtomValue(cliConfigDetectedShownAtom);
  const setCliConfigDetectedShown = useSetAtom(cliConfigDetectedShownAtom);
  const selectedProject = useAtomValue(selectedProjectAtom);
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom);
  const { setActiveSubChat, addToOpenSubChats, setChatId } =
    useAgentSubChatStore();

  // Apply initial window params (chatId/subChatId) when opening via "Open in new window"
  useEffect(() => {
    const params = getInitialWindowParams();
    if (params.chatId) {
      console.log(
        "[App] Opening chat from window params:",
        params.chatId,
        params.subChatId,
      );
      setSelectedChatId(params.chatId);
      setChatId(params.chatId);
      if (params.subChatId) {
        addToOpenSubChats(params.subChatId);
        setActiveSubChat(params.subChatId);
      }
    }
  }, [setSelectedChatId, setChatId, addToOpenSubChats, setActiveSubChat]);

  // Check if user has existing CLI config (API key or proxy)
  // Based on PR #29 by @sa4hnd
  const { data: cliConfig, isLoading: isLoadingCliConfig } =
    trpc.claudeCode.hasExistingCliConfig.useQuery();

  // Migration: If user already completed Anthropic onboarding but has no billing method set,
  // automatically set it to "claude-subscription" (legacy users before billing method was added)
  useEffect(() => {
    if (!billingMethod && anthropicOnboardingCompleted) {
      setBillingMethod("claude-subscription");
    }
  }, [billingMethod, anthropicOnboardingCompleted, setBillingMethod]);

  // Auto-skip onboarding if user has existing CLI config (API key or proxy)
  // This allows users with ANTHROPIC_API_KEY to use the app without OAuth
  // Only auto-skip if the user has already seen the CLI config detected page
  useEffect(() => {
    if (cliConfig?.hasConfig && !billingMethod && cliConfigDetectedShown) {
      console.log(
        "[App] Detected existing CLI config, auto-completing onboarding",
      );
      setBillingMethod("api-key");
      setApiKeyOnboardingCompleted(true);
    }
  }, [
    cliConfig?.hasConfig,
    billingMethod,
    cliConfigDetectedShown,
    setBillingMethod,
    setApiKeyOnboardingCompleted,
  ]);

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery();

  // Validated project - only valid if exists in DB
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null;
    // While loading, trust localStorage value to prevent flicker
    if (isLoadingProjects) return selectedProject;
    // After loading, validate against DB
    if (!projects) return null;
    const exists = projects.some((p) => p.id === selectedProject.id);
    return exists ? selectedProject : null;
  }, [selectedProject, projects, isLoadingProjects]);

  // Determine which page to show:
  // 1. No billing method selected -> BillingMethodPage OR CliConfigDetectedPage
  // 2. Claude subscription selected but not completed -> AnthropicOnboardingPage
  // 3. API key or custom model selected but not completed -> ApiKeyOnboardingPage
  // 4. No valid project selected -> SelectRepoPage
  // 5. Otherwise -> AgentsLayout

  // Show CLI config detected page if config exists and user hasn't seen it yet
  if (
    !billingMethod &&
    cliConfig?.hasConfig &&
    !cliConfigDetectedShown &&
    !isLoadingCliConfig
  ) {
    return <CliConfigDetectedPage />;
  }

  if (!billingMethod) {
    return <BillingMethodPage />;
  }

  if (
    billingMethod === "claude-subscription" &&
    !anthropicOnboardingCompleted
  ) {
    return <AnthropicOnboardingPage />;
  }

  if (
    (billingMethod === "api-key" || billingMethod === "custom-model") &&
    !apiKeyOnboardingCompleted
  ) {
    return <ApiKeyOnboardingPage />;
  }

  if (!validatedProject && !isLoadingProjects) {
    return <SelectRepoPage />;
  }

  return <AgentsLayout />;
}

export function App() {
  // Listen for tray events (settings, workspace selection)
  useTrayEvents();

  // Initialize analytics on mount
  useEffect(() => {
    initAnalytics();

    // Sync analytics opt-out status to main process
    const syncOptOutStatus = async () => {
      try {
        const optOut =
          localStorage.getItem("preferences:analytics-opt-out") === "true";
        await window.desktopApi?.setAnalyticsOptOut(optOut);
      } catch (error) {
        console.warn("[Analytics] Failed to sync opt-out status:", error);
      }
    };
    syncOptOutStatus();

    // Identify user if already authenticated
    const identifyUser = async () => {
      try {
        const user = await window.desktopApi?.getUser();
        if (user?.id) {
          identify(user.id, { email: user.email, name: user.name });
        }
      } catch (error) {
        console.warn("[Analytics] Failed to identify user:", error);
      }
    };
    identifyUser();

    // Cleanup on unmount
    return () => {
      shutdown();
    };
  }, []);

  return (
    <WindowProvider>
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
    </WindowProvider>
  );
}
