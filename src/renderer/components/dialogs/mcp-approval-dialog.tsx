"use client"

import { useAtom } from "jotai"
import { Shield } from "lucide-react"
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
import { trpc } from "../../lib/trpc"
import { toast } from "sonner"
import {
  mcpApprovalDialogOpenAtom,
  pendingMcpApprovalsAtom,
} from "../../lib/atoms"
import { useI18n } from "../../lib/i18n"

export function McpApprovalDialog() {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useAtom(mcpApprovalDialogOpenAtom)
  const [pendingApprovals, setPendingApprovals] = useAtom(
    pendingMcpApprovalsAtom,
  )

  const approveMutation =
    trpc.claudeSettings.approvePluginMcpServer.useMutation()
  const approveAllMutation =
    trpc.claudeSettings.approveAllPluginMcpServers.useMutation()

  const currentApproval = pendingApprovals[0]

  const handleAllow = async () => {
    if (!currentApproval) return

    try {
      await approveMutation.mutateAsync({
        identifier: currentApproval.identifier,
      })
      toast.success(t("mcpApproval.toast.serverApproved"), {
        description: currentApproval.serverName,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("mcpApproval.toast.failedToApprove")
      toast.error(message)
    }

    advance()
  }

  const handleAllowAll = async () => {
    if (!currentApproval) return

    // Approve all pending from the same plugin
    const samePlugin = pendingApprovals.filter(
      (a) => a.pluginSource === currentApproval.pluginSource,
    )

    try {
      await approveAllMutation.mutateAsync({
        pluginSource: currentApproval.pluginSource,
        serverNames: samePlugin.map((a) => a.serverName),
      })
      toast.success(t("mcpApproval.toast.allServersApproved"), {
        description: t("mcpApproval.toast.serversFromPlugin", {
          count: samePlugin.length,
          plugin: currentApproval.pluginSource,
        }),
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("mcpApproval.toast.failedToApprove")
      toast.error(message)
    }

    // Remove all from same plugin
    const remaining = pendingApprovals.filter(
      (a) => a.pluginSource !== currentApproval.pluginSource,
    )
    setPendingApprovals(remaining)
    if (remaining.length === 0) {
      setIsOpen(false)
    }
  }

  const handleDeny = () => {
    advance()
  }

  const advance = () => {
    const remaining = pendingApprovals.slice(1)
    setPendingApprovals(remaining)
    if (remaining.length === 0) {
      setIsOpen(false)
    }
  }

  if (!currentApproval) return null

  const config = currentApproval.config
  const url = config.url as string | undefined
  const command = config.command as string | undefined
  const args = config.args as string[] | undefined

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/10">
              <Shield className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <AlertDialogTitle>{t("mcpApproval.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("mcpApproval.description")}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogBody>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex gap-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">
                  {t("common.plugin")}
                </span>
                <span className="text-xs text-foreground font-medium">
                  {currentApproval.pluginSource}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">
                  {t("mcpApproval.server")}
                </span>
                <span className="text-xs text-foreground font-mono">
                  {currentApproval.serverName}
                </span>
              </div>
              {command && (
                <div className="flex gap-2">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">
                    {t("settings.mcp.command")}
                  </span>
                  <span className="text-xs text-foreground font-mono break-all">
                    {command}
                    {args && args.length > 0 ? ` ${args.join(" ")}` : ""}
                  </span>
                </div>
              )}
              {url && (
                <div className="flex gap-2">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">
                    URL
                  </span>
                  <span className="text-xs text-foreground font-mono break-all">
                    {url}
                  </span>
                </div>
              )}
            </div>

            {pendingApprovals.length > 1 && (
              <p className="text-[11px] text-muted-foreground text-center">
                {pendingApprovals.length - 1 === 1
                  ? t("mcpApproval.oneMorePending")
                  : t("mcpApproval.morePending", {
                      count: pendingApprovals.length - 1,
                    })}
              </p>
            )}
          </div>
        </AlertDialogBody>

        <AlertDialogFooter>
          <Button variant="ghost" size="sm" onClick={handleDeny}>
            {t("mcpApproval.dontAllow")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleAllowAll}>
            {t("mcpApproval.allowAll")}
          </Button>
          <Button size="sm" onClick={handleAllow}>
            {t("mcpApproval.allow")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
