"use client"

import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../ui/alert-dialog"
import { trpc } from "../../../../lib/trpc"
import type { McpServer, ScopeType } from "./types"

interface DeleteServerConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server: McpServer | null
  scope: ScopeType
  projectPath: string | null
  onSuccess?: () => void
}

export function DeleteServerConfirm({
  open,
  onOpenChange,
  server,
  scope,
  projectPath,
  onSuccess,
}: DeleteServerConfirmProps) {
  const removeMutation = trpc.claude.removeMcpServer.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Removed "${server?.name}"`)
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error || "Failed to remove server")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove server")
    },
  })

  const handleDelete = () => {
    if (!server) return
    removeMutation.mutate({
      name: server.name,
      scope,
      projectPath: projectPath || undefined,
    })
  }

  if (!server) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove MCP Server</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody>
          <AlertDialogDescription>
            Are you sure you want to remove <strong>{server.name}</strong>? This will
            delete the server configuration from your settings.
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={removeMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {removeMutation.isPending ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
