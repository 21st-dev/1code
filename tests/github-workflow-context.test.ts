import { describe, expect, test } from "bun:test"
import {
  boundGitHubLogText,
  buildGitHubDraftPullRequestBody,
  buildGitHubFailedCheckLogContextText,
  buildGitHubPrContextText,
  buildGitHubReviewCommentsContextText,
  buildGitHubTaskContextText,
  createGitHubDraftPullRequestPreparation,
  formatGitHubChecksSummary,
  parseGitHubActionsJobId,
  parseGitHubActionsRunId,
  parseGitHubRemoteUrl,
  parseGitHubTaskUrl,
  redactGitHubLogText,
  summarizeGitHubChecks,
  type GitHubFailedCheckLogContext,
  type GitHubPrContext,
  type GitHubReviewCommentsContext,
  type GitHubTaskContext,
} from "../src/shared/github-workflow-context"
import { buildGitHubDraftPullRequestCreateArgs } from "../src/main/lib/github-workflow/draft-pr-preparation"
import { parseGitHubReviewThreadsResponse } from "../src/main/lib/github-workflow/review-comments"
import {
  classifyGitHubCommandError,
  getGitHubCommandErrorText,
  isNoPullRequestFoundError,
} from "../src/main/lib/github-workflow/status"
import { parseChecks } from "../src/main/lib/git/github/github"
import { GHPRResponseSchema } from "../src/main/lib/git/github/types"

