import { index, sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
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
  // Custom project icon (absolute path to local image file)
  iconPath: text("icon_path"),
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
}, (table) => [
  index("chats_worktree_path_idx").on(table.worktreePath),
])

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

// ============ CLAUDE CODE CREDENTIALS ============
// Stores encrypted OAuth token for Claude Code integration
// DEPRECATED: Use anthropicAccounts for multi-account support
export const claudeCodeCredentials = sqliteTable("claude_code_credentials", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  oauthToken: text("oauth_token").notNull(), // Encrypted with safeStorage
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  userId: text("user_id"), // Desktop auth user ID (for reference)
})

// ============ ANTHROPIC ACCOUNTS (Multi-account support) ============
// Stores multiple Anthropic OAuth accounts for quick switching
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
  desktopUserId: text("desktop_user_id"), // Reference to 21st.dev user
})

// Tracks which Anthropic account is currently active
export const anthropicSettings = sqliteTable("anthropic_settings", {
  id: text("id").primaryKey().default("singleton"), // Single row
  activeAccountId: text("active_account_id"), // References anthropicAccounts.id
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ CONTINUITY CACHES ============
export const continuityFileCache = sqliteTable("continuity_file_cache", {
  key: text("key").primaryKey(),
  repoRoot: text("repo_root").notNull(),
  filePath: text("file_path").notNull(),
  contentHash: text("content_hash").notNull(),
  summary: text("summary").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const continuitySearchCache = sqliteTable("continuity_search_cache", {
  key: text("key").primaryKey(),
  repoRoot: text("repo_root").notNull(),
  query: text("query").notNull(),
  commitHash: text("commit_hash").notNull(),
  scope: text("scope").notNull(),
  resultJson: text("result_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const continuityPackCache = sqliteTable("continuity_pack_cache", {
  key: text("key").primaryKey(),
  taskFingerprint: text("task_fingerprint").notNull(),
  changedFilesHash: text("changed_files_hash").notNull(),
  headCommit: text("head_commit").notNull(),
  provider: text("provider").notNull(),
  mode: text("mode").notNull(),
  budgetBytes: integer("budget_bytes").notNull(),
  pack: text("pack").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const continuityState = sqliteTable("continuity_state", {
  subChatId: text("sub_chat_id").primaryKey(),
  lastChangedFilesHash: text("last_changed_files_hash").notNull().default(""),
  turnsSinceSnapshot: integer("turns_since_snapshot").notNull().default(0),
  totalInjectedBytes: integer("total_injected_bytes").notNull().default(0),
  lastSnapshotAt: integer("last_snapshot_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const continuityArtifact = sqliteTable("continuity_artifact", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  subChatId: text("sub_chat_id")
    .notNull()
    .references(() => subChats.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "devlog" | "adr" | "rejected-approach"
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"), // "draft" | "accepted" | "rejected"
  provenanceJson: text("provenance_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const continuitySettings = sqliteTable("continuity_settings", {
  id: text("id").primaryKey().default("singleton"),
  artifactPolicy: text("artifact_policy")
    .notNull()
    .default("auto-write-manual-commit"),
  autoCommitToMemoryBranch: integer("auto_commit_to_memory_branch", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  memoryBranch: text("memory_branch").notNull().default("memory/continuity"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ TYPE EXPORTS ============
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type SubChat = typeof subChats.$inferSelect
export type NewSubChat = typeof subChats.$inferInsert
export type ClaudeCodeCredential = typeof claudeCodeCredentials.$inferSelect
export type NewClaudeCodeCredential = typeof claudeCodeCredentials.$inferInsert
export type AnthropicAccount = typeof anthropicAccounts.$inferSelect
export type NewAnthropicAccount = typeof anthropicAccounts.$inferInsert
export type AnthropicSettings = typeof anthropicSettings.$inferSelect
export type ContinuityFileCache = typeof continuityFileCache.$inferSelect
export type NewContinuityFileCache = typeof continuityFileCache.$inferInsert
export type ContinuitySearchCache = typeof continuitySearchCache.$inferSelect
export type NewContinuitySearchCache = typeof continuitySearchCache.$inferInsert
export type ContinuityPackCache = typeof continuityPackCache.$inferSelect
export type NewContinuityPackCache = typeof continuityPackCache.$inferInsert
export type ContinuityState = typeof continuityState.$inferSelect
export type NewContinuityState = typeof continuityState.$inferInsert
export type ContinuityArtifact = typeof continuityArtifact.$inferSelect
export type NewContinuityArtifact = typeof continuityArtifact.$inferInsert
export type ContinuitySettings = typeof continuitySettings.$inferSelect
export type NewContinuitySettings = typeof continuitySettings.$inferInsert
