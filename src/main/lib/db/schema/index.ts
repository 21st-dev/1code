// #NP - Database schema for AI Provider Infrastructure
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
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
  // Git remote info (extracted from local .git)
  gitRemoteUrl: text("git_remote_url"),
  gitProvider: text("git_provider"), // "github" | "gitlab" | "bitbucket" | null
  gitOwner: text("git_owner"),
  gitRepo: text("git_repo"),
  // AI provider/model preferences (per-project)
  preferredProviderId: text("preferred_provider_id"),
  preferredModelId: text("preferred_model_id"),
})

export const projectsRelations = relations(projects, ({ many }) => ({
  chats: many(chats),
}))

// ============ CHATS ============
export const chats = sqliteTable("chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
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
})

export const chatsRelations = relations(chats, ({ one, many }) => ({
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
  }),
  subChats: many(subChats),
}))

// ============ SUB-CHATS ============
export const subChats = sqliteTable("sub_chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), // Claude SDK session ID for resume
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

// ============ CLAUDE CODE CREDENTIALS (Legacy) ============
// #P - Kept for backward compatibility, migrated to provider_credentials
export const claudeCodeCredentials = sqliteTable("claude_code_credentials", {
  id: text("id").primaryKey().default("default"),
  oauthToken: text("oauth_token").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  userId: text("user_id"),
})

// ============ AI PROVIDERS ============
// #P - Provider is the root of API configuration
// API endpoint, auth, and connection settings belong HERE, not on models
export const aiProviders = sqliteTable("ai_providers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  type: text("type").notNull(), // "anthropic_oauth" | "api_key"
  role: text("role").notNull().default("secondary"), // "primary" | "secondary"
  isBuiltin: integer("is_builtin").notNull().default(0),
  // Legacy fields (kept for compatibility, new credentials go to provider_credentials)
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  apiFormat: text("api_format").notNull().default("openai"), // "openai" | "anthropic"
  userId: text("user_id"),
  // New provider-centric fields
  providerType: text("provider_type").default("custom"), // "anthropic" | "openai" | "openrouter" | "local" | "custom"
  apiEndpoint: text("api_endpoint"), // Full API URL
  modelsEndpoint: text("models_endpoint"), // Endpoint to fetch models
  authEndpoint: text("auth_endpoint"), // OAuth authorization URL
  supportsStreaming: integer("supports_streaming").default(1),
  requiresUserId: integer("requires_user_id").default(0),
  metadata: text("metadata"), // JSON: extensible config
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  credentials: many(providerCredentials),
  taskRoutings: many(taskRouting),
}))

