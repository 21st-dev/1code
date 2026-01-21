"use client"

import { cn } from "../../../lib/utils"
import { api } from "../../../lib/mock-api"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react"
import { createPortal } from "react-dom"
import {
  IconSpinner,
  IconChatBubble,
  PlanIcon,
  AgentIcon,
} from "../../../components/ui/icons"
import {
  MessageSquareCode,
  FileText,
  ShieldCheck,
  Eye,
  FolderGit2,
} from "lucide-react"
import type { SlashCommandOption, SlashTriggerPayload } from "./types"
import {
  filterBuiltinCommands,
  BUILTIN_SLASH_COMMANDS,
} from "./builtin-commands"

// Get icon component for a slash command
function getCommandIcon(commandName: string) {
  switch (commandName) {
    case "clear":
      return IconChatBubble
    case "plan":
      return PlanIcon
    case "agent":
      return AgentIcon
    case "review":
      return Eye
    case "pr-comments":
      return MessageSquareCode
    case "release-notes":
      return FileText
    case "security-review":
      return ShieldCheck
    case "worktree-setup":
      return FolderGit2
    default:
      return IconChatBubble
  }
}

interface AgentsSlashCommandProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (command: SlashCommandOption) => void
  searchText: string
  position: { top: number; left: number }
  teamId?: string
  repository?: string
  isPlanMode?: boolean
  disabledCommands?: string[]
}

