"use client"

import React, { useCallback } from "react"
import { ChevronRight, Trash2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { ClockIcon } from "../../../components/ui/icons"
import { formatTimeAgo } from "../../agents/utils/format-time-ago"

interface SavedChatStatesProps {
  chatId: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onForkSavedState: (savedStateId: string) => void
}

export function SavedChatStates({
  chatId,
  isCollapsed,
  onToggleCollapse,
  onForkSavedState,
}: SavedChatStatesProps) {
  // Query saved chat states
  const { data: savedStates = [], refetch } = trpc.chats.listSavedChatStates.useQuery(
    { chatId },
    { refetchInterval: 5000 }
  )

  // Delete mutation
  const deleteSavedStateMutation = trpc.chats.deleteSavedChatState.useMutation({
    onSuccess: () => {
      toast.success("Saved chat state deleted")
      refetch()
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`)
    },
  })

  const handleDelete = useCallback(
    (e: React.MouseEvent, savedStateId: string) => {
      e.stopPropagation()
      deleteSavedStateMutation.mutate({ subChatId: savedStateId })
    },
    [deleteSavedStateMutation]
  )

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-background/50">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            aria-label={
              isCollapsed ? "Expand saved chat states" : "Collapse saved chat states"
            }
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isCollapsed ? "rotate-0" : "rotate-90"
              )}
            />
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            Saved Chat States
          </span>
        </div>
        <span className="text-xs text-muted-foreground/60">{savedStates.length}</span>
      </div>

      {/* Saved States List */}
      {!isCollapsed && (
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {savedStates.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              No saved states yet
            </div>
          ) : (
            savedStates.map((state) => (
              <button
                key={state.id}
                onClick={() => onForkSavedState(state.id)}
                className={cn(
                  "w-full text-left py-1.5 transition-colors duration-75 cursor-pointer group relative",
                  "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
                  "pl-2 pr-2 rounded-md",
                  "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                <div className="flex items-start gap-2.5">
                  {/* Icon container */}
                  <div className="pt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center relative">
                    <ClockIcon className="w-4 h-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className="truncate block text-sm leading-tight flex-1">
                        {state.name || "Saved State"}
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, state.id)}
                        tabIndex={-1}
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                        aria-label="Delete saved state"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 min-w-0">
                      <span className="truncate flex-1 min-w-0">
                        {formatTimeAgo(new Date(state.createdAt))}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
