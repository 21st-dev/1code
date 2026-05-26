import { eq } from "drizzle-orm"
import { z } from "zod"
import { chats, getDatabase } from "../../db"
import { getCurrentPullRequestContext } from "../../github-workflow/current-pr-context"
import {
  createDraftPullRequest,
  prepareDraftPullRequest,
} from "../../github-workflow/draft-pr-preparation"
import { getFailedCheckLogContext } from "../../github-workflow/failed-check-log"
import { getReviewCommentsContext } from "../../github-workflow/review-comments"
import { getGitHubWorkflowStatus } from "../../github-workflow/status"
import { importGitHubTaskFromUrl } from "../../github-workflow/task-import"
import {
  markReadyForReviewInputSchema,
  postPullRequestCommentInputSchema,
  replyToReviewThreadInputSchema,
  requestReviewersInputSchema,
} from "../../github-workflow/writeback-input-schemas"
import { runConfirmedGitHubWriteBack } from "../../github-workflow/writeback"
import { publicProcedure, router } from "../index"

function getChatWorktreePath(chatId: string): string | null | undefined {
  const db = getDatabase()
  const chat = db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .get()

  return chat?.worktreePath
}

export const githubWorkflowRouter = router({
  getStatus: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      return getGitHubWorkflowStatus(getChatWorktreePath(input.chatId))
    }),

  getCurrentPullRequestContext: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      return getCurrentPullRequestContext(getChatWorktreePath(input.chatId))
    }),

  importTaskFromUrl: publicProcedure
    .input(z.object({ chatId: z.string(), url: z.string() }))
    .mutation(async ({ input }) => {
      return importGitHubTaskFromUrl({
        worktreePath: getChatWorktreePath(input.chatId),
        url: input.url,
      })
    }),

  getFailedCheckLog: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        checkName: z.string().min(1),
        runId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return getFailedCheckLogContext({
        worktreePath: getChatWorktreePath(input.chatId),
        checkName: input.checkName,
        runId: input.runId,
      })
    }),

  getReviewCommentsContext: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      return getReviewCommentsContext(getChatWorktreePath(input.chatId))
    }),

  prepareDraftPullRequest: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      return prepareDraftPullRequest(getChatWorktreePath(input.chatId))
    }),

  createDraftPullRequest: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        branch: z.string().trim().min(1).max(250),
        baseBranch: z.string().trim().min(1).max(250),
        title: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(65_000),
      }),
    )
    .mutation(async ({ input }) => {
      return createDraftPullRequest(getChatWorktreePath(input.chatId), {
        branch: input.branch,
        baseBranch: input.baseBranch,
        title: input.title,
        body: input.body,
      })
    }),

  postPullRequestComment: publicProcedure
    .input(postPullRequestCommentInputSchema)
    .mutation(async ({ input }) => {
      return runConfirmedGitHubWriteBack(getChatWorktreePath(input.chatId), {
        action: "pr_comment",
        confirmed: input.confirmed,
        prNumber: input.prNumber,
        body: input.body,
      })
    }),

  replyToReviewThread: publicProcedure
    .input(replyToReviewThreadInputSchema)
    .mutation(async ({ input }) => {
      return runConfirmedGitHubWriteBack(getChatWorktreePath(input.chatId), {
        action: "review_thread_reply",
        confirmed: input.confirmed,
        prNumber: input.prNumber,
        threadId: input.threadId,
        body: input.body,
      })
    }),

  markReadyForReview: publicProcedure
    .input(markReadyForReviewInputSchema)
    .mutation(async ({ input }) => {
      return runConfirmedGitHubWriteBack(getChatWorktreePath(input.chatId), {
        action: "mark_ready_for_review",
        confirmed: input.confirmed,
        prNumber: input.prNumber,
      })
    }),

  requestReviewers: publicProcedure
    .input(requestReviewersInputSchema)
    .mutation(async ({ input }) => {
      return runConfirmedGitHubWriteBack(getChatWorktreePath(input.chatId), {
        action: "request_reviewers",
        confirmed: input.confirmed,
        prNumber: input.prNumber,
        reviewers: input.reviewers,
      })
    }),
})
