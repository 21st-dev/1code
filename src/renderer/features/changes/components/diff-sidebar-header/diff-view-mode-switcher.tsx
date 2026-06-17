"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconFullPage, IconOpenSidebarRight } from "@/components/ui/icons"
import type { DiffViewDisplayMode } from "@/features/agents/atoms"
import { type TranslationKey, useI18n } from "@/lib/i18n"

interface DiffViewModeSwitcherProps {
  mode: DiffViewDisplayMode
  onModeChange: (mode: DiffViewDisplayMode) => void
}

const MODES = [
  {
    value: "details-expanded" as const,
    labelKey: "details.details" as TranslationKey,
    Icon: IconOpenSidebarRight,
  },
  {
    value: "full-page" as const,
    labelKey: "changes.diff.fullscreen" as TranslationKey,
    Icon: IconFullPage,
  },
]

export function DiffViewModeSwitcher({
  mode,
  onModeChange,
}: DiffViewModeSwitcherProps) {
  const { t } = useI18n()
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
        {MODES.map(({ value, labelKey, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onModeChange(value)}
            className="flex items-center gap-2"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex-1">{t(labelKey)}</span>
            {mode === value && (
              <Check className="size-4 text-muted-foreground ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
