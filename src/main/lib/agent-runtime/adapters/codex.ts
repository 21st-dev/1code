import {
  batchWriteCodexAppServerConfig,
  cancelCodexAppServerAccountLogin,
  clearCodexAppServerThreadGoal,
  controlCodexAppServerThread,
  detectCodexAppServerExternalAgentConfig,
  forkCodexAppServerThread,
  getCodexAppServerThreadFullDiff,
  getCodexAppServerThreadGoal,
  getCodexAppServerThreadTurnDiff,
  importCodexAppServerExternalAgentConfig,
  installCodexAppServerPlugin,
  listCodexAppServerApps,
  listCodexAppServerHooks,
  listCodexAppServerMcpServerStatuses,
  listCodexAppServerModels,
  listCodexAppServerPermissionProfiles,
  listCodexAppServerPlugins,
  listCodexAppServerSkills,
  listInstalledCodexAppServerPlugins,
  listLoadedCodexAppServerThreads,
  listCodexAppServerThreads,
  logoutCodexAppServerAccount,
  readCodexAppServerAccount,
  readCodexAppServerAccountRateLimits,
  readCodexAppServerAccountUsage,
  readCodexAppServerConfig,
  readCodexAppServerConfigRequirements,
  readCodexAppServerPlugin,
  readCodexAppServerThread,
  reloadCodexAppServerMcpServerConfig,
  runCodexAppServerRuntimeRun,
  rollbackCodexAppServerThread,
  setCodexAppServerThreadGoal,
  setCodexAppServerThreadName,
  startCodexAppServerAccountLogin,
  startCodexAppServerMcpServerOauthLogin,
  streamCodexAppServerRuntimeRun,
  updateCodexAppServerThreadMetadata,
  writeCodexAppServerConfigValue,
} from "../codex-app-server-runtime";
import { getAgentRuntimeManifest } from "../manifests";
import {
  stopAgentRuntimeProcess,
  submitAgentRuntimeToolResult,
} from "../process-registry";
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAccountLoginCancelRequest,
  AgentRuntimeAccountLoginCancelResult,
  AgentRuntimeAccountLoginStartRequest,
  AgentRuntimeAccountLoginStartResult,
  AgentRuntimeAccountLogoutRequest,
  AgentRuntimeAccountLogoutResult,
  AgentRuntimeAccountRateLimitsReadRequest,
  AgentRuntimeAccountRateLimitsReadResult,
  AgentRuntimeAccountReadRequest,
  AgentRuntimeAccountReadResult,
  AgentRuntimeAccountUsageReadRequest,
  AgentRuntimeAccountUsageReadResult,
  AgentRuntimeAppListRequest,
  AgentRuntimeAppListResult,
  AgentRuntimeConfigBatchWriteRequest,
  AgentRuntimeAvailability,
  AgentRuntimeConfigReadRequest,
  AgentRuntimeConfigReadResult,
  AgentRuntimeConfigRequirementsReadRequest,
  AgentRuntimeConfigRequirementsReadResult,
  AgentRuntimeConfigValueWriteRequest,
  AgentRuntimeConfigWriteResult,
  AgentRuntimeExternalAgentConfigDetectRequest,
  AgentRuntimeExternalAgentConfigDetectResult,
  AgentRuntimeExternalAgentConfigImportRequest,
  AgentRuntimeExternalAgentConfigImportResult,
  AgentRuntimeHookListRequest,
  AgentRuntimeHookListResult,
  AgentRuntimeMcpServerConfigReloadRequest,
  AgentRuntimeMcpServerConfigReloadResult,
  AgentRuntimeMcpServerStatusListRequest,
  AgentRuntimeMcpServerStatusListResult,
  AgentRuntimeMcpServerOauthLoginRequest,
  AgentRuntimeMcpServerOauthLoginResult,
  AgentRuntimeModelListRequest,
  AgentRuntimeModelListResult,
  AgentRuntimePermissionProfileListRequest,
  AgentRuntimePermissionProfileListResult,
  AgentRuntimePluginInstalledRequest,
  AgentRuntimePluginInstalledResult,
  AgentRuntimePluginInstallRequest,
  AgentRuntimePluginInstallResult,
  AgentRuntimePluginListRequest,
  AgentRuntimePluginListResult,
  AgentRuntimePluginReadRequest,
  AgentRuntimePluginReadResult,
  AgentRuntimeRunReceipt,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
  AgentRuntimeSkillListRequest,
  AgentRuntimeSkillListResult,
  AgentRuntimeStartRequest,
  AgentRuntimeStreamEvent,
  AgentRuntimeThreadControlRequest,
  AgentRuntimeThreadControlResult,
  AgentRuntimeThreadDiffResult,
  AgentRuntimeThreadFullDiffRequest,
  AgentRuntimeThreadForkRequest,
  AgentRuntimeThreadForkResult,
  AgentRuntimeThreadGoalClearRequest,
  AgentRuntimeThreadGoalClearResult,
  AgentRuntimeThreadGoalGetRequest,
  AgentRuntimeThreadGoalGetResult,
  AgentRuntimeThreadGoalSetRequest,
  AgentRuntimeThreadGoalSetResult,
  AgentRuntimeThreadLoadedListRequest,
  AgentRuntimeThreadLoadedListResult,
  AgentRuntimeThreadListRequest,
  AgentRuntimeThreadListResult,
  AgentRuntimeThreadMetadataUpdateRequest,
  AgentRuntimeThreadMetadataUpdateResult,
  AgentRuntimeThreadNameSetRequest,
  AgentRuntimeThreadNameSetResult,
  AgentRuntimeThreadReadRequest,
  AgentRuntimeThreadReadResult,
  AgentRuntimeThreadRollbackRequest,
  AgentRuntimeThreadRollbackResult,
  AgentRuntimeThreadTurnDiffRequest,
} from "../types";

