# Multiple Model Profiles - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to create, manage, and switch between multiple Claude API proxy configurations (profiles) with custom base URLs, API keys, and model names.

**Architecture:** Replace the single "Override Model" form with a profile list UI. Use existing `modelProfilesAtom` and `activeProfileIdAtom` for state. The `activeConfigAtom` already handles the priority chain - no changes needed there.

**Tech Stack:** React 19, Jotai atoms, TypeScript, Tailwind CSS, Radix UI components, sonner toasts

---

## Task 1: Create ProfileRow Component

**Files:**
- Create: `src/renderer/components/dialogs/settings-tabs/model-profile-row.tsx`

**Step 1: Write the component**

```tsx
import { Check, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { type ModelProfile } from "../../../../lib/atoms"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"

interface ProfileRowProps {
  profile: ModelProfile
  isActive: boolean
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ModelProfileRow({
  profile,
  isActive,
  onActivate,
  onEdit,
  onDelete,
}: ProfileRowProps) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{profile.name}</span>
            {isActive && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Model: {profile.config.model || "Not set"}
          </div>
          <div className="text-xs text-muted-foreground">
            Proxy: {profile.config.baseUrl || "Default (api.anthropic.com)"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button size="sm" variant="ghost" onClick={onActivate}>
            Use
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/dialogs/settings-tabs/model-profile-row.tsx
git commit -m "feat: add ModelProfileRow component for profile list"
```

---

## Task 2: Create ProfileForm Component (Inline Add/Edit)

**Files:**
- Create: `src/renderer/components/dialogs/settings-tabs/model-profile-form.tsx`

**Step 1: Write the component**

```tsx
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { type CustomClaudeConfig, type ModelProfile } from "../../../../lib/atoms"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

interface ProfileFormProps {
  mode: "add" | "edit"
  existingProfile?: ModelProfile
  onSave: (profile: Omit<ModelProfile, "id">) => void
  onCancel: () => void
}

export function ModelProfileForm({
  mode,
  existingProfile,
  onSave,
  onCancel,
}: ProfileFormProps) {
  const [name, setName] = useState(existingProfile?.name || "")
  const [model, setModel] = useState(existingProfile?.config.model || "")
  const [token, setToken] = useState(existingProfile?.config.token || "")
  const [baseUrl, setBaseUrl] = useState(existingProfile?.config.baseUrl || "")

  const isValid = name.trim() && model.trim() && token.trim() && baseUrl.trim()

  const handleSave = () => {
    if (!isValid) return

    onSave({
      name: name.trim(),
      config: {
        model: model.trim(),
        token: token.trim(),
        baseUrl: baseUrl.trim(),
      },
    })
  }

  return (
    <div className="p-4 space-y-4 border-t border-border bg-muted/30">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {mode === "add" ? "Add Profile" : "Edit Profile"}
        </h4>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="profile-name" className="text-xs">
            Profile Name *
          </Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Local Proxy, Cloud Gateway"
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="profile-model" className="text-xs">
            Model *
          </Label>
          <Input
            id="profile-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="claude-3-7-sonnet-20250219"
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="profile-token" className="text-xs">
            API Token *
          </Label>
          <Input
            id="profile-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="sk-ant-..."
            className="h-8"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="profile-base-url" className="text-xs">
            Base URL *
          </Label>
          <Input
            id="profile-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com"
            className="h-8"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={!isValid}
          className="w-full"
          size="sm"
        >
          {mode === "add" ? "Add Profile" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/dialogs/settings-tabs/model-profile-form.tsx
git commit -m "feat: add ModelProfileForm component for add/edit"
```

---

## Task 3: Create ModelProfilesSection Component

**Files:**
- Create: `src/renderer/components/dialogs/settings-tabs/model-profiles-section.tsx`

**Step 1: Write the component**

```tsx
import { useAtom } from "jotai"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  activeProfileIdAtom,
  modelProfilesAtom,
  type ModelProfile,
} from "../../../../lib/atoms"
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
```

**Step 2: Commit**

```bash
git add src/renderer/components/dialogs/settings-tabs/model-profiles-section.tsx
git commit -m "feat: add ModelProfilesSection with CRUD operations"
```

---

## Task 4: Integrate ModelProfilesSection into AgentsModelsTab

**Files:**
- Modify: `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx:463-599`

**Step 1: Replace the Override Model section with ModelProfilesSection**

Find the existing "Override Model" section (around line 463) and replace it with:

