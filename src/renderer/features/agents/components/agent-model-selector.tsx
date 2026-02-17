"use client"

import { Brain, Zap } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  CheckIcon,
  ClaudeCodeIcon,
  IconChevronDown,
  ThinkingIcon,
} from "../../../components/ui/icons"
import { Switch } from "../../../components/ui/switch"
import { cn } from "../../../lib/utils"
import type { CodexThinkingLevel } from "../lib/models"
import { formatCodexThinkingLabel } from "../lib/models"

const CodexIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
)

export type AgentProviderId = "claude-code" | "codex"

type ClaudeModelOption = {
  id: string
  name: string
  version: string
}

type CodexModelOption = {
  id: string
  name: string
  thinkings: CodexThinkingLevel[]
}

interface AgentModelSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedAgentId: AgentProviderId
  onSelectedAgentIdChange: (provider: AgentProviderId) => void
  selectedModelLabel: string
  allowProviderSwitch?: boolean
  isBedrockMode?: boolean
  triggerClassName?: string
  contentClassName?: string
  claude: {
    models: ClaudeModelOption[]
    selectedModelId?: string
    onSelectModel: (modelId: string) => void
    hasCustomModelConfig: boolean
    isOffline: boolean
    ollamaModels: string[]
    selectedOllamaModel?: string
    recommendedOllamaModel?: string
    onSelectOllamaModel: (modelId: string) => void
    isConnected: boolean
    thinkingEnabled: boolean
    onThinkingChange: (enabled: boolean) => void
  }
  codex: {
    models: CodexModelOption[]
    selectedModelId: string
    onSelectModel: (modelId: string) => void
    selectedThinking: CodexThinkingLevel
    onSelectThinking: (thinking: CodexThinkingLevel) => void
    isConnected: boolean
  }
}

export function AgentModelSelector({
  open,
  onOpenChange,
  selectedAgentId,
  onSelectedAgentIdChange,
  selectedModelLabel,
  allowProviderSwitch = true,
  isBedrockMode = false,
  triggerClassName,
  contentClassName,
  claude,
  codex,
}: AgentModelSelectorProps) {
  const showClaudeGroup = (allowProviderSwitch || selectedAgentId === "claude-code") && claude.isConnected
  const showCodexGroup = (allowProviderSwitch || selectedAgentId === "codex") && codex.isConnected
  const canSelectProvider = (provider: AgentProviderId) =>
    allowProviderSwitch || selectedAgentId === provider

  const selectedCodexModel = codex.models.find((m) => m.id === codex.selectedModelId) || codex.models[0]

  const triggerIcon =
    selectedAgentId === "claude-code" &&
    claude.isOffline &&
    claude.ollamaModels.length > 0 ? (
      <Zap className="h-4 w-4" />
    ) : selectedAgentId === "codex" ? (
      <CodexIcon className="h-3.5 w-3.5" />
    ) : (
      <ClaudeCodeIcon className="h-3.5 w-3.5" />
    )

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            "hover:text-foreground hover:bg-muted/50",
            triggerClassName,
          )}
        >
          {triggerIcon}
          <span className="truncate">{selectedModelLabel}</span>
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className={cn(
          "w-[280px] max-h-[400px] overflow-y-auto",
          contentClassName,
        )}
      >
        {showClaudeGroup && (
          <>
            <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              Claude Code
              {isBedrockMode && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  Bedrock
                </span>
              )}
            </div>

            {claude.isOffline && claude.ollamaModels.length > 0 ? (
              claude.ollamaModels.map((model) => {
                const isSelected =
                  selectedAgentId === "claude-code" &&
                  claude.selectedOllamaModel === model
                const isRecommended = model === claude.recommendedOllamaModel
                return (
                  <DropdownMenuItem
                    key={model}
                    disabled={!canSelectProvider("claude-code")}
                    onClick={() => {
                      if (!canSelectProvider("claude-code")) return
                      onSelectedAgentIdChange("claude-code")
                      claude.onSelectOllamaModel(model)
                    }}
                    className="gap-2 justify-between"
                  >
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>
                        {model}
                        {isRecommended && (
                          <span className="text-muted-foreground ml-1">
                            (recommended)
                          </span>
                        )}
                      </span>
                    </div>
                    {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                  </DropdownMenuItem>
                )
              })
            ) : claude.hasCustomModelConfig ? (
              <DropdownMenuItem
                disabled={!canSelectProvider("claude-code")}
                onClick={() => {
                  if (!canSelectProvider("claude-code")) return
                  onSelectedAgentIdChange("claude-code")
                }}
                className="gap-2 justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Custom Model</span>
                </div>
                {selectedAgentId === "claude-code" && (
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                )}
              </DropdownMenuItem>
            ) : (
              claude.models.map((model) => {
                const isSelected =
                  selectedAgentId === "claude-code" &&
                  claude.selectedModelId === model.id
                return (
                  <DropdownMenuItem
                    key={model.id}
                    disabled={!canSelectProvider("claude-code")}
                    onClick={() => {
                      if (!canSelectProvider("claude-code")) return
                      onSelectedAgentIdChange("claude-code")
                      claude.onSelectModel(model.id)
                    }}
                    className="gap-2 justify-between"
                  >
                    <div className="flex items-center gap-1.5">
                      <ClaudeCodeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>
                        {model.name}{" "}
                        <span className="text-muted-foreground">{model.version}</span>
                      </span>
                    </div>
                    {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                  </DropdownMenuItem>
                )
              })
            )}

            {/* Claude thinking toggle inside dropdown */}
            {selectedAgentId === "claude-code" &&
              !claude.isOffline &&
              !claude.hasCustomModelConfig && (
              <>
                <DropdownMenuSeparator />
                <div
                  className="flex items-center justify-between px-1.5 py-1.5 mx-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5">
                    <ThinkingIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm">Thinking</span>
                  </div>
                  <Switch
                    checked={claude.thinkingEnabled}
                    onCheckedChange={claude.onThinkingChange}
                    className="scale-75"
                  />
                </div>
              </>
            )}
          </>
        )}

        {showClaudeGroup && showCodexGroup && (
          <DropdownMenuSeparator className="my-1" />
        )}

        {showCodexGroup && (
          <>
            <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground">
              OpenAI Codex
            </div>

            {codex.models.map((model) => {
              const isSelected =
                selectedAgentId === "codex" && codex.selectedModelId === model.id
              return (
                <DropdownMenuItem
                  key={model.id}
                  disabled={!canSelectProvider("codex")}
                  onClick={() => {
                    if (!canSelectProvider("codex")) return
                    onSelectedAgentIdChange("codex")
                    codex.onSelectModel(model.id)
                  }}
                  className="gap-2 justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <CodexIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{model.name}</span>
                  </div>
                  {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                </DropdownMenuItem>
              )
            })}

            {/* Thinking level selector inside dropdown */}
            {selectedAgentId === "codex" && selectedCodexModel && (
              <>
                <DropdownMenuSeparator className="my-1" />
                <div className="px-2.5 py-1.5 mx-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Brain className="h-3 w-3" />
                  Thinking
                </div>
                {selectedCodexModel.thinkings.map((thinking) => {
                  const isSelected = codex.selectedThinking === thinking
                  return (
                    <DropdownMenuItem
                      key={thinking}
                      onClick={() => {
                        codex.onSelectThinking(thinking)
                      }}
                      className="gap-2 justify-between pl-4"
                    >
                      <span>{formatCodexThinkingLabel(thinking)}</span>
                      {isSelected && (
                        <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
