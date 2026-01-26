"use client"

import { useAtom } from "jotai"
import { Shield, Terminal, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  mcpApprovalDialogOpenAtom,
  pendingMcpApprovalsAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { IconSpinner } from "../ui/icons"

export function McpApprovalDialog() {
  const [open, setOpen] = useAtom(mcpApprovalDialogOpenAtom)
  const [pendingApprovals, setPendingApprovals] = useAtom(pendingMcpApprovalsAtom)
  const [isApproving, setIsApproving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const utils = trpc.useUtils()
  const approveServerMutation = trpc.claudeSettings.approvePluginMcpServer.useMutation()
  const approveAllMutation = trpc.claudeSettings.approveAllPluginMcpServers.useMutation()

  const currentApproval = pendingApprovals[currentIndex]
  const hasMore = currentIndex < pendingApprovals.length - 1

  // Group approvals by plugin source for "Allow All" feature
  const currentPluginApprovals = currentApproval
    ? pendingApprovals.filter(a => a.pluginSource === currentApproval.pluginSource)
    : []
  const hasMultipleFromSamePlugin = currentPluginApprovals.length > 1

  const handleAllow = async () => {
    if (!currentApproval) return
    setIsApproving(true)
    try {
      await approveServerMutation.mutateAsync({ identifier: currentApproval.identifier })
      // Invalidate queries
      utils.claudeSettings.getApprovedPluginMcpServers.invalidate()
      utils.claude.getPendingPluginMcpApprovals.invalidate()
      utils.claude.getAllMcpConfig.invalidate()

      // Move to next or close
      if (hasMore) {
        setCurrentIndex(currentIndex + 1)
      } else {
        setOpen(false)
        setPendingApprovals([])
        setCurrentIndex(0)
      }
    } catch (error) {
      console.error("Failed to approve MCP server:", error)
      toast.error("Failed to approve MCP server", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handleAllowAll = async () => {
    if (!currentApproval) return
    setIsApproving(true)
    try {
      const serverNames = currentPluginApprovals.map(a => a.serverName)
      await approveAllMutation.mutateAsync({
        pluginSource: currentApproval.pluginSource,
        serverNames,
      })
      // Invalidate queries
      utils.claudeSettings.getApprovedPluginMcpServers.invalidate()
      utils.claude.getPendingPluginMcpApprovals.invalidate()
      utils.claude.getAllMcpConfig.invalidate()

      // Remove all from same plugin and move to next
      const remaining = pendingApprovals.filter(a => a.pluginSource !== currentApproval.pluginSource)
      if (remaining.length > 0) {
        setPendingApprovals(remaining)
        setCurrentIndex(0)
      } else {
        setOpen(false)
        setPendingApprovals([])
        setCurrentIndex(0)
      }
    } catch (error) {
      console.error("Failed to approve all MCP servers:", error)
      toast.error("Failed to approve MCP servers", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsApproving(false)
    }
  }

  const handleDeny = () => {
    // Skip this approval without approving
    if (hasMore) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setOpen(false)
      setPendingApprovals([])
      setCurrentIndex(0)
    }
  }

  const handleClose = () => {
    setOpen(false)
    // Keep pending approvals - they'll be shown again next time
    setCurrentIndex(0)
  }

  if (!currentApproval) return null

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="w-[480px]">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100 flex items-center justify-center"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <AlertDialogTitle>MCP Server Approval</AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                A plugin wants to run an MCP server
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogBody className="space-y-4">
          {/* Progress indicator */}
          {pendingApprovals.length > 1 && (
            <div className="text-xs text-muted-foreground">
              {currentIndex + 1} of {pendingApprovals.length} servers
            </div>
          )}

          {/* Server details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Plugin</div>
              <div className="text-sm font-medium">{currentApproval.pluginName}</div>
              <div className="text-xs text-muted-foreground font-mono">{currentApproval.pluginSource}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">MCP Server</div>
              <div className="text-sm font-medium">{currentApproval.serverName}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Command</div>
              <div className="bg-background rounded border border-border p-2 font-mono text-xs flex items-start gap-2">
                <Terminal className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="break-all">
                  {currentApproval.command}
                  {currentApproval.args.length > 0 && (
                    <span className="text-muted-foreground"> {currentApproval.args.join(" ")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Security note */}
          <p className="text-xs text-muted-foreground">
            MCP servers can execute commands on your system. Only approve servers from plugins you trust.
          </p>
        </AlertDialogBody>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDeny}
            disabled={isApproving}
            className="sm:mr-auto"
          >
            Don't Allow
          </Button>
          <div className="flex gap-2">
            {hasMultipleFromSamePlugin && (
              <Button
                variant="secondary"
                onClick={handleAllowAll}
                disabled={isApproving}
              >
                {isApproving ? (
                  <IconSpinner className="h-4 w-4" />
                ) : (
                  `Allow All (${currentPluginApprovals.length})`
                )}
              </Button>
            )}
            <Button onClick={handleAllow} disabled={isApproving}>
              {isApproving ? <IconSpinner className="h-4 w-4" /> : "Allow"}
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
