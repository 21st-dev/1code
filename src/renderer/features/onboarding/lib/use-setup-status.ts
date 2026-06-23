import { useAtomValue } from "jotai"
import { useMemo } from "react"
import { trpc, trpcClient } from "../../../lib/trpc"
import { selectedProjectAtom } from "../../agents/atoms"
import { getUsableClaudeProviderProfile } from "../../agents/lib/models"
import { deriveSetupStatus, type SetupStatus } from "./derive-setup-status"

/**
 * Derived setup status hook.
 *
 * This is the single source of truth for "is the app configured enough to use".
 * It is computed entirely from the provider/runtime owners (Claude Code, Codex,
 * provider profiles, projects) — there are no separate "onboarding completed"
 * booleans. A revoked token or removed profile therefore reflects immediately,
 * and the same status is consumed by non-onboarding surfaces (new chat form,
 * chat input, login modals) so the two can never drift. The derivation itself
 * lives in {@link deriveSetupStatus} (pure, testable).
 */

const PROVIDER_STATUS_STALE_TIME = 30_000

export type {
  SetupClaudeStatus,
  SetupCodexStatus,
  SetupStatus,
  SetupStatusInputs,
} from "./derive-setup-status"
export { deriveSetupStatus } from "./derive-setup-status"

export function useSetupStatus(): SetupStatus {
  const selectedProject = useAtomValue(selectedProjectAtom)

  const claudeRuntime = trpc.claudeCode.getRuntimeStatus.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })
  const claudeIntegration = trpc.claudeCode.getIntegration.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })
  const cliConfig = trpc.claudeCode.hasExistingCliConfig.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })
  const providerProfiles = trpc.providerProfiles.listProfiles.useQuery(
    undefined,
    { staleTime: PROVIDER_STATUS_STALE_TIME },
  )
  const secureProviderConfig = trpc.claudeProviderConfig.get.useQuery(
    undefined,
    { staleTime: PROVIDER_STATUS_STALE_TIME },
  )
  const codexRuntime = trpc.codex.getRuntimeStatus.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })
  const codexIntegration = trpc.codex.getIntegration.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })
  const codexApiKey = trpc.codex.getCodexApiKeyStatus.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    staleTime: PROVIDER_STATUS_STALE_TIME,
  })

  return useMemo(() => {
    const hasClaudeApiProfile =
      Boolean(
        getUsableClaudeProviderProfile(providerProfiles.data?.profiles ?? []),
      ) || Boolean(secureProviderConfig.data?.config?.hasToken)

    // Trust the persisted selection while the list loads to avoid flashing the
    // repo step on relaunch (mirrors App.tsx's validatedProject logic).
    const hasProject = (() => {
      if (!selectedProject) return false
      if (projectsQuery.isLoading) return true
      const projects = projectsQuery.data
      if (!projects) return false
      return projects.some((project) => project.id === selectedProject.id)
    })()

    return deriveSetupStatus({
      claudeRuntimeReady: claudeRuntime.data?.executable.ok === true,
      claudeOauthConnected: Boolean(claudeIntegration.data?.isConnected),
      claudeOauthExpired: Boolean(claudeIntegration.data?.isExpired),
      claudeDisplayName: claudeIntegration.data?.displayName ?? null,
      hasCliConfig: Boolean(cliConfig.data?.hasConfig),
      hasClaudeApiProfile,
      codexRuntimeReady: codexRuntime.data?.ok === true,
      codexState: codexIntegration.data?.state,
      codexApiKeyPresent: Boolean(codexApiKey.data?.hasApiKey),
      hasProject,
      statusQueriesLoading:
        claudeRuntime.isLoading ||
        claudeIntegration.isLoading ||
        cliConfig.isLoading ||
        providerProfiles.isLoading ||
        secureProviderConfig.isLoading ||
        codexRuntime.isLoading ||
        codexIntegration.isLoading ||
        codexApiKey.isLoading,
    })
  }, [
    claudeRuntime.data,
    claudeRuntime.isLoading,
    claudeIntegration.data,
    claudeIntegration.isLoading,
    cliConfig.data,
    cliConfig.isLoading,
    providerProfiles.data,
    providerProfiles.isLoading,
    secureProviderConfig.data,
    secureProviderConfig.isLoading,
    codexRuntime.data,
    codexRuntime.isLoading,
    codexIntegration.data,
    codexIntegration.isLoading,
    codexApiKey.data,
    codexApiKey.isLoading,
    projectsQuery.data,
    projectsQuery.isLoading,
    selectedProject,
  ])
}

/**
 * Non-React snapshot of Codex connection state, derived from the live owners.
 * Used by {@link file://./acp-chat-transport.ts} which runs outside React and
 * previously read the (now removed) onboarding atoms via appStore.
 */
export async function getCodexConnectionSnapshot(
  client: typeof trpcClient = trpcClient,
): Promise<{
  apiKeyConnected: boolean
  oauthConnected: boolean
  authMethod: "chatgpt" | "api_key" | null
  hasAny: boolean
}> {
  const [apiKeyStatus, integration] = await Promise.all([
    client.codex.getCodexApiKeyStatus
      .query()
      .catch(() => ({ hasApiKey: false }) as { hasApiKey: boolean }),
    client.codex.getIntegration
      .query()
      .catch(() => ({ state: "unknown" }) as { state: string }),
  ])

  const oauthConnected = integration.state === "connected_chatgpt"
  const apiKeyConnected =
    Boolean(apiKeyStatus.hasApiKey) || integration.state === "connected_api_key"

  return {
    apiKeyConnected,
    oauthConnected,
    authMethod: oauthConnected ? "chatgpt" : apiKeyConnected ? "api_key" : null,
    hasAny: oauthConnected || apiKeyConnected,
  }
}