```tsx
      {/* Model Profiles */}
      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Model Profiles
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your proxy configurations
            </p>
          </div>
        </div>

        <ModelProfilesSection />
      </div>
```

**Step 2: Add the import at the top of the file**

Add to imports section:
```tsx
import { ModelProfilesSection } from "./model-profiles-section"
```

**Step 3: Remove the old Override Model UI code**

Delete the entire "Override Model" section div that contains:
- The header with "Override Model" title and Reset button
- The form with Model name, API token, and Base URL inputs
- All associated state (model, baseUrl, token, handleBlurSave, handleReset, etc.)

**Step 4: Clean up unused code**

Remove these unused imports and state from the component:
- `storedConfig, setStoredConfig, model, baseUrl, token` state variables
- `handleBlurSave`, `handleReset` handlers
- `savedConfigRef` ref
- `useEffect` hooks for syncing config state

**Step 5: Commit**

```bash
git add src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx
git commit -m "feat: integrate ModelProfilesSection into settings tab"
```

---

## Task 5: Add Quick Profile Selector to Chat Header

**Files:**
- Modify: `src/renderer/features/agents/main/active-chat.tsx`

**Step 1: Find the chat header section**

Locate the header area in active-chat.tsx that contains the chat title and controls. Look for elements like the model badge or settings button.

**Step 2: Add the profile selector dropdown**

Insert this component near the header controls:

```tsx
import { useAtom } from "jotai"
import { ChevronDown } from "lucide-react"
import { activeProfileIdAtom, modelProfilesAtom } from "../../../../lib/atoms"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu"
import { Badge } from "../../../components/ui/badge"

// Inside the component, add:
function ModelProfileSelector() {
  const [profiles] = useAtom(modelProfilesAtom)
  const [activeProfileId, setActiveProfileId] = useAtom(activeProfileIdAtom)

  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const customProfiles = profiles.filter((p) => !p.isOffline)

  if (customProfiles.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1">
          <span className="text-xs">
            {activeProfile ? activeProfile.name : "Default"}
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => setActiveProfileId(null)}>
          <span>Default (no profile)</span>
          {!activeProfileId && <Badge className="ml-auto text-xs">Active</Badge>}
        </DropdownMenuItem>
        {customProfiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            onClick={() => setActiveProfileId(profile.id)}
          >
            <span>{profile.name}</span>
            {activeProfileId === profile.id && (
              <Badge className="ml-auto text-xs">Active</Badge>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Step 3: Place the selector in the header**

Add `<ModelProfileSelector />` in the header, likely next to the settings button or model indicator.

**Step 4: Commit**

```bash
git add src/renderer/features/agents/main/active-chat.tsx
git commit -m "feat: add quick profile selector to chat header"
```

---

## Task 6: Add CLI Config "Save as Profile" Prompt

**Files:**
- Modify: `src/renderer/features/onboarding/cli-config-detected-page.tsx:29-37`

**Step 1: Modify handleUseExistingConfig to prompt for saving**

Replace the existing `handleUseExistingConfig` function with:

```tsx
  const handleUseExistingConfig = () => {
    const cliConfigData = cliConfig
    if (!cliConfigData) return

    // Prompt user to save as profile
    const shouldSave = window.confirm(
      "Would you like to save this configuration as a profile for easy switching later?",
    )

    if (shouldSave) {
      // Get profiles from atom
      const profiles = get(modelProfilesAtom)
      const setProfiles = set(modelProfilesAtom)
      const setActiveProfileId = set(activeProfileIdAtom)

      const newProfile: ModelProfile = {
        id: crypto.randomUUID(),
        name: "Detected CLI Config",
        config: {
          model: cliConfigData.model || "claude-3-7-sonnet-20250219",
          token: cliConfigData.apiKey || "",
          baseUrl: cliConfigData.baseUrl || "https://api.anthropic.com",
        },
      }

      setProfiles([...profiles, newProfile])
      setActiveProfileId(newProfile.id)
    }

    // Mark CLI config detected as shown
    setCliConfigDetectedShown(true)
    setBillingMethod("api-key")
    setApiKeyOnboardingCompleted(true)
  }
