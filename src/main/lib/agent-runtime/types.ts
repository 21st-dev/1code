import type {
  CodexBlockStatus,
  CodexConversationBlock,
} from "../../../shared/codex-tool-normalizer";

export const AGENT_ENGINE_IDS = [
  "claude-code",
  "codex",
  "hermes",
  "custom-acp",
] as const;

export type AgentEngineId = (typeof AGENT_ENGINE_IDS)[number];
export const DEFAULT_AGENT_ENGINE_ID: AgentEngineId = "hermes";

export type AgentRuntimeAvailability =
  | "available"
  | "needs-auth"
  | "not-installed"
  | "unsupported"
  | "error";

export type AgentRuntimeFeature =
  | "chat"
  | "resume"
  | "fork"
  | "rollback"
  | "mcp"
  | "agents"
  | "skills"
  | "commands"
  | "plugins"
  | "memory"
  | "images"
  | "usage"
  | "permissions"
  | "projects"
  | "library"
  | "pull-requests"
  | "follow-ups"
  | "rate-limits"
  | "realtime-voice"
  | "dictation"
  | "diagnostics"
  | "thread-management";

export type AgentPermissionMode =
  | "plan"
  | "agent"
  | "bypass"
  | "read-only"
  | "ask-approval"
  | "full-access"
  | "custom";

export type AgentRuntimeAuthMethod =
  | "oauth"
  | "api-key"
  | "shell-config"
  | "not-authenticated"
  | "unsupported"
  | "unknown";

export interface AgentRuntimeModel {
  id: string;
  label: string;
}

export interface AgentRuntimeModelHealth extends AgentRuntimeModel {
  availability: AgentRuntimeAvailability;
  reason?: string;
}

export type AgentRuntimeProviderInstanceStatus =
  | "ready"
  | "warning"
  | "error"
  | "disabled";

export interface AgentRuntimeProviderInstance {
  instanceId: string;
  engineId: AgentEngineId;
  displayName?: string;
  enabled: boolean;
  installed: boolean;
  status: AgentRuntimeProviderInstanceStatus;
  isDefault?: boolean;
  modelIds?: string[];
  version?: string | null;
  versionAdvisory?: AgentRuntimeVersionAdvisory | null;
  updateState?: AgentRuntimeUpdateState | null;
}

export type AgentRuntimeVersionAdvisoryStatus =
  | "unknown"
  | "current"
  | "behind_latest";

export interface AgentRuntimeVersionAdvisory {
  status: AgentRuntimeVersionAdvisoryStatus;
  currentVersion: string | null;
  latestVersion: string | null;
  updateCommand: string | null;
  canUpdate: boolean;
  checkedAt: string | null;
  message: string | null;
}

export type AgentRuntimeUpdateStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "unchanged";

export interface AgentRuntimeUpdateState {
  status: AgentRuntimeUpdateStatus;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  output: string | null;
}

export interface AgentRuntimeHealth {
  availability: AgentRuntimeAvailability;
  statusReason?: string;
  authMethod?: AgentRuntimeAuthMethod;
  models?: AgentRuntimeModelHealth[];
  providerInstances?: AgentRuntimeProviderInstance[];
  version?: string | null;
  versionAdvisory?: AgentRuntimeVersionAdvisory | null;
  updateState?: AgentRuntimeUpdateState | null;
}

export interface AgentRuntimeManifest {
  id: AgentEngineId;
  label: string;
  vendor: string;
  availability: AgentRuntimeAvailability;
  features: AgentRuntimeFeature[];
  defaultModelId?: string;
  models?: AgentRuntimeModel[];
  providerInstances?: AgentRuntimeProviderInstance[];
  version?: string | null;
  versionAdvisory?: AgentRuntimeVersionAdvisory | null;
  updateState?: AgentRuntimeUpdateState | null;
  configRoots: {
    user?: string;
    project?: string;
    sessions?: string;
  };
  notes?: string[];
}

