import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useAtom } from "jotai"
import { X } from "lucide-react"
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SearchIcon } from "@/components/ui/icons"
import { Input } from "@/components/ui/input"
import { UnknownFileIcon } from "@/icons/framework-icons"
import { useI18n } from "@/lib/i18n"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import { getFileIconByExtension } from "../../agents/mentions/agents-file-mention"
import { recentlyOpenedFilesAtom } from "../../details-sidebar/atoms"

// ============================================================================
// Highlight helper – splits text into segments with matching parts marked
// ============================================================================

function highlightMatches(
  text: string,
  query: string,
): Array<{ text: string; highlight: boolean }> {
  if (!query) return [{ text, highlight: false }]
  const lower = text.toLowerCase()
  const qLower = query.toLowerCase()
  const segments: Array<{ text: string; highlight: boolean }> = []
  let cursor = 0
  while (cursor < text.length) {
    const idx = lower.indexOf(qLower, cursor)
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), highlight: false })
      break
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), highlight: false })
    }
    segments.push({ text: text.slice(idx, idx + query.length), highlight: true })
    cursor = idx + query.length
  }
  return segments
}

interface FileSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPath: string
  onSelectFile: (filePath: string) => void
}

export const FileSearchDialog = memo(function FileSearchDialog({
  open,
  onOpenChange,
  projectPath,
  onSelectFile,
}: FileSearchDialogProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [recentlyOpenedFiles, setRecentlyOpenedFiles] = useAtom(recentlyOpenedFilesAtom)

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery("")
      setDebouncedQuery("")
      setSelectedIndex(0)
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 0)
    }
  }, [open])

  const { data: results } = trpc.files.search.useQuery(
    {
      projectPath,
      query: debouncedQuery,
      limit: 50,
    },
    {
      enabled: open && !!projectPath,
      placeholderData: (prev) => prev,
    },
  )

  // Build recent file items directly from atom (independent of search results)
  const recentItems = useMemo(() => {
    const prefix = projectPath + "/"
    const items: { id: string; label: string; path: string }[] = []
    const queryLower = debouncedQuery.toLowerCase()
    for (const absPath of recentlyOpenedFiles) {
      if (!absPath.startsWith(prefix)) continue
      const relPath = absPath.slice(prefix.length)
      const fileName = relPath.includes("/") ? relPath.slice(relPath.lastIndexOf("/") + 1) : relPath
      // Filter by query if searching
      if (queryLower && !relPath.toLowerCase().includes(queryLower)) continue
      items.push({ id: `recent-${relPath}`, label: fileName, path: relPath })
    }
    return items
  }, [recentlyOpenedFiles, projectPath, debouncedQuery])

  const recentPathsSet = useMemo(
    () => new Set(recentItems.map((f) => f.path)),
    [recentItems],
  )

  // Search results excluding recently opened files
  const otherFiles = useMemo(() => {
    const allFiles = (results ?? []).filter((item) => item.type === "file")
    return allFiles.filter((file) => !recentPathsSet.has(file.path))
  }, [results, recentPathsSet])

  // Flat list for keyboard navigation: recent first, then rest
  const allItems = useMemo(
    () => [...recentItems, ...otherFiles],
    [recentItems, otherFiles],
  )

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
    itemRefs.current = []
  }, [debouncedQuery])

  // Scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current[selectedIndex]
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [selectedIndex])

  const handleSelect = useCallback(
    (relativePath: string) => {
      const absolutePath = projectPath + "/" + relativePath
      onSelectFile(absolutePath)
      onOpenChange(false)
    },
    [projectPath, onSelectFile, onOpenChange],
  )

  const handleRemoveRecent = useCallback(
    (relativePath: string) => {
      const absolutePath = projectPath + "/" + relativePath
      setRecentlyOpenedFiles((prev) => prev.filter((p) => p !== absolutePath))
    },
    [projectPath, setRecentlyOpenedFiles],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (allItems.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % allItems.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + allItems.length) % allItems.length)
      } else if (e.key === "Enter") {
        e.preventDefault()
        const file = allItems[selectedIndex]
        if (file) {
          handleSelect(file.path)
        }
      }
    },
    [allItems, selectedIndex, handleSelect],
  )

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
    },
    [],
  )

  const handleSetRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      itemRefs.current[index] = el
    },
    [],
  )

  const recentCount = recentItems.length

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-3 z-50 ml-[-300px]",
            "w-[600px] max-w-[calc(100vw-32px)]",
            "rounded-[10px] border border-border bg-popover shadow-lg",
            "p-0 flex flex-col overflow-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onKeyDown={handleKeyDown}
        >
          {/* Search */}
          <div className="mx-1 my-1">
            <div className="relative flex items-center gap-1.5 h-7 px-1.5 rounded-md bg-muted/50">
              <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                ref={searchInputRef}
                placeholder={t("fileViewer.goToFile")}
                value={query}
                onChange={handleSearchChange}
                className="h-auto p-0 border-0 rounded-none bg-transparent text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto py-1 max-h-[400px] border-t scrollbar-hide">
            {allItems.length === 0 && debouncedQuery ? (
              <div className="min-h-[32px] py-[5px] px-1.5 mx-1 flex items-center text-sm text-muted-foreground">
                {t("fileViewer.noFilesFound")}
              </div>
            ) : (
              <>
                {/* Recently opened files (shown at top, no section header) */}
                {recentItems.map((item, i) => {
                  const dirPath = item.path.includes("/")
                    ? item.path.slice(0, item.path.lastIndexOf("/"))
                    : ""
                  return (
                    <FileSearchItem
                      key={item.id}
                      label={item.label}
                      dirPath={dirPath}
                      index={i}
                      isSelected={i === selectedIndex}
                      onSelect={() => handleSelect(item.path)}
                      setRef={handleSetRef}
                      query={debouncedQuery}
                      recentLabel="recently opened"
                      onRemoveRecent={() => handleRemoveRecent(item.path)}
                    />
                  )
                })}

                {/* Other files section */}
                {otherFiles.length > 0 && (
                  <>
                    {otherFiles.map((item, i) => {
                      const flatIndex = recentCount + i
                      const dirPath = item.path.includes("/")
                        ? item.path.slice(0, item.path.lastIndexOf("/"))
                        : ""
                      return (
                        <FileSearchItem
                          key={item.id}
                          label={item.label}
                          dirPath={dirPath}
                          index={flatIndex}
                          isSelected={flatIndex === selectedIndex}
                          onSelect={() => handleSelect(item.path)}
                          setRef={handleSetRef}
                          query={debouncedQuery}
                        />
                      )
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})

interface FileSearchItemProps {
  label: string
  dirPath: string
  index: number
  isSelected: boolean
  onSelect: () => void
  setRef: (index: number, el: HTMLDivElement | null) => void
  query?: string
  recentLabel?: string
  onRemoveRecent?: () => void
}

const FileSearchItem = memo(function FileSearchItem({
  label,
  dirPath,
  index,
  isSelected,
  onSelect,
  setRef,
  query,
  recentLabel,
  onRemoveRecent,
}: FileSearchItemProps) {
  const handleRef = useCallback(
    (el: HTMLDivElement | null) => {
      setRef(index, el)
    },
    [setRef, index],
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onRemoveRecent?.()
    },
    [onRemoveRecent],
  )

  const Icon = getFileIconByExtension(label) ?? UnknownFileIcon

  return (
    <div
      ref={handleRef}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)]",
        "rounded-md text-sm cursor-default select-none outline-none",
        "transition-colors group",
        isSelected
          ? "dark:bg-neutral-800 bg-accent text-foreground"
          : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="flex items-center gap-1.5 w-full min-w-0">
        <span className="shrink-0 whitespace-nowrap">
          {query
            ? highlightMatches(label, query).map((seg, i) =>
                seg.highlight ? (
                  <mark key={i} className="bg-transparent text-foreground font-semibold">{seg.text}</mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )
            : label}
        </span>
        {dirPath && (
          <span
            className="text-muted-foreground flex-1 min-w-0 ml-1 font-mono overflow-hidden text-xs"
            style={{
              direction: "rtl",
              textAlign: "left",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ direction: "ltr" }}>
              {query
                ? highlightMatches(dirPath, query).map((seg, i) =>
                    seg.highlight ? (
                      <mark key={i} className="bg-transparent text-foreground font-semibold">{seg.text}</mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )
                : dirPath}
            </span>
          </span>
        )}
      </span>
      {recentLabel && (
        <span className="flex items-center gap-1 ml-auto shrink-0">
          <span className="text-xs text-muted-foreground/60">{recentLabel}</span>
          <button
            type="button"
            onClick={handleRemove}
            className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  )
})