// ============ PROVIDER CREDENTIALS ============
// #NP - Multiple auth credentials per provider with usage tracking
export const providerCredentials = sqliteTable("provider_credentials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  providerId: text("provider_id")
    .notNull()
    .references(() => aiProviders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  authType: text("auth_type").notNull(), // "oauth" | "api_key"
  // OAuth fields (encrypted with safeStorage)
  oauthToken: text("oauth_token"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthExpiresAt: integer("oauth_expires_at", { mode: "timestamp" }),
  // API Key fields (encrypted with safeStorage)
  apiKey: text("api_key"),
  // Status & Usage
  isActive: integer("is_active").notNull().default(1),
  priority: integer("priority").notNull().default(0),
  usageLimitType: text("usage_limit_type"), // "time_based" | "token_based" | "request_based"
  usageLimitValue: integer("usage_limit_value"),
  usageLimitPeriod: text("usage_limit_period"), // "daily" | "monthly" | "none"
  currentUsage: integer("current_usage").notNull().default(0),
  usageResetAt: integer("usage_reset_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const providerCredentialsRelations = relations(
  providerCredentials,
  ({ one, many }) => ({
    provider: one(aiProviders, {
      fields: [providerCredentials.providerId],
      references: [aiProviders.id],
    }),
    usageLogs: many(usageLogs),
  }),
)

// ============ UNIVERSAL MODELS ============
// #P - Models are universal entities, can exist across multiple providers
export const models = sqliteTable("models", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  modelId: text("model_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  // Multi-provider mapping (comma-separated, position-matched)
  // Example: providerIds="prov1,prov2", providerStatus="A,D"
  providerIds: text("provider_ids").notNull(),
  providerStatus: text("provider_status").notNull(), // "A" | "D" | "X" per provider
  // Model capabilities
  apiFormat: text("api_format").notNull().default("openai"),
  version: text("version"),
  maxContextLength: integer("max_context_length"),
  maxOutputTokens: integer("max_output_tokens"),
  defaultTemperature: real("default_temperature").default(1.0),
  supportsVision: integer("supports_vision").default(0),
  supportsTools: integer("supports_tools").default(0),
  supportsStreaming: integer("supports_streaming").default(1),
  supportsSystemPrompt: integer("supports_system_prompt").default(1),
  // Pricing (per million tokens)
  pricingInputPerMtok: real("pricing_input_per_mtok"),
  pricingOutputPerMtok: real("pricing_output_per_mtok"),
  // Extensible JSON fields
  capabilities: text("capabilities"),
  toolsConfig: text("tools_config"),
  metadata: text("metadata"),
  isDefault: integer("is_default").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ PROVIDER MODELS (Legacy/Backup) ============
// #NP - Kept for backward compatibility during migration
export const providerModels = sqliteTable("provider_models", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  providerId: text("provider_id")
    .notNull()
    .references(() => aiProviders.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  apiFormat: text("api_format").notNull().default("openai"),
  capabilities: text("capabilities"),
  contextLength: integer("context_length"),
  isDefault: integer("is_default").notNull().default(0),
  isAvailable: integer("is_available").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const providerModelsRelations = relations(providerModels, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [providerModels.providerId],
    references: [aiProviders.id],
  }),
}))

// ============ PROVIDER SWITCHING RULES ============
// #NP - Auto-switch logic for failover and optimization
export const providerSwitchingRules = sqliteTable("provider_switching_rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  isEnabled: integer("is_enabled").notNull().default(1),
  priority: integer("priority").notNull().default(0),
  // Trigger conditions (JSON)
  triggerCondition: text("trigger_condition").notNull(),
  // Action
  actionType: text("action_type").notNull(), // "switch_credential" | "switch_provider" | "notify" | "disable_model"
  targetCredentialId: text("target_credential_id").references(
    () => providerCredentials.id,
    { onDelete: "set null" },
  ),
  targetProviderId: text("target_provider_id").references(() => aiProviders.id, {
    onDelete: "set null",
  }),
  targetModelId: text("target_model_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const providerSwitchingRulesRelations = relations(
  providerSwitchingRules,
  ({ one }) => ({
    targetCredential: one(providerCredentials, {
      fields: [providerSwitchingRules.targetCredentialId],
      references: [providerCredentials.id],
    }),
    targetProvider: one(aiProviders, {
      fields: [providerSwitchingRules.targetProviderId],
      references: [aiProviders.id],
    }),
  }),
)

// ============ USAGE LOGS ============
// #NP - Track API usage metrics (debug payloads optional)
export const usageLogs = sqliteTable("usage_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  credentialId: text("credential_id")
    .notNull()
    .references(() => providerCredentials.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id").notNull(),
  // Request metrics
  requestTokens: integer("request_tokens"),
  responseTokens: integer("response_tokens"),
  totalTokens: integer("total_tokens"),
  requestTimeMs: integer("request_time_ms"),
  // Cost tracking
  estimatedCost: real("estimated_cost"),
  // Context
  chatId: text("chat_id"),
  subChatId: text("sub_chat_id"),
  agentType: text("agent_type"),
  // #P - Debug data is sensitive, only store when explicitly enabled
  requestPayload: text("request_payload"),
  responsePayload: text("response_payload"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  credential: one(providerCredentials, {
    fields: [usageLogs.credentialId],
    references: [providerCredentials.id],
  }),
}))

// ============ TASK ROUTING ============
// Maps subagent types to AI providers for orchestration
export const taskRouting = sqliteTable("task_routing", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  agentType: text("agent_type").notNull().unique(),
  providerId: text("provider_id").references(() => aiProviders.id, {
    onDelete: "set null",
  }),
  isEnabled: integer("is_enabled").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const taskRoutingRelations = relations(taskRouting, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [taskRouting.providerId],
    references: [aiProviders.id],
  }),
}))

// ============ INTEGRATION SETTINGS ============
// Settings for external tool integrations with fallbacks
export const integrationSettings = sqliteTable("integration_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  integrationType: text("integration_type").notNull().unique(), // 'router' | 'auth' | 'memory' | 'proxy'
  enabled: integer("enabled").notNull().default(1),
  useExternal: integer("use_external").notNull().default(1), // 1 = external tool, 0 = fallback
  config: text("config"), // JSON config for the integration
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
})

// ============ APP SETTINGS ============
// General key-value settings storage
export const appSettings = sqliteTable("app_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ TYPE EXPORTS ============
export type AppSetting = typeof appSettings.$inferSelect
export type NewAppSetting = typeof appSettings.$inferInsert
export type IntegrationSetting = typeof integrationSettings.$inferSelect
export type NewIntegrationSetting = typeof integrationSettings.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type SubChat = typeof subChats.$inferSelect
export type NewSubChat = typeof subChats.$inferInsert
export type ClaudeCodeCredential = typeof claudeCodeCredentials.$inferSelect
export type NewClaudeCodeCredential = typeof claudeCodeCredentials.$inferInsert
export type AiProvider = typeof aiProviders.$inferSelect
export type NewAiProvider = typeof aiProviders.$inferInsert
export type ProviderCredential = typeof providerCredentials.$inferSelect
export type NewProviderCredential = typeof providerCredentials.$inferInsert
export type Model = typeof models.$inferSelect
export type NewModel = typeof models.$inferInsert
export type ProviderModel = typeof providerModels.$inferSelect
export type NewProviderModel = typeof providerModels.$inferInsert
export type ProviderSwitchingRule = typeof providerSwitchingRules.$inferSelect
export type NewProviderSwitchingRule = typeof providerSwitchingRules.$inferInsert
export type UsageLog = typeof usageLogs.$inferSelect
export type NewUsageLog = typeof usageLogs.$inferInsert
export type TaskRouting = typeof taskRouting.$inferSelect
export type NewTaskRouting = typeof taskRouting.$inferInsert
