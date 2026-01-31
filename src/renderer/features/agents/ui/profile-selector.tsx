import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronDown, Settings } from "lucide-react"
import { useCallback } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { CheckIcon } from "../../../components/ui/icons"
import {
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  lastUsedProfileIdAtom,
  modelProfilesAtom,
  type ModelProfile,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"

interface ProfileSelectorProps {
  chatId: string
  currentProfileId: string | null
  disabled?: boolean
  className?: string
}

/**
 * Dropdown selector for choosing a model profile per-chat.
 * Updates the chat's modelProfileId in the database and syncs lastUsedProfileIdAtom.
 */
export function ProfileSelector({
  chatId,
  currentProfileId,
  disabled = false,
  className,
}: ProfileSelectorProps) {
  const profiles = useAtomValue(modelProfilesAtom)
  const [lastUsedProfileId, setLastUsedProfileId] = useAtom(lastUsedProfileIdAtom)
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  const utils = trpc.useUtils()
  const updateProfileMutation = trpc.chats.updateModelProfile.useMutation({
    onSuccess: () => {
      utils.chats.get.invalidate({ id: chatId })
    },
  })

  // Filter out offline profiles from display (they're auto-selected when offline)
  const displayProfiles = profiles.filter((p) => !p.isOffline)

  // Get effective profile ID (chat's profile or fallback to lastUsed)
  const effectiveProfileId = currentProfileId ?? lastUsedProfileId

  // Find current profile
  const currentProfile = profiles.find((p) => p.id === effectiveProfileId)

  const handleProfileChange = useCallback(
    (profileId: string) => {
      // Update the chat's profile in database
      updateProfileMutation.mutate({ id: chatId, modelProfileId: profileId })

      // Update lastUsedProfileId so new chats inherit this
      setLastUsedProfileId(profileId)
    },
    [chatId, updateProfileMutation, setLastUsedProfileId],
  )

  const handleOpenSettings = useCallback(() => {
    setSettingsTab("models")
    setSettingsOpen(true)
  }, [setSettingsTab, setSettingsOpen])

  // Don't show if no custom profiles configured
  if (displayProfiles.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground transition-colors rounded-md outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            !disabled && "hover:text-foreground hover:bg-muted/50",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <span className="truncate max-w-[100px]">
            {currentProfile?.name || "Default"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        {displayProfiles.map((profile) => {
          const isSelected = profile.id === effectiveProfileId
          return (
            <DropdownMenuItem
              key={profile.id}
              onClick={() => handleProfileChange(profile.id)}
              className="gap-2 justify-between"
            >
              <span className="truncate">{profile.name}</span>
              {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleOpenSettings} className="gap-2">
          <Settings className="h-3.5 w-3.5" />
          <span>Manage Profiles...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Hook to get the effective profile for a chat.
 * Returns the profile from chat.modelProfileId or falls back to lastUsedProfileId.
 */
export function useEffectiveProfile(
  chatModelProfileId: string | null | undefined,
): ModelProfile | null {
  const profiles = useAtomValue(modelProfilesAtom)
  const lastUsedProfileId = useAtomValue(lastUsedProfileIdAtom)

  const effectiveProfileId = chatModelProfileId ?? lastUsedProfileId

  if (!effectiveProfileId) {
    // Return first non-offline profile as default
    return profiles.find((p) => !p.isOffline) ?? null
  }

  return profiles.find((p) => p.id === effectiveProfileId) ?? null
}

/**
 * Hook to get the effective model for a chat within a profile.
 * Returns the model from chat.selectedModelId or falls back to first model in profile.
 */
export function useEffectiveModel(
  profile: ModelProfile | null,
  chatSelectedModelId: string | null | undefined,
) {
  if (!profile || !profile.models || profile.models.length === 0) {
    return null
  }

  // Try to find the selected model
  if (chatSelectedModelId) {
    const selectedModel = profile.models.find((m) => m.id === chatSelectedModelId)
    if (selectedModel) {
      return selectedModel
    }
  }

  // Fallback to first model
  return profile.models[0] ?? null
}
