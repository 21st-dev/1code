"use client"

import { Button } from "../../../components/ui/button"
import { AlignJustify, PanelRightClose, PanelRightOpen } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "../../../components/ui/tooltip"
import { Kbd } from "../../../components/ui/kbd"

interface AgentsHeaderControlsProps {
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  hasUnseenChanges?: boolean
  isSubChatsSidebarOpen?: boolean
  isRightPanelOpen?: boolean
  onToggleRightPanel?: () => void
}

export function AgentsHeaderControls({
  isSidebarOpen,
  onToggleSidebar,
  hasUnseenChanges = false,
  isSubChatsSidebarOpen = false,
  isRightPanelOpen = false,
  onToggleRightPanel,
}: AgentsHeaderControlsProps) {
  // Only show open button for left sidebar when both sidebars are closed
  // But always show right panel toggle if onToggleRightPanel is provided
  // if (isSidebarOpen || isSubChatsSidebarOpen) return null


  return (
    <TooltipProvider>
      <Tooltip delayDuration={500}>
        {(!isSidebarOpen && !isSubChatsSidebarOpen) && (
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md relative"
              aria-label="Open sidebar"
            >
              <AlignJustify className="h-4 w-4" />
              {/* Unseen changes indicator */}
              {hasUnseenChanges && (
                <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#307BD0] ring-2 ring-background" />
              )}
            </Button>
          </TooltipTrigger>
        )}
        <TooltipContent>
          Open sidebar
          <Kbd>⌘\</Kbd>
        </TooltipContent>
      </Tooltip>

      {/* Right Panel Toggle */}
      {onToggleRightPanel && (
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleRightPanel}
              className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
              aria-label={isRightPanelOpen ? "Close activity panel" : "Open activity panel"}
            >
              {isRightPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isRightPanelOpen ? "Close activity panel" : "Open activity panel"}
            <Kbd>⌘⇧P</Kbd>
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  )
}
