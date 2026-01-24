"use client"

import React, { useCallback } from "react"
import { ChevronRight, Trash2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { AgentIcon } from "../../../components/ui/icons"

interface FileAgent {
  name: string
  description: string
  source: "user" | "project"
  path: string
}

interface AgentsSectionProps {
  chatId: string
  projectPath?: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onAgentClick: (agent: FileAgent) => void
  onDeleteAgent: (e: React.MouseEvent, agent: FileAgent) => void
}

export function AgentsSection({
  chatId,
  projectPath,
  isCollapsed,
  onToggleCollapse,
  onAgentClick,
  onDeleteAgent,
}: AgentsSectionProps) {
  // Query agents
  const { data: agents = [], isLoading } = trpc.agents.listEnabled.useQuery(
    { cwd: projectPath },
    { refetchInterval: 30000 }
  )

  // Separate by source
  const projectAgents = agents.filter((a) => a.source === "project")
  const userAgents = agents.filter((a) => a.source === "user")

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-background/50">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            aria-label={isCollapsed ? "Expand agents" : "Collapse agents"}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isCollapsed ? "rotate-0" : "rotate-90"
              )}
            />
          </button>
          <span className="text-xs font-medium text-muted-foreground">Agents</span>
        </div>
        <span className="text-xs text-muted-foreground/60">{agents.length}</span>
      </div>

      {/* Agents List */}
      {!isCollapsed && (
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              Loading...
            </div>
          ) : agents.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              No agents found
            </div>
          ) : (
            <>
              {/* Project Agents */}
              {projectAgents.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 px-2 pt-2 pb-1">
                    PROJECT (.claude/agents/)
                  </div>
                  {projectAgents.map((agent) => (
                    <button
                      key={agent.path}
                      onClick={() => onAgentClick(agent)}
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
                          <AgentIcon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate block text-sm leading-tight flex-1">
                              {agent.name}
                            </span>
                            <button
                              onClick={(e) => onDeleteAgent(e, agent)}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete agent"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {agent.description && (
                            <div className="text-[11px] text-muted-foreground/60 truncate">
                              {agent.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* User Agents */}
              {userAgents.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 px-2 pt-2 pb-1">
                    USER (~/.claude/agents/)
                  </div>
                  {userAgents.map((agent) => (
                    <button
                      key={agent.path}
                      onClick={() => onAgentClick(agent)}
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
                          <AgentIcon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate block text-sm leading-tight flex-1">
                              {agent.name}
                            </span>
                            <button
                              onClick={(e) => onDeleteAgent(e, agent)}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete agent"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {agent.description && (
                            <div className="text-[11px] text-muted-foreground/60 truncate">
                              {agent.description}
                            </div>
                          )}
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
