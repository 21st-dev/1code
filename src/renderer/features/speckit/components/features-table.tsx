/**
 * FeaturesTable Component
 *
 * Displays a table of all previous Spec features with their artifacts.
 * Allows clicking on a feature to open the FeatureDetailModal.
 *
 * @see specs/001-speckit-ui-integration/spec.md (US3)
 */

import { memo, useCallback, useState, useMemo, useEffect } from "react"
import {
  FileText,
  FileCode,
  ClipboardList,
  BookOpen,
  Check,
  X,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { FeatureDetailModal } from "./feature-detail-modal"
import type { Feature } from "../types"

/** Debounce delay for file watcher refetch (ms) */
const FILE_WATCH_DEBOUNCE = 1000

/** Number of features to show per page */
const PAGE_SIZE = 10

interface FeaturesTableProps {
  /** Project path for loading features */
  projectPath: string
  /** Additional CSS classes */
  className?: string
}

/**
 * ArtifactIndicator - Shows a checkmark or X for artifact presence
 */
const ArtifactIndicator = memo(function ArtifactIndicator({
  present,
  label,
  icon: Icon,
}: {
  present: boolean
  label: string
  icon: React.ElementType
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-xs",
        present ? "text-green-500" : "text-muted-foreground/40"
      )}
      title={`${label}: ${present ? "Available" : "Not created"}`}
    >
      <Icon className="h-3 w-3" />
      {present ? (
        <Check className="h-2.5 w-2.5" />
      ) : (
        <X className="h-2.5 w-2.5" />
      )}
    </div>
  )
})

ArtifactIndicator.displayName = "ArtifactIndicator"

/**
 * FeatureRow - Single row in the features table
 */
const FeatureRow = memo(function FeatureRow({
  feature,
  onClick,
}: {
  feature: Feature
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg",
        "text-left hover:bg-muted/50 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      )}
    >
      {/* Feature ID Badge */}
      <div className="flex-shrink-0 w-10 h-6 flex items-center justify-center bg-primary/10 text-primary rounded text-xs font-mono font-medium">
        {feature.id}
      </div>

      {/* Feature Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{feature.name}</span>
        </div>
        {feature.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {feature.description}
          </p>
        )}
      </div>

      {/* Artifact Indicators */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ArtifactIndicator
          present={feature.artifacts.spec}
          label="Specification"
          icon={FileText}
        />
        <ArtifactIndicator
          present={feature.artifacts.plan}
          label="Plan"
          icon={FileCode}
        />
        <ArtifactIndicator
          present={feature.artifacts.research}
          label="Research"
          icon={BookOpen}
        />
        <ArtifactIndicator
          present={feature.artifacts.tasks}
          label="Tasks"
          icon={ClipboardList}
        />
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  )
})

FeatureRow.displayName = "FeatureRow"

/**
 * FeaturesTable - Table of all features with artifact indicators
 *
 * Features:
 * - Lists all features from specs/ directory
 * - Shows artifact presence indicators (spec, plan, research, tasks)
 * - Clicking a row opens FeatureDetailModal
 * - Shows loading skeleton during fetch
 * - Shows empty state when no features exist
 */
export const FeaturesTable = memo(function FeaturesTable({
  projectPath,
  className,
}: FeaturesTableProps) {
  // Selected feature for detail modal
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0)

  // Query features list with pagination
  const {
    data: featuresData,
    isLoading,
    error,
    refetch: refetchFeatures,
  } = trpc.speckit.getFeaturesList.useQuery(
    { projectPath, limit: PAGE_SIZE, offset: currentPage * PAGE_SIZE },
    { enabled: !!projectPath }
  )

  // File watcher for auto-refresh when specs/ directory changes
  const watchDirMutation = trpc.speckit.watchDirectory.useMutation()

  // Setup file watcher subscription for specs/ directory
  useEffect(() => {
    if (!projectPath) return

    let refetchTimeout: NodeJS.Timeout | null = null

    // Start watching the specs/ directory
    watchDirMutation.mutate(
      { projectPath, directory: "specs" },
      {
        onSuccess: () => {
          // Debounced refetch on file changes
          const handleFileChange = () => {
            if (refetchTimeout) clearTimeout(refetchTimeout)
            refetchTimeout = setTimeout(() => {
              refetchFeatures()
            }, FILE_WATCH_DEBOUNCE)
          }

          // Note: The actual file change subscription would be done via trpc.speckit.onFileChange
          // For now, we set up the watcher; the subscription is handled separately if needed
        },
      }
    )

    return () => {
      if (refetchTimeout) clearTimeout(refetchTimeout)
    }
  }, [projectPath, refetchFeatures, watchDirMutation])

  // Pagination info
  const totalFeatures = featuresData?.total ?? 0
  const totalPages = Math.ceil(totalFeatures / PAGE_SIZE)
  const hasNextPage = currentPage < totalPages - 1
  const hasPrevPage = currentPage > 0

  // Pagination handlers
  const handleNextPage = useCallback(() => {
    if (hasNextPage) {
      setCurrentPage((prev) => prev + 1)
    }
  }, [hasNextPage])

  const handlePrevPage = useCallback(() => {
    if (hasPrevPage) {
      setCurrentPage((prev) => prev - 1)
    }
  }, [hasPrevPage])

  // Handle feature click
  const handleFeatureClick = useCallback((feature: Feature) => {
    setSelectedFeature(feature)
    setIsModalOpen(true)
  }, [])

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    // Delay clearing selection to allow modal animation to complete
    setTimeout(() => setSelectedFeature(null), 200)
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Features
          </span>
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Features
          </span>
        </div>
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          Failed to load features: {error.message}
        </div>
      </div>
    )
  }

  const features = featuresData?.features ?? []

  // Empty state
  if (features.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Features
          </span>
        </div>
        <div className="text-center py-6 text-muted-foreground">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No features yet</p>
          <p className="text-xs mt-1 opacity-75">
            Start a new feature workflow to create your first specification
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Features
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {featuresData?.total ?? 0} total
        </span>
      </div>

      {/* Features List */}
      <div className="space-y-1">
        {features.map((feature) => (
          <FeatureRow
            key={feature.branch}
            feature={feature}
            onClick={() => handleFeatureClick(feature)}
          />
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <span className="text-xs text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handlePrevPage}
              disabled={!hasPrevPage}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleNextPage}
              disabled={!hasNextPage}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Feature Detail Modal */}
      <FeatureDetailModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        projectPath={projectPath}
        feature={selectedFeature}
        onClose={handleModalClose}
      />
    </div>
  )
})

FeaturesTable.displayName = "FeaturesTable"
