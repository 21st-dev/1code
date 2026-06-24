import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { getElectronUserDataPath } from "../electron-app"
import {
  getProviderGatewayEndpoint,
  revokeProviderGatewayToken,
} from "../provider-profiles/gateway"
import type { ProviderProfileRuntimeConfig } from "../provider-profiles/storage"

export type SynthesizedKunProviderConfig = {
  configPath: string
  providerProfileId: string
  model: string
  gatewayBaseUrl: string
  gatewayToken: string
  secretHints: readonly string[]
  cleanup: () => void
}

function safeRunDirectoryName(runId: string): string {
  return runId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "run"
}

export async function synthesizeKunProviderConfig(input: {
  runId: string
  profile: ProviderProfileRuntimeConfig
  userDataPath?: string
}): Promise<SynthesizedKunProviderConfig> {
  if (!input.profile.targetRuntimes.includes("kun")) {
    throw new Error("Selected provider profile does not target Kun.")
  }

  const endpoint = await getProviderGatewayEndpoint(
    input.profile.id,
    "responses",
  )
  const root = input.userDataPath ?? getElectronUserDataPath()
  const configPath = join(
    root,
    "kun-provider-configs",
    safeRunDirectoryName(input.runId),
    "config.json",
  )
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 })
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        serve: {
          baseUrl: endpoint.baseUrl,
          apiKey: endpoint.token,
          endpointFormat: "responses",
          model: input.profile.defaultModel,
        },
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  )

  let cleaned = false
  return {
    configPath,
    providerProfileId: input.profile.id,
    model: input.profile.defaultModel,
    gatewayBaseUrl: endpoint.baseUrl,
    gatewayToken: endpoint.token,
    secretHints: [endpoint.token],
    cleanup: () => {
      if (cleaned) return
      cleaned = true
      revokeProviderGatewayToken(endpoint.token)
      rmSync(dirname(configPath), { recursive: true, force: true })
    },
  }
}
