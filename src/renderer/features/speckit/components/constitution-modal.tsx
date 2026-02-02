/**
 * ConstitutionModal Component
 *
 * Full-screen modal dialog for viewing and editing the project constitution.
 * Renders constitution markdown with Edit button to open in system editor.
 *
 * @see specs/001-speckit-ui-integration/spec.md (US2)
 */

import { memo, useCallback } from "react"
import { ExternalLink, Book } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { trpc } from "@/lib/trpc"
import { MarkdownView } from "./markdown-view"
import { cn } from "@/lib/utils"

interface ConstitutionModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Project path for constructing constitution file path */
  projectPath: string
  /** Constitution content to display */
  content: string
  /** Callback when modal is closed */
  onClose?: () => void
}

/**
 * ConstitutionModal - Full modal for viewing constitution
 *
 * Features:
 * - Renders constitution markdown with syntax highlighting
 * - Edit button opens file in system editor
 * - Scrollable content area for long documents
 */
export const ConstitutionModal = memo(function ConstitutionModal({
  open,
  onOpenChange,
  projectPath,
  content,
  onClose,
}: ConstitutionModalProps) {
  // Mutation for opening file in editor
  const openFileMutation = trpc.speckit.openFileInEditor.useMutation()

  // Handle edit button click
  const handleEditConstitution = useCallback(() => {
    const constitutionPath = `${projectPath}/.specify/memory/constitution.md`
    openFileMutation.mutate({ filePath: constitutionPath })
  }, [projectPath, openFileMutation])

  // Handle close
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen)
      if (!newOpen) {
        onClose?.()
      }
    },
    [onOpenChange, onClose]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-w-4xl max-h-[85vh] flex flex-col",
          "w-[90vw] sm:w-[85vw] md:w-[80vw] lg:w-[900px]"
        )}
      >
        <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between pr-8">
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>Project Constitution</DialogTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleEditConstitution}
            disabled={openFileMutation.isPending}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Edit in Editor
          </Button>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-2 -mr-2">
          {content ? (
            <div className="p-4 bg-muted/20 rounded-lg">
              <MarkdownView content={content} size="md" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">No constitution content available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})

ConstitutionModal.displayName = "ConstitutionModal"