function createCodexRuntimeVersionAdvisory(
  version: string | null,
): AgentRuntimeHealth["versionAdvisory"] {
  return {
    status: "unknown",
    currentVersion: version,
    latestVersion: null,
    updateCommand: null,
    canUpdate: false,
    checkedAt: new Date().toISOString(),
    message: version
      ? "Codex CLI version detected; latest-version checks are not connected yet."
      : "Codex CLI version could not be detected.",
  };
}

async function inspectCodexRuntime(): Promise<AgentRuntimeHealth> {
  const manifest = getAgentRuntimeManifest("codex");

  try {
    const { getCodexIntegrationStatus } =
      await import("../../trpc/routers/codex");
    const integration = await getCodexIntegrationStatus();
    const authMethod =
      integration.state === "connected_api_key"
        ? "api-key"
        : integration.state === "connected_chatgpt"
          ? "oauth"
          : "not-authenticated";

    if (integration.isConnected) {
      return {
        availability: "available",
        statusReason: `Codex auth detected via ${integration.state}.`,
        authMethod,
        version: integration.version,
        versionAdvisory: createCodexRuntimeVersionAdvisory(
          integration.version,
        ),
        models: manifest.models?.map((model) => ({
          ...model,
          availability: "available",
        })),
      };
    }

    return {
      availability: "needs-auth",
      statusReason:
        integration.rawOutput ||
        "Codex CLI is installed but no login was found.",
      authMethod,
      version: integration.version,
      versionAdvisory: createCodexRuntimeVersionAdvisory(integration.version),
      models: manifest.models?.map((model) => ({
        ...model,
        availability: "needs-auth",
        reason: "Codex authentication is required.",
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingBinary = message.includes("Bundled Codex CLI not found");
    return {
      availability: missingBinary ? "not-installed" : "error",
      statusReason: message,
      authMethod: "unknown",
      version: null,
      versionAdvisory: createCodexRuntimeVersionAdvisory(null),
      models: manifest.models?.map((model) => ({
        ...model,
        availability: missingBinary ? "not-installed" : "error",
        reason: message,
      })),
    };
  }
}

async function runCodexLifecycle(
  action: "start" | "resume",
  request: AgentRuntimeStartRequest,
): Promise<AgentRuntimeRunReceipt> {
  return runCodexAppServerRuntimeRun(action, request);
}

async function* streamCodexLifecycle(
  request: AgentRuntimeStartRequest,
): AsyncIterable<AgentRuntimeStreamEvent> {
  const action =
    request.session.nativeSessionId && !request.forceNewSession
      ? "resume"
      : "start";
  yield* streamCodexAppServerRuntimeRun(action, request);
}

async function readCodexThread(
  request: AgentRuntimeThreadReadRequest,
): Promise<AgentRuntimeThreadReadResult> {
  return readCodexAppServerThread(request);
}

async function readCodexConfig(
  request: AgentRuntimeConfigReadRequest,
): Promise<AgentRuntimeConfigReadResult> {
  return readCodexAppServerConfig(request);
}

async function writeCodexConfigValue(
  request: AgentRuntimeConfigValueWriteRequest,
): Promise<AgentRuntimeConfigWriteResult> {
  return writeCodexAppServerConfigValue(request);
}

async function batchWriteCodexConfig(
  request: AgentRuntimeConfigBatchWriteRequest,
): Promise<AgentRuntimeConfigWriteResult> {
  return batchWriteCodexAppServerConfig(request);
}

async function readCodexConfigRequirements(
  request: AgentRuntimeConfigRequirementsReadRequest,
): Promise<AgentRuntimeConfigRequirementsReadResult> {
  return readCodexAppServerConfigRequirements(request);
}

async function listCodexPermissionProfiles(
  request: AgentRuntimePermissionProfileListRequest,
): Promise<AgentRuntimePermissionProfileListResult> {
  return listCodexAppServerPermissionProfiles(request);
}

async function listCodexMcpServerStatuses(
  request: AgentRuntimeMcpServerStatusListRequest,
): Promise<AgentRuntimeMcpServerStatusListResult> {
  return listCodexAppServerMcpServerStatuses(request);
}

async function reloadCodexMcpServerConfig(
  request: AgentRuntimeMcpServerConfigReloadRequest,
): Promise<AgentRuntimeMcpServerConfigReloadResult> {
  return reloadCodexAppServerMcpServerConfig(request);
}

async function listCodexSkills(
  request: AgentRuntimeSkillListRequest,
): Promise<AgentRuntimeSkillListResult> {
  return listCodexAppServerSkills(request);
}

async function listCodexHooks(
  request: AgentRuntimeHookListRequest,
): Promise<AgentRuntimeHookListResult> {
  return listCodexAppServerHooks(request);
}

async function listCodexApps(
  request: AgentRuntimeAppListRequest,
): Promise<AgentRuntimeAppListResult> {
  return listCodexAppServerApps(request);
}

async function listCodexPlugins(
  request: AgentRuntimePluginListRequest,
): Promise<AgentRuntimePluginListResult> {
  return listCodexAppServerPlugins(request);
}

async function listInstalledCodexPlugins(
  request: AgentRuntimePluginInstalledRequest,
): Promise<AgentRuntimePluginInstalledResult> {
  return listInstalledCodexAppServerPlugins(request);
}

async function readCodexPlugin(
  request: AgentRuntimePluginReadRequest,
): Promise<AgentRuntimePluginReadResult> {
  return readCodexAppServerPlugin(request);
}

async function installCodexPlugin(
  request: AgentRuntimePluginInstallRequest,
): Promise<AgentRuntimePluginInstallResult> {
  return installCodexAppServerPlugin(request);
}

async function detectCodexExternalAgentConfig(
  request: AgentRuntimeExternalAgentConfigDetectRequest,
): Promise<AgentRuntimeExternalAgentConfigDetectResult> {
  return detectCodexAppServerExternalAgentConfig(request);
}

async function importCodexExternalAgentConfig(
  request: AgentRuntimeExternalAgentConfigImportRequest,
): Promise<AgentRuntimeExternalAgentConfigImportResult> {
  return importCodexAppServerExternalAgentConfig(request);
}

async function startCodexMcpServerOauthLogin(
  request: AgentRuntimeMcpServerOauthLoginRequest,
): Promise<AgentRuntimeMcpServerOauthLoginResult> {
  return startCodexAppServerMcpServerOauthLogin(request);
}

async function listCodexModels(
  request: AgentRuntimeModelListRequest,
): Promise<AgentRuntimeModelListResult> {
  return listCodexAppServerModels(request);
}

async function readCodexAccount(
  request: AgentRuntimeAccountReadRequest,
): Promise<AgentRuntimeAccountReadResult> {
  return readCodexAppServerAccount(request);
}

async function startCodexAccountLogin(
  request: AgentRuntimeAccountLoginStartRequest,
): Promise<AgentRuntimeAccountLoginStartResult> {
  return startCodexAppServerAccountLogin(request);
}

async function cancelCodexAccountLogin(
  request: AgentRuntimeAccountLoginCancelRequest,
): Promise<AgentRuntimeAccountLoginCancelResult> {
  return cancelCodexAppServerAccountLogin(request);
}

async function logoutCodexAccount(
  request: AgentRuntimeAccountLogoutRequest,
): Promise<AgentRuntimeAccountLogoutResult> {
  return logoutCodexAppServerAccount(request);
}

async function readCodexAccountRateLimits(
  request: AgentRuntimeAccountRateLimitsReadRequest,
): Promise<AgentRuntimeAccountRateLimitsReadResult> {
  return readCodexAppServerAccountRateLimits(request);
}

async function readCodexAccountUsage(
  request: AgentRuntimeAccountUsageReadRequest,
): Promise<AgentRuntimeAccountUsageReadResult> {
  return readCodexAppServerAccountUsage(request);
}

async function forkCodexThread(
  request: AgentRuntimeThreadForkRequest,
): Promise<AgentRuntimeThreadForkResult> {
  return forkCodexAppServerThread(request);
}

async function getCodexThreadTurnDiff(
  request: AgentRuntimeThreadTurnDiffRequest,
): Promise<AgentRuntimeThreadDiffResult> {
  return getCodexAppServerThreadTurnDiff(request);
}

async function getCodexThreadFullDiff(
  request: AgentRuntimeThreadFullDiffRequest,
): Promise<AgentRuntimeThreadDiffResult> {
  return getCodexAppServerThreadFullDiff(request);
}

async function listCodexThreads(
  request: AgentRuntimeThreadListRequest,
): Promise<AgentRuntimeThreadListResult> {
  return listCodexAppServerThreads(request);
}

async function listLoadedCodexThreads(
  request: AgentRuntimeThreadLoadedListRequest,
): Promise<AgentRuntimeThreadLoadedListResult> {
  return listLoadedCodexAppServerThreads(request);
}

async function controlCodexThread(
  request: AgentRuntimeThreadControlRequest,
): Promise<AgentRuntimeThreadControlResult> {
  return controlCodexAppServerThread(request);
}

async function setCodexThreadName(
  request: AgentRuntimeThreadNameSetRequest,
): Promise<AgentRuntimeThreadNameSetResult> {
  return setCodexAppServerThreadName(request);
}

async function updateCodexThreadMetadata(
  request: AgentRuntimeThreadMetadataUpdateRequest,
): Promise<AgentRuntimeThreadMetadataUpdateResult> {
  return updateCodexAppServerThreadMetadata(request);
}

async function getCodexThreadGoal(
  request: AgentRuntimeThreadGoalGetRequest,
): Promise<AgentRuntimeThreadGoalGetResult> {
  return getCodexAppServerThreadGoal(request);
}

async function setCodexThreadGoal(
  request: AgentRuntimeThreadGoalSetRequest,
): Promise<AgentRuntimeThreadGoalSetResult> {
  return setCodexAppServerThreadGoal(request);
}

async function clearCodexThreadGoal(
  request: AgentRuntimeThreadGoalClearRequest,
): Promise<AgentRuntimeThreadGoalClearResult> {
  return clearCodexAppServerThreadGoal(request);
}

async function rollbackCodexThread(
  request: AgentRuntimeThreadRollbackRequest,
): Promise<AgentRuntimeThreadRollbackResult> {
  return rollbackCodexAppServerThread(request);
}

export const codexAdapter: AgentRuntimeAdapter = {
  manifest: getAgentRuntimeManifest("codex"),
  async inspect(_session: AgentRuntimeSessionRef): Promise<AgentRuntimeHealth> {
    return inspectCodexRuntime();
  },
  async canStart(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeAvailability> {
    return (await inspectCodexRuntime()).availability;
  },
  async start(request) {
    return runCodexLifecycle("start", request);
  },
  async resume(request) {
    return runCodexLifecycle("resume", request);
  },
  stream(request) {
    return streamCodexLifecycle(request);
  },
  async stop(request) {
    return stopAgentRuntimeProcess(request);
  },
  async submitToolResult(request) {
    return submitAgentRuntimeToolResult(request);
  },
  async readConfig(request) {
    return readCodexConfig(request);
  },
  async writeConfigValue(request) {
    return writeCodexConfigValue(request);
  },
  async batchWriteConfig(request) {
    return batchWriteCodexConfig(request);
  },
  async readConfigRequirements(request) {
    return readCodexConfigRequirements(request);
  },
  async listPermissionProfiles(request) {
    return listCodexPermissionProfiles(request);
  },
  async listMcpServerStatuses(request) {
    return listCodexMcpServerStatuses(request);
  },
  async reloadMcpServerConfig(request) {
    return reloadCodexMcpServerConfig(request);
  },
  async listSkills(request) {
    return listCodexSkills(request);
  },
  async listHooks(request) {
    return listCodexHooks(request);
  },
  async listApps(request) {
    return listCodexApps(request);
  },
  async listPlugins(request) {
    return listCodexPlugins(request);
  },
  async listInstalledPlugins(request) {
    return listInstalledCodexPlugins(request);
  },
  async readPlugin(request) {
    return readCodexPlugin(request);
  },
  async installPlugin(request) {
    return installCodexPlugin(request);
  },
  async detectExternalAgentConfig(request) {
    return detectCodexExternalAgentConfig(request);
  },
  async importExternalAgentConfig(request) {
    return importCodexExternalAgentConfig(request);
  },
  async startMcpServerOauthLogin(request) {
    return startCodexMcpServerOauthLogin(request);
  },
  async listModels(request) {
    return listCodexModels(request);
  },
  async startAccountLogin(request) {
    return startCodexAccountLogin(request);
  },
  async cancelAccountLogin(request) {
    return cancelCodexAccountLogin(request);
  },
  async logoutAccount(request) {
    return logoutCodexAccount(request);
  },
  async readAccount(request) {
    return readCodexAccount(request);
  },
  async readAccountRateLimits(request) {
    return readCodexAccountRateLimits(request);
  },
  async readAccountUsage(request) {
    return readCodexAccountUsage(request);
  },
  async readThread(request) {
    return readCodexThread(request);
  },
  async forkThread(request) {
    return forkCodexThread(request);
  },
  async getThreadTurnDiff(request) {
    return getCodexThreadTurnDiff(request);
  },
  async getThreadFullDiff(request) {
    return getCodexThreadFullDiff(request);
  },
  async listThreads(request) {
    return listCodexThreads(request);
  },
  async listLoadedThreads(request) {
    return listLoadedCodexThreads(request);
  },
  async controlThread(request) {
    return controlCodexThread(request);
  },
  async setThreadName(request) {
    return setCodexThreadName(request);
  },
  async updateThreadMetadata(request) {
    return updateCodexThreadMetadata(request);
  },
  async getThreadGoal(request) {
    return getCodexThreadGoal(request);
  },
  async setThreadGoal(request) {
    return setCodexThreadGoal(request);
  },
  async clearThreadGoal(request) {
    return clearCodexThreadGoal(request);
  },
  async rollbackThread(request) {
    return rollbackCodexThread(request);
  },
};
