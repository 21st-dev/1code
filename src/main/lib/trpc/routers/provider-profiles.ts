import { z } from "zod"
import type { ProviderProfileTarget } from "../../../../shared/provider-profile-types"
import { getRuntimeFeatureSettingsSnapshot } from "../../agent-runtime/runtime-feature-settings"
import {
  providerProfileAuthModeSchema,
  providerProfileCapabilitiesSchema,
  providerProfileDefaultPurposeSchema,
  providerProfileProtocolSchema,
  providerProfileTargetSchema,
  getProviderDefaults,
  getProviderProfileMetadata,
  getProviderProfileRuntimeConfig,
  listProviderProfiles,
  saveProviderProfile,
  deleteProviderProfile,
  setProviderDefault,
} from "../../provider-profiles/storage"
import { PROVIDER_PROFILE_PRESETS } from "../../provider-profiles/presets"
import { testProviderProfile } from "../../provider-profiles/gateway"
import { publicProcedure, router } from "../index"

const headersSchema = z.record(z.string(), z.string()).default({})

const saveInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  presetId: z.string().nullable().optional(),
  protocol: providerProfileProtocolSchema,
  baseUrl: z.string().min(1),
  defaultModel: z.string().min(1),
  authMode: providerProfileAuthModeSchema,
  token: z.string().optional(),
  headers: headersSchema.optional(),
  targetRuntimes: z.array(providerProfileTargetSchema).min(1),
  capabilities: providerProfileCapabilitiesSchema.optional(),
})

export function normalizeProviderProfileTargetsForKunRuntimeGate(input: {
  targetRuntimes: ProviderProfileTarget[]
  capabilities?: z.infer<typeof providerProfileCapabilitiesSchema>
  existingTargetRuntimes?: ProviderProfileTarget[]
  kunRuntimeEnabled: boolean
}): {
  targetRuntimes: ProviderProfileTarget[]
  capabilities?: z.infer<typeof providerProfileCapabilitiesSchema>
} {
  if (input.kunRuntimeEnabled) {
    return {
      targetRuntimes: input.targetRuntimes,
      capabilities: input.capabilities,
    }
  }

  const preserveExistingKun =
    input.existingTargetRuntimes?.includes("kun") ?? false
  const targetRuntimes: ProviderProfileTarget[] = input.targetRuntimes.filter(
    (target) => target !== "kun",
  )
  if (preserveExistingKun) targetRuntimes.push("kun")
  return {
    targetRuntimes,
    capabilities: {
      ...(input.capabilities ?? {}),
      kun: preserveExistingKun,
    },
  }
}

function normalizeTargetsForKunRuntimeGate(input: z.infer<typeof saveInputSchema>) {
  const kunEnabled = getRuntimeFeatureSettingsSnapshot({
    env: process.env,
  }).resolved.kunRuntimeEnabled

  const existingProfile = input.id
    ? getProviderProfileMetadata(input.id)
    : null
  const normalized = normalizeProviderProfileTargetsForKunRuntimeGate({
    targetRuntimes: input.targetRuntimes,
    capabilities: input.capabilities,
    existingTargetRuntimes: existingProfile?.targetRuntimes,
    kunRuntimeEnabled: kunEnabled,
  })
  const { targetRuntimes } = normalized
  if (targetRuntimes.length === 0) {
    throw new Error("Kun runtime is disabled. Select another provider target.")
  }
  return {
    ...input,
    targetRuntimes,
    capabilities: normalized.capabilities,
  }
}

export const providerProfilesRouter = router({
  listPresets: publicProcedure.query(() => ({
    presets: PROVIDER_PROFILE_PRESETS,
  })),

  listProfiles: publicProcedure.query(() => ({
    profiles: listProviderProfiles(),
  })),

  getDefaults: publicProcedure.query(() => ({
    defaults: getProviderDefaults(),
  })),

  saveProfile: publicProcedure.input(saveInputSchema).mutation(({ input }) => ({
    profile: saveProviderProfile(normalizeTargetsForKunRuntimeGate(input)),
  })),

  deleteProfile: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => {
      deleteProviderProfile(input.id)
      return { success: true }
    }),

  setDefault: publicProcedure
    .input(
      z.object({
        purpose: providerProfileDefaultPurposeSchema,
        profileId: z.string().nullable(),
        modelOverride: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) => {
      setProviderDefault(input)
      return { defaults: getProviderDefaults() }
    }),

  testProfile: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const profile = getProviderProfileRuntimeConfig(input.id)
      if (!profile) {
        throw new Error("Provider profile not found")
      }
      const status = await testProviderProfile(profile)
      return { status }
    }),
})