// Memoized to prevent re-renders when parent re-renders
export const AgentsSlashCommand = memo(function AgentsSlashCommand({
  isOpen,
  onClose,
  onSelect,
  searchText,
  position,
  teamId,
  repository,
  isPlanMode,
  disabledCommands,
}: AgentsSlashCommandProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const placementRef = useRef<"above" | "below" | null>(null)
  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText)

  // Debounce search text (300ms to match file mention)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // Fetch repository commands
  const { data: repoCommands = [], isLoading } =
    api.github.getSlashCommands.useQuery(
      {
        teamId: teamId!,
        repository: repository!,
      },
      {
        enabled: isOpen && !!teamId && !!repository,
        staleTime: 30_000, // Cache for 30 seconds
        refetchOnWindowFocus: false,
      },
    )

  // State for loading command content
  const [isLoadingContent, setIsLoadingContent] = useState(false)

  // tRPC utils for fetching command content
  const utils = api.useUtils()

  // Handle command selection - fetch content for repository commands
  const handleSelect = useCallback(
    async (option: SlashCommandOption) => {
      // For builtin commands, call onSelect directly
      if (option.category === "builtin") {
        onSelect(option)
        return
      }

      // For repository commands, fetch the prompt content first
      if (option.path && teamId) {
        setIsLoadingContent(true)
        try {
          const result = await utils.github.getSlashCommandContent.fetch({
            teamId,
            repository: option.repository || repository!,
            path: option.path,
          })

          // Call onSelect with the fetched prompt
          onSelect({
            ...option,
            prompt: result.content,
          })
        } catch (error) {
          console.error("Failed to fetch slash command content:", error)
          // Still close the dropdown even on error
          onClose()
        } finally {
          setIsLoadingContent(false)
        }
      } else {
        // Fallback - just call onSelect without prompt
        onSelect(option)
      }
    },
    [onSelect, onClose, teamId, repository, utils],
  )

  // Combine builtin and repository commands, filtered by search
  const options: SlashCommandOption[] = useMemo(() => {
    let builtinFiltered = filterBuiltinCommands(debouncedSearchText)

    // Hide /plan when already in Plan mode, hide /agent when already in Agent mode
    if (isPlanMode !== undefined) {
      builtinFiltered = builtinFiltered.filter((cmd) => {
        if (isPlanMode && cmd.name === "plan") return false
        if (!isPlanMode && cmd.name === "agent") return false
        return true
      })
    }

    // Filter out disabled commands
    if (disabledCommands && disabledCommands.length > 0) {
      builtinFiltered = builtinFiltered.filter(
        (cmd) => !disabledCommands.includes(cmd.name),
      )
    }

    // Filter repo commands by search
    let repoFiltered = repoCommands
    if (debouncedSearchText) {
      const query = debouncedSearchText.toLowerCase()
      repoFiltered = repoCommands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(query) ||
          cmd.command.toLowerCase().includes(query),
      )
    }

    // Return builtin first, then repository commands
    return [...builtinFiltered, ...repoFiltered]
  }, [debouncedSearchText, repoCommands, isPlanMode, disabledCommands])

  // Track previous values for smarter selection reset
  const prevIsOpenRef = useRef(isOpen)
  const prevSearchRef = useRef(debouncedSearchText)

  // CONSOLIDATED: Single useLayoutEffect for selection management
  useLayoutEffect(() => {
    const didJustOpen = isOpen && !prevIsOpenRef.current
    const didSearchChange = debouncedSearchText !== prevSearchRef.current

    // Reset to 0 when opening or search changes
    if (didJustOpen || didSearchChange) {
      setSelectedIndex(0)
    }
    // Clamp to valid range if options shrunk
    else if (options.length > 0 && selectedIndex >= options.length) {
      setSelectedIndex(Math.max(0, options.length - 1))
    }

    // Update refs
    prevIsOpenRef.current = isOpen
    prevSearchRef.current = debouncedSearchText
  }, [isOpen, debouncedSearchText, options.length, selectedIndex])

  // Reset placement when closed
  useEffect(() => {
    if (!isOpen) {
      placementRef.current = null
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          // Guard against modulo by zero when no options
          if (options.length > 0) {
            setSelectedIndex((prev) => (prev + 1) % options.length)
          }
          break
        case "ArrowUp":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          // Guard against modulo by zero when no options
          if (options.length > 0) {
            setSelectedIndex(
              (prev) => (prev - 1 + options.length) % options.length,
            )
          }
          break
        case "Enter":
          if (e.shiftKey) return
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          if (options[selectedIndex]) {
            handleSelect(options[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          onClose()
          break
        case "Tab":
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          if (options[selectedIndex]) {
            handleSelect(options[selectedIndex])
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [isOpen, options, selectedIndex, handleSelect, onClose])

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return

    if (selectedIndex === 0) {
      dropdownRef.current.scrollTo({ top: 0, behavior: "auto" })
      return
    }

    const elements = dropdownRef.current.querySelectorAll("[data-option-index]")
    const selectedElement = elements[selectedIndex] as HTMLElement
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex, isOpen])

  // Click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Calculate dropdown dimensions (matching file mention style)
  const dropdownWidth = 320
  const itemHeight = 28  // h-7 = 28px to match file mention
  const headerHeight = 24
  const builtinCount = filterBuiltinCommands(debouncedSearchText).length
  const repoCount = options.length - builtinCount
  const headersCount = (builtinCount > 0 ? 1 : 0) + (repoCount > 0 ? 1 : 0)
  const requestedHeight = Math.min(
    options.length * itemHeight + headersCount * headerHeight + 8,
    200,  // Match file mention maxHeight
  )
  const gap = 8

  // Decide placement like Radix Popover (auto-flip top/bottom)
  const safeMargin = 10
  const caretOffsetBelow = 20
  const availableBelow =
    window.innerHeight - (position.top + caretOffsetBelow) - safeMargin
  const availableAbove = position.top - safeMargin

  // Compute desired placement, but lock it for the duration of the open state
  if (placementRef.current === null) {
    const condition1 =
      availableAbove >= requestedHeight && availableBelow < requestedHeight
    const condition2 =
      availableAbove > availableBelow && availableAbove >= requestedHeight
    const shouldPlaceAbove = condition1 || condition2
    placementRef.current = shouldPlaceAbove ? "above" : "below"
  }
  const placeAbove = placementRef.current === "above"

  // Compute final top based on placement
  let finalTop = placeAbove
    ? position.top - gap
    : position.top + gap + caretOffsetBelow

  // Slight left bias to better align with '/'
  const leftOffset = -4
  let finalLeft = position.left + leftOffset

  // Adjust horizontal overflow
  if (finalLeft + dropdownWidth > window.innerWidth - safeMargin) {
    finalLeft = window.innerWidth - dropdownWidth - safeMargin
  }
  if (finalLeft < safeMargin) {
    finalLeft = safeMargin
  }

  // Compute actual maxHeight based on available space on the chosen side
  const computedMaxHeight = Math.max(
    80,
    Math.min(
      requestedHeight,
      placeAbove ? availableAbove - gap : availableBelow - gap,
    ),
  )
  const transformY = placeAbove ? "translateY(-100%)" : "translateY(0)"

  // Split options into builtin and repository
  const builtinOptions = options.filter((o) => o.category === "builtin")
  const repoOptions = options.filter((o) => o.category === "repository")

  // Calculate global index for each item
  let globalIndex = 0

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[99999] overflow-y-auto rounded-[10px] border border-border bg-popover py-1 text-xs text-popover-foreground shadow-lg dark [&::-webkit-scrollbar]:hidden"
      style={{
        top: finalTop,
        left: finalLeft,
        width: `${dropdownWidth}px`,
        maxHeight: `${computedMaxHeight}px`,
        transform: transformY,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      } as React.CSSProperties}
    >
      {/* Builtin commands section */}
      {builtinOptions.length > 0 && (
        <>
          <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground">
            Commands
          </div>
          {builtinOptions.map((option) => {
            const currentIndex = globalIndex++
            const isSelected = selectedIndex === currentIndex
            const CommandIcon = getCommandIcon(option.name)
            return (
              <div
                key={option.id}
                data-option-index={currentIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSelect(option)
                }}
                onMouseEnter={() => setSelectedIndex(currentIndex)}
                className={cn(
                  "group inline-flex w-[calc(100%-8px)] mx-1 items-center whitespace-nowrap outline-none",
                  "h-7 px-1.5 justify-start text-xs rounded-md",
                  "transition-colors cursor-pointer select-none gap-1.5",
                  isSelected
                    ? "dark:bg-neutral-800 bg-accent text-foreground"
                    : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
                )}
              >
                <CommandIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="flex items-center gap-1 w-full min-w-0">
                  <span className="shrink-0 whitespace-nowrap font-medium">
                    {option.command}
                  </span>
                  <span
                    className="text-muted-foreground flex-1 min-w-0 ml-2 overflow-hidden text-[10px] truncate"
                  >
                    {option.description}
                  </span>
                </span>
              </div>
            )
          })}
        </>
      )}

      {/* Repository commands section */}
      {repoOptions.length > 0 && (
        <>
          <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground mt-1">
            From repository
          </div>
          {repoOptions.map((option) => {
            const currentIndex = globalIndex++
            const isSelected = selectedIndex === currentIndex
            const CommandIcon = getCommandIcon(option.name)
            return (
              <div
                key={option.id}
                data-option-index={currentIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSelect(option)
                }}
                onMouseEnter={() => setSelectedIndex(currentIndex)}
                className={cn(
                  "group inline-flex w-[calc(100%-8px)] mx-1 items-center whitespace-nowrap outline-none",
                  "h-7 px-1.5 justify-start text-xs rounded-md",
                  "transition-colors cursor-pointer select-none gap-1.5",
                  isSelected
                    ? "dark:bg-neutral-800 bg-accent text-foreground"
                    : "text-muted-foreground dark:hover:bg-neutral-800 hover:bg-accent hover:text-foreground",
                )}
              >
                <CommandIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="flex items-center gap-1 w-full min-w-0">
                  <span className="shrink-0 whitespace-nowrap font-medium">
                    {option.command}
                  </span>
                  <span
                    className="text-muted-foreground flex-1 min-w-0 ml-2 overflow-hidden text-[10px] truncate"
                  >
                    {option.description}
                  </span>
                </span>
              </div>
            )
          })}
        </>
      )}

      {/* Loading state for repository commands */}
      {isLoading && (
        <div className="flex items-center gap-1.5 h-7 px-1.5 mx-1 text-xs text-muted-foreground">
          <IconSpinner className="h-3.5 w-3.5" />
          <span>Loading commands...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && options.length === 0 && (
        <div className="h-7 px-1.5 mx-1 flex items-center text-xs text-muted-foreground">
          {debouncedSearchText
            ? `No commands matching "${debouncedSearchText}"`
            : "No commands available"}
        </div>
      )}
    </div>,
    document.body
  )
})
