# Multiple Model Profiles - Design Document

**Date:** 2025-01-31
**Status:** Approved
**Author:** AI Brainstorming Session

## Overview

Enable users to create and manage multiple Claude API proxy configurations (profiles), each with their own `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, and model name. Users can quickly switch between profiles from the settings UI and directly from the active chat interface.

## Problem Statement

Currently, the app supports only a single "Override Model" configuration. Users with multiple proxy configurations (e.g., local proxy, cloud proxy, different API keys) must manually edit these settings each time they want to switch. This is cumbersome and error-prone.

## Solution

Replace the single "Override Model" card with a profile list UI that supports:
- Creating, editing, deleting, and switching between multiple profiles
- Quick profile selector in the chat header for fast switching
- Auto-detection of CLI config to suggest creating a profile
- Legacy migration from existing single config

## Section 1: UI Layout

### Model Profiles List

The "Override Model" section in [agents-models-tab.tsx](../src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx) will be replaced with a list of profile cards.

**ProfileRow Component Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Profile Name                           [Active] [⋮]             │
│ Model: claude-3-7-sonnet-20250219                               │
│ Proxy: http://localhost:8080                                     │
└─────────────────────────────────────────────────────────────────┘
```

- **Profile Name**: User-defined name (e.g., "Local Proxy", "Cloud Gateway")
- **Active Badge**: Shows which profile is currently active
- **Actions Menu (⋮)**: Edit, Delete, Set Active

**Empty State:**
- When no profiles exist (excluding offline), show "Add your first proxy configuration"
- Button to open the add form

## Section 2: Add/Edit Form & CRUD Operations

### Inline Add/Edit Form

When user clicks "Add Profile" or edits an existing profile, an inline form expands:

```tsx
interface ProfileFormState {
  mode: 'add' | 'edit'
  profileId?: string  // set when editing
  fields: {
    name: string
    model: string
    token: string
    baseUrl: string
  }
}
```

**Form Fields:**
- Name (text input, required)
- Model (text input, placeholder: "claude-3-7-sonnet-20250219")
- API Token (password input, placeholder: "sk-ant-...")
- Base URL (text input, placeholder: "https://api.anthropic.com")

**Validation:**
- All fields required
- Token should start with "sk-ant-" (warning only, not blocking)
- Base URL should be a valid URL format

### CRUD Operations Table

| Operation | Action | Atoms Updated |
|-----------|--------|---------------|
| **Add** | Push new profile to `modelProfilesAtom` | `modelProfilesAtom`, `activeProfileIdAtom` (if first) |
| **Edit** | Find by ID and update in `modelProfilesAtom` | `modelProfilesAtom` |
| **Delete** | Filter out by ID from `modelProfilesAtom` | `modelProfilesAtom`, `activeProfileIdAtom` (if deleting active) |
| **Set Active** | Update `activeProfileIdAtom` | `activeProfileIdAtom` |

**Delete Behavior:**
- If deleting the active profile, auto-select the next available profile
- If no profiles remain, set `activeProfileIdAtom` to `null` (use default)
- Show confirmation dialog for delete

## Section 3: Integration

### Existing System Integration

The `activeConfigAtom` in [atoms/index.ts](../src/renderer/lib/atoms/index.ts) already handles the priority chain:

```typescript
// Priority chain:
// 1. Auto-offline (if enabled and no internet)
// 2. Active profile (if selected)
// 3. Legacy single config (backwards compat)
// 4. None (use Claude Code default)
```

**No changes needed to `activeConfigAtom`** - it already reads from `activeProfileIdAtom` and `modelProfilesAtom`.

### CLI Config Auto-Detection

The existing [cli-config-detected-page.tsx](../src/renderer/features/onboarding/cli-config-detected-page.tsx) detects environment variables. Extend it to offer creating a profile:

**Flow:**
1. User has `ANTHROPIC_BASE_URL` and/or `ANTHROPIC_API_KEY` in env
2. App shows "Configuration Detected" page
3. User clicks "Use Existing Configuration"
4. **NEW**: Prompt "Save as a profile?" with Yes/No
5. If Yes, open inline form with detected values pre-filled

### Legacy Migration

On app startup, check if `customClaudeConfigAtom` has values:

```typescript
// One-time migration
useEffect(() => {
  const legacyConfig = get(customClaudeConfigAtom)
  const profiles = get(modelProfilesAtom)

  // Only migrate if legacy has values and profiles is default (only offline)
  if (normalizeCustomClaudeConfig(legacyConfig) && profiles.length === 1) {
    const migratedProfile: ModelProfile = {
      id: crypto.randomUUID(),
      name: "Migrated Config",
      config: legacyConfig,
    }
    set(modelProfilesAtom, [OFFLINE_PROFILE, migratedProfile])
    set(activeProfileIdAtom, migratedProfile.id)
    // Clear legacy
    set(customClaudeConfigAtom, EMPTY_CONFIG)
  }
}, [])
```

### Quick Selector in Chat

Add a dropdown in the chat header ([active-chat.tsx](../src/renderer/features/agents/main/active-chat.tsx)) for fast profile switching:

```
┌─────────────────────────────────────────────────────────────────┐
│ [New Chat]  [Profile: Local Proxy ▼]        [Settings ⚙]       │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Use `DropdownMenu` with `RadioGroup` for selection
- Show active profile with checkmark
- clicking updates `activeProfileIdAtom`
- Profile change takes effect on next message

## Files to Modify

1. **[agents-models-tab.tsx](../src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx)** - Replace Override Model section with profile list
2. **[cli-config-detected-page.tsx](../src/renderer/features/onboarding/cli-config-detected-page.tsx)** - Add "Save as profile" option
3. **[active-chat.tsx](../src/renderer/features/agents/main/active-chat.tsx)** - Add quick profile selector to header
4. **[atoms/index.ts](../src/renderer/lib/atoms/index.ts)** - Add migration logic (atoms already in place)

## Data Types (Already Defined)

```typescript
export type ModelProfile = {
  id: string
  name: string
  config: CustomClaudeConfig
  isOffline?: boolean
}

export type CustomClaudeConfig = {
  model: string
  token: string
  baseUrl: string
}
```

## Future Enhancements (Out of Scope)

- Per-chat profile selection
- Profile import/export
- Connection testing before saving
- Profile templates (presets for common proxies)
