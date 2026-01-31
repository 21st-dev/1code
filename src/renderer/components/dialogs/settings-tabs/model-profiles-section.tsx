import { useAtom } from "jotai"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  activeProfileIdAtom,
  modelProfilesAtom,
  type ModelProfile,
} from "../../../lib/atoms"
import { Button } from "../../ui/button"
import { ModelProfileForm } from "./model-profile-form"
import { ModelProfileRow } from "./model-profile-row"

type FormState = {
  mode: "add" | "edit" | null
  editingProfile?: ModelProfile
}

export function ModelProfilesSection() {
  const [profiles, setProfiles] = useAtom(modelProfilesAtom)
  const [activeProfileId, setActiveProfileId] = useAtom(activeProfileIdAtom)
  const [formState, setFormState] = useState<FormState>({ mode: null })

  // Filter out offline profile from display
  const customProfiles = profiles.filter((p) => !p.isOffline)

  const handleAddProfile = (profileData: Omit<ModelProfile, "id">) => {
    const newProfile: ModelProfile = {
      ...profileData,
      id: crypto.randomUUID(),
    }

    setProfiles([...profiles, newProfile])

    // If this is the first custom profile, auto-activate it
    if (customProfiles.length === 0) {
      setActiveProfileId(newProfile.id)
    }

    setFormState({ mode: null })
    toast.success("Profile added")
  }

  const handleEditProfile = (profileData: Omit<ModelProfile, "id">) => {
    if (!formState.editingProfile) return

    setProfiles(
      profiles.map((p) =>
        p.id === formState.editingProfile!.id
          ? { ...profileData, id: p.id }
          : p,
      ),
    )

    setFormState({ mode: null })
    toast.success("Profile updated")
  }

  const handleDeleteProfile = (profileId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this profile?",
    )
    if (!confirmed) return

    const newProfiles = profiles.filter((p) => p.id !== profileId)
    setProfiles(newProfiles)

    // If we deleted the active profile, clear the active ID
    if (activeProfileId === profileId) {
      const remainingCustom = newProfiles.filter((p) => !p.isOffline)
      setActiveProfileId(remainingCustom[0]?.id || null)
    }

    toast.success("Profile deleted")
  }

  const handleStartEdit = (profile: ModelProfile) => {
    setFormState({ mode: "edit", editingProfile: profile })
  }

  const handleCancelForm = () => {
    setFormState({ mode: null })
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
      {customProfiles.length === 0 && !formState.mode ? (
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No custom profiles yet. Add your first proxy configuration.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFormState({ mode: "add" })}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Profile
          </Button>
        </div>
      ) : (
        <>
          {customProfiles.map((profile) => (
            <ModelProfileRow
              key={profile.id}
              profile={profile}
              isActive={activeProfileId === profile.id}
              onActivate={() => setActiveProfileId(profile.id)}
              onEdit={() => handleStartEdit(profile)}
              onDelete={() => handleDeleteProfile(profile.id)}
            />
          ))}

          {formState.mode && (
            <ModelProfileForm
              mode={formState.mode}
              existingProfile={formState.editingProfile}
              onSave={
                formState.mode === "add"
                  ? handleAddProfile
                  : handleEditProfile
              }
              onCancel={handleCancelForm}
            />
          )}

          {!formState.mode && (
            <div className="p-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setFormState({ mode: "add" })}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Profile
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
