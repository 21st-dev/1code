import { z } from "zod"
import { getAuthManager } from "../../../auth-manager"
import {
  buildMossAccountEntitlement,
  type MossAccountPlanQuota,
} from "../../moss-account"
import {
  hasMossProviderSecret,
  readMossProviderConfig,
  type MossProviderConfig,
} from "../../moss-source"
import { publicProcedure, router } from "../index"

const PLAN_FETCH_TIMEOUT_MS = 2500

async function buildStoredSecretSummary(
  config: MossProviderConfig | undefined,
): Promise<Record<string, { hasApiKey?: boolean }>> {
  const providerIds = Object.keys(config?.providers ?? {})
  const entries = await Promise.all(
    providerIds.map(async (providerId) => [
      providerId,
      { hasApiKey: await hasMossProviderSecret(providerId) },
    ] as const),
  )
  return Object.fromEntries(entries)
}

function normalizePlanQuota(planData: {
  quota?: MossAccountPlanQuota | null
  includedCredits?: number | null
  usedCredits?: number | null
  remainingCredits?: number | null
  resetAt?: string | null
  quotaUnit?: string | null
}): MossAccountPlanQuota | null {
  const quota = planData.quota ?? null
  if (quota) return { ...quota, source: "backend" }

  if (
    planData.includedCredits === undefined &&
    planData.usedCredits === undefined &&
    planData.remainingCredits === undefined &&
    planData.resetAt === undefined &&
    planData.quotaUnit === undefined
  ) {
    return null
  }

  return {
    includedCredits: planData.includedCredits,
    usedCredits: planData.usedCredits,
    remainingCredits: planData.remainingCredits,
    resetAt: planData.resetAt,
    unit: planData.quotaUnit,
    source: "backend",
  }
}

async function fetchMossPlanSafely() {
  const authManager = getAuthManager()
  if (!authManager?.isAuthenticated()) return null

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      authManager.fetchUserPlan().then((planData) =>
        planData
          ? {
              plan: planData.plan,
              status: planData.status,
              source: "backend" as const,
              quota: normalizePlanQuota(planData),
            }
          : null,
      ),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), PLAN_FETCH_TIMEOUT_MS)
      }),
    ])
  } catch {
    return null
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export const mossAccountRouter = router({
  getEntitlement: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const authManager = getAuthManager()
      const user = authManager?.getUser() ?? null
      const plan = await fetchMossPlanSafely()

      const providerReadResult = input?.projectPath
        ? await readMossProviderConfig(input.projectPath, {
            createIfMissing: true,
          })
        : null
      const storedSecrets = await buildStoredSecretSummary(
        providerReadResult?.config,
      )

      return buildMossAccountEntitlement({
        user,
        plan,
        providerReadResult,
        storedSecrets,
      })
    }),
})
