/**
 * SpecKit Sidebar Component
 *
 * Right sidebar drawer for SpecKit workflow management.
 * Opens when the SpecKit button is clicked in the toolbar.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconDoubleChevronRight } from "@/components/ui/icons"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { atomWithStorage } from "jotai/utils"
import { PlanPage } from "./plan-page"

// Sidebar width atom (persisted)
export const speckitSidebarWidthAtom = atomWithStorage<number>(
  "speckit:sidebarWidth",
  400,
  undefined,
  { getOnInit: true }
)

interface SpecKitSidebarProps {
  /** Whether the sidebar is open */
  isOpen: boolean
  /** Callback when sidebar should close */
  onClose: () => void
  /** Chat/workspace ID */
  chatId?: string
  /** Project path */
  projectPath?: string | null
}

/**
 * SpecKitSidebar - Right drawer containing the SpecKit workflow page
 */
export const SpecKitSidebar = memo(function SpecKitSidebar({
  isOpen,
  onClose,
  chatId,
  projectPath,
}: SpecKitSidebarProps) {
  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={onClose}
      widthAtom={speckitSidebarWidthAtom}
      side="right"
      minWidth={350}
      maxWidth={600}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-tl-background border-l"
      style={{ borderLeftWidth: "0.5px" }}
    >
      <div className="flex flex-col h-full">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-3 h-10 bg-tl-background flex-shrink-0 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                  aria-label="Close SpecKit"
                >
                  <IconDoubleChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close SpecKit</TooltipContent>
            </Tooltip>
            <span className="text-sm font-medium">SpecKit</span>
          </div>
        </div>

        {/* Plan Page Content */}
        <div className="flex-1 overflow-hidden">
          <PlanPage
            chatId={chatId}
            projectPath={projectPath || undefined}
            onClose={onClose}
          />
        </div>
      </div>
    </ResizableSidebar>
  )
})

SpecKitSidebar.displayName = "SpecKitSidebar"
