import { FileText, ListTodo } from "lucide-react"
import { Button } from "./button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { cn } from "../../lib/utils"
import { RIGHT_ACTION_BAR_WIDTH, type RightSidebarPanel } from "../../lib/atoms/right-sidebar"

interface RightActionBarProps {
  activePanel: RightSidebarPanel
  onPanelChange: (panel: RightSidebarPanel) => void
}

export function RightActionBar({ activePanel, onPanelChange }: RightActionBarProps) {
  const handleClick = (panel: "documents" | "tasks") => {
    // Toggle: if already open, close it; otherwise open it
    onPanelChange(activePanel === panel ? null : panel)
  }

  return (
    <div
      className="flex flex-col justify-end items-center py-2 gap-1 border-l bg-background"
      style={{ width: RIGHT_ACTION_BAR_WIDTH, minWidth: RIGHT_ACTION_BAR_WIDTH, borderLeftWidth: "0.5px" }}
    >
      {/* Icons start from bottom */}
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleClick("tasks")}
            className={cn(
              "h-8 w-8 rounded-md",
              activePanel === "tasks" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListTodo className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Tasks</TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleClick("documents")}
            className={cn(
              "h-8 w-8 rounded-md",
              activePanel === "documents" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Documents</TooltipContent>
      </Tooltip>
    </div>
  )
}
