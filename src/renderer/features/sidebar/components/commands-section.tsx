"use client"

import React, { useCallback } from "react"
import { ChevronRight, Trash2, Terminal } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"

interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project"
  path: string
}

interface CommandsSectionProps {
  chatId: string
  projectPath?: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onCommandClick: (command: FileCommand) => void
  onDeleteCommand: (e: React.MouseEvent, command: FileCommand) => void
}

export function CommandsSection({
  chatId,
  projectPath,
  isCollapsed,
  onToggleCollapse,
  onCommandClick,
  onDeleteCommand,
}: CommandsSectionProps) {
  // Query commands
  const { data: commands = [], isLoading } = trpc.commands.list.useQuery(
    { projectPath },
    { refetchInterval: 30000 }
  )

  // Separate by source
  const projectCommands = commands.filter((c) => c.source === "project")
  const userCommands = commands.filter((c) => c.source === "user")

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-background/50">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            aria-label={isCollapsed ? "Expand commands" : "Collapse commands"}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isCollapsed ? "rotate-0" : "rotate-90"
              )}
            />
          </button>
          <span className="text-xs font-medium text-muted-foreground">Commands</span>
        </div>
        <span className="text-xs text-muted-foreground/60">{commands.length}</span>
      </div>

      {/* Commands List */}
      {!isCollapsed && (
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              Loading...
            </div>
          ) : commands.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              No commands found
            </div>
          ) : (
            <>
              {/* Project Commands */}
              {projectCommands.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 px-2 pt-2 pb-1">
                    PROJECT (.claude/commands/)
                  </div>
                  {projectCommands.map((command) => (
                    <button
                      key={command.path}
                      onClick={() => onCommandClick(command)}
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
                          <Terminal className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate block text-sm leading-tight flex-1">
                              /{command.name}
                            </span>
                            <button
                              onClick={(e) => onDeleteCommand(e, command)}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete command"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="text-[11px] text-muted-foreground/60 space-y-0.5">
                            {command.description && (
                              <div className="truncate">{command.description}</div>
                            )}
                            {command.argumentHint && (
                              <div className="truncate font-mono text-[10px]">
                                {command.argumentHint}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* User Commands */}
              {userCommands.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 px-2 pt-2 pb-1">
                    USER (~/.claude/commands/)
                  </div>
                  {userCommands.map((command) => (
                    <button
                      key={command.path}
                      onClick={() => onCommandClick(command)}
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
                          <Terminal className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate block text-sm leading-tight flex-1">
                              /{command.name}
                            </span>
                            <button
                              onClick={(e) => onDeleteCommand(e, command)}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete command"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="text-[11px] text-muted-foreground/60 space-y-0.5">
                            {command.description && (
                              <div className="truncate">{command.description}</div>
                            )}
                            {command.argumentHint && (
                              <div className="truncate font-mono text-[10px]">
                                {command.argumentHint}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
