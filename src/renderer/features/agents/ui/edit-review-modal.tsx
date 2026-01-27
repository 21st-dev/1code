import { useAtom, useSetAtom } from "jotai"
import { Check, X } from "lucide-react"
import { DiffView, DiffModeEnum } from "@git-diff-view/react"
import "@git-diff-view/react/styles/diff-view.css"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { pendingEditApprovalsAtom, reviewingEditAtom } from "../atoms"
import { trpcClient } from "@/lib/trpc"

/**
 * Edit Review Modal
 *
 * Displays a diff review modal for Ask mode when user needs to approve/reject
 * an edit before it's applied to a file.
 *
 * Features:
 * - Side-by-side diff view using @git-diff-view/react
 * - Accept/Reject buttons
 * - Integrates with Ask mode approval flow via tRPC
 * - Automatically clears pending approval on accept/reject
 */
export function EditReviewModal() {
  const [reviewingEdit, setReviewingEdit] = useAtom(reviewingEditAtom)
  const setPendingApprovals = useSetAtom(pendingEditApprovalsAtom)

  const handleAccept = async () => {
    if (!reviewingEdit) return

    try {
      await trpcClient.claude.respondEditApproval.mutate({
        toolUseId: reviewingEdit.toolUseId,
        approved: true,
      })

      // Clear pending approval from map
      setPendingApprovals((prev) => {
        const next = new Map(prev)
        next.delete(reviewingEdit.toolUseId)
        return next
      })

      // Close modal
      setReviewingEdit(null)
    } catch (error) {
      console.error("[EditReviewModal] Failed to accept edit:", error)
    }
  }

  const handleReject = async () => {
    if (!reviewingEdit) return

    try {
      await trpcClient.claude.respondEditApproval.mutate({
        toolUseId: reviewingEdit.toolUseId,
        approved: false,
        message: "Rejected by user",
      })

      // Clear pending approval from map
      setPendingApprovals((prev) => {
        const next = new Map(prev)
        next.delete(reviewingEdit.toolUseId)
        return next
      })

      // Close modal
      setReviewingEdit(null)
    } catch (error) {
      console.error("[EditReviewModal] Failed to reject edit:", error)
    }
  }

  // Get diff data from the reviewing edit
  const getDiffData = () => {
    if (!reviewingEdit) return null

    // For Edit tool: old_string vs new_string
    if (reviewingEdit.toolName === "Edit") {
      return {
        oldFile: {
          content: (reviewingEdit.input.old_string as string) || "",
        },
        newFile: {
          content: (reviewingEdit.input.new_string as string) || "",
        },
      }
    }

    // For Write tool: oldContent (if exists) vs content
    if (reviewingEdit.toolName === "Write") {
      return {
        oldFile: {
          content: reviewingEdit.oldContent || "",
        },
        newFile: {
          content: (reviewingEdit.input.content as string) || "",
        },
      }
    }

    return null
  }

  const diffData = getDiffData()

  return (
    <Dialog
      open={!!reviewingEdit}
      onOpenChange={(open) => !open && setReviewingEdit(null)}
    >
      <DialogContent className="w-[75vw] h-[85vh] p-0 flex flex-col">
        <DialogTitle className="p-4 border-b flex items-center gap-2">
          <span>Review Changes</span>
          <span className="text-muted-foreground">—</span>
          <span className="font-mono text-sm">{reviewingEdit?.filePath}</span>
        </DialogTitle>

        <div className="flex-1 overflow-auto">
          {diffData && (
            <DiffView
              data={diffData}
              diffViewMode={DiffModeEnum.Split}
              renderWidgetLine={() => null}
            />
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <Button variant="outline" onClick={handleReject}>
            <X className="w-4 h-4 mr-2" /> Reject
          </Button>
          <Button onClick={handleAccept}>
            <Check className="w-4 h-4 mr-2" /> Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
