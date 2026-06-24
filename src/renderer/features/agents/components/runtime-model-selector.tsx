"use client"

import type { ComponentProps } from "react"
import type { AgentChatProvider } from "../../../../shared/agent-chat-provider"
import {
  parseProviderProfileSource,
  providerProfileSource,
} from "../../../../shared/provider-profile-types"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  CheckIcon,
  IconChevronDown,
} from "../../../components/ui/icons"
import { useI18n } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import type { KunModelSource } from "../atoms"
import {
  AgentModelSelector,
  type AgentProviderId,
} from "./agent-model-selector"

type AgentModelSelectorProps = ComponentProps<typeof AgentModelSelector>

function isAgentModelProvider(
  engine: AgentChatProvider,
): engine is AgentProviderId {
  return engine === "claude-code" || engine === "codex"
}

export function RuntimeModelSelector({
  selectedEngineId,
  selectedModelLabel,
  modelOpen,
  onModelOpenChange,
  triggerClassName,
  contentClassName,
  providerProfiles = [],
  onOpenModelsSettings,
  claude,
  codex,
  kun,
}: {
  selectedEngineId: AgentChatProvider
  selectedModelLabel: string
  modelOpen: boolean
  onModelOpenChange: (open: boolean) => void
  triggerClassName?: string
  contentClassName?: string
  providerProfiles?: AgentModelSelectorProps["providerProfiles"]
  onOpenModelsSettings?: () => void
  claude: AgentModelSelectorProps["claude"]
  codex: AgentModelSelectorProps["codex"]
  kun: {
    selectedModelSource: KunModelSource
    onSelectModelSource: (source: KunModelSource) => void
  }
}) {
  const { t } = useI18n()

  if (isAgentModelProvider(selectedEngineId)) {
    return (
      <AgentModelSelector
        open={modelOpen}
        onOpenChange={onModelOpenChange}
        selectedAgentId={selectedEngineId}
        selectedModelLabel={selectedModelLabel}
        triggerClassName={triggerClassName}
        contentClassName={contentClassName}
        providerProfiles={providerProfiles}
        onOpenModelsSettings={onOpenModelsSettings}
        claude={claude}
        codex={codex}
      />
    )
  }

  if (selectedEngineId === "qwen-code") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("agent.model.selector")}
            className={cn(
              "h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 text-sm font-normal text-muted-foreground",
              triggerClassName,
            )}
            title={selectedModelLabel}
          >
            <AgentIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{selectedModelLabel}</span>
            <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={cn("w-72", contentClassName)}
        >
          <DropdownMenuItem disabled className="justify-between gap-2">
            <span className="min-w-0 flex-1 truncate">
              {t("agent.model.qwenRuntimeManaged")}
            </span>
            <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const kunProfiles =
    providerProfiles?.filter((profile) =>
      profile.targetRuntimes.includes("kun"),
    ) ?? []
  const selectedProfileId = parseProviderProfileSource(kun.selectedModelSource)
  const selectedProfile = selectedProfileId
    ? kunProfiles.find((profile) => profile.id === selectedProfileId)
    : undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("agent.model.selector")}
          className={cn(
            "h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 text-sm font-normal text-muted-foreground",
            triggerClassName,
          )}
          title={selectedModelLabel}
        >
          <AgentIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{selectedModelLabel}</span>
          <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn("w-72", contentClassName)}
      >
        <DropdownMenuItem
          onSelect={() => kun.onSelectModelSource("runtime-managed")}
          className="justify-between gap-2"
        >
          <span className="min-w-0 flex-1 truncate">
            {t("agent.model.kunByoConfig")}
          </span>
          {kun.selectedModelSource === "runtime-managed" ? (
            <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0" />
          ) : null}
        </DropdownMenuItem>
        {kunProfiles.length > 0 ? (
          kunProfiles.map((profile) => {
            const source = providerProfileSource(profile.id) as KunModelSource
            const selected =
              kun.selectedModelSource === source ||
              selectedProfile?.id === profile.id
            return (
              <DropdownMenuItem
                key={profile.id}
                onSelect={() => kun.onSelectModelSource(source)}
                className="justify-between gap-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {profile.name} · {profile.defaultModel}
                </span>
                {selected ? (
                  <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            )
          })
        ) : (
          <DropdownMenuItem disabled>
            {t("agent.model.noKunProviderProfiles")}
          </DropdownMenuItem>
        )}
        {onOpenModelsSettings ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenModelsSettings}>
              {t("agent.model.addModels")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
