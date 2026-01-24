"use client"

import React from "react"
import { Server } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { ClusterList } from "./cluster-list"
import { ClusterDetail } from "./cluster-detail"

export function ClustersContent() {
  const { data: region } = trpc.clusters.getRegion.useQuery()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Kubernetes Clusters</h1>
        </div>
        {region && (
          <span className="text-xs text-muted-foreground">
            Region: {region}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Cluster list (left) */}
        <div className="w-[280px] border-r border-border flex-shrink-0 overflow-hidden">
          <ClusterList />
        </div>

        {/* Cluster detail (right) */}
        <div className="flex-1 overflow-hidden">
          <ClusterDetail />
        </div>
      </div>
    </div>
  )
}
