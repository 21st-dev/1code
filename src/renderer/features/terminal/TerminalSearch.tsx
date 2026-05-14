import { useState, useCallback, useEffect, useRef } from "react"
import type { SearchAddon } from "@xterm/addon-search"
import { X, ChevronUp, ChevronDown } from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface TerminalSearchProps {
  searchAddon: SearchAddon | null
  isOpen: boolean
  onClose: () => void
}

export function TerminalSearch({
  searchAddon,
  isOpen,
  onClose,
}: TerminalSearchProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isOpen])

  // Handle search
  const handleSearch = useCallback(
    (direction: "next" | "prev") => {
      if (!searchAddon || !query) return

      if (direction === "next") {
        searchAddon.findNext(query, { caseSensitive: false, regex: false })
      } else {
        searchAddon.findPrevious(query, { caseSensitive: false, regex: false })
      }
    },
    [searchAddon, query]
  )

  // Search on query change
  useEffect(() => {
    if (!searchAddon || !query) {
      setMatchCount(null)
      return
    }

    // Trigger search
    searchAddon.findNext(query, { caseSensitive: false, regex: false })
  }, [searchAddon, query])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) {
          handleSearch("prev")
        } else {
          handleSearch("next")
        }
      }
    },
    [onClose, handleSearch]
  )

  // Clear search when closed
  useEffect(() => {
    if (!isOpen && searchAddon) {
      searchAddon.clearDecorations()
    }
  }, [isOpen, searchAddon])

  if (!isOpen) return null

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background p-1.5 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("terminal.find")}
        className="w-40 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      {matchCount !== null && (
        <span className="px-1 text-xs text-muted-foreground">
          {t("terminal.matches", { count: matchCount })}
        </span>
      )}
      <button
        onClick={() => handleSearch("prev")}
        className="rounded p-1 hover:bg-muted"
        title={t("terminal.previousMatch")}
      >
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      </button>
      <button
        onClick={() => handleSearch("next")}
        className="rounded p-1 hover:bg-muted"
        title={t("terminal.nextMatch")}
      >
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      <button
        onClick={onClose}
        className="rounded p-1 hover:bg-muted"
        title={t("terminal.closeSearch")}
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )
}
