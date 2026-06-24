"use client"

import {
  parseProviderProfileSource,
  providerProfileSource,
} from "../../../../shared/provider-profile-types"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  CheckIcon,
  IconChevronDown,
} from "../../../components/ui/icons"
import { cn } from "../../../lib/utils"
import type { KunModelSource } from "../atoms"

type KunProviderProfileOption = {
  id: string
  name: string
  defaultModel: string
  targetRuntimes: string[]
  lastTestStatus?: {
    ok: boolean
    message: string
  } | null
}

export function KunProviderProfileSelector({
  providerProfiles,
  selectedModelSource,
  onSelectModelSource,
  onOpenModelsSettings,
  className,
}: {
  providerProfiles: KunProviderProfileOption[]
  selectedModelSource: KunModelSource
  onSelectModelSource: (source: KunModelSource) => void
  onOpenModelsSettings?: () => void
  className?: string
}) {
  const kunProfiles = providerProfiles.filter((profile) =>
    profile.targetRuntimes.includes("kun"),
  )
  const selectedProfileId = parseProviderProfileSource(selectedModelSource)
  const selectedProfile = selectedProfileId
    ? kunProfiles.find((profile) => profile.id === selectedProfileId)
    : undefined
  const selectedLabel = selectedProfile
    ? `${selectedProfile.name} · ${selectedProfile.defaultModel}`
    : "Kun"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 text-sm font-normal text-muted-foreground",
            className,
          )}
          title={selectedLabel}
        >
          <AgentIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{selectedLabel}</span>
          <IconChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem
          onSelect={() => onSelectModelSource("runtime-managed")}
        >
          <span className="min-w-0 flex-1 truncate">Kun BYO config</span>
          {selectedModelSource === "runtime-managed" && (
            <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0" />
          )}
        </DropdownMenuItem>
        {kunProfiles.length === 0 ? (
          <DropdownMenuItem disabled>No Kun provider profiles</DropdownMenuItem>
        ) : (
          kunProfiles.map((profile) => {
            const source = providerProfileSource(profile.id) as KunModelSource
            const isSelected = selectedModelSource === source
            return (
              <DropdownMenuItem
                key={profile.id}
                onSelect={() => onSelectModelSource(source)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {profile.name} · {profile.defaultModel}
                </span>
                {isSelected && (
                  <CheckIcon className="ml-2 h-3.5 w-3.5 shrink-0" />
                )}
              </DropdownMenuItem>
            )
          })
        )}
        {onOpenModelsSettings ? (
          <DropdownMenuItem onSelect={onOpenModelsSettings}>
            Provider Profiles...
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