describe("GitHub workflow context", () => {
  test("parses GitHub origin remote URLs", () => {
    expect(
      parseGitHubRemoteUrl("https://github.com/example/project.git"),
    ).toEqual({
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
    })
    expect(parseGitHubRemoteUrl("git@github.com:example/project.git")).toEqual({
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
    })
    expect(
      parseGitHubRemoteUrl("ssh://git@github.com/example/project.git"),
    ).toEqual({
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
    })
    expect(parseGitHubRemoteUrl("https://gitlab.com/example/project.git")).toBeNull()
  })

  test("parses absolute and relative GitHub task URLs", () => {
    expect(
      parseGitHubTaskUrl("https://github.com/example/project/issues/123"),
    ).toEqual({
      kind: "issue",
      owner: "example",
      repo: "project",
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      number: 123,
      url: "https://github.com/example/project/issues/123",
    })

    expect(parseGitHubTaskUrl("/pull/42", "example/project")).toEqual({
      kind: "pull_request",
      owner: "example",
      repo: "project",
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      number: 42,
      url: "https://github.com/example/project/pull/42",
    })

    expect(parseGitHubTaskUrl("/pull/42")).toBeNull()
    expect(parseGitHubTaskUrl("https://github.com/example/project/actions/42")).toBeNull()
  })

  test("parses GitHub Actions run IDs from check URLs", () => {
    const jobUrl =
      "https://github.com/example/project/actions/runs/987654321/job/123"

    expect(parseGitHubActionsRunId(jobUrl)).toBe(987654321)
    expect(parseGitHubActionsJobId(jobUrl)).toBe(123)
    expect(
      parseGitHubActionsRunId(
        "https://github.com/example/project/actions/runs/987654321?pr=42",
      ),
    ).toBe(987654321)
    expect(parseGitHubActionsRunId("https://example.com/status/1")).toBeNull()
    expect(parseGitHubActionsJobId("https://example.com/status/1")).toBeNull()
  })

  test("parses gh pr view JSON and normalizes check rollups", () => {
    const parsed = GHPRResponseSchema.parse({
      number: 42,
      title: "Add GitHub context",
      url: "https://github.com/example/project/pull/42",
      state: "OPEN",
      isDraft: false,
      baseRefName: "main",
      headRefName: "feature/github-context",
      body: "Adds context",
      author: { login: "ethan" },
      mergedAt: null,
      additions: 12,
      deletions: 3,
      reviewDecision: "CHANGES_REQUESTED",
      mergeable: "MERGEABLE",
      statusCheckRollup: [
        {
          name: "test",
          conclusion: "FAILURE",
          status: "COMPLETED",
          detailsUrl:
            "https://github.com/example/project/actions/runs/987654321/job/123",
          workflowName: "CI",
        },
        {
          context: "lint",
          state: "SUCCESS",
          targetUrl:
            "https://github.com/example/project/actions/runs/987654322",
        },
      ],
    })

    const checks = parseChecks(parsed.statusCheckRollup)

    expect(checks).toHaveLength(2)
    expect(checks[0]).toMatchObject({
      name: "test",
      status: "failure",
      runId: 987654321,
      jobId: 123,
      workflowName: "CI",
    })
    expect(checks[1]).toMatchObject({
      name: "lint",
      status: "success",
      runId: 987654322,
    })
  })

  test("summarizes check states", () => {
    const summary = summarizeGitHubChecks([
      { name: "typecheck", status: "success" },
      { name: "test", status: "failure" },
      { name: "lint", status: "pending" },
      { name: "docs", status: "skipped" },
      { name: "deploy", status: "cancelled" },
    ])

    expect(summary).toEqual({
      total: 5,
      passed: 1,
      failed: 1,
      pending: 1,
      skipped: 1,
      cancelled: 1,
    })
    expect(formatGitHubChecksSummary(summary)).toBe(
      "1 passed, 1 failed, 1 pending, 1 skipped, 1 cancelled",
    )
  })

  test("builds a runtime-agnostic PR context prompt", () => {
    const context: GitHubPrContext = {
      repoUrl: "https://github.com/example/project",
      branch: "feature/github-context",
      pr: {
        number: 42,
        title: "Add GitHub context",
        url: "https://github.com/example/project/pull/42",
        state: "open",
        baseBranch: "main",
        headBranch: "feature/github-context",
        authorLogin: "ethan",
        body: "Adds current PR context for agents.",
        additions: 120,
        deletions: 18,
        reviewDecision: "changes_requested",
        checksStatus: "failure",
        checks: [
          { name: "typecheck", status: "success" },
          { name: "test", status: "failure" },
        ],
      },
      checksSummary: {
        total: 2,
        passed: 1,
        failed: 1,
        pending: 0,
        skipped: 0,
        cancelled: 0,
      },
    }

    const prompt = buildGitHubPrContextText(context)

    expect(prompt).toContain("PR: #42 Add GitHub context")
    expect(prompt).toContain("Base branch: main")
    expect(prompt).toContain("Review: Changes requested")
    expect(prompt).toContain("Checks: 1 passed, 1 failed, 0 pending")
    expect(prompt).toContain("- failure: test")
  })

  test("bounds long PR bodies in context prompts", () => {
    const context: GitHubPrContext = {
      repoUrl: "https://github.com/example/project",
      branch: "feature/github-context",
      pr: {
        number: 42,
        title: "Add GitHub context",
        url: "https://github.com/example/project/pull/42",
        state: "open",
        body: "a".repeat(4_100),
        additions: 1,
        deletions: 0,
        reviewDecision: "pending",
        checksStatus: "none",
        checks: [],
      },
      checksSummary: {
        total: 0,
        passed: 0,
        failed: 0,
        pending: 0,
        skipped: 0,
        cancelled: 0,
      },
    }

    const prompt = buildGitHubPrContextText(context)

    expect(prompt).toContain("[Truncated after 4000 characters]")
    expect(prompt.length).toBeLessThan(4_800)
  })

  test("builds a runtime-agnostic GitHub task context prompt", () => {
    const context: GitHubTaskContext = {
      kind: "issue",
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      number: 123,
      title: "Settings crash on startup",
      url: "https://github.com/example/project/issues/123",
      state: "Open",
      body: "The settings panel crashes after launch.",
      authorLogin: "ethan",
      labels: ["bug", "settings"],
      comments: [
        {
          authorLogin: "reviewer",
          body: "This still reproduces on main.",
          createdAt: "2026-05-26T00:00:00Z",
        },
      ],
      commentsCount: 1,
    }

    const prompt = buildGitHubTaskContextText(context)

    expect(prompt).toContain("Use this GitHub issue context")
    expect(prompt).toContain("Issue: #123 Settings crash on startup")
    expect(prompt).toContain("Labels: bug, settings")
    expect(prompt).toContain("1 comments")
    expect(prompt).toContain("This still reproduces on main.")
  })

  test("redacts and bounds GitHub CI logs", () => {
    const redacted = redactGitHubLogText(
      "token=ghp_abcdefghijklmnopqrstuvwxyz123456\nall good",
    )

    expect(redacted.redacted).toBe(true)
    expect(redacted.log).toContain("[REDACTED]")
    expect(redacted.log).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456")

    const bounded = boundGitHubLogText("a".repeat(120), 50)
    expect(bounded.truncated).toBe(true)
    expect(bounded.log.length).toBeGreaterThan(50)
    expect(bounded.log).toContain("Truncated 70 characters")
  })

  test("builds a runtime-agnostic failed check log context prompt", () => {
    const context: GitHubFailedCheckLogContext = {
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      branch: "feature/github-context",
      pr: {
        number: 42,
        title: "Add GitHub context",
        url: "https://github.com/example/project/pull/42",
      },
      check: {
        name: "test",
        status: "failure",
        workflowName: "CI",
        runId: 987654321,
      },
      runId: 987654321,
      runUrl: "https://github.com/example/project/actions/runs/987654321",
      log: "Error: expected true to be false",
      truncated: false,
      redacted: false,
      fetchedAt: "2026-05-26T00:00:00.000Z",
    }

    const prompt = buildGitHubFailedCheckLogContextText(context)

    expect(prompt).toContain("Use this GitHub CI failure context")
    expect(prompt).toContain("PR: #42 Add GitHub context")
    expect(prompt).toContain("Check: test")
    expect(prompt).toContain("Run ID: 987654321")
    expect(prompt).toContain("Error: expected true to be false")
  })

  test("builds runtime-agnostic review comments context prompt", () => {
    const context: GitHubReviewCommentsContext = {
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      branch: "feature/github-context",
      pr: {
        number: 42,
        title: "Add GitHub context",
        url: "https://github.com/example/project/pull/42",
      },
      threads: [
        {
          id: "thread-1",
          path: "src/settings.ts",
          line: 18,
          isResolved: false,
          comments: [
            {
              id: "comment-1",
              authorLogin: "reviewer",
              body: "This branch still crashes when settings are missing.",
              url: "https://github.com/example/project/pull/42#discussion_r1",
              createdAt: "2026-05-26T00:00:00Z",
              diffHunk: "@@ -1,2 +1,2 @@\n- old\n+ new",
            },
          ],
        },
      ],
      totalThreads: 2,
      unresolvedThreads: 1,
      commentsCount: 1,
      fetchedAt: "2026-05-26T00:00:00.000Z",
    }

    const prompt = buildGitHubReviewCommentsContextText(context)

    expect(prompt).toContain("Use this GitHub pull request review feedback context")
    expect(prompt).toContain("PR: #42 Add GitHub context")
    expect(prompt).toContain("Review threads: 1 unresolved of 2 total")
    expect(prompt).toContain("src/settings.ts: line 18")
    expect(prompt).toContain("reviewer")
    expect(prompt).toContain("This branch still crashes")
    expect(prompt).toContain("Do not reply to, resolve, or mutate GitHub review threads")
  })

  test("parses gh GraphQL review threads and redacts comment content", () => {
    const parsed = parseGitHubReviewThreadsResponse({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "resolved-thread",
                  isResolved: true,
                  isOutdated: false,
                  path: "src/old.ts",
                  line: 9,
                  comments: {
                    nodes: [
                      {
                        id: "resolved-comment",
                        author: { login: "reviewer" },
                        body: "Resolved feedback",
                      },
                    ],
                  },
                },
                {
                  id: "unresolved-thread",
                  isResolved: false,
                  isOutdated: false,
                  path: "src/settings.ts",
                  line: 18,
                  comments: {
                    nodes: [
                      {
                        id: "comment-1",
                        author: { login: "reviewer" },
                        body:
                          "Please avoid logging token=ghp_abcdefghijklmnopqrstuvwxyz123456 here.",
                        createdAt: "2026-05-26T00:00:00Z",
                        url:
                          "https://github.com/example/project/pull/42#discussion_r1",
                        path: "src/settings.ts",
                        line: 18,
                        originalLine: 17,
                        diffHunk:
                          "@@ -1,2 +1,2 @@\n- token=ghp_abcdefghijklmnopqrstuvwxyz123456\n+ safe",
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    })

    expect(parsed.totalThreads).toBe(2)
    expect(parsed.commentsCount).toBe(1)
    expect(parsed.threads).toHaveLength(1)
    expect(parsed.threads[0]).toMatchObject({
      id: "unresolved-thread",
      path: "src/settings.ts",
      line: 18,
      isResolved: false,
    })
    expect(parsed.threads[0].comments[0].body).toContain("token=[REDACTED]")
    expect(parsed.threads[0].comments[0].body).not.toContain("ghp_")
    expect(parsed.threads[0].comments[0].diffHunk).toContain("[REDACTED]")
    expect(parsed.threads[0].comments[0].diffHunk).not.toContain("ghp_")
  })

  test("prepares editable draft PR text without creating a PR", () => {
    const preparation = createGitHubDraftPullRequestPreparation({
      repoSlug: "example/project",
      repoUrl: "https://github.com/example/project",
      branch: "fix/settings-crash",
      baseBranch: "main",
      commits: ["Fix settings startup crash"],
      changedFiles: [
        { path: "src/settings.ts", status: "modified" },
        { path: "tests/settings.test.ts", status: "added" },
      ],
    })

    expect(preparation.draft).toBe(true)
    expect(preparation.title).toBe("Settings crash")
    expect(preparation.body).toContain("## Summary")
    expect(preparation.body).toContain("- Fix settings startup crash")
    expect(preparation.body).toContain("## Test plan")
    expect(preparation.body).toContain("Modified: src/settings.ts")
    expect(preparation.body).toContain("Added: tests/settings.test.ts")
  })

  test("builds draft PR body with deterministic sections", () => {
    const body = buildGitHubDraftPullRequestBody({
      summary: "- Add GitHub context handoff.",
      testPlan: "- bun test tests",
      changedFiles: [{ path: "src/github.ts", status: "added" }],
      commits: ["Add GitHub context"],
    })

    expect(body).toContain("## Summary")
    expect(body).toContain("- Add GitHub context handoff.")
    expect(body).toContain("## Test plan")
    expect(body).toContain("- bun test tests")
    expect(body).toContain("## Local commits")
    expect(body).toContain("## Changed files")
  })

  test("builds non-interactive gh args for draft PR creation", () => {
    expect(
      buildGitHubDraftPullRequestCreateArgs({
        repoSlug: "example/project",
        branch: "fix/settings-crash",
        baseBranch: "main",
        title: "Fix settings crash",
        body: "## Summary\n- Fix crash",
      }),
    ).toEqual([
      "pr",
      "create",
      "--repo",
      "example/project",
      "--base",
      "main",
      "--head",
      "fix/settings-crash",
      "--title",
      "Fix settings crash",
      "--body",
      "## Summary\n- Fix crash",
      "--draft",
    ])
  })

  test("normalizes GitHub CLI empty and error states", () => {
    expect(classifyGitHubCommandError(new Error("spawn gh ENOENT"))).toBe(
      "gh_missing",
    )
    expect(
      classifyGitHubCommandError(
        new Error("You are not logged into any GitHub hosts. Run gh auth login"),
      ),
    ).toBe("gh_not_authenticated")
    expect(classifyGitHubCommandError(new Error("GraphQL: API rate limit"))).toBe(
      "github_unavailable",
    )
    expect(
      isNoPullRequestFoundError(new Error("no pull requests found for branch")),
    ).toBe(true)
    expect(
      getGitHubCommandErrorText(
        Object.assign(new Error("Command failed"), {
          stderr: "stderr details",
          stdout: "stdout details",
          code: 1,
        }),
      ),
    ).toContain("stderr details")
  })
})
