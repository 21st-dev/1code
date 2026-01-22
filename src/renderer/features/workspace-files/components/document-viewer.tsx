import { useAtomValue, useSetAtom } from "jotai"
import { X, FileText } from "lucide-react"
import {
  activeDocumentAtomFamily,
  documentsPanelOpenAtomFamily,
} from "../../../lib/atoms"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { CodeViewer } from "./code-viewer"

interface WorkspaceDocumentViewerProps {
  chatId: string
}

export function WorkspaceDocumentViewer({ chatId }: WorkspaceDocumentViewerProps) {
  const activeDoc = useAtomValue(activeDocumentAtomFamily(chatId))
  const setDocumentsOpen = useSetAtom(documentsPanelOpenAtomFamily(chatId))

  if (!activeDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <div className="text-sm font-medium text-muted-foreground">Select a file to view</div>
        <div className="text-xs text-muted-foreground">
          Click a file in the tree to open it here
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{activeDoc.path}</span>
          </div>
          <button
            onClick={() => setDocumentsOpen(false)}
            className="flex-shrink-0 rounded p-1 hover:bg-accent"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeDoc.type === "markdown" && (
          <div className="p-4">
            <ChatMarkdownRenderer content={activeDoc.content} size="md" />
          </div>
        )}
        {activeDoc.type === "code" && (
          <CodeViewer content={activeDoc.content} filename={activeDoc.path} />
        )}
        {activeDoc.type === "text" && (
          <pre className="p-4 font-mono text-sm">{activeDoc.content}</pre>
        )}
      </div>
    </div>
  )
}
