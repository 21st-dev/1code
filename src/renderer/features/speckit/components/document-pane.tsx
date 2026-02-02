/**
 * DocumentPane Component
 *
 * Right pane of the workflow modal for live artifact preview.
 * Displays markdown content with tabs for different artifact types.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useMemo } from "react"
import { FileText, ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { MarkdownView } from "./markdown-view"
import type { ArtifactType } from "../types"

interface DocumentPaneProps {
  /** Project path */
  projectPath: string
  /** Feature branch name */
  featureBranch: string
  /** Currently selected artifact type */
  selectedArtifact: ArtifactType
  /** Callback when artifact tab changes */
  onArtifactChange?: (artifact: ArtifactType) => void
  /** Whether to show the constitution tab */
  showConstitution?: boolean
  /** Callback to open file in editor */
  onOpenInEditor?: (filePath: string) => void
}

/**
 * DocumentPane - Artifact preview with tabs
 */
export const DocumentPane = memo(function DocumentPane({
  projectPath,
  featureBranch,
  selectedArtifact,
  onArtifactChange,
  showConstitution = true,
  onOpenInEditor,
}: DocumentPaneProps) {
  // Query artifacts based on branch with caching (30 second stale time)
  const cacheConfig = {
    enabled: !!featureBranch,
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30 seconds - prevents unnecessary refetches
  }

  const { data: specArtifact, isLoading: specLoading, refetch: refetchSpec } =
    trpc.speckit.getArtifact.useQuery(
      { projectPath, featureBranch, artifactType: "spec" },
      cacheConfig
    )

  const { data: planArtifact, isLoading: planLoading, refetch: refetchPlan } =
    trpc.speckit.getArtifact.useQuery(
      { projectPath, featureBranch, artifactType: "plan" },
      cacheConfig
    )

  const { data: researchArtifact, isLoading: researchLoading, refetch: refetchResearch } =
    trpc.speckit.getArtifact.useQuery(
      { projectPath, featureBranch, artifactType: "research" },
      cacheConfig
    )

  const { data: tasksArtifact, isLoading: tasksLoading, refetch: refetchTasks } =
    trpc.speckit.getArtifact.useQuery(
      { projectPath, featureBranch, artifactType: "tasks" },
      cacheConfig
    )

  const { data: constitution, isLoading: constitutionLoading, refetch: refetchConstitution } =
    trpc.speckit.getConstitution.useQuery(
      { projectPath },
      { enabled: showConstitution, refetchOnWindowFocus: false, staleTime: 30000 }
    )

  // Get current artifact data
  const currentArtifact = useMemo(() => {
    switch (selectedArtifact) {
      case "spec":
        return { data: specArtifact, loading: specLoading, refetch: refetchSpec }
      case "plan":
        return { data: planArtifact, loading: planLoading, refetch: refetchPlan }
      case "research":
        return { data: researchArtifact, loading: researchLoading, refetch: refetchResearch }
      case "tasks":
        return { data: tasksArtifact, loading: tasksLoading, refetch: refetchTasks }
      case "constitution":
        return {
          data: constitution ? { content: constitution.content, exists: constitution.exists, filePath: "" } : null,
          loading: constitutionLoading,
          refetch: refetchConstitution,
        }
      default:
        return { data: null, loading: false, refetch: () => {} }
    }
  }, [
    selectedArtifact,
    specArtifact, specLoading, refetchSpec,
    planArtifact, planLoading, refetchPlan,
    researchArtifact, researchLoading, refetchResearch,
    tasksArtifact, tasksLoading, refetchTasks,
    constitution, constitutionLoading, refetchConstitution,
  ])

  // Available tabs based on what exists
  const availableTabs = useMemo(() => {
    const tabs: { value: ArtifactType; label: string; exists: boolean }[] = []

    if (showConstitution) {
      tabs.push({
        value: "constitution",
        label: "Constitution",
        exists: constitution?.exists ?? false,
      })
    }

    tabs.push(
      { value: "spec", label: "Spec", exists: specArtifact?.exists ?? false },
      { value: "plan", label: "Plan", exists: planArtifact?.exists ?? false },
      { value: "research", label: "Research", exists: researchArtifact?.exists ?? false },
      { value: "tasks", label: "Tasks", exists: tasksArtifact?.exists ?? false }
    )

    return tabs
  }, [showConstitution, constitution, specArtifact, planArtifact, researchArtifact, tasksArtifact])

  const handleOpenInEditor = () => {
    if (currentArtifact.data?.filePath && onOpenInEditor) {
      onOpenInEditor(currentArtifact.data.filePath)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/50 flex-shrink-0">
        <Tabs
          value={selectedArtifact}
          onValueChange={(value) => onArtifactChange?.(value as ArtifactType)}
        >
          <TabsList className="h-8">
            {availableTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "h-7 px-2 text-xs",
                  !tab.exists && "text-muted-foreground/50"
                )}
                disabled={!tab.exists}
              >
                {tab.label}
                {tab.exists && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => currentArtifact.refetch()}
            disabled={currentArtifact.loading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", currentArtifact.loading && "animate-spin")}
            />
          </Button>
          {currentArtifact.data?.filePath && onOpenInEditor && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleOpenInEditor}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentArtifact.loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : currentArtifact.data?.exists && currentArtifact.data.content ? (
          <MarkdownView content={currentArtifact.data.content} size="md" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {selectedArtifact === "constitution"
                  ? "Constitution not found"
                  : `No ${selectedArtifact}.md file yet`}
              </p>
              <p className="text-xs mt-1">
                Complete the workflow step to generate this artifact
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

DocumentPane.displayName = "DocumentPane"

/**
 * Simplified artifact viewer for single artifact display
 */
export const ArtifactViewer = memo(function ArtifactViewer({
  content,
  exists,
  isLoading,
  emptyMessage = "No content available",
}: {
  content?: string
  exists?: boolean
  isLoading?: boolean
  emptyMessage?: string
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!exists || !content) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <div className="text-center">
          <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return <MarkdownView content={content} size="md" />
})

ArtifactViewer.displayName = "ArtifactViewer"
