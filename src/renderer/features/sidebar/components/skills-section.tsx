"use client"

import React, { useCallback } from "react"
import { ChevronRight, Trash2 } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { toast } from "sonner"
import { SkillIcon } from "../../../components/ui/icons"

interface FileSkill {
  name: string
  description: string
  source: "user" | "project"
  path: string
}

interface SkillsSectionProps {
  chatId: string
  projectPath?: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSkillClick: (skill: FileSkill) => void
  onDeleteSkill: (e: React.MouseEvent, skill: FileSkill) => void
}

export function SkillsSection({
  chatId,
  projectPath,
  isCollapsed,
  onToggleCollapse,
  onSkillClick,
  onDeleteSkill,
}: SkillsSectionProps) {
  // Query skills
  const { data: skills = [], isLoading } = trpc.skills.listEnabled.useQuery(
    { cwd: projectPath },
    { refetchInterval: 30000 }
  )

  // Separate by source
  const projectSkills = skills.filter((s) => s.source === "project")
  const userSkills = skills.filter((s) => s.source === "user")

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-background/50">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            aria-label={isCollapsed ? "Expand skills" : "Collapse skills"}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isCollapsed ? "rotate-0" : "rotate-90"
              )}
            />
          </button>
          <span className="text-xs font-medium text-muted-foreground">Skills</span>
        </div>
        <span className="text-xs text-muted-foreground/60">{skills.length}</span>
      </div>

      {/* Skills List */}
      {!isCollapsed && (
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              Loading...
            </div>
          ) : skills.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 text-center py-4">
              No skills found
            </div>
          ) : (
            <>
              {/* Project Skills */}
              {projectSkills.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 px-2 pt-2 pb-1">
                    PROJECT (.claude/skills/)
                  </div>
                  {projectSkills.map((skill) => (
                    <button
                      key={skill.path}
                      onClick={() => onSkillClick(skill)}
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
                          <SkillIcon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate block text-sm leading-tight flex-1">
                              {skill.name}
                            </span>
                            <button
                              onClick={(e) => onDeleteSkill(e, skill)}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete skill"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {skill.description && (
                            <div className="text-[11px] text-muted-foreground/60 truncate">
                              {skill.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* User Skills */}
              {userSkills.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 px-2 pt-2 pb-1">
                    USER (~/.claude/skills/)
                  </div>
                  {userSkills.map((skill) => (
                    <button
                      key={skill.path}
                      onClick={() => onSkillClick(skill)}
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
                          <SkillIcon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate block text-sm leading-tight flex-1">
                              {skill.name}
                            </span>
                            <button
                              onClick={(e) => onDeleteSkill(e, skill)}
                              tabIndex={-1}
                              className="flex-shrink-0 text-muted-foreground hover:text-destructive active:text-destructive transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                              aria-label="Delete skill"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {skill.description && (
                            <div className="text-[11px] text-muted-foreground/60 truncate">
                              {skill.description}
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
