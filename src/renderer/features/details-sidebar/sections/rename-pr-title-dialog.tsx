import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trpc } from "@/lib/trpc"

interface RenamePrTitleDialogProps {
  chatId: string
  open: boolean
  initialTitle: string
  prNumber: number
  onOpenChange: (open: boolean) => void
}

export function RenamePrTitleDialog({
  chatId,
  open,
  initialTitle,
  prNumber,
  onOpenChange,
}: RenamePrTitleDialogProps) {
  const [title, setTitle] = useState(initialTitle)
  const utils = trpc.useUtils()

  useEffect(() => {
    if (open) setTitle(initialTitle)
  }, [open, initialTitle])

  const mutation = trpc.chats.updatePrTitle.useMutation({
    onSuccess: () => {
      utils.chats.getPrStatus.invalidate({ chatId })
      toast.success(`Renamed PR #${prNumber}`)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error("Couldn't rename PR", { description: error.message })
    },
  })

  const trimmed = title.trim()
  const canSave =
    trimmed.length > 0 && trimmed !== initialTitle.trim() && !mutation.isPending

  const handleSave = () => {
    if (!canSave) return
    mutation.mutate({ chatId, title: trimmed, prNumber })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Rename PR #{prNumber}</DialogTitle>
          <DialogDescription>
            Update the title of this pull request.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="PR title"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleSave()
            }
          }}
          disabled={mutation.isPending}
        />
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
