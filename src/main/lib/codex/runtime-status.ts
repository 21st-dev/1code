import {
  buildCodexRuntimeAvailabilityFromComponents,
  createCodexRuntimeComponent,
  type CodexRuntimeComponentStatus,
  type RuntimeExecutableLike,
} from "../../../shared/codex-runtime-status"
import {
  CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA,
  CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA,
} from "../agent-runtime/desktop-adapter-metadata"
import type { DesktopRuntimeAdapterMetadata } from "../agent-runtime/desktop-runner"
import { getRegisteredAgentRuntimeManifest } from "../agent-runtime/runtime-registry"
import { isLocalOnlyMode } from "../local-only"
import { getRuntimeExecutableStatus } from "../runtime-executable"
import { resolveCodexAcpBinaryPath } from "./acp-path"
import { probeCodexAcpSpawn } from "./acp-spawn-probe"
import { BUNDLED_CODEX_CLI_VERSION, getBundledCodexCliPath } from "./cli-path"
import {
  resolveCodexDesktopAdapterSelection,
  type CodexDesktopAdapterSelection,
} from "./desktop-adapter-selection"
import { extractCodexError } from "./errors"
import { getCodexIntegrationStatus } from "./integration-status"
import { redactCodexLoginOutput } from "./login-output"
import { getElectronApp, type ElectronAppLike } from "../electron-app"

export type CodexAdapterRuntimeStatusMetadata = {
  bundledCodexVersion: string
  current: DesktopRuntimeAdapterMetadata
  target: DesktopRuntimeAdapterMetadata
  selection: CodexDesktopAdapterSelection
  acpTemporaryCompat: {
    source: DesktopRuntimeAdapterMetadata["source"]
    fallbackReason: string | null
    defaultDisableCondition: string | null
    removalCondition: string | null
  }
}

type EnvLike = Record<string, string | undefined>

function executableStatus(
  executable: RuntimeExecutableLike,
): CodexRuntimeComponentStatus {
  if (executable.ok) return "ready"
  if (!executable.exists) return "missing"
  if (!executable.isExecutable) return "unavailable"
  return "failed"
}

export function buildCodexAdapterRuntimeStatusMetadata(
  input: { env?: EnvLike } = {},
): CodexAdapterRuntimeStatusMetadata {
  const selection = resolveCodexDesktopAdapterSelection(input.env)
  const current = selection.useAppServer
    ? CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA
    : CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA
  return {
    bundledCodexVersion: BUNDLED_CODEX_CLI_VERSION,
    current,
    target: CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA,
    selection,
    acpTemporaryCompat: {
      source: CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA.source,
      fallbackReason:
        CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA.fallbackReason ??
        null,
      defaultDisableCondition:
        CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA.defaultDisableCondition ??
        null,
      removalCondition:
        CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA.removalCondition ??
        null,
    },
  }
}

