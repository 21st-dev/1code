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
      toast.success("Server added", { description: data.name })
      onOpenChange(false)
      onServerAdded?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add server"
      toast.error("Failed to add server", { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Configure a new MCP server connection.
          </DialogDescription>
        </DialogHeader>
        <McpServerForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
          submitLabel="Add Server"
        />
      </DialogContent>
    </Dialog>
  )
}
