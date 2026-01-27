import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
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
  isSavedChatState: integer("is_saved_chat_state", { mode: "boolean" })
    .notNull()
    .default(false), // Whether this is a saved chat state (not a regular chat)
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
export const claudeCodeCredentials = sqliteTable("claude_code_credentials", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  oauthToken: text("oauth_token").notNull(), // Encrypted with safeStorage
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  userId: text("user_id"), // Desktop auth user ID (for reference)
})

// ============ AGENTS ============
// Tracks Claude Code agents with chat creation/modification history
export const agents = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull().unique(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  tools: text("tools"), // JSON array of allowed tools
  disallowedTools: text("disallowed_tools"), // JSON array of disallowed tools
  model: text("model"), // "sonnet" | "opus" | "haiku" | "inherit"
  source: text("source").notNull(), // "user" | "project"
  projectId: text("project_id"), // null for user agents
  filePath: text("file_path").notNull(), // Actual .md file location
  createdViaChat: integer("created_via_chat", { mode: "boolean" })
    .notNull()
    .default(false),
  creationChatIds: text("creation_chat_ids").notNull().default("[]"), // JSON array of sub_chat IDs
  modificationChatIds: text("modification_chat_ids").notNull().default("[]"), // JSON array of sub_chat IDs
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ MODEL PROFILES ============
// Stores custom model configurations for API integrations
export const modelProfiles = sqliteTable("model_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  // Store config as JSON to preserve structure
  config: text("config").notNull(), // JSON: { model, token, baseUrl }
  // Store models array as JSON
  models: text("models").notNull(), // JSON array of model names
  isOffline: integer("is_offline", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
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
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type ModelProfile = typeof modelProfiles.$inferSelect
export type NewModelProfile = typeof modelProfiles.$inferInsert

// ============ FEEDBACK ============
export { feedback, feedbackRelations } from "./feedback"
export type { Feedback, NewFeedback } from "./feedback"
