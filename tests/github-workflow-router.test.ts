import { describe, expect, test } from "bun:test"
import {
  markReadyForReviewInputSchema,
  postPullRequestCommentInputSchema,
  replyToReviewThreadInputSchema,
  requestReviewersInputSchema,
} from "../src/main/lib/github-workflow/writeback-input-schemas"

describe("GitHub workflow router write-back inputs", () => {
  test("requires explicit confirmation for write-back mutations", () => {
    expect(
      postPullRequestCommentInputSchema.safeParse({
        chatId: "chat-1",
        confirmed: false,
        prNumber: 42,
        body: "Looks good.",
      }).success,
    ).toBe(false)

    expect(
      postPullRequestCommentInputSchema.safeParse({
        chatId: "chat-1",
        confirmed: true,
        prNumber: 42,
        body: "Looks good.",
      }).success,
    ).toBe(true)
  })

  test("keeps mutation payloads action-specific", () => {
    expect(
      postPullRequestCommentInputSchema.parse({
        chatId: "chat-1",
        confirmed: true,
        prNumber: 42,
        body: "",
      }),
    ).toMatchObject({
      chatId: "chat-1",
      confirmed: true,
      prNumber: 42,
      body: "",
    })

    expect(
      replyToReviewThreadInputSchema.parse({
        chatId: "chat-1",
        confirmed: true,
        prNumber: 42,
        threadId: "",
        body: "",
      }),
    ).toMatchObject({
      threadId: "",
      body: "",
    })

    expect(
      markReadyForReviewInputSchema.parse({
        chatId: "chat-1",
        confirmed: true,
        prNumber: 42,
      }),
    ).toMatchObject({
      prNumber: 42,
    })

    expect(
      requestReviewersInputSchema.parse({
        chatId: "chat-1",
        confirmed: true,
        prNumber: 42,
        reviewers: [],
      }),
    ).toMatchObject({
      reviewers: [],
    })
  })
})
