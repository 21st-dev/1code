"use client"

import { useState } from "react"
import { GitBranch } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover"
import { IconChevronDown, CheckIcon, LaptopIcon, CloudIcon } from "../../../components/ui/icons"
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
    label: "Local",
    icon: LaptopIcon,
  },
  {
    id: "worktree" as const,
    label: "Worktree",
    icon: GitBranch,
  },
  {
    id: "sandbox" as const,
    label: "Background",
    icon: CloudIcon,
    disabled: true,
    soon: true,
  },
]

export function WorkModeSelector({
  value,
  onChange,
  disabled,
}: WorkModeSelectorProps) {
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
          <span>{selectedOption.label}</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] min-w-[160px]" align="start">
        {workModeOptions.map((option) => {
          const OptionIcon = option.icon
          const isSelected = value === option.id
          const isDisabled = "disabled" in option && option.disabled
          const isSoon = "soon" in option && option.soon
          return (
            <button
              key={option.id}
              onClick={() => {
                if (isDisabled) return
                onChange(option.id as WorkMode)
                setOpen(false)
              }}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-1.5 min-h-[32px] py-[5px] px-1.5 mx-1 w-[calc(100%-8px)] text-sm text-left rounded-md cursor-default select-none outline-none transition-colors",
                isDisabled
                  ? "opacity-50 cursor-not-allowed"
                  : isSelected
                    ? "dark:bg-neutral-800 text-foreground"
                    : "dark:hover:bg-neutral-800 hover:text-foreground"
              )}
            >
              <OptionIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1">{option.label}</span>
              {isSoon && (
                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                  Soon
                </span>
              )}
              {isSelected && !isDisabled && <CheckIcon className="h-4 w-4 shrink-0" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
