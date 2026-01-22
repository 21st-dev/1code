import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronRight, Folder, FileText } from "lucide-react"
import { useEffect, useState } from "react"
import { trpc } from "../../../lib/trpc"
import {
  type FileTreeNode,
  workspaceFileTreeAtomFamily,
  expandedFoldersAtomFamily,
  activeDocumentAtomFamily,
  documentsPanelOpenAtomFamily,
} from "../../../lib/atoms"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { getFileType } from "../utils/file-types"

interface WorkspaceFileTreeProps {
  chatId: string
}

export function WorkspaceFileTree({ chatId }: WorkspaceFileTreeProps) {
  const [files, setFiles] = useAtom(workspaceFileTreeAtomFamily(chatId))

  // Fetch files from tRPC
  const { data: fileTree, isLoading, error, refetch } = trpc.workspaceFiles.listFiles.useQuery(
    { chatId },
    { refetchOnWindowFocus: false }
  )

  // Update atom when data loads
  useEffect(() => {
    if (fileTree) {
      setFiles(fileTree)
    }
  }, [fileTree, setFiles])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading files...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <div className="text-sm text-destructive">Failed to load files</div>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Retry
        </button>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <Folder className="h-12 w-12 text-muted-foreground/50" />
        <div className="text-sm font-medium text-muted-foreground">No files yet</div>
        <div className="text-xs text-muted-foreground">
          Agents can create documents in this workspace
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Files</span>
          <button
            onClick={() => refetch()}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {files.map((node) => (
          <FileTreeNode key={node.path} node={node} depth={0} chatId={chatId} />
        ))}
      </div>
    </div>
  )
}

interface FileTreeNodeProps {
  node: FileTreeNode
  depth: number
  chatId: string
}

function FileTreeNode({ node, depth, chatId }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useAtom(expandedFoldersAtomFamily(chatId))
  const setActiveDoc = useSetAtom(activeDocumentAtomFamily(chatId))
  const setDocumentsOpen = useSetAtom(documentsPanelOpenAtomFamily(chatId))
  const isExpanded = expanded.has(node.path)

  // tRPC mutation to read file
  const readFileMutation = trpc.workspaceFiles.readFile.useMutation()

  const handleClick = async () => {
    if (node.type === "folder") {
      // Toggle folder expansion
      const newExpanded = new Set(expanded)
      if (isExpanded) {
        newExpanded.delete(node.path)
      } else {
        newExpanded.add(node.path)
      }
      setExpanded(newExpanded)
    } else {
      // Read and open file
      try {
        const result = await readFileMutation.mutateAsync({
          chatId,
          filePath: node.path,
        })

        // Determine file type
        const type = getFileType(node.name)

        // Update active document
        setActiveDoc({
          path: node.path,
          content: result.content,
          type,
        })

        // Open documents panel
        setDocumentsOpen(true)
      } catch (error) {
        console.error("[FileTreeNode] Failed to read file:", error)
      }
    }
  }

  const paddingLeft = depth * 12 + 8

  return (
    <div>
      <div
        className="group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm hover:bg-accent"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
      >
        {node.type === "folder" ? (
          <>
            <ChevronRight
              className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
            <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          </>
        ) : (
          <>
            <div className="w-3.5" /> {/* Spacer for alignment */}
            {(() => {
              const FileIcon = getFileIconByExtension(node.name)
              return <FileIcon className="h-3.5 w-3.5 flex-shrink-0" />
            })()}
          </>
        )}
        <span className="truncate text-xs">{node.name}</span>
      </div>
      {node.type === "folder" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} chatId={chatId} />
          ))}
        </div>
      )}
    </div>
  )
}
