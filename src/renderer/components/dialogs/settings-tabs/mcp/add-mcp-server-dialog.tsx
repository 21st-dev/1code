"use client"

import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../ui/dialog"
import { trpc } from "../../../../lib/trpc"
import { McpServerForm } from "./mcp-server-form"
import type { McpServerFormData } from "./types"

interface AddMcpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AddMcpServerDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddMcpServerDialogProps) {
  const addMutation = trpc.claude.addMcpServer.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("MCP server added")
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error || "Failed to add server")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add server")
    },
  })

  const handleSubmit = (data: McpServerFormData) => {
    addMutation.mutate({
      name: data.name,
      scope: data.scope,
      projectPath: data.projectPath,
      transport: data.transport,
      command: data.command,
      args: data.args,
      env: data.env,
      url: data.url,
      authType: data.authType,
      bearerToken: data.bearerToken,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
        </DialogHeader>
        <McpServerForm
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={addMutation.isPending}
          submitLabel="Add Server"
        />
      </DialogContent>
    </Dialog>
  )
}
