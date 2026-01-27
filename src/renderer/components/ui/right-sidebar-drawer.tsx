import { ResizableSidebar } from "./resizable-sidebar"
import { rightSidebarDrawerWidthAtom, type RightSidebarPanel } from "../../lib/atoms/right-sidebar"
import { WorkspaceDocumentViewer } from "../../features/workspace-files"
import { TasksPage } from "../../features/tasks/tasks-page"

interface RightSidebarDrawerProps {
  activePanel: RightSidebarPanel
  onClose: () => void
  chatId: string
  subChatId: string | null
}

export function RightSidebarDrawer({
  activePanel,
  onClose,
  chatId,
  subChatId
}: RightSidebarDrawerProps) {
  return (
    <ResizableSidebar
      isOpen={activePanel !== null}
      onClose={onClose}
      widthAtom={rightSidebarDrawerWidthAtom}
      minWidth={300}
      maxWidth={800}
      side="right"
      animationDuration={100}
      showResizeTooltip={true}
      className="overflow-hidden bg-background border-l"
      style={{ borderLeftWidth: "0.5px" }}
    >
      {activePanel === "documents" && (
        <WorkspaceDocumentViewer chatId={chatId} subChatId={subChatId ?? undefined} />
      )}
      {activePanel === "tasks" && (
        <TasksPage chatId={chatId} />
      )}
    </ResizableSidebar>
  )
}
