import { useState, useEffect } from "react"
import { useAtomValue } from "jotai"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { selectedProjectAtom } from "../../../features/agents/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { SkillIcon } from "../../ui/icons"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsSkillsTab() {
  const isNarrowScreen = useIsNarrowScreen()
  const [expandedSkillName, setExpandedSkillName] = useState<string | null>(null)
  const selectedProject = useAtomValue(selectedProjectAtom)

  const { data: skills = [], isLoading } = trpc.skills.list.useQuery(
    selectedProject?.path ? { cwd: selectedProject.path } : undefined,
  )
  const openInFinderMutation = trpc.external.openInFinder.useMutation()

  const userSkills = skills.filter((s) => s.source === "user")
  const projectSkills = skills.filter((s) => s.source === "project")

  const handleExpandSkill = (skillName: string) => {
    setExpandedSkillName(expandedSkillName === skillName ? null : skillName)
  }

  const handleOpenInFinder = (path: string) => {
    openInFinderMutation.mutate(path)
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
      {/* Header - hidden on narrow screens */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Skills</h3>
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
              Beta
            </span>
          </div>
          <a
            href="https://code.claude.com/docs/en/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Documentation
          </a>
        </div>
      )}

      {/* Skills List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-background rounded-lg border border-border p-4 text-sm text-muted-foreground text-center">
            Loading skills...
          </div>
        ) : skills.length === 0 ? (
          <div className="bg-background rounded-lg border border-border p-6 text-center">
            <SkillIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              No skills found
            </p>
            <p className="text-xs text-muted-foreground">
              Add skills to <code className="px-1 py-0.5 bg-muted rounded">~/.claude/skills/</code> or <code className="px-1 py-0.5 bg-muted rounded">.claude/skills/</code>
            </p>
          </div>
        ) : (
          <>
            {/* User Skills */}
            {userSkills.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  ~/.claude/skills/
                </div>
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                  <div className="divide-y divide-border">
                    {userSkills.map((skill) => (
                      <SkillRow
                        key={skill.name}
                        skill={skill}
                        isExpanded={expandedSkillName === skill.name}
                        onToggle={() => handleExpandSkill(skill.name)}
                        onOpenInFinder={() => handleOpenInFinder(skill.path)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Project Skills */}
            {projectSkills.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  .claude/skills/
                </div>
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                  <div className="divide-y divide-border">
                    {projectSkills.map((skill) => (
                      <SkillRow
                        key={skill.name}
                        skill={skill}
                        isExpanded={expandedSkillName === skill.name}
                        onToggle={() => handleExpandSkill(skill.name)}
                        onOpenInFinder={() => handleOpenInFinder(skill.path)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Section */}
      <div className="pt-4 border-t border-border space-y-3">
        <div>
          <h4 className="text-xs font-medium text-foreground mb-1.5">
            How to use Skills
          </h4>
          <p className="text-xs text-muted-foreground">
            Mention a skill in chat with <code className="px-1 py-0.5 bg-muted rounded">@skill-name</code> or ask Claude to use it directly.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-medium text-foreground mb-1.5">
            Creating Skills
          </h4>
          <p className="text-xs text-muted-foreground">
            Create a folder with a <code className="px-1 py-0.5 bg-muted rounded">SKILL.md</code> file in <code className="px-1 py-0.5 bg-muted rounded">~/.claude/skills/your-skill/</code>
          </p>
        </div>
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  isExpanded,
  onToggle,
  onOpenInFinder,
}: {
  skill: { name: string; description: string; source: "user" | "project"; path: string }
  isExpanded: boolean
  onToggle: () => void
  onOpenInFinder: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
            isExpanded && "rotate-90",
          )}
        />
        <div className="flex flex-col space-y-0.5 min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">
            {skill.name}
          </span>
          {skill.description && (
            <span className="text-xs text-muted-foreground truncate">
              {skill.description}
            </span>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-border bg-muted/20">
              <div className="pt-3 space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Path</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenInFinder()
                    }}
                    className="block text-xs text-muted-foreground font-mono mt-0.5 break-all text-left hover:text-foreground hover:underline transition-colors cursor-pointer"
                  >
                    {skill.path}
                  </button>
                </div>
                <div>
                  <span className="text-xs font-medium text-foreground">Usage</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Type <code className="px-1 py-0.5 bg-muted rounded">@{skill.name}</code> in chat or ask Claude to use the {skill.name} skill.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
