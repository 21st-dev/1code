"use client"

import { useState } from "react"
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
import { useI18n } from "../../../lib/i18n"

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
  const { t } = useI18n()
  const [internalOpen, setInternalOpen] = useState(false)
  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen

  const handleCommunityClick = () => {
    window.desktopApi.openExternal("https://github.com/lupanpan1030/agent-code-for-me")
  }

  const handleChangelogClick = () => {
    window.desktopApi.openExternal("https://github.com/lupanpan1030/agent-code-for-me/releases")
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
          <span className="flex-1">{t("sidebar.repository")}</span>
        </DropdownMenuItem>

        {!isMobile && (
          <DropdownMenuItem
            onClick={handleKeyboardShortcutsClick}
            className="gap-2"
          >
            <KeyboardIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1">{t("sidebar.shortcuts")}</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleChangelogClick} className="gap-2">
          <span className="flex-1">{t("sidebar.releases")}</span>
          <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