export async function getCodexRuntimeStatus(
  input: {
    appContext?: Pick<ElectronAppLike, "isPackaged" | "getAppPath">
    env?: EnvLike
  } = {},
) {
  const env = input.env ?? process.env
  const appContext = input.appContext ?? getElectronApp()
  const cliHint = appContext.isPackaged
    ? "Reinstall the app so the bundled Codex command is restored."
    : "Run `bun run codex:download` from the repo, then restart the dev app."
  const acpHint = appContext.isPackaged
    ? "Reinstall the app so the bundled Codex ACP runtime is restored."
    : "Run `bun install` from the repo, then restart the dev app."

  let acpPath: string | null = null
  let acpResolveError: string | null = null
  try {
    acpPath = resolveCodexAcpBinaryPath()
  } catch (error) {
    acpResolveError =
      error instanceof Error
        ? error.message
        : "Codex ACP runtime path could not be resolved."
  }

  const loginCli = getRuntimeExecutableStatus(
    getBundledCodexCliPath(appContext),
    cliHint,
  )
  const acp = getRuntimeExecutableStatus(acpPath, acpHint)
  const spawnProbe = acp.ok
    ? await probeCodexAcpSpawn(acp.path)
    : {
        ok: false,
        exitCode: null,
        signal: null,
        error: acp.error,
        stdoutPreview: "",
        stderrPreview: "",
        durationMs: 0,
      }
  const acpWithProbe = { ...acp, spawnProbe }
  const resolvedAcp = acpResolveError
    ? { ...acpWithProbe, error: acpResolveError }
    : acpWithProbe
  const adapterStatus = buildCodexAdapterRuntimeStatusMetadata({ env })
  const adapterMetadata = adapterStatus.current
  const acpBlocking = !adapterStatus.selection.useAppServer
  const acpSpawnBlockedByRuntime = !resolvedAcp.ok
  const runtimeAvailability = buildCodexRuntimeAvailabilityFromComponents([
    createCodexRuntimeComponent({
      id: "login-cli",
      label: "Codex CLI",
      status: executableStatus(loginCli),
      ok: loginCli.ok,
      error: loginCli.error,
      hint: loginCli.hint,
      path: loginCli.path,
    }),
    createCodexRuntimeComponent({
      id: "acp-runtime",
      label: "Codex ACP runtime",
      status: executableStatus(resolvedAcp),
      ok: resolvedAcp.ok,
      blocking: acpBlocking,
      error: resolvedAcp.error,
      hint: acpBlocking
        ? resolvedAcp.hint
        : `Only required when ${adapterStatus.selection.fallbackEnvVar}=1 selects the ACP temporary-compat fallback. ${resolvedAcp.hint}`,
      path: resolvedAcp.path,
    }),
    createCodexRuntimeComponent({
      id: "acp-spawn",
      label: "Codex ACP spawn probe",
      status: acpSpawnBlockedByRuntime
        ? "blocked"
        : resolvedAcp.spawnProbe.ok
          ? "ready"
          : "failed",
      ok: resolvedAcp.ok && resolvedAcp.spawnProbe.ok,
      blocking: acpBlocking,
      error: acpSpawnBlockedByRuntime
        ? resolvedAcp.error
        : resolvedAcp.spawnProbe.error,
      hint: acpBlocking
        ? resolvedAcp.hint
        : `Only required when ${adapterStatus.selection.fallbackEnvVar}=1 selects the ACP temporary-compat fallback. ${resolvedAcp.hint}`,
      path: resolvedAcp.path,
    }),
  ])
  const extraComponents = [
    createCodexRuntimeComponent({
      id: "adapter-source",
      label: "Codex desktop adapter",
      status: "ready",
      ok: true,
      blocking: false,
      error: null,
      hint: [
        `${adapterMetadata.source}: ${adapterStatus.selection.reason}`,
        adapterStatus.selection.acpFallbackAvailable
          ? `ACP fallback remains available with ${adapterStatus.selection.fallbackEnvVar}=1.`
          : "ACP fallback is unavailable.",
        `Target adapter: ${adapterStatus.target.source}.`,
        `Bundled Codex version: ${adapterStatus.bundledCodexVersion}.`,
        `Default-disable condition: ${adapterMetadata.defaultDisableCondition}`,
        `Removal condition: ${adapterMetadata.removalCondition}`,
      ].join(" "),
    }),
    createCodexRuntimeComponent({
      id: "provider-profile",
      label: "Codex provider profile",
      status: "unknown",
      ok: true,
      blocking: false,
      error: null,
      hint: "Provider profile availability is checked for the selected run.",
    }),
    createCodexRuntimeComponent({
      id: "mcp",
      label: "Codex MCP configuration",
      status: "unknown",
      ok: true,
      blocking: false,
      error: null,
      hint: "MCP configuration and auth are checked for the selected project before each run.",
    }),
    createCodexRuntimeComponent({
      id: "local-only",
      label: "Local-only policy",
      status: isLocalOnlyMode() ? "ready" : "unknown",
      ok: true,
      blocking: false,
      error: null,
      hint: isLocalOnlyMode()
        ? "Local-only policy is active; Codex runs use local runtime components and user-selected providers."
        : "Local-only policy is disabled by environment configuration.",
    }),
  ]

  if (loginCli.ok) {
    try {
      const integration = await getCodexIntegrationStatus()
      extraComponents.unshift(
        createCodexRuntimeComponent({
          id: "login",
          label: "Codex login",
          status: integration.isConnected ? "ready" : "needs-auth",
          ok: integration.isConnected,
          blocking: false,
          error: integration.isConnected
            ? null
            : "Codex login or API key is required for ChatGPT-backed Codex runs.",
          hint: integration.isConnected
            ? "Codex login is connected."
            : "Connect Codex with ChatGPT login, use a Codex API key, or choose a provider profile.",
        }),
      )
    } catch (error) {
      const normalized = extractCodexError(error, {
        redactLoginOutput: redactCodexLoginOutput,
      })
      extraComponents.unshift(
        createCodexRuntimeComponent({
          id: "login",
          label: "Codex login",
          status: "failed",
          ok: false,
          blocking: false,
          error: normalized.message,
          hint: "Codex login status could not be checked.",
        }),
      )
    }
  } else {
    extraComponents.unshift(
      createCodexRuntimeComponent({
        id: "login",
        label: "Codex login",
        status: "blocked",
        ok: false,
        blocking: false,
        error: "Codex CLI is unavailable, so login status cannot be checked.",
        hint: loginCli.hint,
      }),
    )
  }
  const availability = buildCodexRuntimeAvailabilityFromComponents([
    ...runtimeAvailability.components,
    ...extraComponents,
  ])

  return {
    runtime: "codex" as const,
    requiresGlobalCli: false,
    ok: availability.ok,
    loginCli,
    acp: resolvedAcp,
    adapter: adapterMetadata,
    adapters: adapterStatus,
    components: availability.components,
    blockers: availability.blockers,
    capabilities: getRegisteredAgentRuntimeManifest("codex").capabilities,
  }
}
