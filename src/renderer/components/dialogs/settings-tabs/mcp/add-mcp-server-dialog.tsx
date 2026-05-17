import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../ui/dialog"
import { McpServerForm } from "./mcp-server-form"
import { trpc } from "../../../../lib/trpc"
import { useI18n } from "../../../../lib/i18n"
import { toast } from "sonner"
import type { McpServerFormData } from "./types"

interface AddMcpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onServerAdded?: () => void
}

export function AddMcpServerDialog({
  open,
  onOpenChange,
  onServerAdded,
}: AddMcpServerDialogProps) {
  const { t } = useI18n()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const addServerMutation = trpc.claude.addMcpServer.useMutation()

  const handleSubmit = async (data: McpServerFormData) => {
    setIsSubmitting(true)
    try {
      await addServerMutation.mutateAsync({
        name: data.name,
        transport: data.transport,
        scope: data.scope,
        command: data.command,
        args: data.args,
        url: data.url,
        projectPath: data.scope === "project" ? data.projectPath : undefined,
      })
      toast.success(t("settings.mcp.toast.serverAdded"), { description: data.name })
      onOpenChange(false)
      onServerAdded?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("settings.mcp.toast.failedToAddServer")
      toast.error(t("settings.mcp.toast.failedToAddServer"), { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.mcp.addServer")}</DialogTitle>
          <DialogDescription>
            {t("settings.mcp.addServerDescription")}
          </DialogDescription>
        </DialogHeader>
        <McpServerForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
          submitLabel={t("settings.mcp.addServer")}
        />
      </DialogContent>
    </Dialog>
  )
}
