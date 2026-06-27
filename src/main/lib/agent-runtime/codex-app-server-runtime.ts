import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import {
  CodexAppServerRpcClient,
  codexAppServerInvalidParamsError,
  type CodexAppServerJsonRpcId,
  type CodexAppServerRpcNotification,
  type CodexAppServerRpcRequest,
} from "./codex-app-server-client";
import {
  codexAppServerNotificationToStreamEvent,
  codexAppServerRequestType,
  codexAppServerServerRequestId,
  codexAppServerServerRequestToStreamEvent,
} from "./codex-app-server-events";
import {
  buildCodexAppServerLaunchPlan,
  buildCodexAppServerThreadForkParams,
  buildCodexAppServerThreadResumeParams,
  buildCodexAppServerThreadStartParams,
  buildCodexAppServerTurnStartParams,
  hasConfiguredCodexAppServerMcpServer,
  isRecoverableCodexAppServerThreadResumeError,
  type CodexAppServerLaunchPlan,
} from "./codex-app-server-plan";
import {
  createAgentRuntimeProcessHandle,
  registerAgentRuntimeProcessHandle,
  unregisterAgentRuntimeProcessHandle,
} from "./process-registry";
import {
  createAgentRuntimeRunId,
  createAgentRuntimeRunReceipt,
  createInMemoryAgentRuntimeRunLedger,
  projectAgentRuntimeRunLedgerSnapshot,
  replayAgentRuntimeRunLedgerEvents,
  type AgentRuntimeRunLedger,
} from "./runtime-run-ledger";
import type { AgentRuntimeReceiptBus } from "./runtime-receipt-bus";
import type {
  AgentRuntimeAccountRateLimitsReadRequest,
  AgentRuntimeAccountRateLimitsReadResult,
  AgentRuntimeAccountLoginCancelRequest,
  AgentRuntimeAccountLoginCancelResult,
  AgentRuntimeAccountLoginStartRequest,
  AgentRuntimeAccountLoginStartResult,
  AgentRuntimeAccountLoginType,
  AgentRuntimeAccountLogoutRequest,
  AgentRuntimeAccountLogoutResult,
  AgentRuntimeAccountReadRequest,
  AgentRuntimeAccountReadResult,
  AgentRuntimeAccountUsageReadRequest,
  AgentRuntimeAccountUsageReadResult,
  AgentRuntimeAppListRequest,
  AgentRuntimeAppListResult,
  AgentRuntimeConfigBatchWriteRequest,
  AgentRuntimeConfigReadRequest,
  AgentRuntimeConfigReadResult,
  AgentRuntimeConfigRequirementsReadRequest,
  AgentRuntimeConfigRequirementsReadResult,
  AgentRuntimeConfigValueWriteRequest,
  AgentRuntimeConfigWriteEdit,
  AgentRuntimeConfigWriteMergeStrategy,
  AgentRuntimeConfigWriteResult,
  AgentRuntimeControlResult,
  AgentRuntimeExternalAgentConfigDetectRequest,
  AgentRuntimeExternalAgentConfigDetectResult,
  AgentRuntimeExternalAgentConfigImportRequest,
  AgentRuntimeExternalAgentConfigImportResult,
  AgentRuntimeExternalAgentConfigMigrationDetails,
  AgentRuntimeExternalAgentConfigMigrationItem,
  AgentRuntimeExternalAgentConfigMigrationItemType,
  AgentRuntimeHookListRequest,
  AgentRuntimeHookListResult,
  AgentRuntimeMcpServerConfigReloadRequest,
  AgentRuntimeMcpServerConfigReloadResult,
  AgentRuntimeMcpServerOauthLoginRequest,
  AgentRuntimeMcpServerOauthLoginResult,
  AgentRuntimeMcpServerStatusDetail,
  AgentRuntimeMcpServerStatusListRequest,
  AgentRuntimeMcpServerStatusListResult,
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
  AgentRuntimePluginMarketplaceKind,
  AgentRuntimePluginReadRequest,
  AgentRuntimePluginReadResult,
  AgentRuntimeRunAction,
  AgentRuntimeRunReceipt,
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
  AgentRuntimeThreadGoal,
  AgentRuntimeThreadGoalClearRequest,
  AgentRuntimeThreadGoalClearResult,
  AgentRuntimeThreadGoalGetRequest,
  AgentRuntimeThreadGoalGetResult,
  AgentRuntimeThreadGoalSetRequest,
  AgentRuntimeThreadGoalSetResult,
  AgentRuntimeThreadGoalStatus,
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
  AgentRuntimeToolResultRequest,
} from "./types";
import {
  providerRuntimeEventToStreamEvent,
  type CanonicalRuntimeRequestType,
} from "./provider-runtime-contract";

interface CodexAppServerProcess {
  stdin: Writable;
  stdout: Readable;
  stderr?: Readable | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(
    event: "exit" | "close",
    listener: (...args: unknown[]) => void,
  ): unknown;
}

interface PendingServerRequest {
  jsonRpcId: CodexAppServerJsonRpcId;
  method: string;
  requestId: string;
  requestType: CanonicalRuntimeRequestType;
  turnId?: string;
  itemId?: string;
}

export interface CodexAppServerRuntimeOptions {
  spawnProcess?: (plan: CodexAppServerLaunchPlan) => CodexAppServerProcess;
  runLedger?: AgentRuntimeRunLedger | null;
  recordRunLedger?: boolean;
  runtimeReceipts?: AgentRuntimeReceiptBus;
  appServerArgs?: readonly string[] | null;
  command?: string | null;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined> | null;
  codeHome?: string | null;
  homeDir?: string | null;
}

let defaultCodexAppServerRuntimeRunLedger =
  createInMemoryAgentRuntimeRunLedger();

export function getCodexAppServerRuntimeRunLedger(): AgentRuntimeRunLedger {
  return defaultCodexAppServerRuntimeRunLedger;
}

export function resetCodexAppServerRuntimeRunLedgerForTests(): void {
  defaultCodexAppServerRuntimeRunLedger =
    createInMemoryAgentRuntimeRunLedger();
}

const THREAD_GOAL_STATUSES = new Set<AgentRuntimeThreadGoalStatus>([
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
]);

const MCP_SERVER_STATUS_DETAILS = new Set<AgentRuntimeMcpServerStatusDetail>([
  "full",
  "toolsAndAuthOnly",
]);

const CONFIG_WRITE_MERGE_STRATEGIES =
  new Set<AgentRuntimeConfigWriteMergeStrategy>(["replace", "upsert"]);

const ACCOUNT_LOGIN_TYPES = new Set<AgentRuntimeAccountLoginType>([
  "apiKey",
  "chatgpt",
  "chatgptDeviceCode",
  "chatgptAuthTokens",
]);

const PLUGIN_MARKETPLACE_KINDS = new Set<AgentRuntimePluginMarketplaceKind>([
  "local",
  "vertical",
  "workspace-directory",
  "shared-with-me",
]);

