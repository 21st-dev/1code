import { z } from "zod"
import {
  buildGitHubTaskContextText,
  parseGitHubTaskUrl,
  summarizeGitHubChecks,
  type GitHubTaskContext,
  type GitHubTaskImportResult,
} from "../../../shared/github-workflow-context"
import { parseChecks } from "../git/github/github"
import { GHPRResponseSchema } from "../git/github/types"
import {
  classifyGitHubCommandError,
  getGitHubCliStatus,
  getGitHubWorkflowUnavailableMessage,
} from "./status"
import { readGitHubOriginRepo, runGitHubCliJson } from "./gh-cli"

const GHLabelSchema = z.object({
  name: z.string(),
})

const GHCommentSchema = z.object({
  author: z.object({ login: z.string() }).nullable().optional(),
  body: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
})

const GHIssueResponseSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  body: z.string().nullable().optional(),
  author: z.object({ login: z.string() }).nullable().optional(),
  labels: z.array(GHLabelSchema).nullable().optional(),
  comments: z.array(GHCommentSchema).nullable().optional(),
})

const GHPrTaskResponseSchema = GHPRResponseSchema.extend({
  labels: z.array(GHLabelSchema).nullable().optional(),
  comments: z.array(GHCommentSchema).nullable().optional(),
})

function normalizeState(value: string): string {
  if (!value) return "Unknown"
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function normalizeComments(
  comments: Array<z.infer<typeof GHCommentSchema>> | null | undefined,
): GitHubTaskContext["comments"] {
  return (comments ?? []).slice(-5).map((comment) => ({
    authorLogin: comment.author?.login,
    body: comment.body ?? "",
    createdAt: comment.createdAt ?? undefined,
    url: comment.url ?? undefined,
  }))
}

export async function importGitHubTaskFromUrl(
  input: {
    worktreePath?: string | null
    url: string
  },
): Promise<GitHubTaskImportResult> {
  const baseRepo = input.worktreePath
    ? await readGitHubOriginRepo(input.worktreePath)
    : null
  const parsed = parseGitHubTaskUrl(input.url, baseRepo?.repoSlug)

  if (!parsed) {
    return {
      status: "invalid_url",
      reason: "invalid_url",
      message:
        "Enter a GitHub issue or pull request URL, such as https://github.com/org/repo/issues/123 or /pull/123.",
    }
  }

  const cliStatus = await getGitHubCliStatus(input.worktreePath)
  if (cliStatus.status === "unavailable") {
    return {
      status: "unavailable",
      reason: cliStatus.reason,
      message: cliStatus.message,
    }
  }

  try {
    if (parsed.kind === "issue") {
      const data = await runGitHubCliJson(
        [
          "issue",
          "view",
          String(parsed.number),
          "--repo",
          parsed.repoSlug,
          "--json",
          "number,title,url,state,body,author,labels,comments",
        ],
        GHIssueResponseSchema,
        {
          cwd: input.worktreePath ?? undefined,
          commandDescription: "GitHub issue",
        },
      )
      const context: GitHubTaskContext = {
        kind: "issue",
        repoSlug: parsed.repoSlug,
        repoUrl: parsed.repoUrl,
        number: data.number,
        title: data.title,
        url: data.url,
        state: normalizeState(data.state),
        body: data.body ?? undefined,
        authorLogin: data.author?.login,
        labels: (data.labels ?? []).map((label) => label.name),
        comments: normalizeComments(data.comments),
        commentsCount: data.comments?.length ?? 0,
      }

      return {
        status: "found",
        task: context,
        contextText: buildGitHubTaskContextText(context),
        lastRefreshed: Date.now(),
      }
    }

    const data = await runGitHubCliJson(
      [
        "pr",
        "view",
        String(parsed.number),
        "--repo",
        parsed.repoSlug,
        "--json",
        "number,title,url,state,isDraft,baseRefName,headRefName,body,author,labels,comments,mergedAt,additions,deletions,reviewDecision,statusCheckRollup,mergeable",
      ],
      GHPrTaskResponseSchema,
      {
        cwd: input.worktreePath ?? undefined,
        commandDescription: "GitHub pull request",
      },
    )
    const checks = parseChecks(data.statusCheckRollup)
    const context: GitHubTaskContext = {
      kind: "pull_request",
      repoSlug: parsed.repoSlug,
      repoUrl: parsed.repoUrl,
      number: data.number,
      title: data.title,
      url: data.url,
      state: data.isDraft ? "Draft" : normalizeState(data.state),
      body: data.body ?? undefined,
      authorLogin: data.author?.login,
      labels: (data.labels ?? []).map((label) => label.name),
      comments: normalizeComments(data.comments),
      commentsCount: data.comments?.length ?? 0,
      pr: {
        baseBranch: data.baseRefName ?? undefined,
        headBranch: data.headRefName ?? undefined,
        additions: data.additions,
        deletions: data.deletions,
        reviewDecision:
          data.reviewDecision === "APPROVED"
            ? "approved"
            : data.reviewDecision === "CHANGES_REQUESTED"
              ? "changes_requested"
              : "pending",
        checks,
        checksSummary: summarizeGitHubChecks(checks),
      },
    }

    return {
      status: "found",
      task: context,
      contextText: buildGitHubTaskContextText(context),
      lastRefreshed: Date.now(),
    }
  } catch (error) {
    const reason = classifyGitHubCommandError(error)
    return {
      status: "unavailable",
      reason,
      message: getGitHubWorkflowUnavailableMessage(reason),
    }
  }
}
