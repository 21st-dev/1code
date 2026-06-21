import type { JsonValue } from "../agent-runtime/runtime-events"
import type {
  DesktopRunProviderBinding,
  DesktopRunRequest,
} from "../agent-runtime/desktop-run-request"
import { buildCodexOfficialRuntimeEnv } from "./official-runtime-env"

type EnvSource = Record<string, string | undefined>

export type CodexAppServerProviderClientConfig = {
  modelProvider?: string
  config?: Record<string, JsonValue>
}

export type CodexAppServerProviderBinding = {
  authMode: NonNullable<DesktopRunProviderBinding["authMode"]>
  runtimeEnv: Record<string, string>
  client: CodexAppServerProviderClientConfig
}

export class CodexAppServerProviderBindingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CodexAppServerProviderBindingError"
  }
}

const RENDERER_SECRET_KEY_PATTERN =
  /(?:api[_-]?key|auth[_-]?config|authorization|bearer|client[_-]?secret|cookie|custom[_-]?env|env(?:ironment)?|env[_-]?vars|env[_-]?http[_-]?headers|gateway[_-]?token|headers?|http[_-]?headers|mcp[_-]?servers|mcp[_-]?session[_-]?servers|oauth|password|process[_-]?env|provider[_-]?config|provider[_-]?token|refresh[_-]?token|secret|shell[_-]?env|token)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function assertNoCodexAppServerRendererSecrets(
  value: unknown,
  path = "input",
  options: {
    trustedSubtreePaths?: string[]
  } = {},
): void {
  if (isTrustedCodexAppServerRendererSecretSubtree(path, options)) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoCodexAppServerRendererSecrets(
        item,
        `${path}[${index}]`,
        options,
      ),
    )
    return
  }

  if (!isRecord(value)) return

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (
      isTrustedCodexAppServerRendererSecretSubtree(childPath, options)
    ) {
      continue
    }
    if (RENDERER_SECRET_KEY_PATTERN.test(key)) {
      throw new CodexAppServerProviderBindingError(
        `Secret-bearing Codex app-server renderer input is not allowed: ${childPath}.`,
      )
    }
    assertNoCodexAppServerRendererSecrets(child, childPath, options)
  }
}

function isTrustedCodexAppServerRendererSecretSubtree(
  path: string,
  options: { trustedSubtreePaths?: string[] },
): boolean {
  return (
    options.trustedSubtreePaths?.some(
      (trustedPath) =>
        path === trustedPath ||
        path.startsWith(`${trustedPath}.`) ||
        path.startsWith(`${trustedPath}[`),
    ) ?? false
  )
}

export function buildCodexAppServerProviderBinding({
  request,
  processEnv,
  shellEnv,
  providerGatewayToken,
  appManagedApiKey,
}: {
  request: Pick<DesktopRunRequest, "providerBinding">
  processEnv?: EnvSource
  shellEnv?: EnvSource
  providerGatewayToken?: string | null
  appManagedApiKey?: string | null
}): CodexAppServerProviderBinding {
  const authMode = request.providerBinding.authMode ?? "runtime-managed"

  if (authMode === "provider-profile") {
    const providerProfileId = request.providerBinding.providerProfileId?.trim()
    const gatewayEndpoint = request.providerBinding.gatewayEndpoint?.trim()
    const gatewayToken = providerGatewayToken?.trim()
    if (!providerProfileId || !gatewayEndpoint || !gatewayToken) {
      throw new CodexAppServerProviderBindingError(
        "Codex app-server provider-profile binding requires main-process gateway endpoint and token.",
      )
    }

    return {
      authMode,
      runtimeEnv: buildCodexOfficialRuntimeEnv({
        processEnv,
        shellEnv,
        providerGatewayToken: gatewayToken,
      }),
      client: {
        modelProvider: "locus_profile",
        config: {
          "model_providers.locus_profile.name": "Locus provider profile",
          "model_providers.locus_profile.base_url": gatewayEndpoint,
          "model_providers.locus_profile.env_key":
            "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
          "model_providers.locus_profile.wire_api": "responses",
        },
      },
    }
  }

  if (authMode === "app-managed") {
    const apiKey = appManagedApiKey?.trim()
    if (!apiKey) {
      throw new CodexAppServerProviderBindingError(
        "Codex app-server app-managed binding requires a main-process API key.",
      )
    }

    return {
      authMode,
      runtimeEnv: buildCodexOfficialRuntimeEnv({
        processEnv,
        shellEnv,
        appManagedApiKey: apiKey,
      }),
      client: {},
    }
  }

  return {
    authMode: "runtime-managed",
    runtimeEnv: buildCodexOfficialRuntimeEnv({ processEnv, shellEnv }),
    client: {},
  }
}
