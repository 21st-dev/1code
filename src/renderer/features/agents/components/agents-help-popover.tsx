"use client"

import { useState, useEffect } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu"
import { ArrowUpRight, Github } from "lucide-react"
import { KeyboardIcon } from "../../../components/ui/icons"
import { useSetAtom } from "jotai"
import { agentsSettingsDialogOpenAtom, agentsSettingsDialogActiveTabAtom } from "../../../lib/atoms"
import { useLocalOnlyMode } from "../../../lib/hooks/use-local-only-mode"

interface ReleaseHighlight {
  version: string
  title: string
}

function parseFirstItemFromSection(lines: string[], sectionPattern: RegExp): string | null {
  let inSection = false
  for (const line of lines) {
    if (sectionPattern.test(line)) {
      inSection = true
      continue
    }
    if (inSection && /^###?\s+/.test(line)) break
    if (inSection) {
      const bold = line.match(/^[-*]\s+\*\*(.+?)\*\*/)
      if (bold) return bold[1]
      const plain = line.match(/^[-*]\s+(.+)/)
      if (plain) return plain[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim()
    }
  }
  return null
}

function parseFirstHighlight(content: string): string {
  const lines = content.split("\n")
  return (
    parseFirstItemFromSection(lines, /^###\s+Features/i) ??
    parseFirstItemFromSection(lines, /^###\s+Improvements/i) ??
    "Bug fixes & improvements"
  )
}

interface AgentsHelpPopoverProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isMobile?: boolean
}

export function AgentsHelpPopover({
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  isMobile = false,
}: AgentsHelpPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [highlights, setHighlights] = useState<ReleaseHighlight[]>([])
  const isLocalOnly = useLocalOnlyMode()

  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen

  useEffect(() => {
    if (isLocalOnly) {
      setHighlights([])
      return
    }

    let cancelled = false
    window.desktopApi
      .getApiBaseUrl()
      .then((apiBase) => {
        if (!apiBase) return null
        return window.desktopApi.signedFetch(
          `${apiBase}/api/changelog/desktop?per_page=3`,
        )
      })
      .then((result) => {
        if (!result) return
        if (cancelled) return
        const data = result.data as {
          releases?: Array<{ version?: string; content?: string }>
        }
        if (data?.releases) {
          const items: ReleaseHighlight[] = []
          for (const release of data.releases) {
            if (release.version) {
              items.push({ version: release.version, title: parseFirstHighlight(release.content || "") })
            }
          }
          setHighlights(items)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isLocalOnly])

  const handleCommunityClick = () => {
    window.desktopApi.openExternal("https://github.com/lupanpan1030/agent-code-for-me")
  }

  const handleChangelogClick = () => {
    window.desktopApi.openExternal("https://github.com/lupanpan1030/agent-code-for-me/releases")
  }

  const handleReleaseClick = (version: string) => {
    window.desktopApi.openExternal(
      `https://github.com/lupanpan1030/agent-code-for-me/releases/tag/v${version}`,
    )
  }

  const handleKeyboardShortcutsClick = () => {
    setOpen(false)
    setSettingsActiveTab("keyboard")
    setSettingsDialogOpen(true)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem onClick={handleCommunityClick} className="gap-2">
          <Github className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1">Repository</span>
        </DropdownMenuItem>

        {!isMobile && (
          <DropdownMenuItem
            onClick={handleKeyboardShortcutsClick}
            className="gap-2"
          >
            <KeyboardIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1">Shortcuts</span>
          </DropdownMenuItem>
        )}

        {highlights.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="mx-1 px-1.5 pt-1.5 pb-0.5 text-xs text-muted-foreground">
              What's new
            </div>
            {highlights.map((item, i) => (
              <DropdownMenuItem
                key={item.version}
                onClick={() => handleReleaseClick(item.version)}
                className="gap-0 items-stretch min-h-0 px-2 py-0"
              >
                <div className="flex flex-col items-center w-3 shrink-0">
                  {i === 0 ? <div className="h-[11px]" /> : <div className="w-px h-[11px] border-l border-dashed border-muted-foreground/30" />}
                  <div className="w-1.5 h-1.5 rounded-full border border-muted-foreground/40 shrink-0" />
                  <div className="w-px flex-1 border-l border-dashed border-muted-foreground/30" />
                </div>
                <span className="text-xs text-muted-foreground leading-tight py-1.5 pl-2 line-clamp-2">
                  {item.title}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={handleChangelogClick} className="gap-0 items-stretch min-h-0 px-2 py-0">
              <div className="flex flex-col items-center w-3 shrink-0">
                <div className="w-px h-[11px] border-l border-dashed border-muted-foreground/30" />
                <div className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                <div className="w-px flex-1 border-l border-dashed border-muted-foreground/30" />
              </div>
              <span className="flex-1 text-xs pl-2 py-1.5">Full changelog</span>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0 self-center" />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
