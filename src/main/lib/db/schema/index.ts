import { relations } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
import { createId } from "../utils"

// ============ PROJECTS ============
export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  removedAt: integer("removed_at", { mode: "timestamp" }),
  // Git remote info (extracted from local .git)
  gitRemoteUrl: text("git_remote_url"),
  gitProvider: text("git_provider"), // "github" | "gitlab" | "bitbucket" | null
  gitOwner: text("git_owner"),
  gitRepo: text("git_repo"),
  // Custom project icon (absolute path to local image file)
  iconPath: text("icon_path"),
})

export const projectsRelations = relations(projects, ({ many }) => ({
  chats: many(chats),
}))

// ============ CHATS ============
export const chats = sqliteTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    // Worktree fields (for git isolation per chat)
    worktreePath: text("worktree_path"),
    branch: text("branch"),
    baseBranch: text("base_branch"),
    // PR tracking fields
    prUrl: text("pr_url"),
    prNumber: integer("pr_number"),
  },
  (table) => [index("chats_worktree_path_idx").on(table.worktreePath)],
)

export const chatsRelations = relations(chats, ({ one, many }) => ({
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
  }),
  subChats: many(subChats),
}))

// ============ WORKTREE SETUP TRUST ============
export const worktreeSetupTrustDecisions = sqliteTable(
  "worktree_setup_trust_decisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    configSource: text("config_source").notNull(),
    configPath: text("config_path").notNull(),
    commandHash: text("command_hash").notNull(),
    decision: text("decision").notNull().default("approved"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    uniqueIndex("worktree_setup_trust_project_hash_idx").on(
      table.projectId,
      table.commandHash,
    ),
    index("worktree_setup_trust_project_idx").on(table.projectId),
  ],
)

// ============ SUB-CHATS ============
export const subChats = sqliteTable("sub_chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), // Claude Agent SDK session ID for resume
  streamId: text("stream_id"), // Track in-progress streams
  mode: text("mode").notNull().default("agent"), // "plan" | "agent"
  messages: text("messages").notNull().default("[]"), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const subChatsRelations = relations(subChats, ({ one }) => ({
  chat: one(chats, {
    fields: [subChats.chatId],
    references: [chats.id],
  }),
}))

// ============ CLAUDE CODE CREDENTIALS ============
// Stores encrypted OAuth credential for Claude Code integration
// DEPRECATED: Use anthropicAccounts for multi-account support
export const claudeCodeCredentials = sqliteTable("claude_code_credentials", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  oauthToken: text("oauth_token").notNull(), // Encrypted legacy token or credential envelope
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  userId: text("user_id"), // Desktop auth user ID (for reference)
})

// ============ ANTHROPIC ACCOUNTS (Multi-account support) ============
// Stores multiple Anthropic OAuth accounts for quick switching.
// oauthToken may contain a legacy encrypted access token or a versioned
// encrypted Claude Code credential envelope with refresh metadata.
export const anthropicAccounts = sqliteTable("anthropic_accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email"), // User's email from OAuth (if available)
  displayName: text("display_name"), // User-editable label
  oauthToken: text("oauth_token").notNull(), // Encrypted with safeStorage
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  desktopUserId: text("desktop_user_id"), // Reference to hosted desktop user
})

