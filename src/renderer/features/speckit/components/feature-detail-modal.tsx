/**
 * FeatureDetailModal Component
 *
 * Modal dialog for viewing feature artifacts (spec, plan, research, tasks).
 * Displays artifact content with tabs for switching between different artifacts.
 *
 * @see specs/001-speckit-ui-integration/spec.md (US3)
 */

import { memo, useCallback, useState, useMemo } from "react"
import {
  FileText,
  FileCode,
  ClipboardList,
  BookOpen,
  ExternalLink,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { trpc } from "@/lib/trpc"
import { MarkdownView } from "./markdown-view"
import { cn } from "@/lib/utils"
import type { Feature, ArtifactType } from "../types"

interface FeatureDetailModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Project path for loading artifacts */
  projectPath: string
  /** Feature to display (null when no feature selected) */
  feature: Feature | null
  /** Callback when modal is closed */
  onClose?: () => void
}

/**
 * Artifact tab configuration
 */
const ARTIFACT_TABS: Array<{
  id: Exclude<ArtifactType, "constitution">
  label: string
  icon: React.ElementType
}> = [
  { id: "spec", label: "Specification", icon: FileText },
  { id: "plan", label: "Plan", icon: FileCode },
  { id: "research", label: "Research", icon: BookOpen },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
]

/**
 * ArtifactContent - Displays artifact content with loading and error states
 */
const ArtifactContent = memo(function ArtifactContent({
  projectPath,
  featureBranch,
  artifactType,
  exists,
  onOpenInEditor,
}: {
  projectPath: string
  featureBranch: string
  artifactType: Exclude<ArtifactType, "constitution">
  exists: boolean
  onOpenInEditor: (filePath: string) => void
}) {
  // Query artifact content
  const {
    data: artifact,
    isLoading,
    error,
    refetch,
  } = trpc.speckit.getArtifact.useQuery(
    { projectPath, featureBranch, artifactType },
    {
      enabled: !!projectPath && !!featureBranch && exists,
      staleTime: 30000, // Cache for 30 seconds
    }
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive font-medium mb-2">
          Failed to load artifact
        </p>
        <p className="text-xs text-muted-foreground mb-4">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    )
  }

  // Artifact doesn't exist
  if (!exists || !artifact?.exists) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Artifact not found</p>
        <p className="text-xs text-muted-foreground/75 mt-1">
          This artifact has not been created yet
        </p>
      </div>
    )
  }

  // Content view
  return (
    <div className="flex flex-col h-full">
      {/* Header with Open in Editor button */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => artifact.filePath && onOpenInEditor(artifact.filePath)}
          disabled={!artifact.filePath}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" />
          Open in Editor
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {artifact.content ? (
          <MarkdownView content={artifact.content} size="md" />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Artifact file is empty
          </p>
        )}
      </div>
    </div>
  )
})

ArtifactContent.displayName = "ArtifactContent"

/**
 * FeatureDetailModal - Modal for viewing feature artifacts
 *
 * Features:
 * - Tabs for switching between Specification, Plan, Research, and Tasks
 * - Markdown rendering for artifact content
 * - Open in Editor button for each artifact
 * - Loading states while fetching content
 * - Error handling for missing artifacts
 */
export const FeatureDetailModal = memo(function FeatureDetailModal({
  open,
  onOpenChange,
  projectPath,
  feature,
  onClose,
}: FeatureDetailModalProps) {
  // Active tab state
  const [activeTab, setActiveTab] = useState<Exclude<ArtifactType, "constitution">>("spec")

  // Mutation for opening file in editor
  const openFileMutation = trpc.speckit.openFileInEditor.useMutation()

  // Handle open in editor
  const handleOpenInEditor = useCallback(
    (filePath: string) => {
      openFileMutation.mutate({ filePath })
    },
    [openFileMutation]
  )

  // Handle close
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange(newOpen)
      if (!newOpen) {
        onClose?.()
        // Reset to first tab when closing
        setTimeout(() => setActiveTab("spec"), 200)
      }
    },
    [onOpenChange, onClose]
  )

  // Determine which tabs have content
  const tabsWithContent = useMemo(() => {
    if (!feature) return new Set<string>()
    return new Set(
      ARTIFACT_TABS.filter((tab) => feature.artifacts[tab.id]).map((tab) => tab.id)
    )
  }, [feature])

  // Auto-select first available tab if current tab has no content
  const effectiveTab = useMemo(() => {
    if (!feature) return activeTab
    if (feature.artifacts[activeTab]) return activeTab
    // Find first tab with content
    const firstWithContent = ARTIFACT_TABS.find((tab) => feature.artifacts[tab.id])
    return firstWithContent?.id ?? activeTab
  }, [activeTab, feature])

  if (!feature) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-w-4xl max-h-[85vh] flex flex-col",
          "w-[90vw] sm:w-[85vw] md:w-[80vw] lg:w-[900px]"
        )}
      >
        <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between pr-8">
          <div className="flex items-center gap-3">
            {/* Feature ID Badge */}
            <div className="flex-shrink-0 w-10 h-6 flex items-center justify-center bg-primary/10 text-primary rounded text-xs font-mono font-medium">
              {feature.id}
            </div>
            <div>
              <DialogTitle className="text-base">{feature.name}</DialogTitle>
              {feature.description && (
                <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">
                  {feature.description}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs
          value={effectiveTab}
          onValueChange={(value) => setActiveTab(value as Exclude<ArtifactType, "constitution">)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="flex-shrink-0 w-full justify-start bg-muted/30 rounded-lg p-1">
            {ARTIFACT_TABS.map((tab) => {
              const hasContent = tabsWithContent.has(tab.id)
              const Icon = tab.icon
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5",
                    !hasContent && "opacity-50"
                  )}
                  disabled={!hasContent}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Tab Content */}
          {ARTIFACT_TABS.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="flex-1 min-h-0 mt-0 border border-border/50 rounded-lg bg-muted/10 overflow-hidden"
            >
              <ArtifactContent
                projectPath={projectPath}
                featureBranch={feature.branch}
                artifactType={tab.id}
                exists={feature.artifacts[tab.id]}
                onOpenInEditor={handleOpenInEditor}
              />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
})

FeatureDetailModal.displayName = "FeatureDetailModal"