```

**Step 2: Add necessary imports**

Add to imports:
```tsx
import { modelProfilesAtom, activeProfileIdAtom, type ModelProfile } from "../../lib/atoms"
import { useSetAtom, useAtom } from "jotai"
```

**Step 3: Commit**

```bash
git add src/renderer/features/onboarding/cli-config-detected-page.tsx
git commit -m "feat: add 'save as profile' option to CLI config detection"
```

---

## Task 7: Add Legacy Config Migration

**Files:**
- Modify: `src/renderer/lib/atoms/index.ts`

**Step 1: Add migration logic after atom definitions**

Add this code after the `customClaudeConfigAtom` definition (around line 271):

```tsx
// Migration: convert legacy single config to profile
// This runs once when the module loads
if (typeof window !== "undefined") {
  const legacyKey = "agents:claude-custom-config"
  const migrationFlagKey = "agents:legacy-config-migrated"

  const legacyValue = localStorage.getItem(legacyKey)
  const hasMigrated = localStorage.getItem(migrationFlagKey)

  if (legacyValue && !hasMigrated) {
    try {
      const legacyConfig: CustomClaudeConfig = JSON.parse(legacyValue)

      // Only migrate if has actual values
      if (
        legacyConfig.model?.trim() ||
        legacyConfig.token?.trim() ||
        legacyConfig.baseUrl?.trim()
      ) {
        const profilesKey = "agents:model-profiles"
        const activeProfileKey = "agents:active-profile-id"

        const existingProfiles = localStorage.getItem(profilesKey)
        const profiles: ModelProfile[] = existingProfiles
          ? JSON.parse(existingProfiles)
          : [OFFLINE_PROFILE]

        // Create migrated profile
        const migratedProfile: ModelProfile = {
          id: crypto.randomUUID(),
          name: "Migrated Config",
          config: {
            model: legacyConfig.model || "",
            token: legacyConfig.token || "",
            baseUrl: legacyConfig.baseUrl || "",
          },
        }

        // Add profile and set as active
        const updatedProfiles = [...profiles, migratedProfile]
        localStorage.setItem(profilesKey, JSON.stringify(updatedProfiles))
        localStorage.setItem(activeProfileKey, JSON.stringify(migratedProfile.id))

        // Clear legacy config
        localStorage.setItem(
          legacyKey,
          JSON.stringify({ model: "", token: "", baseUrl: "" }),
        )

        // Mark as migrated
        localStorage.setItem(migrationFlagKey, "true")
        console.log("[atoms] Migrated legacy config to profile system")
      }
    } catch (e) {
      console.error("[atoms] Failed to migrate legacy config:", e)
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/renderer/lib/atoms/index.ts
git commit -m "feat: add legacy config migration to profile system"
```

---

## Testing Checklist

After completing all tasks, verify:

1. **Settings UI:**
   - [ ] Can add a new profile with all fields
   - [ ] Can edit an existing profile
   - [ ] Can delete a profile
   - [ ] Active profile shows badge
   - [ ] Clicking "Use" activates a profile
   - [ ] Empty state shows "Add Profile" button

2. **Chat Header:**
   - [ ] Profile selector appears when profiles exist
   - [ ] Can switch profiles from dropdown
   - [ ] Active profile is highlighted
   - [ ] "Default" option clears active profile

3. **CLI Config Detection:**
   - [ ] Prompt appears when using existing config
   - [ ] Choosing "Yes" creates a profile
   - [ ] Profile is auto-activated

4. **Legacy Migration:**
   - [ ] Existing `customClaudeConfigAtom` values migrate to profile
   - [ ] Migrated profile is set as active
   - [ ] Legacy config is cleared after migration

5. **Integration:**
   - [ ] Active profile config is used by `activeConfigAtom`
   - [ ] Switching profiles affects next message
   - [ ] Offline profile still works for fallback

---

## Files Modified Summary

| File | Action |
|------|--------|
| `src/renderer/components/dialogs/settings-tabs/model-profile-row.tsx` | Create |
| `src/renderer/components/dialogs/settings-tabs/model-profile-form.tsx` | Create |
| `src/renderer/components/dialogs/settings-tabs/model-profiles-section.tsx` | Create |
| `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` | Modify |
| `src/renderer/features/agents/main/active-chat.tsx` | Modify |
| `src/renderer/features/onboarding/cli-config-detected-page.tsx` | Modify |
| `src/renderer/lib/atoms/index.ts` | Modify |

---

## Related Docs

- Design: [docs/plans/2025-01-31-multiple-model-profiles-design.md](./2025-01-31-multiple-model-profiles-design.md)
- Atoms reference: `src/renderer/lib/atoms/index.ts:222-368`
