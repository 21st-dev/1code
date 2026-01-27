"use client"

import { useState } from "react"
import { ChevronDown, Zap } from "lucide-react"
import { cn } from "../../../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { CheckIcon, ThinkingIcon, ClaudeCodeIcon } from "../../../components/ui/icons"
import { Switch } from "../../../components/ui/switch"
import { useAllModels, type ModelOption } from "../lib/models"

interface ModelSelectorProps {
  className?: string
  onThinkingChange?: (enabled: boolean) => void
  thinkingEnabled?: boolean
  onModelSelect?: (model: ModelOption) => void
}

export function ModelSelector({ className, onThinkingChange, thinkingEnabled = false, onModelSelect }: ModelSelectorProps) {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const { groups, selectedModel, selectModel } = useAllModels()

  const handleModelSelect = (model: ModelOption) => {
    selectModel(model)
    onModelSelect?.(model)
  }

  return (
    <DropdownMenu open={isModelDropdownOpen} onOpenChange={setIsModelDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground transition-colors rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            "hover:text-foreground hover:bg-muted/50",
            className,
          )}
          aria-label={`Current model: ${selectedModel?.name}. Click to change model.`}
        >
          {selectedModel?.provider === "claude" ? (
            <ClaudeCodeIcon className="h-3.5 w-3.5 shrink-0" />
          ) : selectedModel?.provider === "custom" ? (
            <Zap className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Zap className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">
            {selectedModel?.name}
            {selectedModel?.provider === "claude" && (
              <span className="text-muted-foreground ml-0.5">4.5</span>
            )}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        {groups.map((group) => (
          <div key={group.id}>
            {group.id !== "claude" && <DropdownMenuSeparator />}
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group.name}
            </div>
            {group.options.map((model) => {
              const isSelected = selectedModel?.id === model.id
              return (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => {
                    handleModelSelect(model)
                  }}
                  className="gap-2 justify-between"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {model.provider === "claude" ? (
                      <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : model.provider === "custom" ? (
                      <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">
                      {model.name}
                      {model.provider === "claude" && (
                        <span className="text-muted-foreground ml-0.5">4.5</span>
                      )}
                    </span>
                  </div>
                  {isSelected && (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0 ml-2" />
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>
        ))}
        <DropdownMenuSeparator />
        <div
          className="flex items-center justify-between px-1.5 py-1.5 mx-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5">
            <ThinkingIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm">Thinking</span>
          </div>
          {/* Thinking toggle - controlled by parent via callback */}
          <Switch
            checked={thinkingEnabled}
            onCheckedChange={onThinkingChange}
            aria-label="Toggle extended thinking"
            className="scale-75"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