const EXTERNAL_AGENT_CONFIG_ITEM_TYPES =
  new Set<AgentRuntimeExternalAgentConfigMigrationItemType>([
    "AGENTS_MD",
    "CONFIG",
    "SKILLS",
    "PLUGINS",
    "MCP_SERVER_CONFIG",
    "SUBAGENTS",
    "HOOKS",
    "COMMANDS",
    "SESSIONS",
  ]);

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<{
    resolve(value: IteratorResult<T>): void;
    reject(error: unknown): void;
  }> = [];
  private closed = false;
  private error: unknown;

  push(item: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined as T, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.error = error;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.items.length > 0) {
      return { value: this.items.shift() as T, done: false };
    }
    if (this.error) throw this.error;
    if (this.closed) return { value: undefined as T, done: true };

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function splitModelAndReasoning(modelId: string | null | undefined): {
  modelId?: string;
  reasoningEffort?: string;
} {
  const cleaned = cleanString(modelId);
  if (!cleaned) return {};
  const separatorIndex = cleaned.indexOf("/");
  if (separatorIndex === -1) return { modelId: cleaned };

  const model = cleanString(cleaned.slice(0, separatorIndex));
  const reasoningEffort = cleanString(cleaned.slice(separatorIndex + 1));
  return {
    ...(model ? { modelId: model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

function readOptionsRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function resolveSessionModelAndEffort(session: AgentRuntimeSessionRef): {
  modelId?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  developerInstructions?: string;
} {
  const metadataSelection = readOptionsRecord(session.metadata?.modelSelection);
  const options =
    readOptionsRecord(session.modelSelection?.options) ??
    readOptionsRecord(metadataSelection?.options);
  const selectedModel =
    cleanString(session.modelSelection?.modelId) ??
    cleanString(metadataSelection?.modelId) ??
    cleanString(metadataSelection?.model);
  const legacy = splitModelAndReasoning(selectedModel ? null : session.modelId);

  return {
    modelId: selectedModel ?? legacy.modelId,
    reasoningEffort:
      cleanString(options?.reasoningEffort) ??
      cleanString(options?.reasoning_effort) ??
      legacy.reasoningEffort,
    serviceTier:
      cleanString(options?.serviceTier) ?? cleanString(options?.service_tier),
    developerInstructions:
      cleanString(options?.developerInstructions) ??
      cleanString(options?.developer_instructions),
  };
}

function resolveModelAndEffort(request: AgentRuntimeStartRequest): {
  modelId?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  developerInstructions?: string;
} {
  return resolveSessionModelAndEffort(request.session);
}

function patchPlanModel(
  plan: CodexAppServerLaunchPlan,
  modelId: string | undefined,
): CodexAppServerLaunchPlan {
  if (!modelId || plan.modelId === modelId) return plan;
  return { ...plan, modelId };
}

function cleanStringArray(
  value: string[] | null | undefined,
): string[] | undefined {
  const cleaned = (value ?? [])
    .map((entry) => cleanString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanCwdFilter(
  value: string | string[] | null | undefined,
): string | string[] | undefined {
  if (Array.isArray(value)) return cleanStringArray(value);
  return cleanString(value);
}

function buildThreadListParams(
  request: AgentRuntimeThreadListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (typeof request.archived === "boolean") params.archived = request.archived;
  const cursor = cleanString(request.cursor);
  if (cursor) params.cursor = cursor;
  const cwd = cleanCwdFilter(request.cwd);
  if (cwd) params.cwd = cwd;
  if (request.limit !== null && request.limit !== undefined) {
    if (!Number.isInteger(request.limit) || request.limit < 0) {
      throw new Error(
        "Codex app-server thread/list limit must be an integer >= 0.",
      );
    }
    params.limit = request.limit;
  }
  const modelProviders = cleanStringArray(request.modelProviders);
  if (modelProviders) params.modelProviders = modelProviders;
  const searchTerm = cleanString(request.searchTerm);
  if (searchTerm) params.searchTerm = searchTerm;
  if (request.sortDirection) params.sortDirection = request.sortDirection;
  if (request.sortKey) params.sortKey = request.sortKey;
  const sourceKinds = cleanStringArray(request.sourceKinds);
  if (sourceKinds) params.sourceKinds = sourceKinds;
  if (typeof request.useStateDbOnly === "boolean") {
    params.useStateDbOnly = request.useStateDbOnly;
  }
  return params;
}

function buildThreadLoadedListParams(
  request: AgentRuntimeThreadLoadedListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const cursor = cleanString(request.cursor);
  if (cursor) params.cursor = cursor;
  if (request.limit !== null && request.limit !== undefined) {
    if (!Number.isInteger(request.limit) || request.limit < 0) {
      throw new Error(
        "Codex app-server thread/loaded/list limit must be an integer >= 0.",
      );
    }
    params.limit = request.limit;
  }
  return params;
}

function writeOptionalLimitParam(
  params: Record<string, unknown>,
  value: number | null | undefined,
  method: string,
): void {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Codex app-server ${method} limit must be an integer >= 0.`,
    );
  }
  params.limit = value;
}

function buildConfigReadParams(
  request: AgentRuntimeConfigReadRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const cwd = cleanString(request.cwd);
  if (cwd) params.cwd = cwd;
  if (typeof request.includeLayers === "boolean") {
    params.includeLayers = request.includeLayers;
  }
  return params;
}

function normalizeConfigWriteMergeStrategy(
  value: AgentRuntimeConfigWriteMergeStrategy | undefined,
): AgentRuntimeConfigWriteMergeStrategy {
  if (value === undefined) return "replace";
  if (!CONFIG_WRITE_MERGE_STRATEGIES.has(value)) {
    throw new Error(
      `Unsupported Codex app-server config merge strategy: ${value}`,
    );
  }
  return value;
}

function buildConfigWriteEdit(
  edit: AgentRuntimeConfigWriteEdit,
  index: number,
): Record<string, unknown> {
  const keyPath = cleanString(edit.keyPath);
  if (!keyPath) {
    throw new Error(
      `Codex app-server config/batchWrite edit ${index + 1} requires a keyPath.`,
    );
  }
  if (edit.value === undefined) {
    throw new Error(
      `Codex app-server config/batchWrite edit ${index + 1} requires a JSON value.`,
    );
  }
  return {
    keyPath,
    mergeStrategy: normalizeConfigWriteMergeStrategy(edit.mergeStrategy),
    value: edit.value,
  };
}

function writeConfigFileOptions(
  params: Record<string, unknown>,
  request: {
    filePath?: string | null;
    expectedVersion?: string | null;
  },
): void {
  const filePath = cleanString(request.filePath);
  if (filePath) params.filePath = filePath;
  const expectedVersion = cleanString(request.expectedVersion);
  if (expectedVersion) params.expectedVersion = expectedVersion;
}

function buildConfigValueWriteParams(
  request: AgentRuntimeConfigValueWriteRequest,
): Record<string, unknown> {
  const keyPath = cleanString(request.keyPath);
  if (!keyPath) {
    throw new Error("Codex app-server config/value/write requires a keyPath.");
  }
  if (request.value === undefined) {
    throw new Error(
      "Codex app-server config/value/write requires a JSON value.",
    );
  }
  const params: Record<string, unknown> = {
    keyPath,
    mergeStrategy: normalizeConfigWriteMergeStrategy(request.mergeStrategy),
    value: request.value,
  };
  writeConfigFileOptions(params, request);
  return params;
}

function buildConfigBatchWriteParams(
  request: AgentRuntimeConfigBatchWriteRequest,
): Record<string, unknown> {
  if (!Array.isArray(request.edits) || request.edits.length === 0) {
    throw new Error(
      "Codex app-server config/batchWrite requires at least one edit.",
    );
  }
  const params: Record<string, unknown> = {
    edits: request.edits.map((edit, index) =>
      buildConfigWriteEdit(edit, index),
    ),
  };
  writeConfigFileOptions(params, request);
  if (typeof request.reloadUserConfig === "boolean") {
    params.reloadUserConfig = request.reloadUserConfig;
  }
  return params;
}

function buildPermissionProfileListParams(
  request: AgentRuntimePermissionProfileListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const cursor = cleanString(request.cursor);
  if (cursor) params.cursor = cursor;
  const cwd = cleanString(request.cwd);
  if (cwd) params.cwd = cwd;
  writeOptionalLimitParam(params, request.limit, "permissionProfile/list");
  return params;
}

function buildMcpServerStatusListParams(
  request: AgentRuntimeMcpServerStatusListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const cursor = cleanString(request.cursor);
  if (cursor) params.cursor = cursor;
  if (request.detail !== null && request.detail !== undefined) {
    if (!MCP_SERVER_STATUS_DETAILS.has(request.detail)) {
      throw new Error(
        `Unsupported Codex app-server mcpServerStatus/list detail: ${request.detail}`,
      );
    }
    params.detail = request.detail;
  }
  writeOptionalLimitParam(params, request.limit, "mcpServerStatus/list");
  const threadId = cleanString(request.threadId);
  if (threadId) params.threadId = threadId;
  return params;
}

function writeCwdsParam(
  params: Record<string, unknown>,
  cwds: string[] | null | undefined,
): void {
  const cleaned = cleanStringArray(cwds);
  if (cleaned) params.cwds = cleaned;
}

function buildSkillListParams(
  request: AgentRuntimeSkillListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writeCwdsParam(params, request.cwds);
  if (typeof request.forceReload === "boolean") {
    params.forceReload = request.forceReload;
  }
  return params;
}

function buildHookListParams(
  request: AgentRuntimeHookListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writeCwdsParam(params, request.cwds);
  return params;
}

function buildAppListParams(
  request: AgentRuntimeAppListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const cursor = cleanString(request.cursor);
  if (cursor) params.cursor = cursor;
  if (typeof request.forceRefetch === "boolean") {
    params.forceRefetch = request.forceRefetch;
  }
  writeOptionalLimitParam(params, request.limit, "app/list");
  const threadId = cleanString(request.threadId);
  if (threadId) params.threadId = threadId;
  return params;
}

function cleanPluginMarketplaceKinds(
  value: AgentRuntimePluginMarketplaceKind[] | null | undefined,
): AgentRuntimePluginMarketplaceKind[] | undefined {
  const cleaned = (value ?? [])
    .map((entry) => cleanString(entry))
    .filter((entry): entry is AgentRuntimePluginMarketplaceKind =>
      Boolean(entry),
    );
  for (const kind of cleaned) {
    if (!PLUGIN_MARKETPLACE_KINDS.has(kind)) {
      throw new Error(
        `Unsupported Codex app-server plugin marketplace kind: ${kind}`,
      );
    }
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function buildPluginListParams(
  request: AgentRuntimePluginListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writeCwdsParam(params, request.cwds);
  const marketplaceKinds = cleanPluginMarketplaceKinds(
    request.marketplaceKinds,
  );
  if (marketplaceKinds) params.marketplaceKinds = marketplaceKinds;
  return params;
}

function buildPluginInstalledParams(
  request: AgentRuntimePluginInstalledRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writeCwdsParam(params, request.cwds);
  const installSuggestionPluginNames = cleanStringArray(
    request.installSuggestionPluginNames,
  );
  if (installSuggestionPluginNames) {
    params.installSuggestionPluginNames = installSuggestionPluginNames;
  }
  return params;
}

function writePluginTargetParams(
  params: Record<string, unknown>,
  request: AgentRuntimePluginReadRequest | AgentRuntimePluginInstallRequest,
  method: string,
): void {
  const pluginName = cleanString(request.pluginName);
  if (!pluginName) {
    throw new Error(`Codex app-server ${method} requires a pluginName.`);
  }
  params.pluginName = pluginName;
  const marketplacePath = cleanString(request.marketplacePath);
  if (marketplacePath) params.marketplacePath = marketplacePath;
  const remoteMarketplaceName = cleanString(request.remoteMarketplaceName);
  if (remoteMarketplaceName)
    params.remoteMarketplaceName = remoteMarketplaceName;
}

function buildPluginReadParams(
  request: AgentRuntimePluginReadRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writePluginTargetParams(params, request, "plugin/read");
  return params;
}

function buildPluginInstallParams(
  request: AgentRuntimePluginInstallRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writePluginTargetParams(params, request, "plugin/install");
  return params;
}

function buildExternalAgentConfigDetectParams(
  request: AgentRuntimeExternalAgentConfigDetectRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  writeCwdsParam(params, request.cwds);
  if (typeof request.includeHome === "boolean") {
    params.includeHome = request.includeHome;
  }
  return params;
}

function normalizeNamedMigrationDetails(
  value: unknown,
): Array<{ name: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((entry) => {
    const name = cleanString(readOptionsRecord(entry)?.name);
    return name ? [{ name }] : [];
  });
  return entries.length > 0 ? entries : undefined;
}

function normalizePluginMigrationDetails(
  value: unknown,
): Array<{ marketplaceName: string; pluginNames: string[] }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((entry) => {
    const record = readOptionsRecord(entry);
    const marketplaceName = cleanString(record?.marketplaceName);
    const pluginNames = cleanStringArray(
      Array.isArray(record?.pluginNames) ? record.pluginNames : undefined,
    );
    if (!marketplaceName || !pluginNames) return [];
    return [{ marketplaceName, pluginNames }];
  });
  return entries.length > 0 ? entries : undefined;
}

function normalizeSessionMigrationDetails(
  value: unknown,
): Array<{ cwd: string; path: string; title?: string | null }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((entry) => {
    const record = readOptionsRecord(entry);
    const cwd = cleanString(record?.cwd);
    const path = cleanString(record?.path);
    if (!cwd || !path) return [];
    const title = cleanString(record?.title);
    return [
      {
        cwd,
        path,
        ...(title ? { title } : record?.title === null ? { title: null } : {}),
      },
    ];
  });
  return entries.length > 0 ? entries : undefined;
}

function normalizeExternalAgentConfigMigrationDetails(
  value: unknown,
): AgentRuntimeExternalAgentConfigMigrationDetails | null | undefined {
  if (value === null) return null;
  const record = readOptionsRecord(value);
  if (!record) return undefined;

  const details: AgentRuntimeExternalAgentConfigMigrationDetails = {};
  const commands = normalizeNamedMigrationDetails(record.commands);
  if (commands) details.commands = commands;
  const hooks = normalizeNamedMigrationDetails(record.hooks);
  if (hooks) details.hooks = hooks;
  const mcpServers = normalizeNamedMigrationDetails(record.mcpServers);
  if (mcpServers) details.mcpServers = mcpServers;
  const plugins = normalizePluginMigrationDetails(record.plugins);
  if (plugins) details.plugins = plugins;
  const sessions = normalizeSessionMigrationDetails(record.sessions);
  if (sessions) details.sessions = sessions;
  const subagents = normalizeNamedMigrationDetails(record.subagents);
  if (subagents) details.subagents = subagents;

  return Object.keys(details).length > 0 ? details : undefined;
}

function normalizeExternalAgentConfigMigrationItem(
  value: unknown,
  index: number,
): AgentRuntimeExternalAgentConfigMigrationItem {
  const record = readOptionsRecord(value);
  if (!record) {
    throw new Error(
      `Codex app-server externalAgentConfig/import item ${index + 1} must be an object.`,
    );
  }
  const itemType = cleanString(record.itemType);
  if (
    !itemType ||
    !EXTERNAL_AGENT_CONFIG_ITEM_TYPES.has(
      itemType as AgentRuntimeExternalAgentConfigMigrationItemType,
    )
  ) {
    throw new Error(
      `Codex app-server externalAgentConfig/import item ${index + 1} has an unsupported itemType.`,
    );
  }
  const description = cleanString(record.description);
  if (!description) {
    throw new Error(
      `Codex app-server externalAgentConfig/import item ${index + 1} requires a description.`,
    );
  }
  const cwd = cleanString(record.cwd);
  const details = normalizeExternalAgentConfigMigrationDetails(record.details);

  return {
    cwd: cwd ?? null,
    description,
    ...(details !== undefined ? { details } : {}),
    itemType: itemType as AgentRuntimeExternalAgentConfigMigrationItemType,
  };
}

function readExternalAgentConfigMigrationItems(
  response: unknown,
): AgentRuntimeExternalAgentConfigMigrationItem[] {
  return readArrayProperty(response, "items").flatMap((item, index) => {
    try {
      return [normalizeExternalAgentConfigMigrationItem(item, index)];
    } catch {
      return [];
    }
  });
}

function buildExternalAgentConfigImportParams(
  request: AgentRuntimeExternalAgentConfigImportRequest,
): Record<string, unknown> {
  if (
    !Array.isArray(request.migrationItems) ||
    request.migrationItems.length === 0
  ) {
    throw new Error(
      "Codex app-server externalAgentConfig/import requires at least one migration item.",
    );
  }

  return {
    migrationItems: request.migrationItems.map((item, index) =>
      normalizeExternalAgentConfigMigrationItem(item, index),
    ),
  };
}

function buildMcpServerOauthLoginParams(
  request: AgentRuntimeMcpServerOauthLoginRequest,
): Record<string, unknown> {
  const name = cleanString(request.name);
  if (!name) {
    throw new Error("Codex app-server mcpServer/oauth/login requires a name.");
  }
  const params: Record<string, unknown> = { name };
  if (request.scopes !== null && request.scopes !== undefined) {
    const scopes = request.scopes
      .map((scope) => cleanString(scope))
      .filter((scope): scope is string => Boolean(scope));
    if (scopes.length > 0) params.scopes = scopes;
  }
  if (request.timeoutSecs !== null && request.timeoutSecs !== undefined) {
    if (!Number.isInteger(request.timeoutSecs) || request.timeoutSecs < 0) {
      throw new Error(
        "Codex app-server mcpServer/oauth/login timeoutSecs must be an integer >= 0.",
      );
    }
    params.timeoutSecs = request.timeoutSecs;
  }
  return params;
}

function buildModelListParams(
  request: AgentRuntimeModelListRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const cursor = cleanString(request.cursor);
  if (cursor) params.cursor = cursor;
  if (request.includeHidden !== null && request.includeHidden !== undefined) {
    params.includeHidden = request.includeHidden;
  }
  writeOptionalLimitParam(params, request.limit, "model/list");
  return params;
}

function buildAccountReadParams(
  request: AgentRuntimeAccountReadRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (typeof request.refreshToken === "boolean") {
    params.refreshToken = request.refreshToken;
  }
  return params;
}

function buildAccountLoginStartParams(
  request: AgentRuntimeAccountLoginStartRequest,
): Record<string, unknown> {
  if (!ACCOUNT_LOGIN_TYPES.has(request.type)) {
    throw new Error(
      `Unsupported Codex app-server account login type: ${request.type}`,
    );
  }

  switch (request.type) {
    case "apiKey": {
      const apiKey = cleanString(request.apiKey);
      if (!apiKey) {
        throw new Error(
          "Codex app-server account/login/start apiKey requires an API key.",
        );
      }
      return {
        apiKey,
        type: "apiKey",
      };
    }
    case "chatgpt": {
      return {
        ...(typeof request.codexStreamlinedLogin === "boolean"
          ? { codexStreamlinedLogin: request.codexStreamlinedLogin }
          : {}),
        type: "chatgpt",
      };
    }
    case "chatgptDeviceCode":
      return {
        type: "chatgptDeviceCode",
      };
    case "chatgptAuthTokens": {
      const accessToken = cleanString(request.accessToken);
      const chatgptAccountId = cleanString(request.chatgptAccountId);
      if (!accessToken || !chatgptAccountId) {
        throw new Error(
          "Codex app-server account/login/start chatgptAuthTokens requires accessToken and chatgptAccountId.",
        );
      }
      return {
        accessToken,
        chatgptAccountId,
        ...(request.chatgptPlanType !== undefined
          ? {
              chatgptPlanType:
                request.chatgptPlanType === null
                  ? null
                  : (cleanString(request.chatgptPlanType) ?? null),
            }
          : {}),
        type: "chatgptAuthTokens",
      };
    }
  }
}

function buildAccountLoginCancelParams(
  request: AgentRuntimeAccountLoginCancelRequest,
): Record<string, unknown> {
  const loginId = cleanString(request.loginId);
  if (!loginId) {
    throw new Error(
      "Codex app-server account/login/cancel requires a loginId.",
    );
  }
  return { loginId };
}

function buildThreadNameSetParams(
  request: AgentRuntimeThreadNameSetRequest,
): Record<string, unknown> {
  const name = cleanString(request.name);
  if (!name) {
    throw new Error(
      "Codex app-server thread/name/set requires a non-empty name.",
    );
  }
  return {
    threadId: requireThreadId(request.threadId),
    name,
  };
}

function buildThreadMetadataUpdateParams(
  request: AgentRuntimeThreadMetadataUpdateRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    threadId: requireThreadId(request.threadId),
  };
  if (request.gitInfo !== undefined) {
    const gitInfo = request.gitInfo;
    params.gitInfo =
      gitInfo === null
        ? null
        : {
            ...(gitInfo.branch !== undefined
              ? {
                  branch:
                    gitInfo.branch === null
                      ? null
                      : (cleanString(gitInfo.branch) ?? null),
                }
              : {}),
            ...(gitInfo.originUrl !== undefined
              ? {
                  originUrl:
                    gitInfo.originUrl === null
                      ? null
                      : (cleanString(gitInfo.originUrl) ?? null),
                }
              : {}),
            ...(gitInfo.sha !== undefined
              ? {
                  sha:
                    gitInfo.sha === null
                      ? null
                      : (cleanString(gitInfo.sha) ?? null),
                }
              : {}),
          };
  }
  return params;
}

function cleanThreadGoalStatus(
  status: AgentRuntimeThreadGoalStatus | null | undefined,
): AgentRuntimeThreadGoalStatus | null | undefined {
  if (status === null || status === undefined) return status;
  if (!THREAD_GOAL_STATUSES.has(status)) {
    throw new Error(
      `Unsupported Codex app-server thread goal status: ${status}`,
    );
  }
  return status;
}

function buildThreadGoalSetParams(
  request: AgentRuntimeThreadGoalSetRequest,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    threadId: requireThreadId(request.threadId),
  };

  if (request.objective !== undefined) {
    params.objective =
      request.objective === null
        ? null
        : (cleanString(request.objective) ?? null);
  }
  if (request.status !== undefined) {
    params.status = cleanThreadGoalStatus(request.status);
  }
  if (request.tokenBudget !== undefined) {
    if (
      request.tokenBudget !== null &&
      (!Number.isInteger(request.tokenBudget) || request.tokenBudget < 0)
    ) {
      throw new Error(
        "Codex app-server thread/goal/set tokenBudget must be an integer >= 0.",
      );
    }
    params.tokenBudget = request.tokenBudget;
  }

  return params;
}

function imageToAppServerInput(
  image: NonNullable<AgentRuntimeStartRequest["images"]>[number],
): { type: "image"; url: string } | null {
  const mediaType = cleanString(image.mediaType);
  const base64Data = cleanString(image.base64Data);
  if (!mediaType || !base64Data) return null;
  return {
    type: "image",
    url: `data:${mediaType};base64,${base64Data}`,
  };
}

function readNestedString(value: unknown, key: string): string | undefined {
  return isRecord(value) ? cleanString(value[key]) : undefined;
}

function readThreadId(response: unknown): string | undefined {
  return (
    readNestedString(readOptionsRecord(response)?.thread, "id") ??
    readNestedString(response, "threadId")
  );
}

function readThreadList(response: unknown): unknown[] {
  return readDataList(response);
}

function readDataList(response: unknown): unknown[] {
  const data = readOptionsRecord(response)?.data;
  return Array.isArray(data) ? data : [];
}

function readArrayProperty(response: unknown, key: string): unknown[] {
  const value = readOptionsRecord(response)?.[key];
  return Array.isArray(value) ? value : [];
}

function readStringArrayProperty(response: unknown, key: string): string[] {
  return readArrayProperty(response, key).filter(
    (value): value is string => typeof value === "string",
  );
}

function readThreadIdList(response: unknown): string[] {
  const data = readOptionsRecord(response)?.data;
  return Array.isArray(data)
    ? data.filter((value): value is string => typeof value === "string")
    : [];
}

function readOptionalString(response: unknown, key: string): string | null {
  const value = readOptionsRecord(response)?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readBoolean(response: unknown, key: string): boolean | undefined {
  const value = readOptionsRecord(response)?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(response: unknown, key: string): number | undefined {
  const value = readOptionsRecord(response)?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readThreadDiffString(response: unknown): string | undefined {
  const record = readOptionsRecord(response);
  if (typeof record?.diff === "string") return record.diff;

  const nested = readOptionsRecord(record?.threadDiff);
  return typeof nested?.diff === "string" ? nested.diff : undefined;
}

function readThreadDiffNumber(
  response: unknown,
  key: "fromTurnCount" | "toTurnCount",
): number | undefined {
  return (
    readNumber(response, key) ??
    ((): number | undefined => {
      const nested = readOptionsRecord(readOptionsRecord(response)?.threadDiff);
      const value = nested?.[key];
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
    })()
  );
}

function readThreadGoal(
  response: unknown,
): AgentRuntimeThreadGoal | null | undefined {
  const goal = readOptionsRecord(response)?.goal;
  if (goal === null) return null;
  const goalRecord = readOptionsRecord(goal);
  if (!goalRecord) return undefined;

  return {
    createdAt:
      typeof goalRecord.createdAt === "number"
        ? goalRecord.createdAt
        : undefined,
    objective:
      typeof goalRecord.objective === "string"
        ? goalRecord.objective
        : undefined,
    status:
      typeof goalRecord.status === "string" ? goalRecord.status : undefined,
    threadId:
      typeof goalRecord.threadId === "string" ? goalRecord.threadId : undefined,
    timeUsedSeconds:
      typeof goalRecord.timeUsedSeconds === "number"
        ? goalRecord.timeUsedSeconds
        : undefined,
    tokenBudget:
      goalRecord.tokenBudget === null ||
      typeof goalRecord.tokenBudget === "number"
        ? goalRecord.tokenBudget
        : undefined,
    tokensUsed:
      typeof goalRecord.tokensUsed === "number"
        ? goalRecord.tokensUsed
        : undefined,
    updatedAt:
      typeof goalRecord.updatedAt === "number"
        ? goalRecord.updatedAt
        : undefined,
  };
}

function readTurnId(response: unknown): string | undefined {
  return (
    readNestedString(readOptionsRecord(response)?.turn, "id") ??
    readNestedString(response, "turnId")
  );
}

function makeInitializeParams(): Record<string, unknown> {
  return {
    clientInfo: {
      name: "1code_desktop",
      title: "1code Desktop",
      version: "0.0.0",
    },
    capabilities: {
      experimentalApi: true,
    },
  };
}

function spawnCodexAppServer(
  plan: CodexAppServerLaunchPlan,
): CodexAppServerProcess {
  const child = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: plan.extendEnv ? { ...process.env, ...plan.env } : plan.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return child;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireNativeThreadId(session: AgentRuntimeSessionRef): string {
  const threadId = cleanString(session.nativeSessionId);
  if (!threadId) {
    throw new Error(
      "Codex app-server thread control requires a native thread id.",
    );
  }
  return threadId;
}

function requireThreadId(threadId: string | null | undefined): string {
  const cleaned = cleanString(threadId);
  if (!cleaned) {
    throw new Error("Codex app-server thread control requires a thread id.");
  }
  return cleaned;
}

async function withCodexAppServerControl<T>(
  session: AgentRuntimeSessionRef,
  options: CodexAppServerRuntimeOptions,
  runControl: (
    client: CodexAppServerRpcClient,
    plan: CodexAppServerLaunchPlan,
  ) => Promise<T>,
): Promise<T> {
  const modelOptions = resolveModelAndEffort({
    session,
    prompt: "",
  });
  const launchPlan = patchPlanModel(
    buildCodexAppServerLaunchPlan({
      session,
      appServerArgs: options.appServerArgs,
      command: options.command,
      env: options.env,
      codeHome: options.codeHome,
      homeDir: options.homeDir,
    }),
    modelOptions.modelId,
  );
  const child = (options.spawnProcess ?? spawnCodexAppServer)(launchPlan);
  const client = new CodexAppServerRpcClient({
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
  });

  try {
    await client.request("initialize", makeInitializeParams());
    client.notify("initialized");

    if (hasConfiguredCodexAppServerMcpServer(launchPlan.args)) {
      await client.request("config/mcpServer/reload");
    }

    return await runControl(client, launchPlan);
  } finally {
    client.close();
    child.kill("SIGTERM");
  }
}

export async function readCodexAppServerThread(
  request: AgentRuntimeThreadReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadReadResult> {
  const includeTurns = request.includeTurns ?? true;
  let threadId: string | undefined;

  try {
    const nativeThreadId = requireNativeThreadId(request.session);
    threadId = nativeThreadId;
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) =>
        client.request("thread/read", {
          threadId: nativeThreadId,
          includeTurns,
        }),
    );

    return {
      status: "success",
      threadId: readThreadId(response) ?? nativeThreadId,
      thread: response,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/read",
        includeTurns,
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/read",
        includeTurns,
      },
    };
  }
}

export async function forkCodexAppServerThread(
  request: AgentRuntimeThreadForkRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadForkResult> {
  let sourceThreadId: string | undefined;

  try {
    const nativeThreadId = requireNativeThreadId(request.session);
    sourceThreadId = nativeThreadId;
    const modelOptions = resolveSessionModelAndEffort(request.session);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client, plan) =>
        client.request(
          "thread/fork",
          buildCodexAppServerThreadForkParams({
            plan: patchPlanModel(plan, modelOptions.modelId),
            threadId: nativeThreadId,
            serviceTier: modelOptions.serviceTier,
          }),
        ),
    );
    const forkedThreadId = readThreadId(response);
    if (!forkedThreadId) {
      throw new Error(
        "Codex app-server thread/fork response did not include a forked thread id.",
      );
    }

    return {
      status: "success",
      sourceThreadId: nativeThreadId,
      threadId: forkedThreadId,
      thread: response,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/fork",
      },
    };
  } catch (error) {
    return {
      status: "error",
      sourceThreadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/fork",
      },
    };
  }
}

function resolveThreadDiffThreadId(
  request:
    | AgentRuntimeThreadTurnDiffRequest
    | AgentRuntimeThreadFullDiffRequest,
): string {
  return requireThreadId(request.threadId ?? request.session.nativeSessionId);
}

function makeThreadDiffMetadata(
  method: "thread/diff/turn" | "thread/diff/full",
  ignoreWhitespace: boolean | undefined,
): Record<string, unknown> {
  return {
    bridge: "codex-app-server",
    method,
    ignoreWhitespace: ignoreWhitespace === true,
  };
}

function validateTurnDiffRange(
  fromTurnCount: number,
  toTurnCount: number,
): string | null {
  if (
    !Number.isInteger(fromTurnCount) ||
    !Number.isInteger(toTurnCount) ||
    fromTurnCount < 0 ||
    toTurnCount < 0 ||
    fromTurnCount > toTurnCount
  ) {
    return "Codex app-server thread/diff/turn requires fromTurnCount and toTurnCount to be integers >= 0 with fromTurnCount <= toTurnCount.";
  }

  return null;
}

function validateFullThreadDiffTarget(toTurnCount: number): string | null {
  if (!Number.isInteger(toTurnCount) || toTurnCount < 0) {
    return "Codex app-server thread/diff/full requires toTurnCount to be an integer >= 0.";
  }

  return null;
}

export async function getCodexAppServerThreadTurnDiff(
  request: AgentRuntimeThreadTurnDiffRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadDiffResult> {
  const method = "thread/diff/turn" as const;
  const metadata = makeThreadDiffMetadata(method, request.ignoreWhitespace);
  const validationError = validateTurnDiffRange(
    request.fromTurnCount,
    request.toTurnCount,
  );

  if (validationError) {
    return {
      status: "error",
      threadId: request.threadId ?? request.session.nativeSessionId ?? null,
      fromTurnCount: request.fromTurnCount,
      toTurnCount: request.toTurnCount,
      message: validationError,
      updatedAt: nowIso(),
      metadata,
    };
  }

  let threadId: string | undefined;

  try {
    threadId = resolveThreadDiffThreadId(request);
    const params: Record<string, unknown> = {
      threadId,
      fromTurnCount: request.fromTurnCount,
      toTurnCount: request.toTurnCount,
    };
    if (request.ignoreWhitespace === true) {
      params.ignoreWhitespace = true;
    }

    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request(method, params),
    );

    return {
      status: "success",
      threadId: readThreadId(response) ?? threadId,
      fromTurnCount:
        readThreadDiffNumber(response, "fromTurnCount") ??
        request.fromTurnCount,
      toTurnCount:
        readThreadDiffNumber(response, "toTurnCount") ?? request.toTurnCount,
      diff: readThreadDiffString(response) ?? "",
      updatedAt: nowIso(),
      metadata,
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      fromTurnCount: request.fromTurnCount,
      toTurnCount: request.toTurnCount,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata,
    };
  }
}

export async function getCodexAppServerThreadFullDiff(
  request: AgentRuntimeThreadFullDiffRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadDiffResult> {
  const method = "thread/diff/full" as const;
  const metadata = makeThreadDiffMetadata(method, request.ignoreWhitespace);
  const validationError = validateFullThreadDiffTarget(request.toTurnCount);

  if (validationError) {
    return {
      status: "error",
      threadId: request.threadId ?? request.session.nativeSessionId ?? null,
      fromTurnCount: 0,
      toTurnCount: request.toTurnCount,
      message: validationError,
      updatedAt: nowIso(),
      metadata,
    };
  }

  let threadId: string | undefined;

  try {
    threadId = resolveThreadDiffThreadId(request);
    const params: Record<string, unknown> = {
      threadId,
      toTurnCount: request.toTurnCount,
    };
    if (request.ignoreWhitespace === true) {
      params.ignoreWhitespace = true;
    }

    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request(method, params),
    );

    return {
      status: "success",
      threadId: readThreadId(response) ?? threadId,
      fromTurnCount: readThreadDiffNumber(response, "fromTurnCount") ?? 0,
      toTurnCount:
        readThreadDiffNumber(response, "toTurnCount") ?? request.toTurnCount,
      diff: readThreadDiffString(response) ?? "",
      updatedAt: nowIso(),
      metadata,
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      fromTurnCount: 0,
      toTurnCount: request.toTurnCount,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata,
    };
  }
}

export async function listCodexAppServerThreads(
  request: AgentRuntimeThreadListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadListResult> {
  try {
    const params = buildThreadListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("thread/list", params),
    );

    return {
      status: "success",
      threads: readThreadList(response),
      nextCursor: readOptionalString(response, "nextCursor"),
      backwardsCursor: readOptionalString(response, "backwardsCursor"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/list",
      },
    };
  }
}

export async function listLoadedCodexAppServerThreads(
  request: AgentRuntimeThreadLoadedListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadLoadedListResult> {
  try {
    const params = buildThreadLoadedListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("thread/loaded/list", params),
    );

    return {
      status: "success",
      threadIds: readThreadIdList(response),
      nextCursor: readOptionalString(response, "nextCursor"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/loaded/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/loaded/list",
      },
    };
  }
}

export async function readCodexAppServerConfig(
  request: AgentRuntimeConfigReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeConfigReadResult> {
  try {
    const params = buildConfigReadParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("config/read", params),
    );
    const record = readOptionsRecord(response) ?? {};
    const layers = record.layers;

    return {
      status: "success",
      config: record.config,
      layers: Array.isArray(layers)
        ? layers
        : layers === null
          ? null
          : undefined,
      origins: readOptionsRecord(record.origins) ?? {},
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "config/read",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "config/read",
      },
    };
  }
}

function buildConfigWriteResult(
  response: unknown,
  method: "config/value/write" | "config/batchWrite",
  params: Record<string, unknown>,
): AgentRuntimeConfigWriteResult {
  const record = readOptionsRecord(response) ?? {};
  return {
    status: "success",
    filePath: typeof record.filePath === "string" ? record.filePath : null,
    writeStatus: typeof record.status === "string" ? record.status : undefined,
    version: typeof record.version === "string" ? record.version : null,
    overriddenMetadata:
      record.overriddenMetadata === undefined
        ? undefined
        : record.overriddenMetadata,
    updatedAt: nowIso(),
    metadata: {
      bridge: "codex-app-server",
      method,
      params,
    },
  };
}

export async function writeCodexAppServerConfigValue(
  request: AgentRuntimeConfigValueWriteRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeConfigWriteResult> {
  try {
    const params = buildConfigValueWriteParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("config/value/write", params),
    );
    return buildConfigWriteResult(response, "config/value/write", params);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "config/value/write",
      },
    };
  }
}

export async function batchWriteCodexAppServerConfig(
  request: AgentRuntimeConfigBatchWriteRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeConfigWriteResult> {
  try {
    const params = buildConfigBatchWriteParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("config/batchWrite", params),
    );
    return buildConfigWriteResult(response, "config/batchWrite", params);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "config/batchWrite",
      },
    };
  }
}

export async function readCodexAppServerConfigRequirements(
  request: AgentRuntimeConfigRequirementsReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeConfigRequirementsReadResult> {
  try {
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("configRequirements/read"),
    );
    const record = readOptionsRecord(response) ?? {};

    return {
      status: "success",
      requirements:
        record.requirements === undefined ? null : record.requirements,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "configRequirements/read",
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "configRequirements/read",
      },
    };
  }
}

export async function listCodexAppServerPermissionProfiles(
  request: AgentRuntimePermissionProfileListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimePermissionProfileListResult> {
  try {
    const params = buildPermissionProfileListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("permissionProfile/list", params),
    );

    return {
      status: "success",
      profiles: readDataList(response),
      nextCursor: readOptionalString(response, "nextCursor"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "permissionProfile/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "permissionProfile/list",
      },
    };
  }
}

export async function listCodexAppServerMcpServerStatuses(
  request: AgentRuntimeMcpServerStatusListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeMcpServerStatusListResult> {
  try {
    const params = buildMcpServerStatusListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("mcpServerStatus/list", params),
    );

    return {
      status: "success",
      servers: readDataList(response),
      nextCursor: readOptionalString(response, "nextCursor"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "mcpServerStatus/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "mcpServerStatus/list",
      },
    };
  }
}

export async function reloadCodexAppServerMcpServerConfig(
  request: AgentRuntimeMcpServerConfigReloadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeMcpServerConfigReloadResult> {
  try {
    await withCodexAppServerControl(request.session, options, (client) =>
      client.request("config/mcpServer/reload"),
    );

    return {
      status: "success",
      reloaded: true,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "config/mcpServer/reload",
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "config/mcpServer/reload",
      },
    };
  }
}

export async function listCodexAppServerSkills(
  request: AgentRuntimeSkillListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeSkillListResult> {
  try {
    const params = buildSkillListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("skills/list", params),
    );

    return {
      status: "success",
      entries: readDataList(response),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "skills/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "skills/list",
      },
    };
  }
}

export async function listCodexAppServerHooks(
  request: AgentRuntimeHookListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeHookListResult> {
  try {
    const params = buildHookListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("hooks/list", params),
    );

    return {
      status: "success",
      entries: readDataList(response),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "hooks/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "hooks/list",
      },
    };
  }
}

export async function listCodexAppServerApps(
  request: AgentRuntimeAppListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAppListResult> {
  try {
    const params = buildAppListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("app/list", params),
    );

    return {
      status: "success",
      apps: readDataList(response),
      nextCursor: readOptionalString(response, "nextCursor"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "app/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "app/list",
      },
    };
  }
}

export async function listCodexAppServerPlugins(
  request: AgentRuntimePluginListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimePluginListResult> {
  try {
    const params = buildPluginListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("plugin/list", params),
    );

    return {
      status: "success",
      marketplaces: readArrayProperty(response, "marketplaces"),
      featuredPluginIds: readStringArrayProperty(response, "featuredPluginIds"),
      marketplaceLoadErrors: readArrayProperty(
        response,
        "marketplaceLoadErrors",
      ),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/list",
      },
    };
  }
}

export async function listInstalledCodexAppServerPlugins(
  request: AgentRuntimePluginInstalledRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimePluginInstalledResult> {
  try {
    const params = buildPluginInstalledParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("plugin/installed", params),
    );

    return {
      status: "success",
      marketplaces: readArrayProperty(response, "marketplaces"),
      marketplaceLoadErrors: readArrayProperty(
        response,
        "marketplaceLoadErrors",
      ),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/installed",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/installed",
      },
    };
  }
}

export async function readCodexAppServerPlugin(
  request: AgentRuntimePluginReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimePluginReadResult> {
  try {
    const params = buildPluginReadParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("plugin/read", params),
    );

    return {
      status: "success",
      plugin: readOptionsRecord(response)?.plugin,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/read",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/read",
      },
    };
  }
}

export async function installCodexAppServerPlugin(
  request: AgentRuntimePluginInstallRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimePluginInstallResult> {
  try {
    const params = buildPluginInstallParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("plugin/install", params),
    );

    return {
      status: "success",
      appsNeedingAuth: readArrayProperty(response, "appsNeedingAuth"),
      authPolicy: readOptionalString(response, "authPolicy"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/install",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "plugin/install",
      },
    };
  }
}

export async function detectCodexAppServerExternalAgentConfig(
  request: AgentRuntimeExternalAgentConfigDetectRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeExternalAgentConfigDetectResult> {
  try {
    const params = buildExternalAgentConfigDetectParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("externalAgentConfig/detect", params),
    );

    return {
      status: "success",
      items: readExternalAgentConfigMigrationItems(response),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "externalAgentConfig/detect",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "externalAgentConfig/detect",
      },
    };
  }
}

export async function importCodexAppServerExternalAgentConfig(
  request: AgentRuntimeExternalAgentConfigImportRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeExternalAgentConfigImportResult> {
  try {
    const params = buildExternalAgentConfigImportParams(request);
    await withCodexAppServerControl(request.session, options, (client) =>
      client.request("externalAgentConfig/import", params),
    );

    return {
      status: "success",
      importedCount: request.migrationItems.length,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "externalAgentConfig/import",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "externalAgentConfig/import",
      },
    };
  }
}

export async function startCodexAppServerMcpServerOauthLogin(
  request: AgentRuntimeMcpServerOauthLoginRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeMcpServerOauthLoginResult> {
  try {
    const params = buildMcpServerOauthLoginParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("mcpServer/oauth/login", params),
    );

    return {
      status: "success",
      authorizationUrl:
        readOptionalString(response, "authorizationUrl") ?? null,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "mcpServer/oauth/login",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "mcpServer/oauth/login",
      },
    };
  }
}

export async function listCodexAppServerModels(
  request: AgentRuntimeModelListRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeModelListResult> {
  try {
    const params = buildModelListParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("model/list", params),
    );

    return {
      status: "success",
      models: readDataList(response),
      nextCursor: readOptionalString(response, "nextCursor"),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "model/list",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "model/list",
      },
    };
  }
}

export async function startCodexAppServerAccountLogin(
  request: AgentRuntimeAccountLoginStartRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAccountLoginStartResult> {
  try {
    const params = buildAccountLoginStartParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("account/login/start", params),
    );
    const record = readOptionsRecord(response) ?? {};

    return {
      status: "success",
      type:
        typeof record.type === "string"
          ? (record.type as AgentRuntimeAccountLoginType | (string & {}))
          : undefined,
      authUrl: readOptionalString(record, "authUrl") ?? null,
      loginId: readOptionalString(record, "loginId") ?? null,
      verificationUrl: readOptionalString(record, "verificationUrl") ?? null,
      userCode: readOptionalString(record, "userCode") ?? null,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/login/start",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/login/start",
      },
    };
  }
}

export async function cancelCodexAppServerAccountLogin(
  request: AgentRuntimeAccountLoginCancelRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAccountLoginCancelResult> {
  try {
    const params = buildAccountLoginCancelParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("account/login/cancel", params),
    );
    const record = readOptionsRecord(response) ?? {};

    return {
      status: "success",
      cancelStatus:
        typeof record.status === "string"
          ? (record.status as AgentRuntimeAccountLoginCancelResult["cancelStatus"])
          : undefined,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/login/cancel",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/login/cancel",
      },
    };
  }
}

export async function logoutCodexAppServerAccount(
  request: AgentRuntimeAccountLogoutRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAccountLogoutResult> {
  try {
    await withCodexAppServerControl(request.session, options, (client) =>
      client.request("account/logout"),
    );

    return {
      status: "success",
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/logout",
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/logout",
      },
    };
  }
}

export async function readCodexAppServerAccount(
  request: AgentRuntimeAccountReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAccountReadResult> {
  try {
    const params = buildAccountReadParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("account/read", params),
    );
    const record = readOptionsRecord(response) ?? {};

    return {
      status: "success",
      account: record.account ?? null,
      requiresOpenaiAuth:
        typeof record.requiresOpenaiAuth === "boolean"
          ? record.requiresOpenaiAuth
          : undefined,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/read",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/read",
      },
    };
  }
}

export async function readCodexAppServerAccountRateLimits(
  request: AgentRuntimeAccountRateLimitsReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAccountRateLimitsReadResult> {
  try {
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("account/rateLimits/read"),
    );
    const record = readOptionsRecord(response) ?? {};

    return {
      status: "success",
      rateLimits: record.rateLimits,
      rateLimitsByLimitId:
        readOptionsRecord(record.rateLimitsByLimitId) ??
        (record.rateLimitsByLimitId === null ? null : undefined),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/rateLimits/read",
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/rateLimits/read",
      },
    };
  }
}

export async function readCodexAppServerAccountUsage(
  request: AgentRuntimeAccountUsageReadRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeAccountUsageReadResult> {
  try {
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("account/usage/read"),
    );
    const record = readOptionsRecord(response) ?? {};
    const buckets = record.dailyUsageBuckets;

    return {
      status: "success",
      summary: record.summary,
      dailyUsageBuckets: Array.isArray(buckets)
        ? buckets
        : buckets === null
          ? null
          : undefined,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/usage/read",
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "account/usage/read",
      },
    };
  }
}

export async function controlCodexAppServerThread(
  request: AgentRuntimeThreadControlRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadControlResult> {
  const methodByAction = {
    archive: "thread/archive",
    unarchive: "thread/unarchive",
    delete: "thread/delete",
  } as const;
  let threadId: string | undefined;

  try {
    threadId = requireThreadId(request.threadId);
    const method = methodByAction[request.action];
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) =>
        client.request(method, {
          threadId,
        }),
    );

    return {
      status: "success",
      action: request.action,
      threadId: readThreadId(response) ?? threadId,
      thread: response,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method,
      },
    };
  } catch (error) {
    return {
      status: "error",
      action: request.action,
      threadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: methodByAction[request.action],
      },
    };
  }
}

export async function setCodexAppServerThreadName(
  request: AgentRuntimeThreadNameSetRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadNameSetResult> {
  let threadId: string | undefined;
  let name: string | undefined;

  try {
    const params = buildThreadNameSetParams(request);
    threadId = params.threadId as string;
    name = params.name as string;
    await withCodexAppServerControl(request.session, options, (client) =>
      client.request("thread/name/set", params),
    );

    return {
      status: "success",
      threadId,
      name,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/name/set",
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      name,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/name/set",
      },
    };
  }
}

export async function updateCodexAppServerThreadMetadata(
  request: AgentRuntimeThreadMetadataUpdateRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadMetadataUpdateResult> {
  let threadId: string | undefined;

  try {
    threadId = requireThreadId(request.threadId);
    const params = buildThreadMetadataUpdateParams(request);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("thread/metadata/update", params),
    );

    return {
      status: "success",
      threadId: readThreadId(response) ?? threadId,
      thread: response,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/metadata/update",
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/metadata/update",
      },
    };
  }
}

export async function getCodexAppServerThreadGoal(
  request: AgentRuntimeThreadGoalGetRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadGoalGetResult> {
  let threadId: string | undefined;

  try {
    threadId = requireThreadId(request.threadId);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("thread/goal/get", { threadId }),
    );
    const goal = readThreadGoal(response);

    return {
      status: "success",
      threadId: goal?.threadId ?? threadId,
      goal,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/goal/get",
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/goal/get",
      },
    };
  }
}

export async function setCodexAppServerThreadGoal(
  request: AgentRuntimeThreadGoalSetRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadGoalSetResult> {
  let threadId: string | undefined;

  try {
    const params = buildThreadGoalSetParams(request);
    threadId = params.threadId as string;
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("thread/goal/set", params),
    );
    const goal = readThreadGoal(response);

    return {
      status: "success",
      threadId: goal?.threadId ?? threadId,
      goal,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/goal/set",
        params,
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/goal/set",
      },
    };
  }
}

export async function clearCodexAppServerThreadGoal(
  request: AgentRuntimeThreadGoalClearRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadGoalClearResult> {
  let threadId: string | undefined;

  try {
    threadId = requireThreadId(request.threadId);
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) => client.request("thread/goal/clear", { threadId }),
    );

    return {
      status: "success",
      threadId,
      cleared: readBoolean(response, "cleared") ?? true,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/goal/clear",
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/goal/clear",
      },
    };
  }
}

export async function rollbackCodexAppServerThread(
  request: AgentRuntimeThreadRollbackRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeThreadRollbackResult> {
  let threadId: string | undefined;

  if (!Number.isInteger(request.numTurns) || request.numTurns < 1) {
    return {
      status: "error",
      threadId: request.session.nativeSessionId ?? null,
      numTurns: request.numTurns,
      message:
        "Codex app-server rollback requires numTurns to be an integer >= 1.",
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/rollback",
      },
    };
  }

  try {
    const nativeThreadId = requireNativeThreadId(request.session);
    threadId = nativeThreadId;
    const response = await withCodexAppServerControl(
      request.session,
      options,
      (client) =>
        client.request("thread/rollback", {
          threadId: nativeThreadId,
          numTurns: request.numTurns,
        }),
    );

    return {
      status: "success",
      threadId: readThreadId(response) ?? nativeThreadId,
      numTurns: request.numTurns,
      thread: response,
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/rollback",
      },
    };
  } catch (error) {
    return {
      status: "error",
      threadId,
      numTurns: request.numTurns,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: nowIso(),
      metadata: {
        bridge: "codex-app-server",
        method: "thread/rollback",
      },
    };
  }
}

function isAcceptLike(value: string | undefined): boolean {
  return [
    "accept",
    "accepted",
    "approve",
    "approved",
    "allow",
    "yes",
    "true",
  ].includes(value ?? "");
}

function isSessionAcceptLike(value: string | undefined): boolean {
  return [
    "acceptforsession",
    "accept_for_session",
    "approved_for_session",
    "approve_for_session",
  ].includes(value ?? "");
}

function isCancelLike(value: string | undefined): boolean {
  return ["cancel", "abort", "aborted"].includes(value ?? "");
}

function readDecisionValue(
  result: unknown,
  isError: boolean | undefined,
): string {
  if (isError) return "decline";
  if (typeof result === "boolean") return result ? "accept" : "decline";
  if (typeof result === "string") return result.trim().toLowerCase();
  if (isRecord(result)) {
    return (
      cleanString(result.decision) ??
      cleanString(result.approval) ??
      cleanString(result.status) ??
      (typeof result.approved === "boolean"
        ? result.approved
          ? "accept"
          : "decline"
        : undefined) ??
      "accept"
    ).toLowerCase();
  }
  return "accept";
}

function normalizeApprovalDecision(
  method: string,
  request: AgentRuntimeToolResultRequest,
): string {
  const value = readDecisionValue(request.result, request.isError);
  if (method === "applyPatchApproval" || method === "execCommandApproval") {
    if (isSessionAcceptLike(value)) return "approved_for_session";
    if (isAcceptLike(value)) return "approved";
    if (isCancelLike(value)) return "abort";
    return "denied";
  }

  if (isSessionAcceptLike(value)) return "acceptForSession";
  if (isAcceptLike(value)) return "accept";
  if (isCancelLike(value)) return "cancel";
  return "decline";
}

function normalizeUserInputAnswers(
  result: unknown,
): Record<string, { answers: string[] }> {
  const answers =
    isRecord(result) && isRecord(result.answers) ? result.answers : result;
  if (!isRecord(answers)) return {};

  const normalized: Record<string, { answers: string[] }> = {};
  for (const [questionId, value] of Object.entries(answers)) {
    if (isRecord(value) && Array.isArray(value.answers)) {
      normalized[questionId] = {
        answers: value.answers.map((entry) => String(entry)),
      };
    } else if (Array.isArray(value)) {
      normalized[questionId] = {
        answers: value.map((entry) => String(entry)),
      };
    } else {
      normalized[questionId] = {
        answers: [String(value)],
      };
    }
  }
  return normalized;
}

function responseForToolResult(
  pending: PendingServerRequest,
  request: AgentRuntimeToolResultRequest,
): unknown {
  if (
    isRecord(request.result) &&
    request.result.codexAppServerResponse !== undefined
  ) {
    return request.result.codexAppServerResponse;
  }

  if (pending.method === "item/tool/requestUserInput") {
    return {
      answers: normalizeUserInputAnswers(request.result),
    };
  }

  if (pending.method === "item/tool/call") {
    if (isRecord(request.result) && "contentItems" in request.result)
      return request.result;
    return {
      contentItems: [{ type: "text", text: String(request.result ?? "") }],
      success: request.isError !== true,
    };
  }

  if (pending.method === "item/permissions/requestApproval") {
    if (isRecord(request.result) && "permissions" in request.result)
      return request.result;
    return {
      permissions: {},
    };
  }

  return {
    decision: normalizeApprovalDecision(pending.method, request),
  };
}

function makeResolvedEvent(
  pending: PendingServerRequest,
  response: unknown,
  failed: boolean,
): AgentRuntimeStreamEvent {
  if (pending.method === "item/tool/requestUserInput") {
    const event = providerRuntimeEventToStreamEvent({
      type: "user-input.resolved",
      engineId: "codex",
      requestId: pending.requestId,
      ...(pending.turnId ? { turnId: pending.turnId } : {}),
      ...(pending.itemId ? { itemId: pending.itemId } : {}),
      payload: {
        ...(isRecord(response) && response.answers !== undefined
          ? { answers: response.answers }
          : { response }),
        ...(failed ? { error: true } : {}),
      },
    });
    if (event) return event;
  }

  return {
    type: "conversation-block-update",
    id: pending.requestId,
    patch: {
      status: failed ? "failed" : "completed",
      output: {
        method: pending.method,
        response,
      },
    },
  };
}

function createAcceptedControlResult(
  request: AgentRuntimeToolResultRequest,
  pending: PendingServerRequest,
): AgentRuntimeControlResult {
  return {
    runId: request.runId,
    status: "accepted",
    message: "Codex app-server tool result accepted.",
    updatedAt: new Date().toISOString(),
    metadata: {
      engineId: request.session.engineId,
      requestId: pending.requestId,
      method: pending.method,
    },
  };
}

function createErrorControlResult(
  request: AgentRuntimeToolResultRequest,
  message: string,
): AgentRuntimeControlResult {
  return {
    runId: request.runId,
    status: "error",
    message,
    updatedAt: new Date().toISOString(),
  };
}

function createNotFoundControlResult(
  request: AgentRuntimeToolResultRequest,
): AgentRuntimeControlResult {
  return {
    runId: request.runId,
    status: "not-found",
    message: `No pending Codex app-server request matched ${request.toolCallId}.`,
    updatedAt: new Date().toISOString(),
  };
}

function registerPendingAliases(
  pendingById: Map<string, PendingServerRequest>,
  request: CodexAppServerRpcRequest,
  pending: PendingServerRequest,
): void {
  pendingById.set(pending.requestId, pending);
  pendingById.set(String(request.id), pending);
  const params = readOptionsRecord(request.params);
  for (const key of ["approvalId", "requestId", "itemId", "callId"]) {
    const alias = cleanString(params?.[key]);
    if (alias) pendingById.set(alias, pending);
  }
}

function readRequestAlias(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return cleanString(value);
}

function removePendingAliases(
  pendingById: Map<string, PendingServerRequest>,
  pending: PendingServerRequest,
): void {
  for (const [key, value] of [...pendingById.entries()]) {
    if (value === pending) pendingById.delete(key);
  }
}

function correlateResolvedServerRequestNotification(
  notification: CodexAppServerRpcNotification,
  correlationsById: Map<string, PendingServerRequest>,
): CodexAppServerRpcNotification {
  if (notification.method !== "serverRequest/resolved") return notification;
  const params = readOptionsRecord(notification.params) ?? {};
  const rawRequestId = readRequestAlias(params.requestId);
  if (!rawRequestId) return notification;

  const correlation = correlationsById.get(rawRequestId);
  if (!correlation) return notification;

  removePendingAliases(correlationsById, correlation);
  return {
    ...notification,
    params: {
      ...params,
      rawRequestId,
      requestId: correlation.requestId,
      requestType: correlation.requestType,
      ...(correlation.turnId ? { turnId: correlation.turnId } : {}),
      ...(correlation.itemId ? { itemId: correlation.itemId } : {}),
    },
  };
}

function shouldCompleteForNotification(
  notification: CodexAppServerRpcNotification,
  activeTurnId: string | null,
): boolean {
  if (notification.method !== "turn/completed") return false;
  if (!activeTurnId) return true;
  const params = readOptionsRecord(notification.params);
  const turn = readOptionsRecord(params?.turn);
  return (
    cleanString(params?.turnId) === activeTurnId ||
    cleanString(turn?.id) === activeTurnId
  );
}

function isRuntimeStreamEventPayload(
  value: unknown,
): value is AgentRuntimeStreamEvent {
  return isRecord(value) && typeof value.type === "string";
}

export async function* streamCodexAppServerRuntimeRun(
  action: AgentRuntimeRunAction,
  request: AgentRuntimeStartRequest,
  options: CodexAppServerRuntimeOptions = {},
): AsyncIterable<AgentRuntimeStreamEvent> {
  const startedAt = new Date();
  const runId =
    request.runId ??
    createAgentRuntimeRunId(request.session, action, startedAt.getTime());
  const runLedger =
    options.recordRunLedger === false || options.runLedger === null
      ? null
      : (options.runLedger ?? getCodexAppServerRuntimeRunLedger());
  const commandId = runId;

  if (runLedger) {
    const commandReceipt = runLedger.getCommandReceipt(commandId);
    if (commandReceipt?.status === "accepted") {
      const snapshot = runLedger.snapshot(commandReceipt.runId);
      if (snapshot && snapshot.receipt.status !== "running") {
        for (const event of replayAgentRuntimeRunLedgerEvents(snapshot)) {
          if (
            event.kind === "stream-event" &&
            isRuntimeStreamEventPayload(event.payload)
          ) {
            yield event.payload;
          }
        }
        return;
      }
    }
    if (commandReceipt?.status === "rejected") {
      yield {
        type: "error",
        message:
          commandReceipt.error ??
          "Codex app-server command was previously rejected.",
      };
      yield {
        type: "finish",
        nativeSessionId: request.session.nativeSessionId ?? null,
        resultSubtype: "error",
      };
      return;
    }
  }

  const queue = new AsyncEventQueue<AgentRuntimeStreamEvent>();
  const pendingById = new Map<string, PendingServerRequest>();
  const requestCorrelationsById = new Map<string, PendingServerRequest>();
  let client: CodexAppServerRpcClient | undefined;
  let child: CodexAppServerProcess | undefined;
  let nativeSessionId = request.session.nativeSessionId ?? null;
  let ledgerStatus: Exclude<AgentRuntimeRunReceipt["status"], "running"> =
    "success";
  let ledgerResultSubtype: AgentRuntimeRunReceipt["resultSubtype"] = "success";
  let ledgerErrorMessage: string | undefined;
  let latestLedgerEventId: string | null = null;
  let recordedStreamEventCount = 0;
  let ledgerFinished = false;
  let activeTurnId: string | null = null;
  let providerInstanceId = request.session.providerInstanceId ?? null;
  let lifecycleSettled = false;
  let unregisterRun = true;
  let interruptSent = false;

  const context = () => ({
    providerInstanceId,
    nativeSessionId,
  });

  if (runLedger) {
    runLedger.upsertReceipt(
      createAgentRuntimeRunReceipt({
        runId,
        action,
        session: request.session,
        status: "running",
        nativeSessionId,
        now: startedAt,
      }),
    );
    latestLedgerEventId = runLedger.appendEvent({
      runId,
      engineId: request.session.engineId,
      kind: "run-started",
      commandId,
      correlationId: commandId,
      payload: {
        bridge: "codex-app-server",
        forceNewSession: request.forceNewSession === true,
        imageCount: request.images?.length ?? 0,
        promptLength: request.prompt.length,
        streaming: true,
      },
    }).id;
  }
  options.runtimeReceipts?.publish({
    type: "runtime.run.started",
    runId,
    engineId: request.session.engineId,
    chatId: request.session.chatId,
    subChatId: request.session.subChatId,
    createdAt: startedAt.toISOString(),
    source: "codex-app-server",
    metadata: {
      action,
      forceNewSession: request.forceNewSession === true,
      imageCount: request.images?.length ?? 0,
      promptLength: request.prompt.length,
      streaming: true,
    },
  });

  const recordStreamEvent = (event: AgentRuntimeStreamEvent): void => {
    recordedStreamEventCount += 1;
    if (event.type === "error" || event.type === "auth-error") {
      ledgerStatus = "error";
      ledgerResultSubtype = "error";
      ledgerErrorMessage = event.message;
    }
    if (event.type === "finish") {
      nativeSessionId = event.nativeSessionId ?? nativeSessionId;
      ledgerResultSubtype = event.resultSubtype ?? ledgerResultSubtype;
      if (event.resultSubtype === "cancelled") ledgerStatus = "cancelled";
      else if (event.resultSubtype === "error") ledgerStatus = "error";
    }
    if (!runLedger) return;
    latestLedgerEventId = runLedger.appendEvent({
      runId,
      engineId: request.session.engineId,
      kind: "stream-event",
      commandId,
      correlationId: commandId,
      causationEventId: latestLedgerEventId,
      payload: event as unknown as Record<string, unknown>,
    }).id;
  };

  const finishStreamLedger = (): void => {
    if (ledgerFinished) return;
    ledgerFinished = true;
    let latestSequence: number | null = null;
    if (runLedger) {
      runLedger.finishRun({
        runId,
        status: ledgerStatus,
        resultSubtype: ledgerResultSubtype,
        commandId,
        correlationId: commandId,
        causationEventId: latestLedgerEventId,
        error: ledgerErrorMessage,
        metadata: {
          bridge: "codex-app-server",
          eventCount: recordedStreamEventCount,
          streaming: true,
        },
      });
      const snapshot = runLedger.snapshot(runId);
      const projection = snapshot
        ? projectAgentRuntimeRunLedgerSnapshot(snapshot)
        : null;
      latestSequence = projection?.latestEventSequence ?? null;
      const commandReceipt = runLedger.getCommandReceipt(commandId);
      runLedger.upsertReceipt(
        createAgentRuntimeRunReceipt({
          runId,
          action,
          session: request.session,
          status: ledgerStatus,
          nativeSessionId,
          resultSubtype: ledgerResultSubtype,
          now: startedAt,
          completedAt: new Date(),
          error: ledgerErrorMessage,
          metadata: {
            bridge: "codex-app-server",
            eventCount: recordedStreamEventCount,
            streaming: true,
            ...(projection
              ? {
                  ledger: {
                    eventCount: projection.eventCount,
                    latestEventSequence: projection.latestEventSequence ?? null,
                    latestEventKind: projection.latestEventKind ?? null,
                    correlationIds: projection.correlationIds,
                    causationEventIds: projection.causationEventIds,
                  },
                }
              : {}),
            ...(commandReceipt
              ? {
                  commandReceipt: {
                    status: commandReceipt.status,
                    resultSequence: commandReceipt.resultSequence,
                  },
                }
              : {}),
          },
        }),
      );
    }
    options.runtimeReceipts?.publish({
      type: "turn.processing.quiesced",
      runId,
      engineId: request.session.engineId,
      chatId: request.session.chatId,
      subChatId: request.session.subChatId,
      status: ledgerStatus,
      resultSubtype: ledgerResultSubtype,
      latestSequence,
      eventCount: recordedStreamEventCount,
      createdAt: new Date().toISOString(),
      error: ledgerErrorMessage ?? null,
      source: "codex-app-server",
      metadata: {
        action,
        streaming: true,
      },
    });
  };

  const pushSessionNotification = (
    method: "session/connecting" | "session/ready" | "session/error",
    message: string,
    error?: unknown,
  ): void => {
    const event = codexAppServerNotificationToStreamEvent(
      {
        method,
        params: {
          message,
          ...(nativeSessionId ? { threadId: nativeSessionId } : {}),
          ...(error !== undefined ? { error } : {}),
        },
      },
      {
        ...context(),
        eventId: `codex-app-server:${method}`,
      },
    );
    if (event) queue.push(event);
  };

  const interruptActiveTurn = async (): Promise<void> => {
    if (interruptSent || !client || !nativeSessionId || !activeTurnId) return;
    interruptSent = true;
    await client.request("turn/interrupt", {
      threadId: nativeSessionId,
      turnId: activeTurnId,
    });
  };

  const handle = registerAgentRuntimeProcessHandle(
    createAgentRuntimeProcessHandle({
      action,
      session: request.session,
      runId,
      onStop: interruptActiveTurn,
      submitToolResult: async (toolResult) => {
        const pending = pendingById.get(toolResult.toolCallId);
        if (!pending) return createNotFoundControlResult(toolResult);
        if (!client) {
          return createErrorControlResult(
            toolResult,
            "Codex app-server RPC client is not ready.",
          );
        }

        try {
          const response = responseForToolResult(pending, toolResult);
          if (toolResult.isError) {
            client.respondError(
              pending.jsonRpcId,
              codexAppServerInvalidParamsError(
                "Codex app-server request rejected.",
                response,
              ),
            );
          } else {
            client.respond(pending.jsonRpcId, response);
          }
          removePendingAliases(pendingById, pending);
          queue.push(
            makeResolvedEvent(pending, response, toolResult.isError === true),
          );
          return createAcceptedControlResult(toolResult, pending);
        } catch (error) {
          return createErrorControlResult(
            toolResult,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    }),
  );

  const runLifecycle = async (): Promise<void> => {
    try {
      if (action === "resume" && !nativeSessionId) {
        throw new Error(
          "Codex app-server resume requires a native session id.",
        );
      }

      const modelOptions = resolveModelAndEffort(request);
      const launchPlan = patchPlanModel(
        buildCodexAppServerLaunchPlan({
          session: request.session,
          appServerArgs: options.appServerArgs,
          command: options.command,
          env: options.env,
          codeHome: options.codeHome,
          homeDir: options.homeDir,
        }),
        modelOptions.modelId,
      );
      providerInstanceId = launchPlan.providerInstanceId;
      child = (options.spawnProcess ?? spawnCodexAppServer)(launchPlan);
      const appServerChild = child;

      let completeAbortListener: (() => void) | undefined;
      const complete = new Promise<void>((resolve, reject) => {
        const abort = () => resolve();
        completeAbortListener = abort;
        const fail = (error: Error) => {
          if (handle.abortController.signal.aborted) resolve();
          else reject(error);
        };

        if (handle.abortController.signal.aborted) {
          resolve();
        } else {
          handle.abortController.signal.addEventListener("abort", abort, {
            once: true,
          });
        }

        const rpcClient = new CodexAppServerRpcClient({
          stdin: appServerChild.stdin,
          stdout: appServerChild.stdout,
          stderr: appServerChild.stderr,
          signal: handle.abortController.signal,
          onNotification(notification) {
            const routedNotification =
              correlateResolvedServerRequestNotification(
                notification,
                requestCorrelationsById,
              );
            const params = readOptionsRecord(notification.params);
            if (routedNotification.method === "thread/started") {
              nativeSessionId =
                readNestedString(params?.thread, "id") ?? nativeSessionId;
            }
            const event = codexAppServerNotificationToStreamEvent(
              routedNotification,
              context(),
            );
            if (event) queue.push(event);
            if (
              shouldCompleteForNotification(routedNotification, activeTurnId)
            ) {
              resolve();
            }
          },
          onRequest(serverRequest) {
            const requestId = codexAppServerServerRequestId(serverRequest);
            const params = readOptionsRecord(serverRequest.params) ?? {};
            const pending: PendingServerRequest = {
              jsonRpcId: serverRequest.id,
              method: serverRequest.method,
              requestId,
              requestType: codexAppServerRequestType(serverRequest.method),
              turnId: cleanString(params.turnId),
              itemId: cleanString(params.itemId),
            };
            registerPendingAliases(pendingById, serverRequest, pending);
            registerPendingAliases(
              requestCorrelationsById,
              serverRequest,
              pending,
            );
            const event = codexAppServerServerRequestToStreamEvent(
              serverRequest,
              context(),
            );
            if (event) queue.push(event);
          },
          onStderrLine(line) {
            if (!line.trim()) return;
            queue.push({
              type: "conversation-block",
              block: {
                id: `codex-stderr:${Date.now()}`,
                type: "status",
                status: "completed",
                level: "warning",
                title: "Codex app-server",
                message: line,
                data: {
                  bridge: "codex-app-server",
                  stream: "stderr",
                },
              },
            });
          },
          onProtocolError(error) {
            queue.push({ type: "error", message: error.message });
          },
        });
        client = rpcClient;

        appServerChild.once("exit", () =>
          fail(new Error("Codex app-server process exited.")),
        );
        appServerChild.once("close", () =>
          fail(new Error("Codex app-server process closed.")),
        );
      }).finally(() => {
        if (completeAbortListener) {
          handle.abortController.signal.removeEventListener(
            "abort",
            completeAbortListener,
          );
        }
      });

      const rpcClient = client;
      if (!rpcClient)
        throw new Error("Codex app-server RPC client is not ready.");

      pushSessionNotification(
        "session/connecting",
        "Starting Codex app-server session.",
      );
      await rpcClient.request("initialize", makeInitializeParams());
      rpcClient.notify("initialized");

      if (hasConfiguredCodexAppServerMcpServer(launchPlan.args)) {
        await rpcClient.request("config/mcpServer/reload");
      }
      pushSessionNotification(
        "session/ready",
        "Codex app-server session ready.",
      );

      let threadResponse: unknown;
      if (action === "resume" && nativeSessionId && !request.forceNewSession) {
        try {
          threadResponse = await rpcClient.request(
            "thread/resume",
            buildCodexAppServerThreadResumeParams({
              plan: launchPlan,
              threadId: nativeSessionId,
              serviceTier: modelOptions.serviceTier,
            }),
          );
        } catch (error) {
          if (!isRecoverableCodexAppServerThreadResumeError(error)) throw error;
          threadResponse = await rpcClient.request(
            "thread/start",
            buildCodexAppServerThreadStartParams({
              plan: launchPlan,
              serviceTier: modelOptions.serviceTier,
            }),
          );
        }
      } else {
        threadResponse = await rpcClient.request(
          "thread/start",
          buildCodexAppServerThreadStartParams({
            plan: launchPlan,
            serviceTier: modelOptions.serviceTier,
          }),
        );
      }

      nativeSessionId = readThreadId(threadResponse) ?? nativeSessionId;
      if (!nativeSessionId) {
        throw new Error("Codex app-server did not return a thread id.");
      }

      const turnResponse = await rpcClient.request(
        "turn/start",
        buildCodexAppServerTurnStartParams({
          plan: launchPlan,
          threadId: nativeSessionId,
          prompt: request.prompt,
          images: request.images
            ?.map(imageToAppServerInput)
            .filter((image): image is { type: "image"; url: string } =>
              Boolean(image),
            ),
          effort: modelOptions.reasoningEffort,
          serviceTier: modelOptions.serviceTier,
          interactionMode:
            request.session.permissionMode === "plan" ? "plan" : "default",
          developerInstructions: modelOptions.developerInstructions,
        }),
      );
      activeTurnId = readTurnId(turnResponse) ?? activeTurnId;
      await complete;
      if (handle.abortController.signal.aborted) {
        queue.push({
          type: "finish",
          nativeSessionId,
          resultSubtype: "cancelled",
        });
      }
    } catch (error) {
      const wasCancelled = handle.abortController.signal.aborted;
      if (!wasCancelled) {
        pushSessionNotification(
          "session/error",
          error instanceof Error ? error.message : String(error),
          error,
        );
        queue.push({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      queue.push({
        type: "finish",
        nativeSessionId,
        resultSubtype: wasCancelled ? "cancelled" : "error",
      });
    } finally {
      lifecycleSettled = true;
      client?.close();
      child?.kill("SIGTERM");
      pendingById.clear();
      requestCorrelationsById.clear();
      if (unregisterRun) unregisterAgentRuntimeProcessHandle(handle.runId);
      queue.close();
    }
  };

  const lifecyclePromise = runLifecycle();

  try {
    for await (const event of queue) {
      recordStreamEvent(event);
      yield event;
    }
    await lifecyclePromise;
    finishStreamLedger();
  } finally {
    if (!lifecycleSettled && !handle.abortController.signal.aborted) {
      unregisterRun = false;
      ledgerStatus = "cancelled";
      ledgerResultSubtype = "cancelled";
      handle.abortController.abort("Codex app-server stream consumer stopped.");
      client?.close();
      child?.kill("SIGTERM");
      unregisterAgentRuntimeProcessHandle(handle.runId);
    }
    finishStreamLedger();
  }
}

export async function runCodexAppServerRuntimeRun(
  action: AgentRuntimeRunAction,
  request: AgentRuntimeStartRequest,
  options: CodexAppServerRuntimeOptions = {},
): Promise<AgentRuntimeRunReceipt> {
  const startedAt = new Date();
  const runId =
    request.runId ??
    createAgentRuntimeRunId(request.session, action, startedAt.getTime());
  const runRequest =
    request.runId === runId ? request : { ...request, runId };
  const runLedger = options.runLedger ?? getCodexAppServerRuntimeRunLedger();
  const commandId = runId;
  const existingCommandReceipt = runLedger.getCommandReceipt(commandId);
  if (existingCommandReceipt?.status === "accepted") {
    const existingSnapshot = runLedger.snapshot(existingCommandReceipt.runId);
    if (existingSnapshot && existingSnapshot.receipt.status !== "running") {
      return existingSnapshot.receipt;
    }
  }
  if (existingCommandReceipt?.status === "rejected") {
    return createAgentRuntimeRunReceipt({
      runId,
      action,
      session: request.session,
      status: "error",
      nativeSessionId: request.session.nativeSessionId ?? null,
      resultSubtype: "error",
      now: startedAt,
      completedAt: new Date(),
      error:
        existingCommandReceipt.error ??
        "Codex app-server command was previously rejected.",
      metadata: {
        bridge: "codex-app-server",
        commandReceipt: {
          status: existingCommandReceipt.status,
          resultSequence: existingCommandReceipt.resultSequence,
        },
      },
    });
  }
  let latestLedgerEventId: string | null = null;
  let lastText = "";
  let usage: Record<string, unknown> | undefined;
  let status: Exclude<AgentRuntimeRunReceipt["status"], "running"> = "success";
  let resultSubtype: AgentRuntimeRunReceipt["resultSubtype"] = "success";
  let errorMessage: string | undefined;
  let nativeSessionId = request.session.nativeSessionId ?? null;
  let eventCount = 0;

  runLedger.upsertReceipt(
    createAgentRuntimeRunReceipt({
      runId,
      action,
      session: request.session,
      status: "running",
      nativeSessionId,
      now: startedAt,
    }),
  );
  latestLedgerEventId = runLedger.appendEvent({
    runId,
    engineId: request.session.engineId,
    kind: "run-started",
    commandId,
    correlationId: commandId,
    payload: {
      bridge: "codex-app-server",
      forceNewSession: request.forceNewSession === true,
      imageCount: request.images?.length ?? 0,
      promptLength: request.prompt.length,
    },
  }).id;

  for await (const event of streamCodexAppServerRuntimeRun(
    action,
    runRequest,
    {
      ...options,
      runLedger,
      recordRunLedger: false,
    },
  )) {
    eventCount += 1;
    latestLedgerEventId = runLedger.appendEvent({
      runId,
      engineId: request.session.engineId,
      kind: "stream-event",
      commandId,
      correlationId: commandId,
      causationEventId: latestLedgerEventId,
      payload: event as unknown as Record<string, unknown>,
    }).id;
    if (event.type === "text") lastText += event.text;
    if (event.type === "usage")
      usage = event as unknown as Record<string, unknown>;
    if (event.type === "error" || event.type === "auth-error") {
      status = "error";
      resultSubtype = "error";
      errorMessage = event.message;
    }
    if (event.type === "finish") {
      nativeSessionId = event.nativeSessionId ?? nativeSessionId;
      resultSubtype = event.resultSubtype ?? resultSubtype;
      if (event.resultSubtype === "cancelled") status = "cancelled";
      else if (event.resultSubtype === "error") status = "error";
    }
  }

  runLedger.finishRun({
    runId,
    status,
    resultSubtype,
    commandId,
    correlationId: commandId,
    causationEventId: latestLedgerEventId,
    error: errorMessage,
    metadata: {
      bridge: "codex-app-server",
      eventCount,
    },
  });
  const ledgerSnapshot = runLedger.snapshot(runId);
  const ledgerProjection = ledgerSnapshot
    ? projectAgentRuntimeRunLedgerSnapshot(ledgerSnapshot)
    : null;
  const commandReceipt = runLedger.getCommandReceipt(commandId);

  const finalReceipt = createAgentRuntimeRunReceipt({
    runId,
    action,
    session: request.session,
    status,
    nativeSessionId,
    resultSubtype,
    now: startedAt,
    completedAt: new Date(),
    error: errorMessage,
    metadata: {
      bridge: "codex-app-server",
      eventCount,
      lastText,
      usage,
      ...(ledgerProjection
        ? {
            ledger: {
              eventCount: ledgerProjection.eventCount,
              latestEventSequence: ledgerProjection.latestEventSequence ?? null,
              latestEventKind: ledgerProjection.latestEventKind ?? null,
              correlationIds: ledgerProjection.correlationIds,
              causationEventIds: ledgerProjection.causationEventIds,
            },
          }
        : {}),
      ...(commandReceipt
        ? {
            commandReceipt: {
              status: commandReceipt.status,
              resultSequence: commandReceipt.resultSequence,
            },
          }
        : {}),
    },
  });
  runLedger.upsertReceipt(finalReceipt);
  return finalReceipt;
}