export interface AgentRuntimeSessionRef {
  subChatId: string;
  chatId: string;
  engineId: AgentEngineId;
  providerInstanceId?: string | null;
  nativeSessionId?: string | null;
  modelId?: string | null;
  modelSelection?: {
    instanceId: string;
    modelId: string;
    options?: Record<string, unknown>;
  } | null;
  permissionMode: AgentPermissionMode;
  cwd: string;
  projectPath?: string | null;
  runtimeConfigDir?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeStartRequest {
  runId?: string;
  session: AgentRuntimeSessionRef;
  prompt: string;
  images?: Array<{
    base64Data: string;
    mediaType: string;
    filename?: string;
  }>;
  forceNewSession?: boolean;
}

export type AgentRuntimeRunAction = "start" | "resume";

export type AgentRuntimeRunStatus =
  | "running"
  | "success"
  | "error"
  | "cancelled"
  | "unsupported";

export interface AgentRuntimeRunReceipt {
  version: 1;
  runId: string;
  action: AgentRuntimeRunAction;
  engineId: AgentEngineId;
  subChatId: string;
  chatId: string;
  status: AgentRuntimeRunStatus;
  nativeSessionId?: string | null;
  resultSubtype?: "success" | "error" | "cancelled" | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeStopRequest {
  session: AgentRuntimeSessionRef;
  runId: string;
  reason?: string;
}

export interface AgentRuntimeToolResultRequest {
  session: AgentRuntimeSessionRef;
  runId: string;
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export interface AgentRuntimeControlResult {
  runId: string;
  status: "accepted" | "cancelled" | "unsupported" | "not-found" | "error";
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadReadRequest {
  session: AgentRuntimeSessionRef;
  includeTurns?: boolean;
}

export interface AgentRuntimeThreadReadResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  thread?: unknown;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadForkRequest {
  session: AgentRuntimeSessionRef;
}

export interface AgentRuntimeThreadForkResult {
  status: "success" | "unsupported" | "error";
  sourceThreadId?: string | null;
  threadId?: string | null;
  thread?: unknown;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadTurnDiffRequest {
  session: AgentRuntimeSessionRef;
  threadId?: string | null;
  fromTurnCount: number;
  toTurnCount: number;
  ignoreWhitespace?: boolean;
}

export interface AgentRuntimeThreadFullDiffRequest {
  session: AgentRuntimeSessionRef;
  threadId?: string | null;
  toTurnCount: number;
  ignoreWhitespace?: boolean;
}

export interface AgentRuntimeThreadDiffResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  fromTurnCount?: number;
  toTurnCount?: number;
  diff?: string;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadListRequest {
  session: AgentRuntimeSessionRef;
  archived?: boolean | null;
  cursor?: string | null;
  cwd?: string | string[] | null;
  limit?: number | null;
  modelProviders?: string[] | null;
  searchTerm?: string | null;
  sortDirection?: "asc" | "desc" | null;
  sortKey?: "created_at" | "updated_at" | null;
  sourceKinds?: string[] | null;
  useStateDbOnly?: boolean;
}

export interface AgentRuntimeThreadListResult {
  status: "success" | "unsupported" | "error";
  threads?: unknown[];
  nextCursor?: string | null;
  backwardsCursor?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadLoadedListRequest {
  session: AgentRuntimeSessionRef;
  cursor?: string | null;
  limit?: number | null;
}

export interface AgentRuntimeThreadLoadedListResult {
  status: "success" | "unsupported" | "error";
  threadIds?: string[];
  nextCursor?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeThreadControlAction =
  | "archive"
  | "unarchive"
  | "delete";

export interface AgentRuntimeThreadControlRequest {
  session: AgentRuntimeSessionRef;
  action: AgentRuntimeThreadControlAction;
  threadId: string;
}

export interface AgentRuntimeThreadControlResult {
  status: "success" | "unsupported" | "error";
  action: AgentRuntimeThreadControlAction;
  threadId?: string | null;
  thread?: unknown;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadNameSetRequest {
  session: AgentRuntimeSessionRef;
  threadId: string;
  name: string;
}

export interface AgentRuntimeThreadNameSetResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  name?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadMetadataUpdateRequest {
  session: AgentRuntimeSessionRef;
  threadId: string;
  gitInfo?: {
    branch?: string | null;
    originUrl?: string | null;
    sha?: string | null;
  } | null;
}

export interface AgentRuntimeThreadMetadataUpdateResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  thread?: unknown;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export interface AgentRuntimeThreadGoal {
  createdAt?: number;
  objective?: string;
  status?: AgentRuntimeThreadGoalStatus | (string & {});
  threadId?: string;
  timeUsedSeconds?: number;
  tokenBudget?: number | null;
  tokensUsed?: number;
  updatedAt?: number;
}

export interface AgentRuntimeThreadGoalGetRequest {
  session: AgentRuntimeSessionRef;
  threadId: string;
}

export interface AgentRuntimeThreadGoalGetResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  goal?: AgentRuntimeThreadGoal | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadGoalSetRequest {
  session: AgentRuntimeSessionRef;
  threadId: string;
  objective?: string | null;
  status?: AgentRuntimeThreadGoalStatus | null;
  tokenBudget?: number | null;
}

export interface AgentRuntimeThreadGoalSetResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  goal?: AgentRuntimeThreadGoal | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadGoalClearRequest {
  session: AgentRuntimeSessionRef;
  threadId: string;
}

export interface AgentRuntimeThreadGoalClearResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  cleared?: boolean;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeThreadRollbackRequest {
  session: AgentRuntimeSessionRef;
  numTurns: number;
}

export interface AgentRuntimeThreadRollbackResult {
  status: "success" | "unsupported" | "error";
  threadId?: string | null;
  numTurns: number;
  thread?: unknown;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeConfigReadRequest {
  session: AgentRuntimeSessionRef;
  cwd?: string | null;
  includeLayers?: boolean;
}

export interface AgentRuntimeConfigReadResult {
  status: "success" | "unsupported" | "error";
  config?: unknown;
  layers?: unknown[] | null;
  origins?: Record<string, unknown>;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeConfigWriteMergeStrategy = "replace" | "upsert";

export interface AgentRuntimeConfigWriteEdit {
  keyPath: string;
  mergeStrategy?: AgentRuntimeConfigWriteMergeStrategy;
  value: unknown;
}

export interface AgentRuntimeConfigValueWriteRequest {
  session: AgentRuntimeSessionRef;
  keyPath: string;
  value: unknown;
  mergeStrategy?: AgentRuntimeConfigWriteMergeStrategy;
  filePath?: string | null;
  expectedVersion?: string | null;
}

export interface AgentRuntimeConfigBatchWriteRequest {
  session: AgentRuntimeSessionRef;
  edits: AgentRuntimeConfigWriteEdit[];
  filePath?: string | null;
  expectedVersion?: string | null;
  reloadUserConfig?: boolean;
}

export interface AgentRuntimeConfigWriteResult {
  status: "success" | "unsupported" | "error";
  filePath?: string | null;
  writeStatus?: "ok" | "okOverridden" | (string & {});
  version?: string | null;
  overriddenMetadata?: unknown | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeConfigRequirementsReadRequest {
  session: AgentRuntimeSessionRef;
}

export interface AgentRuntimeConfigRequirementsReadResult {
  status: "success" | "unsupported" | "error";
  requirements?: unknown | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimePermissionProfileListRequest {
  session: AgentRuntimeSessionRef;
  cwd?: string | null;
  cursor?: string | null;
  limit?: number | null;
}

export interface AgentRuntimePermissionProfileListResult {
  status: "success" | "unsupported" | "error";
  profiles?: unknown[];
  nextCursor?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeMcpServerStatusDetail = "full" | "toolsAndAuthOnly";

export interface AgentRuntimeMcpServerStatusListRequest {
  session: AgentRuntimeSessionRef;
  cursor?: string | null;
  detail?: AgentRuntimeMcpServerStatusDetail | null;
  limit?: number | null;
  threadId?: string | null;
}

export interface AgentRuntimeMcpServerStatusListResult {
  status: "success" | "unsupported" | "error";
  servers?: unknown[];
  nextCursor?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeMcpServerConfigReloadRequest {
  session: AgentRuntimeSessionRef;
}

export interface AgentRuntimeMcpServerConfigReloadResult {
  status: "success" | "unsupported" | "error";
  reloaded?: boolean;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeSkillListRequest {
  session: AgentRuntimeSessionRef;
  cwds?: string[] | null;
  forceReload?: boolean | null;
}

export interface AgentRuntimeSkillListResult {
  status: "success" | "unsupported" | "error";
  entries?: unknown[];
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeHookListRequest {
  session: AgentRuntimeSessionRef;
  cwds?: string[] | null;
}

export interface AgentRuntimeHookListResult {
  status: "success" | "unsupported" | "error";
  entries?: unknown[];
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAppListRequest {
  session: AgentRuntimeSessionRef;
  cursor?: string | null;
  forceRefetch?: boolean | null;
  limit?: number | null;
  threadId?: string | null;
}

export interface AgentRuntimeAppListResult {
  status: "success" | "unsupported" | "error";
  apps?: unknown[];
  nextCursor?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimePluginMarketplaceKind =
  | "local"
  | "vertical"
  | "workspace-directory"
  | "shared-with-me";

export interface AgentRuntimePluginListRequest {
  session: AgentRuntimeSessionRef;
  cwds?: string[] | null;
  marketplaceKinds?: AgentRuntimePluginMarketplaceKind[] | null;
}

export interface AgentRuntimePluginListResult {
  status: "success" | "unsupported" | "error";
  marketplaces?: unknown[];
  featuredPluginIds?: string[];
  marketplaceLoadErrors?: unknown[];
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimePluginInstalledRequest {
  session: AgentRuntimeSessionRef;
  cwds?: string[] | null;
  installSuggestionPluginNames?: string[] | null;
}

export interface AgentRuntimePluginInstalledResult {
  status: "success" | "unsupported" | "error";
  marketplaces?: unknown[];
  marketplaceLoadErrors?: unknown[];
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimePluginReadRequest {
  session: AgentRuntimeSessionRef;
  pluginName: string;
  marketplacePath?: string | null;
  remoteMarketplaceName?: string | null;
}

export interface AgentRuntimePluginReadResult {
  status: "success" | "unsupported" | "error";
  plugin?: unknown;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimePluginInstallRequest {
  session: AgentRuntimeSessionRef;
  pluginName: string;
  marketplacePath?: string | null;
  remoteMarketplaceName?: string | null;
}

export interface AgentRuntimePluginInstallResult {
  status: "success" | "unsupported" | "error";
  appsNeedingAuth?: unknown[];
  authPolicy?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeExternalAgentConfigMigrationItemType =
  | "AGENTS_MD"
  | "CONFIG"
  | "SKILLS"
  | "PLUGINS"
  | "MCP_SERVER_CONFIG"
  | "SUBAGENTS"
  | "HOOKS"
  | "COMMANDS"
  | "SESSIONS";

export interface AgentRuntimeExternalAgentConfigMigrationDetails {
  commands?: Array<{ name: string }>;
  hooks?: Array<{ name: string }>;
  mcpServers?: Array<{ name: string }>;
  plugins?: Array<{ marketplaceName: string; pluginNames: string[] }>;
  sessions?: Array<{ cwd: string; path: string; title?: string | null }>;
  subagents?: Array<{ name: string }>;
}

export interface AgentRuntimeExternalAgentConfigMigrationItem {
  cwd?: string | null;
  description: string;
  details?: AgentRuntimeExternalAgentConfigMigrationDetails | null;
  itemType: AgentRuntimeExternalAgentConfigMigrationItemType;
}

export interface AgentRuntimeExternalAgentConfigDetectRequest {
  session: AgentRuntimeSessionRef;
  cwds?: string[] | null;
  includeHome?: boolean | null;
}

export interface AgentRuntimeExternalAgentConfigDetectResult {
  status: "success" | "unsupported" | "error";
  items?: AgentRuntimeExternalAgentConfigMigrationItem[];
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeExternalAgentConfigImportRequest {
  session: AgentRuntimeSessionRef;
  migrationItems: AgentRuntimeExternalAgentConfigMigrationItem[];
}

export interface AgentRuntimeExternalAgentConfigImportResult {
  status: "success" | "unsupported" | "error";
  importedCount?: number;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeMcpServerOauthLoginRequest {
  session: AgentRuntimeSessionRef;
  name: string;
  scopes?: string[] | null;
  timeoutSecs?: number | null;
}

export interface AgentRuntimeMcpServerOauthLoginResult {
  status: "success" | "unsupported" | "error";
  authorizationUrl?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeModelListRequest {
  session: AgentRuntimeSessionRef;
  cursor?: string | null;
  includeHidden?: boolean | null;
  limit?: number | null;
}

export interface AgentRuntimeModelListResult {
  status: "success" | "unsupported" | "error";
  models?: unknown[];
  nextCursor?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeAccountLoginType =
  | "apiKey"
  | "chatgpt"
  | "chatgptDeviceCode"
  | "chatgptAuthTokens";

export interface AgentRuntimeAccountLoginStartRequest {
  session: AgentRuntimeSessionRef;
  type: AgentRuntimeAccountLoginType;
  apiKey?: string | null;
  codexStreamlinedLogin?: boolean;
  accessToken?: string | null;
  chatgptAccountId?: string | null;
  chatgptPlanType?: string | null;
}

export interface AgentRuntimeAccountLoginStartResult {
  status: "success" | "unsupported" | "error";
  type?: AgentRuntimeAccountLoginType | (string & {});
  authUrl?: string | null;
  loginId?: string | null;
  verificationUrl?: string | null;
  userCode?: string | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAccountLoginCancelRequest {
  session: AgentRuntimeSessionRef;
  loginId: string;
}

export interface AgentRuntimeAccountLoginCancelResult {
  status: "success" | "unsupported" | "error";
  cancelStatus?: "canceled" | "notFound" | (string & {});
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAccountLogoutRequest {
  session: AgentRuntimeSessionRef;
}

export interface AgentRuntimeAccountLogoutResult {
  status: "success" | "unsupported" | "error";
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAccountReadRequest {
  session: AgentRuntimeSessionRef;
  refreshToken?: boolean;
}

export interface AgentRuntimeAccountReadResult {
  status: "success" | "unsupported" | "error";
  account?: unknown | null;
  requiresOpenaiAuth?: boolean;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAccountRateLimitsReadRequest {
  session: AgentRuntimeSessionRef;
}

export interface AgentRuntimeAccountRateLimitsReadResult {
  status: "success" | "unsupported" | "error";
  rateLimits?: unknown;
  rateLimitsByLimitId?: Record<string, unknown> | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAccountUsageReadRequest {
  session: AgentRuntimeSessionRef;
}

export interface AgentRuntimeAccountUsageReadResult {
  status: "success" | "unsupported" | "error";
  summary?: unknown;
  dailyUsageBuckets?: unknown[] | null;
  message?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type AgentRuntimeBlockStatus = CodexBlockStatus | "blocked";

export type AgentRuntimeAutomationAction =
  | "created"
  | "updated"
  | "deleted"
  | "enabled"
  | "disabled"
  | "started"
  | "completed"
  | "failed"
  | "paused"
  | "resumed";

export interface AgentRuntimeBaseConversationBlock {
  id: string;
  type: string;
  turnId?: string;
  status?: AgentRuntimeBlockStatus;
  title?: string;
  summary?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeAutomationUpdateBlock extends AgentRuntimeBaseConversationBlock {
  type: "automation-update";
  automationId?: string;
  action?: AgentRuntimeAutomationAction | (string & {});
}

export interface AgentRuntimeMultiAgentActionBlock extends AgentRuntimeBaseConversationBlock {
  type: "multi-agent-action";
  agentId?: string;
  agentLabel?: string;
  action?:
    | "spawn"
    | "message"
    | "handoff"
    | "complete"
    | "failed"
    | (string & {});
}

export interface AgentRuntimeContextCompactionBlock extends AgentRuntimeBaseConversationBlock {
  type: "context-compaction";
  previousInputTokens?: number;
  nextInputTokens?: number;
  droppedMessages?: number;
}

export interface AgentRuntimeModelChangeBlock extends AgentRuntimeBaseConversationBlock {
  type: "model-change" | "model-reroute";
  fromModelId?: string;
  toModelId?: string;
  reason?: string;
}

export interface AgentRuntimeGoalStatusBlock extends AgentRuntimeBaseConversationBlock {
  type: "goal-status";
  goalId?: string;
}

export interface AgentRuntimeRealtimeStateBlock extends AgentRuntimeBaseConversationBlock {
  type: "realtime-state" | "dictation-state";
  mode?: "dictation" | "voice-only" | "voice_and_screen" | (string & {});
  microphoneDeviceId?: string;
}

export interface AgentRuntimeQueuedFollowUpBlock extends AgentRuntimeBaseConversationBlock {
  type: "queued-follow-up";
  followUpId?: string;
  queueState?:
    | "queued"
    | "sending"
    | "sent"
    | "failed"
    | "cancelled"
    | (string & {});
}

export interface AgentRuntimeUsageStatusBlock extends AgentRuntimeBaseConversationBlock {
  type: "rate-limit-status" | "usage-status";
  window?: "hourly" | "daily" | "weekly" | "monthly" | "annual" | (string & {});
  remaining?: number;
  limit?: number;
  resetAt?: string;
}

export interface AgentRuntimeProjectEventBlock extends AgentRuntimeBaseConversationBlock {
  type: "project-event";
  projectId?: string;
  projectName?: string;
  action?:
    | "created"
    | "updated"
    | "pinned"
    | "unpinned"
    | "selected"
    | (string & {});
}

export interface AgentRuntimeLibraryArtifactBlock extends AgentRuntimeBaseConversationBlock {
  type: "library-artifact";
  artifactId?: string;
  artifactKind?:
    | "file"
    | "image"
    | "site"
    | "document"
    | "spreadsheet"
    | (string & {});
  path?: string;
  url?: string;
}

export interface AgentRuntimePullRequestStatusBlock extends AgentRuntimeBaseConversationBlock {
  type: "pull-request-status";
  pullRequestId?: string;
  url?: string;
  reviewState?:
    | "queued"
    | "running"
    | "changes-requested"
    | "approved"
    | "failed"
    | (string & {});
  checksState?:
    | "pending"
    | "running"
    | "passing"
    | "failing"
    | "unknown"
    | (string & {});
}

export interface AgentRuntimeDiagnosticSnapshotBlock extends AgentRuntimeBaseConversationBlock {
  type: "diagnostic-snapshot";
  snapshotKind?:
    | "child-processes"
    | "renderer-memory"
    | "trace-recording"
    | (string & {});
  path?: string;
}

export type AgentRuntimeConversationBlock =
  | CodexConversationBlock
  | AgentRuntimeAutomationUpdateBlock
  | AgentRuntimeMultiAgentActionBlock
  | AgentRuntimeContextCompactionBlock
  | AgentRuntimeModelChangeBlock
  | AgentRuntimeGoalStatusBlock
  | AgentRuntimeRealtimeStateBlock
  | AgentRuntimeQueuedFollowUpBlock
  | AgentRuntimeUsageStatusBlock
  | AgentRuntimeProjectEventBlock
  | AgentRuntimeLibraryArtifactBlock
  | AgentRuntimePullRequestStatusBlock
  | AgentRuntimeDiagnosticSnapshotBlock;

export type AgentRuntimeStreamEvent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-call";
      id?: string;
      name: string;
      input?: unknown;
    }
  | {
      type: "tool-result";
      id?: string;
      name?: string;
      result?: unknown;
    }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      modelContextWindow?: number;
      usedTokens?: number;
      totalProcessedTokens?: number;
      maxTokens?: number;
      cachedInputTokens?: number;
      reasoningOutputTokens?: number;
      lastUsedTokens?: number;
      lastInputTokens?: number;
      lastCachedInputTokens?: number;
      lastOutputTokens?: number;
      lastReasoningOutputTokens?: number;
      toolUses?: number;
      durationMs?: number;
      compactsAutomatically?: boolean;
    }
  | {
      type: "conversation-block";
      block: AgentRuntimeConversationBlock;
    }
  | {
      type: "conversation-block-update";
      id: string;
      patch: Partial<AgentRuntimeConversationBlock>;
    }
  | {
      type: "auth-error" | "error";
      message: string;
    }
  | {
      type: "finish";
      nativeSessionId?: string | null;
      resultSubtype?: "success" | "error" | "cancelled";
    };

export interface AgentRuntimeAdapter {
  manifest: AgentRuntimeManifest;
  inspect?(session: AgentRuntimeSessionRef): Promise<AgentRuntimeHealth>;
  canStart(session: AgentRuntimeSessionRef): Promise<AgentRuntimeAvailability>;
  start(request: AgentRuntimeStartRequest): Promise<AgentRuntimeRunReceipt>;
  resume(request: AgentRuntimeStartRequest): Promise<AgentRuntimeRunReceipt>;
  stream(
    request: AgentRuntimeStartRequest,
  ): AsyncIterable<AgentRuntimeStreamEvent>;
  stop(request: AgentRuntimeStopRequest): Promise<AgentRuntimeControlResult>;
  submitToolResult(
    request: AgentRuntimeToolResultRequest,
  ): Promise<AgentRuntimeControlResult>;
  readConfig?(
    request: AgentRuntimeConfigReadRequest,
  ): Promise<AgentRuntimeConfigReadResult>;
  writeConfigValue?(
    request: AgentRuntimeConfigValueWriteRequest,
  ): Promise<AgentRuntimeConfigWriteResult>;
  batchWriteConfig?(
    request: AgentRuntimeConfigBatchWriteRequest,
  ): Promise<AgentRuntimeConfigWriteResult>;
  readConfigRequirements?(
    request: AgentRuntimeConfigRequirementsReadRequest,
  ): Promise<AgentRuntimeConfigRequirementsReadResult>;
  listPermissionProfiles?(
    request: AgentRuntimePermissionProfileListRequest,
  ): Promise<AgentRuntimePermissionProfileListResult>;
  listMcpServerStatuses?(
    request: AgentRuntimeMcpServerStatusListRequest,
  ): Promise<AgentRuntimeMcpServerStatusListResult>;
  reloadMcpServerConfig?(
    request: AgentRuntimeMcpServerConfigReloadRequest,
  ): Promise<AgentRuntimeMcpServerConfigReloadResult>;
  listSkills?(
    request: AgentRuntimeSkillListRequest,
  ): Promise<AgentRuntimeSkillListResult>;
  listHooks?(
    request: AgentRuntimeHookListRequest,
  ): Promise<AgentRuntimeHookListResult>;
  listApps?(
    request: AgentRuntimeAppListRequest,
  ): Promise<AgentRuntimeAppListResult>;
  listPlugins?(
    request: AgentRuntimePluginListRequest,
  ): Promise<AgentRuntimePluginListResult>;
  listInstalledPlugins?(
    request: AgentRuntimePluginInstalledRequest,
  ): Promise<AgentRuntimePluginInstalledResult>;
  readPlugin?(
    request: AgentRuntimePluginReadRequest,
  ): Promise<AgentRuntimePluginReadResult>;
  installPlugin?(
    request: AgentRuntimePluginInstallRequest,
  ): Promise<AgentRuntimePluginInstallResult>;
  detectExternalAgentConfig?(
    request: AgentRuntimeExternalAgentConfigDetectRequest,
  ): Promise<AgentRuntimeExternalAgentConfigDetectResult>;
  importExternalAgentConfig?(
    request: AgentRuntimeExternalAgentConfigImportRequest,
  ): Promise<AgentRuntimeExternalAgentConfigImportResult>;
  startMcpServerOauthLogin?(
    request: AgentRuntimeMcpServerOauthLoginRequest,
  ): Promise<AgentRuntimeMcpServerOauthLoginResult>;
  listModels?(
    request: AgentRuntimeModelListRequest,
  ): Promise<AgentRuntimeModelListResult>;
  startAccountLogin?(
    request: AgentRuntimeAccountLoginStartRequest,
  ): Promise<AgentRuntimeAccountLoginStartResult>;
  cancelAccountLogin?(
    request: AgentRuntimeAccountLoginCancelRequest,
  ): Promise<AgentRuntimeAccountLoginCancelResult>;
  logoutAccount?(
    request: AgentRuntimeAccountLogoutRequest,
  ): Promise<AgentRuntimeAccountLogoutResult>;
  readAccount?(
    request: AgentRuntimeAccountReadRequest,
  ): Promise<AgentRuntimeAccountReadResult>;
  readAccountRateLimits?(
    request: AgentRuntimeAccountRateLimitsReadRequest,
  ): Promise<AgentRuntimeAccountRateLimitsReadResult>;
  readAccountUsage?(
    request: AgentRuntimeAccountUsageReadRequest,
  ): Promise<AgentRuntimeAccountUsageReadResult>;
  readThread?(
    request: AgentRuntimeThreadReadRequest,
  ): Promise<AgentRuntimeThreadReadResult>;
  forkThread?(
    request: AgentRuntimeThreadForkRequest,
  ): Promise<AgentRuntimeThreadForkResult>;
  getThreadTurnDiff?(
    request: AgentRuntimeThreadTurnDiffRequest,
  ): Promise<AgentRuntimeThreadDiffResult>;
  getThreadFullDiff?(
    request: AgentRuntimeThreadFullDiffRequest,
  ): Promise<AgentRuntimeThreadDiffResult>;
  listThreads?(
    request: AgentRuntimeThreadListRequest,
  ): Promise<AgentRuntimeThreadListResult>;
  listLoadedThreads?(
    request: AgentRuntimeThreadLoadedListRequest,
  ): Promise<AgentRuntimeThreadLoadedListResult>;
  controlThread?(
    request: AgentRuntimeThreadControlRequest,
  ): Promise<AgentRuntimeThreadControlResult>;
  setThreadName?(
    request: AgentRuntimeThreadNameSetRequest,
  ): Promise<AgentRuntimeThreadNameSetResult>;
  updateThreadMetadata?(
    request: AgentRuntimeThreadMetadataUpdateRequest,
  ): Promise<AgentRuntimeThreadMetadataUpdateResult>;
  getThreadGoal?(
    request: AgentRuntimeThreadGoalGetRequest,
  ): Promise<AgentRuntimeThreadGoalGetResult>;
  setThreadGoal?(
    request: AgentRuntimeThreadGoalSetRequest,
  ): Promise<AgentRuntimeThreadGoalSetResult>;
  clearThreadGoal?(
    request: AgentRuntimeThreadGoalClearRequest,
  ): Promise<AgentRuntimeThreadGoalClearResult>;
  rollbackThread?(
    request: AgentRuntimeThreadRollbackRequest,
  ): Promise<AgentRuntimeThreadRollbackResult>;
}
