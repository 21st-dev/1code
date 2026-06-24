import { z } from "zod"
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

function getKunRuntimeEnabledForProviderProfileSave(): boolean {
  return getRuntimeFeatureSettingsSnapshot({
    env: process.env,
  }).resolved.kunRuntimeEnabled
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
    profile: saveProviderProfile(input, {
      kunRuntimeEnabled: getKunRuntimeEnabledForProviderProfileSave(),
    }),
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
