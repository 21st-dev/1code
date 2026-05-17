import { cn } from "../../../lib/utils"
import { useI18n, type TranslationKey } from "../../../lib/i18n"

export const AVAILABLE_TOOLS = [
  // File Operations
  { id: "Read", nameKey: "settings.toolSelector.tools.read.name", category: "file", descriptionKey: "settings.toolSelector.tools.read.description" },
  { id: "Write", nameKey: "settings.toolSelector.tools.write.name", category: "file", descriptionKey: "settings.toolSelector.tools.write.description" },
  { id: "Edit", nameKey: "settings.toolSelector.tools.edit.name", category: "file", descriptionKey: "settings.toolSelector.tools.edit.description" },
  { id: "Glob", nameKey: "settings.toolSelector.tools.glob.name", category: "file", descriptionKey: "settings.toolSelector.tools.glob.description" },
  { id: "Grep", nameKey: "settings.toolSelector.tools.grep.name", category: "file", descriptionKey: "settings.toolSelector.tools.grep.description" },
  { id: "NotebookEdit", nameKey: "settings.toolSelector.tools.notebookEdit.name", category: "file", descriptionKey: "settings.toolSelector.tools.notebookEdit.description" },

  // System
  { id: "Bash", nameKey: "settings.toolSelector.tools.bash.name", category: "system", descriptionKey: "settings.toolSelector.tools.bash.description" },
  { id: "Task", nameKey: "settings.toolSelector.tools.task.name", category: "system", descriptionKey: "settings.toolSelector.tools.task.description" },

  // Web
  { id: "WebSearch", nameKey: "settings.toolSelector.tools.webSearch.name", category: "web", descriptionKey: "settings.toolSelector.tools.webSearch.description" },
  { id: "WebFetch", nameKey: "settings.toolSelector.tools.webFetch.name", category: "web", descriptionKey: "settings.toolSelector.tools.webFetch.description" },

  // Planning & Interaction
  { id: "TodoWrite", nameKey: "settings.toolSelector.tools.todoWrite.name", category: "planning", descriptionKey: "settings.toolSelector.tools.todoWrite.description" },
  { id: "AskUserQuestion", nameKey: "settings.toolSelector.tools.askUserQuestion.name", category: "planning", descriptionKey: "settings.toolSelector.tools.askUserQuestion.description" },
] satisfies Array<{
  id: string
  nameKey: TranslationKey
  category: string
  descriptionKey: TranslationKey
}>

const CATEGORIES = [
  { id: "file", nameKey: "settings.toolSelector.categories.file" },
  { id: "system", nameKey: "settings.toolSelector.categories.system" },
  { id: "web", nameKey: "settings.toolSelector.categories.web" },
  { id: "planning", nameKey: "settings.toolSelector.categories.planning" },
] satisfies Array<{
  id: string
  nameKey: TranslationKey
}>

interface ToolSelectorProps {
  selectedTools: string[]
  onChange: (tools: string[]) => void
  mode: "allowlist" | "denylist"
}

export function ToolSelector({ selectedTools, onChange, mode }: ToolSelectorProps) {
  const { t } = useI18n()

  const handleToggle = (toolId: string) => {
    if (selectedTools.includes(toolId)) {
      onChange(selectedTools.filter((t) => t !== toolId))
    } else {
      onChange([...selectedTools, toolId])
    }
  }

  const handleSelectAll = () => {
    onChange(AVAILABLE_TOOLS.map((t) => t.id))
  }

  const handleSelectNone = () => {
    onChange([])
  }

  return (
    <div className="space-y-3">
      {/* Quick actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSelectAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("settings.toolSelector.selectAll")}
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          onClick={handleSelectNone}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("settings.toolSelector.clear")}
        </button>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {t("settings.toolSelector.selectedCount", { count: selectedTools.length })}
        </span>
      </div>

      {/* Tools by category */}
      <div className="space-y-4 p-3 rounded-lg border border-border bg-muted/20">
        {CATEGORIES.map((category) => {
          const categoryTools = AVAILABLE_TOOLS.filter((t) => t.category === category.id)
          if (categoryTools.length === 0) return null

          return (
            <div key={category.id} className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t(category.nameKey)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {categoryTools.map((tool) => {
                  const isSelected = selectedTools.includes(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleToggle(tool.id)}
                      className={cn(
                        "flex items-start gap-2 p-2 rounded-md border text-left transition-colors",
                        isSelected
                          ? mode === "allowlist"
                            ? "border-green-500/30 bg-green-500/10"
                            : "border-red-500/30 bg-red-500/10"
                          : "border-transparent bg-background hover:bg-foreground/5"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0",
                          isSelected
                            ? mode === "allowlist"
                              ? "border-green-500 bg-green-500"
                              : "border-red-500 bg-red-500"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="h-2.5 w-2.5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {t(tool.nameKey)}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {t(tool.descriptionKey)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground">
        {mode === "allowlist"
          ? t("settings.toolSelector.allowlistHint")
          : t("settings.toolSelector.denylistHint")}
      </p>
    </div>
  )
}
