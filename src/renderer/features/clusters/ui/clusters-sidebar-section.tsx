"use client"

import React from "react"
import { Server } from "lucide-react"
import { useAtom, useAtomValue } from "jotai"
import { cn } from "../../../lib/utils"
import { selectedClustersCategoryAtom } from "../atoms"
import { clustersFeatureEnabledAtom } from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"

interface ClustersSidebarSectionProps {
  className?: string
}

export function ClustersSidebarSection({ className }: ClustersSidebarSectionProps) {
  const [selectedCategory, setSelectedCategory] = useAtom(selectedClustersCategoryAtom)
  const clustersEnabled = useAtomValue(clustersFeatureEnabledAtom)

  // Check if AWS credentials are available
  const { data: availability } = trpc.clusters.isAvailable.useQuery(undefined, {
    enabled: clustersEnabled,
  })

  // Don't render if feature is disabled or no AWS credentials
  if (!clustersEnabled) {
    return null
  }

  const handleClick = () => {
    // Toggle: if clicking the active category, deselect it
    if (selectedCategory === "clusters") {
      setSelectedCategory(null)
    } else {
      setSelectedCategory("clusters")
    }
  }

  // Show warning indicator if credentials are expired
  const showWarning = availability?.credentialsExpired

  return (
    <div className={cn("py-2", className)}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors rounded-md mx-2",
          selectedCategory === "clusters"
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <div className="relative">
          <Server className="h-4 w-4 flex-shrink-0" />
          {showWarning && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </div>
        <span className="flex-1 text-left">Clusters</span>
      </button>
    </div>
  )
}
