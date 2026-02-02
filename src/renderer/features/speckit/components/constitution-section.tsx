/**
 * ConstitutionSection Component
 *
 * Displays the project constitution in the Plan page.
 * Shows principle names preview and provides View/Edit actions.
 *
 * @see specs/001-speckit-ui-integration/spec.md (US2)
 */

import { memo, useState, useCallback } from "react"
import { Book, Eye, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { parseConstitutionPreview } from "../utils/constitution-parser"
import { ConstitutionModal } from "./constitution-modal"

interface ConstitutionSectionProps {
  /** Project path (required) */
  projectPath: string
  /** Callback when constitution needs to be created */
  onCreateConstitution?: () => void
}

/**
 * ConstitutionSection - Displays constitution preview in Plan page
 *
 * States:
 * - Loading: Shows loading spinner
 * - Not found: Shows "No constitution found" with Create action
 * - Found: Shows principle names preview with View/Edit buttons
 */
export const ConstitutionSection = memo(function ConstitutionSection({
  projectPath,
  onCreateConstitution,
}: ConstitutionSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Query constitution content
  const {
    data: constitution,
    isLoading,
    refetch,
  } = trpc.speckit.getConstitution.useQuery(
    { projectPath },
    { enabled: !!projectPath, refetchOnWindowFocus: false }
  )

  // Open constitution modal
  const handleViewConstitution = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  // Close constitution modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  // Handle create constitution
  const handleCreateConstitution = useCallback(() => {
    onCreateConstitution?.()
  }, [onCreateConstitution])

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Book className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Constitution
          </span>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-center">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Constitution not found - show create action
  if (!constitution?.exists) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Book className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Constitution
          </span>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">
            No constitution found. Create one to define project principles.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleCreateConstitution}
          >
            <Plus className="h-3 w-3 mr-1" />
            Create Constitution
          </Button>
        </div>
      </div>
    )
  }

  // Parse constitution preview
  const preview = parseConstitutionPreview(constitution.content)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Book className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Constitution
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleViewConstitution}
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Principles Preview */}
      <div className="bg-muted/30 rounded-lg p-3">
        {preview.principleCount > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">
              {preview.principleCount} Principle{preview.principleCount !== 1 ? "s" : ""}
            </p>
            <ul className="text-xs space-y-0.5">
              {preview.principleNames.slice(0, 5).map((name, index) => (
                <li key={index} className="text-muted-foreground truncate">
                  {index + 1}. {name}
                </li>
              ))}
              {preview.principleNames.length > 5 && (
                <li className="text-muted-foreground/70 italic">
                  +{preview.principleNames.length - 5} more...
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Constitution exists but no principles detected.
          </p>
        )}
      </div>

      {/* Constitution Modal */}
      <ConstitutionModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        projectPath={projectPath}
        content={constitution.content}
        onClose={handleCloseModal}
      />
    </div>
  )
})

ConstitutionSection.displayName = "ConstitutionSection"
