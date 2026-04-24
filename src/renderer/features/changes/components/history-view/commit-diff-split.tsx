"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { FileText } from "lucide-react"
import { IconSpinner } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import type { ChangedFile } from "@/../shared/changes-types"
import { getStatusIndicator } from "../../utils/status"

// Persist the left-column width across sessions
const commitDiffSplitWidthAtom = atomWithStorage<number>(
  "changes:commitDiffSplitWidth",
  280,
  undefined,
  { getOnInit: true },
)

interface CommitDiffSplitProps {
  worktreePath: string
  commitHash: string
  files: ChangedFile[]
  selectedFilePath?: string | null
  onFileSelect?: (file: ChangedFile) => void
}

const MIN_LEFT = 180
const MIN_RIGHT = 240

export const CommitDiffSplit = memo(function CommitDiffSplit({
  worktreePath,
  commitHash,
  files,
  selectedFilePath,
  onFileSelect,
}: CommitDiffSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useAtom(commitDiffSplitWidthAtom)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileClick = useCallback(
    (file: ChangedFile) => {
      onFileSelect?.(file)
    },
    [onFileSelect],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(true)
    },
    [],
  )

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      let next = e.clientX - rect.left
      const maxLeft = rect.width - MIN_RIGHT
      if (next < MIN_LEFT) next = MIN_LEFT
      if (next > maxLeft) next = maxLeft
      setLeftWidth(next)
    }

    const onMouseUp = () => setIsDragging(false)

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isDragging, setLeftWidth])

  return (
    <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden">
      {/* Left: file list */}
      <div
        style={{ width: leftWidth, flexShrink: 0 }}
        className="border-r border-border/50 overflow-y-auto"
      >
        {files.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            No files in this commit.
          </div>
        ) : (
          files.map((file) => (
            <CommitFileRow
              key={file.path}
              file={file}
              isSelected={selectedFilePath === file.path}
              onClick={() => handleFileClick(file)}
            />
          ))
        )}
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors flex-shrink-0",
          isDragging && "bg-primary/50",
        )}
      />

      {/* Right: diff */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {selectedFilePath ? (
          <CommitFileDiff
            worktreePath={worktreePath}
            commitHash={commitHash}
            filePath={selectedFilePath}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            Select a file to view its diff.
          </div>
        )}
      </div>
    </div>
  )
})

const CommitFileRow = memo(function CommitFileRow({
  file,
  isSelected,
  onClick,
}: {
  file: ChangedFile
  isSelected: boolean
  onClick: () => void
}) {
  const fileName = file.path.split("/").pop() || file.path
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : ""

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors",
        "hover:bg-muted/60 border-b border-border/20 last:border-b-0",
        isSelected && "bg-muted",
      )}
    >
      <FileText className="size-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0 flex items-center overflow-hidden">
        {dirPath && (
          <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
            {dirPath}/
          </span>
        )}
        <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
          {fileName}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
        {file.additions != null && file.additions > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">
            +{file.additions}
          </span>
        )}
        {file.deletions != null && file.deletions > 0 && (
          <span className="text-red-600 dark:text-red-400">
            −{file.deletions}
          </span>
        )}
        {getStatusIndicator(file.status)}
      </div>
    </button>
  )
})

const CommitFileDiff = memo(function CommitFileDiff({
  worktreePath,
  commitHash,
  filePath,
}: {
  worktreePath: string
  commitHash: string
  filePath: string
}) {
  const { data, isLoading, error } = trpc.changes.getCommitFileDiff.useQuery(
    { worktreePath, commitHash, filePath },
    { enabled: !!worktreePath && !!commitHash && !!filePath, staleTime: 60_000 },
  )

  if (isLoading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <IconSpinner className="w-4 h-4" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex-1 p-3 text-xs text-red-500">
        Failed to load diff: {error.message}
      </div>
    )
  }
  if (!data || data.trim() === "") {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        No diff available for this file.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/50 px-3 py-1.5 flex items-center gap-2">
        <FileText className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-mono truncate">{filePath}</span>
      </div>
      <pre className="font-mono text-[11px] leading-[1.45] px-3 py-2 whitespace-pre">
        {data.split("\n").map((line, i) => {
          let toneClass = ""
          if (line.startsWith("+") && !line.startsWith("+++")) {
            toneClass = "text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            toneClass = "text-red-700 dark:text-red-400 bg-red-500/5"
          } else if (line.startsWith("@@")) {
            toneClass = "text-sky-700 dark:text-sky-400"
          } else if (
            line.startsWith("diff ") ||
            line.startsWith("+++") ||
            line.startsWith("---") ||
            line.startsWith("index ")
          ) {
            toneClass = "text-muted-foreground"
          }
          return (
            <div key={i} className={toneClass || undefined}>
              {line || "\u00A0"}
            </div>
          )
        })}
      </pre>
    </div>
  )
})
