"use client"

import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconSpinner } from "@/components/ui/icons"
import { useI18n } from "@/lib/i18n"
import {
  canConfirmGitHubWriteBack,
  getGitHubWriteBackActionLabelKey,
  getGitHubWriteBackConfirmationDisabledReason,
  getGitHubWriteBackConfirmButtonKey,
  getGitHubWriteBackConfirmDescriptionKey,
  getGitHubWriteBackConfirmTitleKey,
  getGitHubWriteBackDisabledMessageKey,
  normalizeGitHubWriteBackReviewerLogins,
} from "../../../../shared/github-workflow-ui-state"
import type {
  GitHubReviewCommentThread,
  GitHubWriteBackAction,
  GitHubWriteBackPullRequestTarget,
  GitHubWriteBackRequest,
  GitHubWorkflowUnavailableReason,
} from "../../../../shared/github-workflow-context"

interface GitHubWriteBackConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: GitHubWriteBackAction
  target: GitHubWriteBackPullRequestTarget | null
  defaultBody?: string
  defaultReviewers?: string[]
  thread?: GitHubReviewCommentThread | null
  unavailableReason?: GitHubWorkflowUnavailableReason | null
  isSubmitting?: boolean
  inlineError?: string | null
  onConfirm: (request: GitHubWriteBackRequest) => void
}

function getThreadLocation(thread: GitHubReviewCommentThread | null | undefined) {
  if (!thread?.path) return null
  if (typeof thread.line === "number") {
    return `${thread.path}:${thread.line}`
  }
  return thread.path
}

function buildRequest(input: {
  action: GitHubWriteBackAction
  target: GitHubWriteBackPullRequestTarget
  body: string
  threadId?: string
  reviewers: string[]
}): GitHubWriteBackRequest {
  if (input.action === "pr_comment") {
    return {
      action: "pr_comment",
      confirmed: true,
      prNumber: input.target.pr.number,
      body: input.body.trim(),
    }
  }

  if (input.action === "review_thread_reply") {
    return {
      action: "review_thread_reply",
      confirmed: true,
      prNumber: input.target.pr.number,
      threadId: input.threadId?.trim() ?? "",
      body: input.body.trim(),
    }
  }

  if (input.action === "mark_ready_for_review") {
    return {
      action: "mark_ready_for_review",
      confirmed: true,
      prNumber: input.target.pr.number,
    }
  }

  return {
    action: "request_reviewers",
    confirmed: true,
    prNumber: input.target.pr.number,
    reviewers: input.reviewers,
  }
}

export function GitHubWriteBackConfirmationDialog({
  open,
  onOpenChange,
  action,
  target,
  defaultBody = "",
  defaultReviewers = [],
  thread,
  unavailableReason,
  isSubmitting = false,
  inlineError,
  onConfirm,
}: GitHubWriteBackConfirmationDialogProps) {
  const { t } = useI18n()
  const defaultReviewerInput = defaultReviewers.join(", ")
  const [body, setBody] = useState(defaultBody)
  const [reviewerInput, setReviewerInput] = useState(defaultReviewerInput)

  useEffect(() => {
    if (!open) return
    setBody(defaultBody)
    setReviewerInput(defaultReviewerInput)
  }, [defaultBody, defaultReviewerInput, open])

  const reviewers = useMemo(
    () => normalizeGitHubWriteBackReviewerLogins([reviewerInput]),
    [reviewerInput],
  )
  const disabledReason = getGitHubWriteBackConfirmationDisabledReason({
    action,
    hasCurrentPr: !!target,
    prState: target?.pr.state,
    body,
    threadId: thread?.id,
    reviewers,
    unavailableReason,
  })
  const canConfirm =
    !!target &&
    !isSubmitting &&
    canConfirmGitHubWriteBack({
      action,
      hasCurrentPr: true,
      prState: target.pr.state,
      body,
      threadId: thread?.id,
      reviewers,
      unavailableReason,
    })
  const threadLocation = getThreadLocation(thread)

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) return
    onOpenChange(nextOpen)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!target || !canConfirm) return

    onConfirm(
      buildRequest({
        action,
        target,
        body,
        threadId: thread?.id,
        reviewers,
      }),
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <CanvasDialogContent className="w-[520px]">
        <form onSubmit={handleSubmit}>
          <CanvasDialogHeader className="space-y-2 pr-10">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">
              {t(getGitHubWriteBackActionLabelKey(action))}
            </div>
            <DialogTitle className="text-base">
              {t(getGitHubWriteBackConfirmTitleKey(action))}
            </DialogTitle>
            <DialogDescription>
              {t(getGitHubWriteBackConfirmDescriptionKey(action))}
            </DialogDescription>
          </CanvasDialogHeader>

          <CanvasDialogBody className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="text-[11px] font-medium text-muted-foreground">
                {t("githubWorkflow.writeBack.target")}
              </div>
              <div className="mt-1 min-w-0 text-sm text-foreground">
                {target ? (
                  <>
                    <div className="truncate">{target.repoSlug}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      PR #{target.pr.number} · {target.pr.title}
                    </div>
                    {threadLocation && (
                      <div className="truncate text-xs text-muted-foreground">
                        {threadLocation}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {t("githubWorkflow.writeBack.disabled.noPr")}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
              {t("githubWorkflow.writeBack.publicNotice")}
            </div>

            {(action === "pr_comment" ||
              action === "review_thread_reply") && (
              <div className="space-y-2">
                <Label htmlFor="github-write-back-body" className="text-sm">
                  {t("githubWorkflow.writeBack.body")}
                </Label>
                <Textarea
                  id="github-write-back-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  disabled={isSubmitting}
                  className="min-h-32 resize-y"
                  autoFocus
                />
              </div>
            )}

            {action === "request_reviewers" && (
              <div className="space-y-2">
                <Label htmlFor="github-write-back-reviewers" className="text-sm">
                  {t("githubWorkflow.writeBack.reviewers")}
                </Label>
                <Input
                  id="github-write-back-reviewers"
                  value={reviewerInput}
                  onChange={(event) => setReviewerInput(event.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            )}

            {disabledReason && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t(getGitHubWriteBackDisabledMessageKey(disabledReason))}
              </div>
            )}

            {inlineError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-foreground">
                {inlineError}
              </div>
            )}
          </CanvasDialogBody>

          <CanvasDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("githubWorkflow.writeBack.cancel")}
            </Button>
            <Button type="submit" disabled={!canConfirm}>
              {isSubmitting && <IconSpinner className="mr-2 h-3.5 w-3.5" />}
              {isSubmitting
                ? t("githubWorkflow.writeBack.confirming")
                : t(getGitHubWriteBackConfirmButtonKey(action))}
            </Button>
          </CanvasDialogFooter>
        </form>
      </CanvasDialogContent>
    </Dialog>
  )
}
