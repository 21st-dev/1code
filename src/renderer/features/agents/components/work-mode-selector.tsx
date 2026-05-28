"use client"

import { useState } from "react"
import { GitBranch } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { IconChevronDown, CheckIcon, LaptopIcon } from "../../../components/ui/icons"
import { useI18n, type TranslationKey } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import type { WorkMode } from "../atoms"

interface WorkModeSelectorProps {
  value: WorkMode
  onChange: (mode: WorkMode) => void
  disabled?: boolean
}

const workModeOptions = [
  {
    id: "local" as const,
    labelKey: "agent.workMode.local" as TranslationKey,
    icon: LaptopIcon,
  },
  {
    id: "worktree" as const,
    labelKey: "agent.workMode.worktree" as TranslationKey,
    icon: GitBranch,
  },
]

export function WorkModeSelector({
  value,
  onChange,
  disabled,
}: WorkModeSelectorProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const selectedOption = workModeOptions.find((opt) => opt.id === value) || workModeOptions[1]
  const Icon = selectedOption.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-[background-color,color] duration-150 ease-out rounded-md hover:bg-muted/50 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            disabled && "opacity-50 pointer-events-none",
          )}
          disabled={disabled}
        >
          <Icon className="w-4 h-4" />
          <span>{t(selectedOption.labelKey)}</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] min-w-[160px]" align="start">
        {workModeOptions.map((option) => {
          const OptionIcon = option.icon
          const isSelected = value === option.id
          return (
            <button
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
              className={cn(
                "flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] text-sm text-left rounded-md cursor-default select-none outline-none transition-colors",
                isSelected
                  ? "dark:bg-neutral-800 text-foreground"
                  : "dark:hover:bg-neutral-800 hover:text-foreground"
              )}
            >
              <OptionIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1">{t(option.labelKey)}</span>
              {isSelected && <CheckIcon className="h-4 w-4 shrink-0" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
