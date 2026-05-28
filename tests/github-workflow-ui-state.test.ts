import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  canSendGitHubReviewComments,
  canConfirmGitHubWriteBack,
  getFailedGitHubChecks,
  getGitHubDraftPrUnavailableMessageKey,
  getGitHubStatusMessageKey,
  getGitHubStatusTitleKey,
  getGitHubWriteBackActionLabelKey,
  getGitHubWriteBackConfirmButtonKey,
  getGitHubWriteBackConfirmDescriptionKey,
  getGitHubWriteBackConfirmationDisabledReason,
  getGitHubWriteBackConfirmTitleKey,
  getGitHubWriteBackDisabledMessageKey,
  normalizeGitHubWriteBackReviewerLogins,
  shouldOfferGitHubAuthLogin,
  shouldShowNoFailedGitHubChecks,
} from "../src/shared/github-workflow-ui-state"
import type {
  GitHubChecksSummary,
  GitHubReviewCommentsContext,
  GitHubWorkflowCheck,
} from "../src/shared/github-workflow-context"

describe("GitHub workflow UI state", () => {
  test("maps empty and error states to stable i18n keys", () => {
    expect(getGitHubStatusTitleKey("gh_missing")).toBe(
      "githubWorkflow.status.ghMissing",
    )
    expect(getGitHubStatusMessageKey("gh_missing")).toBe(
      "githubWorkflow.status.ghMissingMessage",
    )
    expect(getGitHubStatusTitleKey("gh_not_authenticated")).toBe(
      "githubWorkflow.status.notAuthenticated",
    )
    expect(getGitHubStatusMessageKey("not_github_repo")).toBe(
      "githubWorkflow.status.notGithubRepoMessage",
    )
    expect(getGitHubStatusTitleKey("no_pr")).toBe(
      "githubWorkflow.status.noPr",
    )
    expect(getGitHubStatusMessageKey("invalid_url")).toBe(
      "githubWorkflow.status.invalidUrlMessage",
    )
    expect(getGitHubStatusTitleKey("github_unavailable")).toBe(
      "githubWorkflow.status.unavailable",
    )
  })

  test("offers gh auth login only for unauthenticated GitHub CLI state", () => {
    expect(shouldOfferGitHubAuthLogin("gh_not_authenticated")).toBe(true)
    expect(shouldOfferGitHubAuthLogin("gh_missing")).toBe(false)
    expect(shouldOfferGitHubAuthLogin("no_pr")).toBe(false)
    expect(shouldOfferGitHubAuthLogin(undefined)).toBe(false)
  })

  test("selects failed checks and no-failed-checks empty state", () => {
    const checks: GitHubWorkflowCheck[] = [
      { name: "typecheck", status: "success" },
      { name: "test", status: "failure" },
      { name: "lint", status: "pending" },
    ]
    const failedChecks = getFailedGitHubChecks(checks)
    const passingSummary: GitHubChecksSummary = {
      total: 2,
      passed: 1,
      failed: 0,
      pending: 1,
      skipped: 0,
      cancelled: 0,
    }

    expect(failedChecks).toEqual([{ name: "test", status: "failure" }])
    expect(shouldShowNoFailedGitHubChecks(passingSummary, 0)).toBe(true)
    expect(shouldShowNoFailedGitHubChecks(passingSummary, 1)).toBe(false)
    expect(shouldShowNoFailedGitHubChecks({ ...passingSummary, total: 0 }, 0)).toBe(
      false,
    )
  })

  test("sends review comments only when unresolved threads are present", () => {
    const baseContext: GitHubReviewCommentsContext = {
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      branch: "feature/review",
      pr: {
        number: 42,
        title: "Review fixes",
        url: "https://github.com/example/project/pull/42",
      },
      threads: [],
      totalThreads: 0,
      unresolvedThreads: 0,
      commentsCount: 0,
      fetchedAt: "2026-05-26T00:00:00.000Z",
    }

    expect(canSendGitHubReviewComments(baseContext)).toBe(false)
    expect(
      canSendGitHubReviewComments({
        ...baseContext,
        threads: [
          {
            id: "thread-1",
            isResolved: false,
            comments: [{ id: "comment-1", body: "Please add a guard." }],
          },
        ],
        totalThreads: 1,
        unresolvedThreads: 1,
        commentsCount: 1,
      }),
    ).toBe(true)
  })

  test("maps draft PR blocking reasons to inline message keys", () => {
    expect(getGitHubDraftPrUnavailableMessageKey("no_worktree")).toBe(
      "githubWorkflow.draftPr.noWorktreeMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("not_github_repo")).toBe(
      "githubWorkflow.draftPr.notGithubRepoMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("gh_missing")).toBe(
      "githubWorkflow.draftPr.ghMissingMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("gh_not_authenticated")).toBe(
      "githubWorkflow.draftPr.ghNotAuthenticatedMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("github_unavailable")).toBe(
      "githubWorkflow.draftPr.githubUnavailableMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("dirty_worktree")).toBe(
      "githubWorkflow.draftPr.dirtyWorktreeMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("branch_mismatch")).toBe(
      "githubWorkflow.draftPr.branchMismatchMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("no_changes")).toBe(
      "githubWorkflow.draftPr.noCommittedChangesMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("base_branch")).toBe(
      "githubWorkflow.draftPr.baseBranchMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("existing_pr")).toBe(
      "githubWorkflow.draftPr.existingPrMessage",
    )
    expect(getGitHubDraftPrUnavailableMessageKey("create_failed")).toBeNull()
  })

  test("maps write-back actions to confirmation copy keys", () => {
    expect(getGitHubWriteBackActionLabelKey("pr_comment")).toBe(
      "githubWorkflow.writeBack.action.prComment",
    )
    expect(getGitHubWriteBackConfirmTitleKey("review_thread_reply")).toBe(
      "githubWorkflow.writeBack.confirmTitle.reviewThreadReply",
    )
    expect(
      getGitHubWriteBackConfirmDescriptionKey("mark_ready_for_review"),
    ).toBe("githubWorkflow.writeBack.confirmDescription.markReady")
    expect(getGitHubWriteBackConfirmButtonKey("request_reviewers")).toBe(
      "githubWorkflow.writeBack.confirmButton.requestReviewers",
    )
  })

  test("maps write-back disabled reasons to inline message keys", () => {
    expect(getGitHubWriteBackDisabledMessageKey("gh_missing")).toBe(
      "githubWorkflow.writeBack.disabled.ghMissing",
    )
    expect(getGitHubWriteBackDisabledMessageKey("gh_not_authenticated")).toBe(
      "githubWorkflow.writeBack.disabled.notAuthenticated",
    )
    expect(getGitHubWriteBackDisabledMessageKey("not_github_repo")).toBe(
      "githubWorkflow.writeBack.disabled.notGithubRepo",
    )
    expect(getGitHubWriteBackDisabledMessageKey("no_pr")).toBe(
      "githubWorkflow.writeBack.disabled.noPr",
    )
    expect(getGitHubWriteBackDisabledMessageKey("missing_thread_id")).toBe(
      "githubWorkflow.writeBack.disabled.missingThreadId",
    )
    expect(getGitHubWriteBackDisabledMessageKey("empty_body")).toBe(
      "githubWorkflow.writeBack.disabled.emptyBody",
    )
    expect(getGitHubWriteBackDisabledMessageKey("empty_reviewers")).toBe(
      "githubWorkflow.writeBack.disabled.emptyReviewers",
    )
    expect(getGitHubWriteBackDisabledMessageKey("unsupported_pr_state")).toBe(
      "githubWorkflow.writeBack.disabled.unsupportedPrState",
    )
  })

  test("computes write-back confirmation disabled reasons", () => {
    expect(
      getGitHubWriteBackConfirmationDisabledReason({
        action: "pr_comment",
        hasCurrentPr: false,
        body: "Ready to post.",
      }),
    ).toBe("no_pr")

    expect(
      getGitHubWriteBackConfirmationDisabledReason({
        action: "pr_comment",
        hasCurrentPr: true,
        body: " ",
      }),
    ).toBe("empty_body")

    expect(
      getGitHubWriteBackConfirmationDisabledReason({
        action: "review_thread_reply",
        hasCurrentPr: true,
        threadId: "",
        body: "Fixed.",
      }),
    ).toBe("missing_thread_id")

    expect(
      getGitHubWriteBackConfirmationDisabledReason({
        action: "mark_ready_for_review",
        hasCurrentPr: true,
        prState: "open",
      }),
    ).toBe("unsupported_pr_state")

    expect(
      getGitHubWriteBackConfirmationDisabledReason({
        action: "request_reviewers",
        hasCurrentPr: true,
        reviewers: [" ", ","],
      }),
    ).toBe("empty_reviewers")
  })

  test("allows confirmed write-back only after required user fields exist", () => {
    expect(
      canConfirmGitHubWriteBack({
        action: "review_thread_reply",
        hasCurrentPr: true,
        threadId: "thread-1",
        body: "Fixed in latest commit.",
      }),
    ).toBe(true)
    expect(
      canConfirmGitHubWriteBack({
        action: "mark_ready_for_review",
        hasCurrentPr: true,
        prState: "draft",
      }),
    ).toBe(true)
    expect(
      canConfirmGitHubWriteBack({
        action: "request_reviewers",
        hasCurrentPr: true,
        reviewers: ["@alice", "bob, @carol", "alice"],
      }),
    ).toBe(true)
    expect(
      normalizeGitHubWriteBackReviewerLogins([
        "@alice",
        "bob, @carol",
        "alice",
      ]),
    ).toEqual(["alice", "bob", "carol"])
  })

  test("keeps high-risk GitHub write-back actions out of the renderer surface", () => {
    const infoSectionSource = readFileSync(
      new URL(
        "../src/renderer/features/details-sidebar/sections/info-section.tsx",
        import.meta.url,
      ),
      "utf8",
    )
    const confirmationDialogSource = readFileSync(
      new URL(
        "../src/renderer/features/details-sidebar/components/github-write-back-confirmation-dialog.tsx",
        import.meta.url,
      ),
      "utf8",
    )

    const dialogActions = Array.from(
      infoSectionSource.matchAll(
        /<GitHubWriteBackConfirmationDialog[\s\S]*?\saction="([^"]+)"/g,
      ),
      (match) => match[1],
    ).sort()
    expect(dialogActions).toEqual([
      "mark_ready_for_review",
      "pr_comment",
      "request_reviewers",
      "review_thread_reply",
    ].sort())

    const githubWorkflowMutations = Array.from(
      infoSectionSource.matchAll(
        /trpc\.githubWorkflow\.([A-Za-z0-9]+)\.useMutation/g,
      ),
      (match) => match[1],
    ).sort()
    expect(githubWorkflowMutations).toEqual([
      "getFailedCheckLog",
      "importTaskFromUrl",
      "markReadyForReview",
      "postPullRequestComment",
      "replyToReviewThread",
      "requestReviewers",
    ].sort())

    const writeBackUiSource = `${infoSectionSource}\n${confirmationDialogSource}`
    expect(writeBackUiSource).not.toMatch(
      /githubWorkflow\.writeBack\.(?:action|confirmTitle|confirmButton|confirmDescription)\.(?:approve|approval|merge|requestChanges|request_changes|resolve|autoResolve)/,
    )
    expect(writeBackUiSource).not.toMatch(
      /trpc\.githubWorkflow\.(?:approve|merge|requestChanges|resolveReviewThread|autoResolve)/,
    )
  })
})
