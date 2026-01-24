"use client"

import React, { useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import {
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Server,
  Box,
  Layers,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { selectedClusterIdAtom, selectedNamespaceAtom } from "../atoms"
import { clustersDefaultNamespaceAtom } from "../../../lib/atoms"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string
  value: string
  onCopy?: () => void
  copied?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm text-muted-foreground w-24 flex-shrink-0">
        {label}
      </span>
      <code className="flex-1 text-xs bg-muted px-2 py-1 rounded break-all">
        {value}
      </code>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  )
}

export function ClusterDetail() {
  const selectedClusterId = useAtomValue(selectedClusterIdAtom)
  const [selectedNamespace, setSelectedNamespace] = useAtom(selectedNamespaceAtom)
  const defaultNamespaceOverride = useAtomValue(clustersDefaultNamespaceAtom)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Get derived namespace from email
  const { data: derivedNamespace } = trpc.clusters.getDefaultNamespace.useQuery()

  // Effective default namespace
  const effectiveDefaultNamespace = defaultNamespaceOverride || derivedNamespace || "default"

  // Get cluster details
  const { data: cluster, isLoading: clusterLoading } = trpc.clusters.get.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  // Get cluster status
  const { data: status } = trpc.clusters.getStatus.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId }
  )

  // Get namespaces
  const {
    data: namespaces,
    isLoading: namespacesLoading,
    refetch: refetchNamespaces,
    isRefetching: namespacesRefetching,
  } = trpc.clusters.getNamespaces.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId && status?.connected }
  )

  // Get nodes
  const {
    data: nodes,
    isLoading: nodesLoading,
    refetch: refetchNodes,
    isRefetching: nodesRefetching,
  } = trpc.clusters.getNodes.useQuery(
    { clusterName: selectedClusterId! },
    { enabled: !!selectedClusterId && status?.connected }
  )

  // Get pods in selected namespace
  const currentNamespace = selectedNamespace || effectiveDefaultNamespace
  const {
    data: pods,
    isLoading: podsLoading,
    refetch: refetchPods,
    isRefetching: podsRefetching,
  } = trpc.clusters.getPods.useQuery(
    { clusterName: selectedClusterId!, namespace: currentNamespace },
    { enabled: !!selectedClusterId && status?.connected && !!currentNamespace }
  )

  const handleCopy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(field)
    toast.success(`Copied ${field} to clipboard`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (!selectedClusterId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a cluster to view details
      </div>
    )
  }

  if (clusterLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cluster) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Cluster not found
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{cluster.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Kubernetes {cluster.version} in {cluster.region}
            </p>
          </div>
          <div
            className={cn(
              "px-2 py-1 text-xs rounded-full font-medium",
              status?.connected
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-red-500/10 text-red-500"
            )}
          >
            {status?.connected ? "Connected" : "Disconnected"}
          </div>
        </div>

        {/* Connection warning */}
        {!status?.connected && status?.error && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-500">Connection failed</p>
              <p className="text-muted-foreground mt-1">{status.error}</p>
            </div>
          </div>
        )}

        {/* Cluster info */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Cluster Information</h3>

          <div className="space-y-3">
            <InfoRow
              label="ARN"
              value={cluster.arn}
              onCopy={() => handleCopy(cluster.arn, "ARN")}
              copied={copiedField === "ARN"}
            />
            <InfoRow
              label="Region"
              value={cluster.region}
              onCopy={() => handleCopy(cluster.region, "Region")}
              copied={copiedField === "Region"}
            />
            <InfoRow
              label="Endpoint"
              value={cluster.endpoint}
              onCopy={() => handleCopy(cluster.endpoint, "Endpoint")}
              copied={copiedField === "Endpoint"}
            />
            <InfoRow label="Status" value={cluster.status} />
            <InfoRow label="Version" value={cluster.version} />
          </div>
        </div>

        {/* Only show resources if connected */}
        {status?.connected && (
          <>
            {/* Nodes */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Nodes ({nodes?.length || 0})
                </h3>
                <button
                  type="button"
                  onClick={() => refetchNodes()}
                  disabled={nodesRefetching}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <RefreshCw
                    className={cn("h-3 w-3", nodesRefetching && "animate-spin")}
                  />
                </button>
              </div>

              {nodesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : nodes && nodes.length > 0 ? (
                <div className="space-y-2">
                  {nodes.map((node) => (
                    <div
                      key={node.name}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <div>
                        <span className="font-medium">{node.name}</span>
                        <span className="text-muted-foreground ml-2">
                          {node.roles.join(", ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {node.version}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            node.status === "Ready"
                              ? "text-emerald-500"
                              : "text-red-500"
                          )}
                        >
                          {node.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No nodes found</p>
              )}
            </div>

            {/* Namespaces & Pods */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  Pods
                </h3>
                <div className="flex items-center gap-2">
                  <Select
                    value={currentNamespace}
                    onValueChange={(value) => setSelectedNamespace(value)}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Select namespace" />
                    </SelectTrigger>
                    <SelectContent>
                      {namespaces?.map((ns) => (
                        <SelectItem key={ns.name} value={ns.name}>
                          <span className="flex items-center gap-2">
                            {ns.name}
                            {ns.name === effectiveDefaultNamespace && (
                              <span className="text-xs text-muted-foreground">
                                (default)
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => refetchPods()}
                    disabled={podsRefetching}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw
                      className={cn("h-3 w-3", podsRefetching && "animate-spin")}
                    />
                  </button>
                </div>
              </div>

              {podsLoading || namespacesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : pods && pods.length > 0 ? (
                <div className="space-y-2">
                  {pods.slice(0, 20).map((pod) => (
                    <div
                      key={pod.name}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <div className="truncate flex-1 mr-2">
                        <span className="font-medium">{pod.name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {pod.ready}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            pod.status === "Running"
                              ? "text-emerald-500"
                              : pod.status === "Pending"
                              ? "text-amber-500"
                              : "text-red-500"
                          )}
                        >
                          {pod.status}
                        </span>
                        {pod.restarts > 0 && (
                          <span className="text-xs text-amber-500">
                            {pod.restarts} restarts
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {pods.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Showing 20 of {pods.length} pods
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pods found in {currentNamespace}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
