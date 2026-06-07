import {
  buildCodexRuntimeAvailability,
  buildCodexRuntimeAvailabilityFromComponents,
  createCodexRuntimeComponent,
} from "../../../shared/codex-runtime-status"
import { CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA } from "../agent-runtime/desktop-adapter-metadata"
import { getRegisteredAgentRuntimeManifest } from "../agent-runtime/runtime-registry"
import { isLocalOnlyMode } from "../local-only"
import { getRuntimeExecutableStatus } from "../runtime-executable"
import { resolveCodexAcpBinaryPath } from "./acp-path"
import { probeCodexAcpSpawn } from "./acp-spawn-probe"
import { getBundledCodexCliPath } from "./cli-path"
import { extractCodexError } from "./errors"
import { getCodexIntegrationStatus } from "./integration-status"
import { redactCodexLoginOutput } from "./login-output"
import { getElectronApp, type ElectronAppLike } from "../electron-app"

export async function getCodexRuntimeStatus(
  input: {
    appContext?: Pick<ElectronAppLike, "isPackaged" | "getAppPath">
  } = {},
) {
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
  const runtimeAvailability = buildCodexRuntimeAvailability({
    loginCli,
    acp: resolvedAcp,
  })
  const adapterMetadata = CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA
  const extraComponents = [
    createCodexRuntimeComponent({
      id: "adapter-source",
      label: "Codex desktop adapter",
      status: "ready",
      ok: true,
      blocking: false,
      error: null,
      hint: `${adapterMetadata.source}: ${adapterMetadata.fallbackReason}`,
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
    components: availability.components,
    blockers: availability.blockers,
    capabilities: getRegisteredAgentRuntimeManifest("codex").capabilities,
  }
}
