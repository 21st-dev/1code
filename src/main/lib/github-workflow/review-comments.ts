import { z } from "zod"
import {
  buildGitHubReviewCommentsContextText,
  redactGitHubLogText,
  type GitHubReviewCommentThread,
  type GitHubReviewCommentsContext,
  type GitHubReviewCommentsResult,
} from "../../../shared/github-workflow-context"
import { runGitHubCliJson } from "./gh-cli"
import { getCurrentPullRequestContext } from "./current-pr-context"
import {
  classifyGitHubCommandError,
  getGitHubWorkflowStatus,
  getGitHubWorkflowUnavailableMessage,
} from "./status"

const REVIEW_THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 20) {
            nodes {
              id
              author {
                login
              }
              body
              createdAt
              url
              path
              line
              originalLine
              diffHunk
            }
          }
        }
      }
    }
  }
}
`

const GHReviewCommentSchema = z.object({
  id: z.string().optional(),
  author: z.object({ login: z.string() }).nullable().optional(),
  body: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  originalLine: z.number().nullable().optional(),
  diffHunk: z.string().nullable().optional(),
})

const GHReviewThreadSchema = z.object({
  id: z.string().optional(),
  isResolved: z.boolean(),
  isOutdated: z.boolean().nullable().optional(),
  path: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  startLine: z.number().nullable().optional(),
  comments: z
    .object({
      nodes: z.array(GHReviewCommentSchema).nullable().optional(),
    })
    .nullable()
    .optional(),
})

const GHReviewThreadsResponseSchema = z.object({
  data: z.object({
    repository: z
      .object({
        pullRequest: z
          .object({
            reviewThreads: z.object({
              nodes: z.array(GHReviewThreadSchema).nullable().optional(),
            }),
          })
          .nullable(),
      })
      .nullable(),
  }),
})

function splitRepoSlug(repoSlug: string): { owner: string; name: string } {
  const [owner, ...repoParts] = repoSlug.split("/")
  return {
    owner,
    name: repoParts.join("/"),
  }
}

function redactText(value: string | null | undefined): string {
  return redactGitHubLogText(value ?? "").log
}

function normalizeReviewThreads(
  threads: Array<z.infer<typeof GHReviewThreadSchema>>,
): GitHubReviewCommentThread[] {
  return threads
    .filter((thread) => !thread.isResolved)
    .map((thread) => ({
      id: thread.id,
      path: thread.path ?? undefined,
      line: thread.line ?? undefined,
      startLine: thread.startLine ?? undefined,
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated ?? undefined,
      comments: (thread.comments?.nodes ?? []).map((comment) => ({
        id: comment.id,
        authorLogin: comment.author?.login,
        body: redactText(comment.body),
        createdAt: comment.createdAt ?? undefined,
        url: comment.url ?? undefined,
        path: comment.path ?? thread.path ?? undefined,
        line: comment.line ?? thread.line ?? undefined,
        originalLine: comment.originalLine ?? undefined,
        diffHunk: redactText(comment.diffHunk) || undefined,
      })),
    }))
}

export function parseGitHubReviewThreadsResponse(raw: unknown): {
  threads: GitHubReviewCommentThread[]
  totalThreads: number
  commentsCount: number
} {
  const result = GHReviewThreadsResponseSchema.safeParse(raw)
  if (!result.success) {
    throw new Error("GitHub review threads response did not match expected shape")
  }

  const rawThreads =
    result.data.data.repository?.pullRequest?.reviewThreads.nodes ?? []
  const threads = normalizeReviewThreads(rawThreads)
  const commentsCount = threads.reduce(
    (total, thread) => total + thread.comments.length,
    0,
  )

  return {
    threads,
    totalThreads: rawThreads.length,
    commentsCount,
  }
}

export async function getReviewCommentsContext(
  worktreePath: string | null | undefined,
): Promise<GitHubReviewCommentsResult> {
  const workflowStatus = await getGitHubWorkflowStatus(worktreePath)
  if (workflowStatus.status === "unavailable") {
    return {
      status: "unavailable",
      reason: workflowStatus.reason,
      message: workflowStatus.message,
    }
  }

  const currentPr = await getCurrentPullRequestContext(worktreePath)
  if (currentPr.status !== "found") {
    return {
      status: "unavailable",
      reason: "no_pr",
      message: "No current pull request is available for review comments.",
    }
  }

  const { owner, name } = splitRepoSlug(workflowStatus.repoSlug)
  if (!owner || !name) {
    return {
      status: "unavailable",
      reason: "review_comments_unavailable",
      message: "Unable to parse the GitHub repository identity.",
    }
  }

  try {
    const data = await runGitHubCliJson(
      [
        "api",
        "graphql",
        "-f",
        `owner=${owner}`,
        "-f",
        `name=${name}`,
        "-F",
        `number=${currentPr.context.pr.number}`,
        "-f",
        `query=${REVIEW_THREADS_QUERY}`,
      ],
      GHReviewThreadsResponseSchema,
      {
        cwd: worktreePath ?? undefined,
        maxBuffer: 5 * 1024 * 1024,
        commandDescription: "GitHub review threads",
      },
    )

    const { threads, totalThreads, commentsCount } =
      parseGitHubReviewThreadsResponse(data)
    const context: GitHubReviewCommentsContext = {
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: currentPr.context.branch,
      pr: {
        number: currentPr.context.pr.number,
        title: currentPr.context.pr.title,
        url: currentPr.context.pr.url,
      },
      threads,
      totalThreads,
      unresolvedThreads: threads.length,
      commentsCount,
      fetchedAt: new Date().toISOString(),
    }

    return {
      status: "found",
      context,
      contextText: buildGitHubReviewCommentsContextText(context),
      lastRefreshed: Date.now(),
    }
  } catch (error) {
    const reason = classifyGitHubCommandError(error)
    if (reason !== "github_unavailable") {
      return {
        status: "unavailable",
        reason,
        message: getGitHubWorkflowUnavailableMessage(reason),
      }
    }

    return {
      status: "unavailable",
      reason: "review_comments_unavailable",
      message:
        "GitHub review comments could not be loaded through gh. Check GitHub CLI output and repository access.",
    }
  }
}
