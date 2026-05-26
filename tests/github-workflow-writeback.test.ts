import { describe, expect, test } from "bun:test"
import {
  buildGitHubMarkReadyForReviewArgs,
  buildGitHubPullRequestCommentArgs,
  buildGitHubRequestReviewersArgs,
  buildGitHubReviewThreadReplyArgs,
  normalizeGitHubReviewerLogins,
  validateGitHubWriteBackRequest,
} from "../src/main/lib/github-workflow/writeback"
import type { GitHubWriteBackRequest } from "../src/shared/github-workflow-context"

describe("GitHub confirmed write-back", () => {
  test("builds non-interactive gh args for pull request comments", () => {
    expect(
      buildGitHubPullRequestCommentArgs({
        repoSlug: "example/project",
        prNumber: 42,
        body: "Fixed in the latest commit.",
      }),
    ).toEqual([
      "pr",
      "comment",
      "42",
      "--repo",
      "example/project",
      "--body",
      "Fixed in the latest commit.",
    ])
  })

  test("builds GraphQL mutation args for review-thread replies", () => {
    const args = buildGitHubReviewThreadReplyArgs({
      threadId: "PRRT_kwDOExample",
      body: "Added the null workspace guard.",
    })

    expect(args.slice(0, 3)).toEqual(["api", "graphql", "-f"])
    expect(args.join("\n")).toContain("addPullRequestReviewThreadReply")
    expect(args.join("\n")).toContain("pullRequestReviewThreadId")
    expect(args).toContain("threadId=PRRT_kwDOExample")
    expect(args).toContain("body=Added the null workspace guard.")
  })

  test("builds gh args for marking ready and requesting reviewers", () => {
    expect(
      buildGitHubMarkReadyForReviewArgs({
        repoSlug: "example/project",
        prNumber: 42,
      }),
    ).toEqual(["pr", "ready", "42", "--repo", "example/project"])

    expect(
      buildGitHubRequestReviewersArgs({
        repoSlug: "example/project",
        prNumber: 42,
        reviewers: ["alice", "bob"],
      }),
    ).toEqual([
      "pr",
      "edit",
      "42",
      "--repo",
      "example/project",
      "--add-reviewer",
      "alice,bob",
    ])
  })

  test("normalizes reviewer logins from explicit user input", () => {
    expect(
      normalizeGitHubReviewerLogins([
        " @alice ",
        "bob, @carol",
        "alice",
        "  ",
      ]),
    ).toEqual(["alice", "bob", "carol"])
  })

  test("rejects missing pull request target before write-back", () => {
    const result = validateGitHubWriteBackRequest({
      action: "mark_ready_for_review",
      confirmed: true,
      prNumber: 0,
    })

    expect(result).toMatchObject({
      status: "unavailable",
      action: "mark_ready_for_review",
      reason: "missing_pr_number",
    })
  })

  test("rejects empty public text before write-back", () => {
    const result = validateGitHubWriteBackRequest({
      action: "pr_comment",
      confirmed: true,
      prNumber: 42,
      body: "   ",
    })

    expect(result).toMatchObject({
      status: "unavailable",
      action: "pr_comment",
      reason: "empty_body",
      prNumber: 42,
    })
  })

  test("rejects review-thread replies without a loaded thread id", () => {
    const result = validateGitHubWriteBackRequest({
      action: "review_thread_reply",
      confirmed: true,
      prNumber: 42,
      threadId: " ",
      body: "Fixed.",
    })

    expect(result).toMatchObject({
      status: "unavailable",
      action: "review_thread_reply",
      reason: "missing_thread_id",
    })
  })

  test("rejects reviewer requests without explicit reviewers", () => {
    const result = validateGitHubWriteBackRequest({
      action: "request_reviewers",
      confirmed: true,
      prNumber: 42,
      reviewers: [" ", ","],
    })

    expect(result).toMatchObject({
      status: "unavailable",
      action: "request_reviewers",
      reason: "empty_reviewers",
    })
  })

  test("accepts action-specific confirmed write-back requests", () => {
    const requests: GitHubWriteBackRequest[] = [
      {
        action: "pr_comment",
        confirmed: true,
        prNumber: 42,
        body: "Looks good after the latest fix.",
      },
      {
        action: "review_thread_reply",
        confirmed: true,
        prNumber: 42,
        threadId: "PRRT_kwDOExample",
        body: "Fixed.",
      },
      {
        action: "mark_ready_for_review",
        confirmed: true,
        prNumber: 42,
      },
      {
        action: "request_reviewers",
        confirmed: true,
        prNumber: 42,
        reviewers: ["alice"],
      },
    ]

    for (const request of requests) {
      expect(validateGitHubWriteBackRequest(request)).toMatchObject({
        status: "valid",
      })
    }
  })
})
