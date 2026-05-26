import { z } from "zod"

const baseConfirmedWriteBackInput = {
  chatId: z.string(),
  confirmed: z.literal(true),
  prNumber: z.number().int().safe(),
}

export const postPullRequestCommentInputSchema = z.object({
  ...baseConfirmedWriteBackInput,
  body: z.string().max(65_000),
})

export const replyToReviewThreadInputSchema = z.object({
  ...baseConfirmedWriteBackInput,
  threadId: z.string().max(500),
  body: z.string().max(65_000),
})

export const markReadyForReviewInputSchema = z.object({
  ...baseConfirmedWriteBackInput,
})

export const requestReviewersInputSchema = z.object({
  ...baseConfirmedWriteBackInput,
  reviewers: z.array(z.string().max(100)).max(100),
})
