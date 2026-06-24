import type { AuthUser } from "../../auth-store"
import { AGENT_ENGINE_IDS, type AgentEngineId } from "../agent-runtime/types"
import type {
  MossProviderConfig,
  MossProviderDefinition,
  MossProviderReadResult,
} from "../moss-source"

export type MossAccountEntitlementStatus =
  | "ready"
  | "needs-sign-in"
  | "custom-ready"
  | "custom-needs-key"
  | "custom-needs-url"
  | "missing-project"
  | "provider-error"

export type MossProviderCredentialStatus =
  | "moss-managed"
  | "stored-key"
  | "inline-key"
  | "env-key"
  | "missing-key"
  | "missing-project"
  | "provider-error"

export type MossProviderBaseUrlStatus =
  | "configured-url"
  | "env-url"
  | "missing-url"
  | "not-required"
  | "missing-project"
  | "provider-error"

export interface MossAccountPlan {
  plan: string
  status: string | null
  source?: "backend" | "local"
  quota?: MossAccountPlanQuota | null
}

export interface MossAccountPlanQuota {
  includedCredits?: number | null
  usedCredits?: number | null
  remainingCredits?: number | null
  resetAt?: string | null
  unit?: string | null
  source?: "backend" | "plan-default" | "none"
}

export interface MossStoredProviderSecretSummary {
  hasApiKey?: boolean
}

export interface MossAccountEntitlement {
  status: MossAccountEntitlementStatus
  account: {
    signedIn: boolean
    userId: string | null
    email: string | null
    name: string | null
  }
  plan: {
    id: string
    status: string
    isPaid: boolean
    source: "backend" | "local" | "none"
  }
  quota: {
    providerId: "moss"
    label: string
    mode: "bundled-quota"
    status: "available" | "needs-sign-in" | "checking" | "inactive"
    sharedAcrossEngines: boolean
    includedCredits: number | null
    usedCredits: number | null
    remainingCredits: number | null
    resetAt: string | null
    unit: string
    source: "backend" | "plan-default" | "none"
    reason: string
  }
  provider: {
    sourcePath: string
    defaultProvider: string
    activeProviderId: string | null
    useCustomProvider: boolean
    sharedAcrossEngines: boolean
    credentialStatus: MossProviderCredentialStatus
    baseUrlStatus: MossProviderBaseUrlStatus
    reason: string
  }
  engines: Array<{
    engineId: AgentEngineId
    providerId: string | null
    model: string | null
    credentialMode: MossProviderCredentialStatus
    status: "ready" | "needs-sign-in" | "needs-api-key" | "needs-base-url" | "unconfigured"
  }>
}

const ENGINE_IDS: readonly AgentEngineId[] = AGENT_ENGINE_IDS
const PAID_PLAN_IDS = new Set([
  "moss_pro",
  "moss_team",
  "moss_enterprise",
  "onecode_pro",
  "onecode_max_100",
  "onecode_max",
])

