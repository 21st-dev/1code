"use client"

import { memo, useState } from "react"
import {
  Check,
  CircleDashed,
  ExternalLink,
  MessageSquare,
  TriangleAlert,
  X,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import { IconSpinner } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PRIcon } from "@/features/changes/components/pr-icon"
import { RenamePrTitleDialog } from "./rename-pr-title-dialog"
import { PrCommentsList } from "./pr-comments-section"

interface PrWidgetProps {
  chatId: string
}

type ReviewDecision = "approved" | "changes_requested" | "pending"

function reviewLabel(decision?: ReviewDecision | null): string | null {
  if (!decision) return null
  if (decision === "approved") return "Approved"
  if (decision === "changes_requested") return "Changes requested"
  return "Review pending"
}

function reviewTone(decision?: ReviewDecision | null): string {
  if (decision === "approved") return "text-emerald-600 dark:text-emerald-400"
  if (decision === "changes_requested") return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

function stateLabel(state: string, isDraft?: boolean): string {
  if (state === "merged") return "Merged"
  if (state === "closed") return "Closed"
  if (isDraft || state === "draft") return "Draft"
  return "Open"
}

export const PrWidget = memo(function PrWidget({ chatId }: PrWidgetProps) {
  const { data: status, isLoading } = trpc.chats.getPrStatus.useQuery(
    { chatId },
    { refetchInterval: 30000, enabled: !!chatId },
  )

  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [showComments, setShowComments] = useState(false)

  if (isLoading && !status) {
    return (
      <div className="px-3 py-4 flex items-center gap-2 text-xs text-muted-foreground">
        <IconSpinner className="h-3.5 w-3.5" />
        Loading PR status…
      </div>
    )
  }

  const pr = status?.pr
  if (!pr) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground">
        No pull request for this branch yet.
      </div>
    )
  }

  const openPr = () => {
    window.desktopApi.openExternal(pr.url)
  }

  const checks = pr.checks ?? []
  const successCount = checks.filter((c) => c.status === "success").length
  const failureCount = checks.filter((c) => c.status === "failure").length
  const pendingCount = checks.filter((c) => c.status === "pending").length

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <PRIcon state={pr.state} className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
              <span className="font-mono">#{pr.number}</span>
              <span>·</span>
              <span>{stateLabel(pr.state)}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsRenameOpen(true)}
              className="text-left text-sm font-medium text-foreground hover:underline decoration-muted-foreground/50 underline-offset-2 break-words"
              title="Click to rename PR title"
            >
              {pr.title}
            </button>
          </div>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={openPr}
                className="h-6 w-6 flex-shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              Open pull request
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Review + checks row */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {reviewLabel(pr.reviewDecision) && (
            <span className={cn("inline-flex items-center gap-1", reviewTone(pr.reviewDecision))}>
              {pr.reviewDecision === "approved" ? (
                <Check className="h-3 w-3" />
              ) : pr.reviewDecision === "changes_requested" ? (
                <TriangleAlert className="h-3 w-3" />
              ) : (
                <CircleDashed className="h-3 w-3" />
              )}
              {reviewLabel(pr.reviewDecision)}
            </span>
          )}
          {checks.length > 0 && (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              {successCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  {successCount}
                </span>
              )}
              {failureCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                  <X className="h-3 w-3" />
                  {failureCount}
                </span>
              )}
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <CircleDashed className="h-3 w-3" />
                  {pendingCount}
                </span>
              )}
            </span>
          )}
          {(pr.additions !== undefined || pr.deletions !== undefined) && (
            <span className="text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{pr.additions ?? 0}
              </span>{" "}
              <span className="text-red-600 dark:text-red-400">
                −{pr.deletions ?? 0}
              </span>
            </span>
          )}
        </div>

        {/* Comments toggle */}
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="self-start inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="h-3 w-3" />
          {showComments ? "Hide comments" : "Show comments"}
        </button>
      </div>

      {showComments && <PrCommentsList chatId={chatId} />}

      <RenamePrTitleDialog
        chatId={chatId}
        open={isRenameOpen}
        initialTitle={pr.title}
        prNumber={pr.number}
        onOpenChange={setIsRenameOpen}
      />
    </div>
  )
})
