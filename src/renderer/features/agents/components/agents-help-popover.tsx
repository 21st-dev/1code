"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../../../components/ui/dropdown-menu"
import { ArrowUpRight } from "lucide-react"
import { KeyboardIcon } from "../../../components/ui/icons"
import { DiscordIcon } from "../../../icons"
import { useSetAtom } from "jotai"
import { agentsSettingsDialogOpenAtom, agentsSettingsDialogActiveTabAtom } from "../../../lib/atoms"
import {
  getOpenCodexAgentsChangelogUrl,
} from "../../../lib/updates/changelog-url"

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

  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen

  const handleCommunityClick = () => {
    window.desktopApi.openExternal("https://discord.gg/8ektTZGnj4")
  }

  const handleChangelogClick = async () => {
    const baseUrl = await window.desktopApi.getApiBaseUrl()
    await window.desktopApi.openExternal(getOpenCodexAgentsChangelogUrl(baseUrl))
  }

  const handleReleaseClick = async (version: string) => {
    const baseUrl = await window.desktopApi.getApiBaseUrl()
    await window.desktopApi.openExternal(getOpenCodexAgentsChangelogUrl(baseUrl, version))
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
          <DiscordIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1">Discord</span>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleReleaseClick("latest")} className="gap-2">
          <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="flex-1">Latest release</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleChangelogClick()} className="gap-2">
          <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="flex-1">Full changelog</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