const PLAN_QUOTA_DEFAULTS: Record<string, Required<Omit<MossAccountPlanQuota, "usedCredits" | "remainingCredits" | "resetAt">> & Pick<MossAccountPlanQuota, "resetAt" | "usedCredits" | "remainingCredits">> = {
  moss_free: {
    includedCredits: 250,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  onecode_free: {
    includedCredits: 250,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  moss_pro: {
    includedCredits: 10000,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  onecode_pro: {
    includedCredits: 10000,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  onecode_max_100: {
    includedCredits: 100000,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  onecode_max: {
    includedCredits: 250000,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  moss_team: {
    includedCredits: 50000,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "credits",
    source: "plan-default",
  },
  moss_enterprise: {
    includedCredits: null,
    usedCredits: null,
    remainingCredits: null,
    resetAt: null,
    unit: "contract credits",
    source: "plan-default",
  },
}

function isActivePaidPlan(plan: MossAccountPlan | null | undefined): boolean {
  if (!plan) return false
  return PAID_PLAN_IDS.has(plan.plan) && plan.status === "active"
}

function normalizeQuotaNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.floor(value)
}

function buildPlanQuotaAllowance(
  plan: MossAccountPlan | null | undefined,
): Pick<
  MossAccountEntitlement["quota"],
  | "includedCredits"
  | "usedCredits"
  | "remainingCredits"
  | "resetAt"
  | "unit"
  | "source"
> {
  if (!plan) {
    return {
      includedCredits: null,
      usedCredits: null,
      remainingCredits: null,
      resetAt: null,
      unit: "credits",
      source: "none",
    }
  }

  const fallback = PLAN_QUOTA_DEFAULTS[plan.plan]
  const quota = plan.quota ?? null
  const source = quota ? "backend" : fallback?.source ?? "none"
  const includedCredits =
    normalizeQuotaNumber(quota?.includedCredits) ??
    fallback?.includedCredits ??
    null
  const usedCredits = normalizeQuotaNumber(quota?.usedCredits)
  const remainingCredits =
    normalizeQuotaNumber(quota?.remainingCredits) ??
    (includedCredits !== null && usedCredits !== null
      ? Math.max(includedCredits - usedCredits, 0)
      : null)

  return {
    includedCredits,
    usedCredits,
    remainingCredits,
    resetAt: quota?.resetAt ?? fallback?.resetAt ?? null,
    unit: quota?.unit ?? fallback?.unit ?? "credits",
    source,
  }
}

function hasManagedQuotaAccess(plan: MossAccountPlan | null | undefined): boolean {
  if (!plan || plan.status !== "active") return false
  const allowance = buildPlanQuotaAllowance(plan)
  return allowance.source !== "none"
}

function getProvider(
  config: MossProviderConfig | undefined,
  providerId: string | undefined,
): MossProviderDefinition | undefined {
  if (!config || !providerId) return undefined
  return config.providers[providerId]
}

function getProviderCredentialStatus(params: {
  provider?: MossProviderDefinition
  storedSecret?: MossStoredProviderSecretSummary
  missingProject?: boolean
  providerError?: boolean
}): MossProviderCredentialStatus {
  if (params.missingProject) return "missing-project"
  if (params.providerError) return "provider-error"
  const provider = params.provider
  if (!provider) return "missing-key"
  if (provider.mode === "bundled-quota") return "moss-managed"
  if (params.storedSecret?.hasApiKey) return "stored-key"
  if (provider.apiKey) return "inline-key"
  if (provider.apiKeyEnv) return "env-key"
  return "missing-key"
}

function hasEnvValue(envName: string | undefined): boolean {
  if (!envName) return false
  const value = process.env[envName]
  return typeof value === "string" && value.trim().length > 0
}

function getProviderBaseUrlStatus(params: {
  provider?: MossProviderDefinition
  missingProject?: boolean
  providerError?: boolean
}): MossProviderBaseUrlStatus {
  if (params.missingProject) return "missing-project"
  if (params.providerError) return "provider-error"

  const provider = params.provider
  if (!provider) return "missing-url"
  if (provider.mode !== "custom-url-key") return "not-required"
  if (provider.baseUrl) return "configured-url"
  if (hasEnvValue(provider.baseUrlEnv)) return "env-url"

  const supportedEngineIds = ENGINE_IDS.filter((engineId) =>
    providerSupportsEngine(provider, engineId),
  )
  if (supportedEngineIds.length === 0) return "missing-url"

  const engineUrlStates = supportedEngineIds.map((engineId) => {
    const engineConfig = provider.engines?.[engineId]
    if (engineConfig?.baseUrl) return "configured-url"
    if (hasEnvValue(engineConfig?.baseUrlEnv)) return "env-url"
    return "missing-url"
  })

  if (engineUrlStates.every((status) => status !== "missing-url")) {
    return engineUrlStates.includes("configured-url")
      ? "configured-url"
      : "env-url"
  }

  return "missing-url"
}

function providerSupportsEngine(
  provider: MossProviderDefinition | undefined,
  engineId: AgentEngineId,
): boolean {
  if (!provider) return false
  if (provider.engines?.[engineId]) return true
  if (provider.runtime === "any") return true
  if (provider.runtime === engineId) return true
  if (provider.runtime === "claude" && engineId === "claude-code") return true
  if (provider.runtime === "openai" && engineId === "codex") return true
  return provider.mode === "bundled-quota"
}

function getEngineModel(
  provider: MossProviderDefinition | undefined,
  engineId: AgentEngineId,
): string | null {
  if (!provider) return null
  return (
    provider.engines?.[engineId]?.model ??
    provider.models?.[engineId] ??
    provider.model ??
    null
  )
}

function buildQuota(params: {
  user: AuthUser | null
  plan: MossAccountPlan | null
  sharedAcrossEngines: boolean
}): MossAccountEntitlement["quota"] {
  const allowance = buildPlanQuotaAllowance(params.plan)

  if (!params.user) {
    return {
      providerId: "moss",
      label: "Moss Managed",
      mode: "bundled-quota",
      status: "needs-sign-in",
      sharedAcrossEngines: params.sharedAcrossEngines,
      ...allowance,
      reason:
        "Sign in to use Moss managed quota across Hermes, Claude Code, Codex, and Custom ACP.",
    }
  }

  if (!params.plan) {
    return {
      providerId: "moss",
      label: "Moss Managed",
      mode: "bundled-quota",
      status: "checking",
      sharedAcrossEngines: params.sharedAcrossEngines,
      ...allowance,
      reason: "Moss account is signed in; quota status needs a backend entitlement refresh.",
    }
  }

  if (hasManagedQuotaAccess(params.plan)) {
    return {
      providerId: "moss",
      label: "Moss Managed",
      mode: "bundled-quota",
      status: "available",
      sharedAcrossEngines: params.sharedAcrossEngines,
      ...allowance,
      reason: "Moss managed quota is available for the shared provider route.",
    }
  }

  return {
    providerId: "moss",
    label: "Moss Managed",
    mode: "bundled-quota",
    status: "inactive",
    sharedAcrossEngines: params.sharedAcrossEngines,
    ...allowance,
    reason: "Moss account is signed in, but the current plan does not include managed quota.",
  }
}

export function buildMossAccountEntitlement(params: {
  user?: AuthUser | null
  plan?: MossAccountPlan | null
  providerReadResult?: MossProviderReadResult | null
  storedSecrets?: Record<string, MossStoredProviderSecretSummary>
}): MossAccountEntitlement {
  const user = params.user ?? null
  const plan = params.plan ?? null
  const providerReadResult = params.providerReadResult ?? null
  const config = providerReadResult?.config
  const providerStatus = providerReadResult?.status
  const missingProject = !providerReadResult || providerStatus === "missing"
  const providerError = providerStatus === "parse-error"
  const defaultProvider = config?.defaultProvider ?? "moss"
  const sharedAcrossEngines =
    config?.credentialPolicy?.shareAcrossEngines ?? true
  const activeProvider = providerError
    ? undefined
    : getProvider(config, defaultProvider) ?? getProvider(config, "moss")
  const activeProviderId = activeProvider?.id ?? null
  const useCustomProvider = activeProviderId === "custom"
  const credentialStatus = getProviderCredentialStatus({
    provider: activeProvider,
    storedSecret: activeProviderId
      ? params.storedSecrets?.[activeProviderId]
      : undefined,
    missingProject,
    providerError,
  })
  const baseUrlStatus = getProviderBaseUrlStatus({
    provider: activeProvider,
    missingProject,
    providerError,
  })
  const quota = buildQuota({
    user,
    plan,
    sharedAcrossEngines,
  })

  let status: MossAccountEntitlementStatus
  if (missingProject) {
    status = "missing-project"
  } else if (providerError) {
    status = "provider-error"
  } else if (useCustomProvider) {
    if (
      credentialStatus !== "stored-key" &&
      credentialStatus !== "inline-key" &&
      credentialStatus !== "env-key"
    ) {
      status = "custom-needs-key"
    } else if (baseUrlStatus === "missing-url") {
      status = "custom-needs-url"
    } else {
      status = "custom-ready"
    }
  } else {
    status = quota.status === "available" ? "ready" : "needs-sign-in"
  }

  return {
    status,
    account: {
      signedIn: Boolean(user),
      userId: user?.id ?? null,
      email: user?.email ?? null,
      name: user?.name ?? null,
    },
    plan: {
      id: plan?.plan ?? (user ? "unknown" : "signed-out"),
      status: plan?.status ?? (user ? "unknown" : "signed-out"),
      isPaid: isActivePaidPlan(plan),
      source: plan?.source ?? (plan ? "backend" : "none"),
    },
    quota,
    provider: {
      sourcePath: providerReadResult?.sourcePath ?? "",
      defaultProvider,
      activeProviderId,
      useCustomProvider,
      sharedAcrossEngines,
      credentialStatus,
      baseUrlStatus,
      reason:
        providerReadResult?.error ??
        (useCustomProvider && baseUrlStatus === "missing-url"
          ? "Custom URL/key requires one base URL before Hermes, Claude Code, Codex, and Custom ACP can share it."
          : useCustomProvider
            ? "Custom URL/key is shared across all engines."
            : "Moss Managed quota is the default shared provider route."),
    },
    engines: ENGINE_IDS.map((engineId) => {
      const supportsEngine = providerSupportsEngine(activeProvider, engineId)
      let engineStatus: MossAccountEntitlement["engines"][number]["status"]
      if (!supportsEngine) {
        engineStatus = "unconfigured"
      } else if (useCustomProvider) {
        if (
          credentialStatus !== "stored-key" &&
          credentialStatus !== "inline-key" &&
          credentialStatus !== "env-key"
        ) {
          engineStatus = "needs-api-key"
        } else if (baseUrlStatus === "missing-url") {
          engineStatus = "needs-base-url"
        } else {
          engineStatus = "ready"
        }
      } else {
        engineStatus =
          quota.status === "available" ? "ready" : "needs-sign-in"
      }

      return {
        engineId,
        providerId: activeProviderId,
        model: getEngineModel(activeProvider, engineId),
        credentialMode: credentialStatus,
        status: engineStatus,
      }
    }),
  }
}
