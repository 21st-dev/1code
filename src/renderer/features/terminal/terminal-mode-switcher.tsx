import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconBottomPanel, IconOpenSidebarRight } from "@/components/ui/icons"
import { type TranslationKey, useI18n } from "@/lib/i18n"
import type { TerminalDisplayMode } from "./atoms"

const TERMINAL_MODES = [
  {
    value: "details" as const,
    labelKey: "details.details" as TranslationKey,
    Icon: IconOpenSidebarRight,
  },
  {
    value: "bottom" as const,
    labelKey: "terminal.bottomMode" as TranslationKey,
    Icon: IconBottomPanel,
  },
]

export function TerminalModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: TerminalDisplayMode
  onModeChange: (mode: TerminalDisplayMode) => void
}) {
  const { t } = useI18n()
  const currentMode =
    TERMINAL_MODES.find((m) => m.value === mode) ?? TERMINAL_MODES[0]
  const CurrentIcon = currentMode.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
          aria-label={t(currentMode.labelKey)}
        >
          <CurrentIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {TERMINAL_MODES.map(({ value, labelKey, Icon }) => (
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
