import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { createId } from "../utils"

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    type: text("type").notNull(),
    priority: text("priority").notNull(),
    description: text("description").notNull(),
    screenshots: text("screenshots").notNull().default("[]"),
    resolved: integer("resolved", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => ({
    resolvedIdx: index("idx_feedback_resolved").on(table.resolved),
    createdAtIdx: index("idx_feedback_created_at").on(table.createdAt),
  }),
)

export const feedbackRelations = relations(feedback, ({}) => ({}))

export type Feedback = typeof feedback.$inferSelect
export type NewFeedback = typeof feedback.$inferInsert
export type FeedbackType =
  | "bug"
  | "feature"
  | "enhancement"
  | "idea"
  | "usability"
  | "other"
export type FeedbackPriority = "low" | "medium" | "high" | "critical"