// Tracks which Anthropic account is currently active
export const anthropicSettings = sqliteTable("anthropic_settings", {
  id: text("id").primaryKey().default("singleton"), // Single row
  activeAccountId: text("active_account_id"), // References anthropicAccounts.id
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ CLAUDE PROVIDER CONFIG ============
// Stores one active Claude-compatible provider token encrypted with safeStorage.
export const claudeProviderConfig = sqliteTable("claude_provider_config", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  model: text("model").notNull(),
  baseUrl: text("base_url").notNull(),
  authMode: text("auth_mode").notNull().default("auth_token"), // "api_key" | "auth_token"
  encryptedToken: text("encrypted_token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ LOCAL API PROVIDER CONFIGS ============
// Stores encrypted OpenAI-compatible provider tokens for local utility features.
export const localApiProviderConfigs = sqliteTable(
  "local_api_provider_configs",
  {
    id: text("id").primaryKey(), // e.g. "sub_chat_title" | "commit_message"
    model: text("model").notNull(),
    baseUrl: text("base_url").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
)

// ============ AGENT PROVIDER PROFILES ============
// Runtime-neutral provider profiles for Claude, Codex, helpers, and local endpoints.
export const agentProviderProfiles = sqliteTable("agent_provider_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  presetId: text("preset_id"),
  protocol: text("protocol").notNull(), // "anthropic" | "openai-chat" | "openai-responses"
  baseUrl: text("base_url").notNull(),
  defaultModel: text("default_model").notNull(),
  authMode: text("auth_mode").notNull().default("bearer"), // "bearer" | "x-api-key" | "none"
  encryptedToken: text("encrypted_token"),
  headersJson: text("headers_json").notNull().default("{}"),
  targetRuntimesJson: text("target_runtimes_json").notNull().default("[]"),
  capabilitiesJson: text("capabilities_json").notNull().default("{}"),
  lastTestStatusJson: text("last_test_status_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const agentProviderDefaults = sqliteTable("agent_provider_defaults", {
  purpose: text("purpose").primaryKey(), // "claude-main" | "codex-main" | "sub_chat_title" | "commit_message"
  profileId: text("profile_id").references(() => agentProviderProfiles.id, {
    onDelete: "set null",
  }),
  modelOverride: text("model_override"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ APP AGENTS ============
// Runtime-neutral app-managed agent profiles.
export const appAgents = sqliteTable("app_agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  prompt: text("prompt").notNull(),
  tools: text("tools"),
  disallowedTools: text("disallowed_tools"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ HEADLESS AGENT JOBS ============
export const agentJobs = sqliteTable(
  "agent_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    retryOfJobId: text("retry_of_job_id"),
    attempt: integer("attempt").notNull().default(1),
    source: text("source").notNull(),
    runtime: text("runtime").notNull(),
    status: text("status").notNull().default("queued"),
    mode: text("mode").notNull().default("agent"),
    cwd: text("cwd").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    chatId: text("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    subChatId: text("sub_chat_id").references(() => subChats.id, {
      onDelete: "set null",
    }),
    promptPreview: text("prompt_preview"),
    inputJson: text("input_json"),
    apiConsumerId: text("api_consumer_id"),
    apiConsumerRunId: text("api_consumer_run_id"),
    artifactBaseDir: text("artifact_base_dir"),
    artifactManifestPath: text("artifact_manifest_path"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    exitCode: integer("exit_code"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    resultJson: text("result_json"),
    createdByVersion: text("created_by_version"),
    workerId: text("worker_id"),
    workerPid: integer("worker_pid"),
    workerStartedAt: integer("worker_started_at", { mode: "timestamp" }),
    heartbeatAt: integer("heartbeat_at", { mode: "timestamp" }),
    cancelRequestedAt: integer("cancel_requested_at", { mode: "timestamp" }),
    cancelRequestedBy: text("cancel_requested_by"),
  },
  (table) => [
    index("agent_jobs_status_idx").on(table.status),
    index("agent_jobs_source_idx").on(table.source),
    index("agent_jobs_runtime_idx").on(table.runtime),
    index("agent_jobs_cwd_idx").on(table.cwd),
    index("agent_jobs_created_at_idx").on(table.createdAt),
    index("agent_jobs_heartbeat_at_idx").on(table.heartbeatAt),
    index("agent_jobs_api_consumer_id_idx").on(table.apiConsumerId),
    index("agent_jobs_api_consumer_run_id_idx").on(table.apiConsumerRunId),
  ],
)

export const agentJobEvents = sqliteTable(
  "agent_job_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    jobId: text("job_id")
      .notNull()
      .references(() => agentJobs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    uniqueIndex("agent_job_events_job_sequence_idx").on(
      table.jobId,
      table.sequence,
    ),
    index("agent_job_events_job_created_at_idx").on(
      table.jobId,
      table.createdAt,
    ),
  ],
)

export const agentSchedules = sqliteTable(
  "agent_schedules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    status: text("status").notNull().default("enabled"),
    runtime: text("runtime").notNull(),
    mode: text("mode").notNull().default("agent"),
    cwd: text("cwd").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    promptPreview: text("prompt_preview"),
    inputJson: text("input_json").notNull().default("{}"),
    intervalSeconds: integer("interval_seconds").notNull(),
    timezone: text("timezone").notNull().default("local"),
    nextRunAt: integer("next_run_at", { mode: "timestamp" }),
    lastRunAt: integer("last_run_at", { mode: "timestamp" }),
    lastJobId: text("last_job_id").references(() => agentJobs.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    disabledAt: integer("disabled_at", { mode: "timestamp" }),
  },
  (table) => [
    index("agent_schedules_status_idx").on(table.status),
    index("agent_schedules_next_run_at_idx").on(table.nextRunAt),
    index("agent_schedules_project_id_idx").on(table.projectId),
    index("agent_schedules_last_job_id_idx").on(table.lastJobId),
  ],
)

export const agentScheduleRuns = sqliteTable(
  "agent_schedule_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    scheduleId: text("schedule_id").references(() => agentSchedules.id, {
      onDelete: "set null",
    }),
    jobId: text("job_id").references(() => agentJobs.id, {
      onDelete: "set null",
    }),
    trigger: text("trigger").notNull(),
    scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    index("agent_schedule_runs_schedule_id_idx").on(table.scheduleId),
    index("agent_schedule_runs_job_id_idx").on(table.jobId),
    index("agent_schedule_runs_created_at_idx").on(table.createdAt),
  ],
)

export const agentJobsRelations = relations(agentJobs, ({ one, many }) => ({
  retryOfJob: one(agentJobs, {
    fields: [agentJobs.retryOfJobId],
    references: [agentJobs.id],
    relationName: "agent_job_retry",
  }),
  retryJobs: many(agentJobs, {
    relationName: "agent_job_retry",
  }),
  project: one(projects, {
    fields: [agentJobs.projectId],
    references: [projects.id],
  }),
  chat: one(chats, {
    fields: [agentJobs.chatId],
    references: [chats.id],
  }),
  subChat: one(subChats, {
    fields: [agentJobs.subChatId],
    references: [subChats.id],
  }),
  events: many(agentJobEvents),
  scheduleRuns: many(agentScheduleRuns),
}))

export const agentJobEventsRelations = relations(agentJobEvents, ({ one }) => ({
  job: one(agentJobs, {
    fields: [agentJobEvents.jobId],
    references: [agentJobs.id],
  }),
}))

export const agentSchedulesRelations = relations(
  agentSchedules,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [agentSchedules.projectId],
      references: [projects.id],
    }),
    lastJob: one(agentJobs, {
      fields: [agentSchedules.lastJobId],
      references: [agentJobs.id],
    }),
    runs: many(agentScheduleRuns),
  }),
)

export const agentScheduleRunsRelations = relations(
  agentScheduleRuns,
  ({ one }) => ({
    schedule: one(agentSchedules, {
      fields: [agentScheduleRuns.scheduleId],
      references: [agentSchedules.id],
    }),
    job: one(agentJobs, {
      fields: [agentScheduleRuns.jobId],
      references: [agentJobs.id],
    }),
  }),
)

// ============ TYPE EXPORTS ============
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type WorktreeSetupTrustDecision =
  typeof worktreeSetupTrustDecisions.$inferSelect
export type NewWorktreeSetupTrustDecision =
  typeof worktreeSetupTrustDecisions.$inferInsert
export type SubChat = typeof subChats.$inferSelect
export type NewSubChat = typeof subChats.$inferInsert
export type ClaudeCodeCredential = typeof claudeCodeCredentials.$inferSelect
export type NewClaudeCodeCredential = typeof claudeCodeCredentials.$inferInsert
export type AnthropicAccount = typeof anthropicAccounts.$inferSelect
export type NewAnthropicAccount = typeof anthropicAccounts.$inferInsert
export type AnthropicSettings = typeof anthropicSettings.$inferSelect
export type ClaudeProviderConfig = typeof claudeProviderConfig.$inferSelect
export type NewClaudeProviderConfig = typeof claudeProviderConfig.$inferInsert
export type LocalApiProviderConfig = typeof localApiProviderConfigs.$inferSelect
export type NewLocalApiProviderConfig =
  typeof localApiProviderConfigs.$inferInsert
export type AgentProviderProfile = typeof agentProviderProfiles.$inferSelect
export type NewAgentProviderProfile = typeof agentProviderProfiles.$inferInsert
export type AgentProviderDefault = typeof agentProviderDefaults.$inferSelect
export type NewAgentProviderDefault = typeof agentProviderDefaults.$inferInsert
export type AppAgent = typeof appAgents.$inferSelect
export type NewAppAgent = typeof appAgents.$inferInsert
export type AgentJob = typeof agentJobs.$inferSelect
export type NewAgentJob = typeof agentJobs.$inferInsert
export type AgentJobEvent = typeof agentJobEvents.$inferSelect
export type NewAgentJobEvent = typeof agentJobEvents.$inferInsert
export type AgentSchedule = typeof agentSchedules.$inferSelect
export type NewAgentSchedule = typeof agentSchedules.$inferInsert
export type AgentScheduleRun = typeof agentScheduleRuns.$inferSelect
export type NewAgentScheduleRun = typeof agentScheduleRuns.$inferInsert
