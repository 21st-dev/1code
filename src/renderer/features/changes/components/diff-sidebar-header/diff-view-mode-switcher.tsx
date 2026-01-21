"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  IconSidePeek,
  IconCenterPeek,
  IconFullPage,
} from "@/components/ui/icons"
import type { DiffViewDisplayMode } from "@/features/agents/atoms"

interface DiffViewModeSwitcherProps {
  mode: DiffViewDisplayMode
  onModeChange: (mode: DiffViewDisplayMode) => void
}

const MODES = [
  {
    value: "side-peek" as const,
    label: "Sidebar",
    Icon: IconSidePeek,
  },
  {
    value: "center-peek" as const,
    label: "Dialog",
    Icon: IconCenterPeek,
  },
  {
    value: "full-page" as const,
    label: "Fullscreen",
    Icon: IconFullPage,
  },
]

export function DiffViewModeSwitcher({
  mode,
  onModeChange,
}: DiffViewModeSwitcherProps) {
  const currentMode = MODES.find((m) => m.value === mode) ?? MODES[0]
  const CurrentIcon = currentMode.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
        >
          <CurrentIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {MODES.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onModeChange(value)}
            className="flex items-center gap-2"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {mode === value && (
              <Check className="size-4 text-muted-foreground ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
