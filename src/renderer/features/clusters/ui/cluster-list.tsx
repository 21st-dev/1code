"use client"

import React, { useEffect } from "react"
import { useAtom } from "jotai"
import { Search, RefreshCw, Check, X, Loader2, AlertCircle } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClusterIdAtom, clusterSearchAtom } from "../atoms"

function getStatusIcon(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Check className="h-3 w-3 text-emerald-500" />
    case "CREATING":
    case "UPDATING":
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
    case "DELETING":
      return <Loader2 className="h-3 w-3 text-red-500 animate-spin" />
    case "FAILED":
      return <X className="h-3 w-3 text-red-500" />
    default:
      return <AlertCircle className="h-3 w-3 text-muted-foreground" />
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "text-emerald-500"
    case "CREATING":
    case "UPDATING":
      return "text-blue-500"
    case "DELETING":
    case "FAILED":
      return "text-red-500"
    default:
      return "text-muted-foreground"
  }
}

export function ClusterList() {
  const [selectedCluster, setSelectedCluster] = useAtom(selectedClusterIdAtom)
  const [search, setSearch] = useAtom(clusterSearchAtom)

  const {
    data: clusters,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = trpc.clusters.discover.useQuery()

  // Filter clusters based on search
  const filteredClusters = React.useMemo(() => {
    if (!clusters) return []
    if (!search.trim()) return clusters

    const query = search.toLowerCase()
    return clusters.filter(
      (cluster) =>
        cluster.name.toLowerCase().includes(query) ||
        cluster.region.toLowerCase().includes(query)
    )
  }, [clusters, search])

  // Auto-select first cluster if none selected
  useEffect(() => {
    if (!selectedCluster && filteredClusters.length > 0) {
      setSelectedCluster(filteredClusters[0].name)
    }
  }, [filteredClusters, selectedCluster, setSelectedCluster])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to discover clusters</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error.message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search and Refresh */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search clusters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {filteredClusters.length} cluster{filteredClusters.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className={cn("h-3 w-3", isRefetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 overflow-y-auto">
        {filteredClusters.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {clusters?.length === 0
              ? "No EKS clusters found in this region."
              : "No clusters match your search"}
          </div>
        ) : (
          <div className="py-1">
            {filteredClusters.map((cluster) => (
              <button
                key={cluster.name}
                type="button"
                onClick={() => setSelectedCluster(cluster.name)}
                className={cn(
                  "w-full px-3 py-2 text-left transition-colors",
                  "hover:bg-muted/50",
                  selectedCluster === cluster.name && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium truncate">
                    {cluster.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {getStatusIcon(cluster.status)}
                  <span className={cn("text-xs", getStatusColor(cluster.status))}>
                    {cluster.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({cluster.region})
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
