import { useAtom } from "jotai"
import { ActivityFeed } from "../activity/activity-feed"
import { DevTerminal } from "./dev-terminal"
import {
    rightPanelOpenAtom,
} from "./atoms"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "../../lib/utils"
import { ChevronLeft } from "lucide-react"

interface RightPanelProps {
    projectId?: string
    projectPath?: string
}

export function RightPanel({ projectId, projectPath }: RightPanelProps) {
    const [isOpen, setIsOpen] = useAtom(rightPanelOpenAtom)

    return (
        <>
            <Sheet open={isOpen} onOpenChange={setIsOpen} modal={false}>
                {/*
        SheetContent is usually wrapped in SheetPortal inside shadcn component,
        but we want custom behaviors (like non-modal interaction if needed).
        However, default Sheet behavior with 'modal={false}' allows interaction with background but
        standard Sheet behavior puts overlay.

        If we want it to be "over the content" but might obscure it, Sheet is correct.
        "Drawer that goes over the content" usually implies overlay.
      */}
                <SheetContent
                    side="right"
                    className="w-[400px] sm:max-w-[800px] p-0 flex flex-col gap-0 border-l border-border/50 bg-background shadow-xl"
                    disableOverlayClickClose={true} // Custom prop we added to prevent accidental closing if we want, or remove if standard behavior is desired.
                    // Actually for "drawer" usually people want click-outside to close.
                    // But if it's a "panel", maybe not.
                    // Let's stick to standard behavior first.
                    hideClose={true}
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <div className="flex flex-col h-full w-full overflow-hidden relative">

                        {/* Top: Activity Feed */}
                        <div className="flex-1 min-h-0 overflow-hidden">
                            {/* ActivityFeed component usually has its own header/padding.
                 We might need to adjust padding here if it looks crowded.
                 But ActivityFeed has 'p-4' internally usually.
              */}
                            <ActivityFeed className="w-full border-none h-full" />
                        </div>

                        {/* Bottom: Dev Terminal */}
                        {projectId && projectPath && (
                            <div className="h-[350px] min-h-[200px] border-t border-border/50 flex flex-col shrink-0">
                                <DevTerminal projectId={projectId} projectPath={projectPath} />
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Side Toggle Button (Visible when closed) */}
            {!isOpen && (
                <div
                    className="fixed right-0 top-1/2 -translate-y-1/2 z-40 cursor-pointer group"
                    onClick={() => setIsOpen(true)}
                >
                    <div className="bg-background border border-r-0 border-border/60 shadow-md rounded-l-md px-1 py-4 flex items-center justify-center transition-transform duration-200 translate-x-1 group-hover:translate-x-0">
                        <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                    </div>
                </div>
            )}
        </>
    )
}
