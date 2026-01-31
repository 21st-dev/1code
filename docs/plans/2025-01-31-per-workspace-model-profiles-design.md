# Per-Workspace Model Profiles

**Date:** 2025-01-31
**Status:** Approved
**Author:** AI Assistant

## Overview

Currently, model profiles are stored globally in localStorage. All chats share the same active profile. This design changes model profiles to be **per-chat (workspace)**, allowing each workspace to use a different model profile.

## Goals

1. Each chat/workspace can independently select a model profile
2. Each profile contains a list of available models with display names
3. Model selector shows `DisplayName (modelId)` format (e.g., "Opus (glm-4.7)")
4. New chats inherit the last-used profile
5. Profile can be changed from chat input area and right-click context menu

## Non-Goals

- Per-project profiles (may add later as enhancement)
- Syncing profiles across devices
- Profile import/export

---

## Data Model Changes

### 1. Extend `ModelProfile` Type

**File:** `src/renderer/lib/atoms/index.ts`

```typescript
// NEW: Model mapping within a profile
export type ModelMapping = {
  id: string           // Internal reference ID (e.g., "opus", "sonnet", "haiku")
  displayName: string  // User-facing name (e.g., "Opus", "Sonnet 3.5")
  modelId: string      // Actual model ID sent to API (e.g., "glm-4.7", "claude-3-opus-20240229")
  supportsThinking?: boolean  // Whether this model supports extended thinking
}

// UPDATED: Add models array to profile
export type ModelProfile = {
  id: string
  name: string                  // Profile name (e.g., "My OpenRouter Proxy")
  config: CustomClaudeConfig    // Base URL, token, default model
  models: ModelMapping[]        // NEW: Available models for this profile
  isOffline?: boolean           // Mark as offline/Ollama profile
}
```

### 2. Database Schema Changes

**File:** `src/main/lib/db/schema/index.ts`

Add two new columns to `chats` table:

```typescript
export const chats = sqliteTable("chats", {
  // ... existing fields ...

  // NEW: Model profile reference
  // References profile ID from localStorage modelProfilesAtom
  // null = use lastUsedProfileId (global default)
  modelProfileId: text("model_profile_id"),

  // NEW: Selected model within the profile
  // References ModelMapping.id from the profile's models array
  // null = use first model in profile
  selectedModelId: text("selected_model_id"),
})
```

### 3. Migration

**File:** `drizzle/XXXX_add_model_profile_to_chats.sql`

```sql
ALTER TABLE chats ADD COLUMN model_profile_id TEXT;
ALTER TABLE chats ADD COLUMN selected_model_id TEXT;
```

### 4. Rename Global Atom

**File:** `src/renderer/lib/atoms/index.ts`

```typescript
// RENAME: activeProfileIdAtom → lastUsedProfileIdAtom
// This now serves as:
// 1. Default for new chats
// 2. Fallback for chats with null modelProfileId
// 3. Updated whenever user changes profile on any chat

export const lastUsedProfileIdAtom = atomWithStorage<string | null>(
  "agents:last-used-profile-id",  // New storage key
  null,
  undefined,
  { getOnInit: true },
)

// Migration: read old key, write to new key, delete old
if (typeof window !== "undefined") {
  const oldKey = "agents:active-profile-id"
  const newKey = "agents:last-used-profile-id"
  const oldValue = localStorage.getItem(oldKey)
  if (oldValue !== null && localStorage.getItem(newKey) === null) {
    localStorage.setItem(newKey, oldValue)
    localStorage.removeItem(oldKey)
  }
}
```

### 5. Type Exports

**File:** `src/main/lib/db/schema/index.ts`

```typescript
// Update Chat type to include new fields
export type Chat = typeof chats.$inferSelect
// Chat now includes: modelProfileId: string | null, selectedModelId: string | null
```

---

## UI Components

### 1. Profile Selector (New Component)

**File:** `src/renderer/features/agents/ui/profile-selector.tsx`

A dropdown component for selecting model profile.

```typescript
interface ProfileSelectorProps {
  chatId: string
  currentProfileId: string | null  // null = using default
  onProfileChange: (profileId: string) => void
}
```

**Behavior:**
- Displays current profile name (or "Default" if null)
- Dropdown shows all profiles from `modelProfilesAtom`
- Checkmark on currently selected profile
- On select: calls `onProfileChange` which updates DB and atoms

**Visual Design:**
```
┌──────────────────┐
│ My Proxy       ▼ │  ← Compact button with dropdown arrow
└──────────────────┘

Dropdown open:
┌──────────────────────┐
│ ✓ My Proxy           │  ← Current selection
│   OpenRouter         │
│   Local Ollama       │
│ ─────────────────── │
│   Manage Profiles... │  ← Opens settings
└──────────────────────┘
```

### 2. Updated Model Selector

**File:** `src/renderer/features/agents/main/chat-input-area.tsx`

Update existing model dropdown to:
1. Source models from current profile's `models` array (not global `CLAUDE_MODELS`)
2. Display format: `DisplayName (modelId)` (e.g., "Opus (glm-4.7)")
3. Store selection in `chat.selectedModelId`

**Visual Design:**
```
┌─────────────────────────┐
│ ❈ Opus (glm-4.7)      ▼ │
└─────────────────────────┘

Dropdown open:
┌─────────────────────────────┐
│ ✓ Opus (glm-4.7)            │
│   Sonnet (claude-3-sonnet)  │
│   Haiku (claude-3-haiku)    │
└─────────────────────────────┘
```

### 3. Chat Input Area Layout

**File:** `src/renderer/features/agents/main/chat-input-area.tsx`

Update `PromptInputActions` layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Plan, @ for context, / for commands                            │
├─────────────────────────────────────────────────────────────────┤
│ [My Proxy ▼] ❈ Opus (glm-4.7) ▼  🧠 Thinking  📍  │  ○  📎  ⬆ │
│ └─ NEW ──┘  └──── UPDATED ────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

Component order (left to right):
1. **Profile Selector** (NEW) - dropdown to select profile
2. **Model Selector** (UPDATED) - shows models from selected profile
3. **Thinking Toggle** (existing)
4. **Mode Toggle** (existing)
5. **Context Indicator** (existing)
6. **Attach Button** (existing)
7. **Send Button** (existing)

### 4. Chat Right-Click Context Menu

**File:** `src/renderer/features/sidebar/components/chat-item.tsx` (or equivalent)

Add "Model Profile" submenu to existing context menu:

```
┌─────────────────────────┐
│ Rename                  │
│ Archive                 │
│ ─────────────────────── │
│ Model Profile         ▸ │  ← NEW submenu
│ ─────────────────────── │
│ Delete                  │
└─────────────────────────┘

Submenu:
┌─────────────────────────┐
│ ✓ My Proxy              │
│   OpenRouter            │
│   Local Ollama          │
│ ─────────────────────── │
│   Manage Profiles...    │
└─────────────────────────┘
```

### 5. Model Profile Form Update

**File:** `src/renderer/components/dialogs/settings-tabs/model-profile-form.tsx`

Add models configuration to profile form:

```
┌─────────────────────────────────────────────────────────┐
│ Profile Name: [My OpenRouter Proxy          ]           │
│ Base URL:     [https://api.openrouter.ai    ]           │
│ API Token:    [sk-or-...                    ]           │
│                                                         │
│ ─────────────── Models ─────────────────────────────── │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Display Name    Model ID              Thinking  [×] │ │
│ │ [Opus        ]  [glm-4.7           ]    [✓]         │ │
│ │ [Sonnet      ]  [claude-3-sonnet   ]    [✓]         │ │
│ │ [Haiku       ]  [claude-3-haiku    ]    [ ]         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [+ Add Model]                                           │
│                                                         │
│                              [Cancel]  [Save Profile]   │
└─────────────────────────────────────────────────────────┘
```

---

## State Management

### 1. New Atoms/Hooks

**File:** `src/renderer/features/agents/atoms/index.ts`

```typescript
// Get effective profile ID for a chat (with fallback)
export function useEffectiveProfileId(chat: Chat | null): string | null {
  const lastUsedProfileId = useAtomValue(lastUsedProfileIdAtom)
  return chat?.modelProfileId ?? lastUsedProfileId
}

// Get effective model ID for a chat (with fallback)
export function useEffectiveModelId(
  chat: Chat | null,
  profile: ModelProfile | null
): string | null {
  if (!profile) return null
  const chatModelId = chat?.selectedModelId
  // If chat has a model selected and it exists in profile, use it
  if (chatModelId && profile.models.some(m => m.id === chatModelId)) {
    return chatModelId
  }
  // Otherwise use first model in profile
  return profile.models[0]?.id ?? null
}

// Get full model info for display
export function useCurrentModel(
  chat: Chat | null,
  profiles: ModelProfile[]
): { profile: ModelProfile | null; model: ModelMapping | null } {
  const effectiveProfileId = useEffectiveProfileId(chat)
  const profile = profiles.find(p => p.id === effectiveProfileId) ?? null
  const effectiveModelId = useEffectiveModelId(chat, profile)
  const model = profile?.models.find(m => m.id === effectiveModelId) ?? null
  return { profile, model }
}
```

### 2. tRPC Router Updates

**File:** `src/main/lib/trpc/routers/chats.ts`

```typescript
// Update chat's model profile
updateModelProfile: publicProcedure
  .input(z.object({
    chatId: z.string(),
    modelProfileId: z.string().nullable(),
  }))
  .mutation(async ({ input }) => {
    const db = getDatabase()
    db.update(chats)
      .set({
        modelProfileId: input.modelProfileId,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, input.chatId))
      .run()
    return { success: true }
  }),

// Update chat's selected model
updateSelectedModel: publicProcedure
  .input(z.object({
    chatId: z.string(),
    selectedModelId: z.string().nullable(),
  }))
  .mutation(async ({ input }) => {
    const db = getDatabase()
    db.update(chats)
      .set({
        selectedModelId: input.selectedModelId,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, input.chatId))
      .run()
    return { success: true }
  }),
```

### 3. Chat Creation Update

**File:** `src/main/lib/trpc/routers/chats.ts`

Update `create` procedure to accept optional profile:

```typescript
create: publicProcedure
  .input(z.object({
    projectId: z.string(),
    name: z.string().optional(),
    modelProfileId: z.string().nullable().optional(),  // NEW
    selectedModelId: z.string().nullable().optional(), // NEW
  }))
  .mutation(async ({ input }) => {
    const db = getDatabase()
    const [chat] = db.insert(chats).values({
      projectId: input.projectId,
      name: input.name,
      modelProfileId: input.modelProfileId ?? null,      // NEW
      selectedModelId: input.selectedModelId ?? null,    // NEW
    }).returning().all()
    return chat
  }),
```

---

## Behavior Specifications

### 1. Profile Change Flow

When user changes profile (from input area or context menu):

```
1. User selects new profile from dropdown
2. Call trpc.chats.updateModelProfile({ chatId, modelProfileId: newProfileId })
3. Update lastUsedProfileIdAtom (so new chats inherit this)
4. Model dropdown reloads with new profile's models array
5. Auto-select first model from new profile (or try to match by displayName)
6. If model changed, call trpc.chats.updateSelectedModel({ chatId, selectedModelId })
7. UI updates immediately (optimistic)
```

### 2. Model Change Flow

When user changes model within current profile:

```
1. User selects new model from dropdown
2. Call trpc.chats.updateSelectedModel({ chatId, selectedModelId: newModelId })
3. UI updates immediately (optimistic)
4. Next message uses new model
```

### 3. New Chat Creation Flow

When user creates a new chat:

```
1. Get lastUsedProfileId from atom
2. Get lastUsedModelId from profile (could store in atom too)
3. Create chat with:
   - modelProfileId: lastUsedProfileId
   - selectedModelId: lastUsedModelId (or first model in profile)
4. Chat immediately shows correct profile and model
```

### 4. Sending Message Flow

When sending a message to Claude:

```typescript
// In claude.ts router
const chat = await db.select().from(chats).where(eq(chats.id, chatId)).get()
const profiles = /* get from IPC or passed in */

// Get effective profile
const effectiveProfileId = chat.modelProfileId ?? lastUsedProfileId
const profile = profiles.find(p => p.id === effectiveProfileId)

if (!profile) {
  // No profile configured - use Claude Code default (OAuth)
  return await sendWithDefaultAuth(message)
}

// Get effective model
const effectiveModelId = chat.selectedModelId ?? profile.models[0]?.id
const model = profile.models.find(m => m.id === effectiveModelId)

// Build config for Claude SDK
const config = {
  baseUrl: profile.config.baseUrl,
  apiKey: profile.config.token,
  model: model?.modelId ?? profile.config.model,
  // Extended thinking support
  supportsThinking: model?.supportsThinking ?? true,
}

return await sendWithCustomConfig(message, config)
```

### 5. Fallback Chain

When resolving which profile/model to use:

```
Profile Resolution:
1. chat.modelProfileId (if set and profile exists)
2. lastUsedProfileIdAtom (if set and profile exists)
3. First non-offline profile in modelProfilesAtom
4. null (use Claude Code OAuth default)

Model Resolution (within profile):
1. chat.selectedModelId (if set and model exists in profile)
2. First model in profile.models array
3. profile.config.model (legacy fallback)
```

---

## Migration Strategy

### 1. Existing Profiles

Existing profiles in localStorage don't have `models` array. Add migration:

```typescript
// In atoms/index.ts or a migration hook
const migrateProfiles = (profiles: ModelProfile[]): ModelProfile[] => {
  return profiles.map(profile => {
    if (profile.models && profile.models.length > 0) {
      return profile // Already migrated
    }

    // Generate default models from legacy config
    const defaultModel: ModelMapping = {
      id: 'default',
      displayName: 'Default',
      modelId: profile.config.model || 'claude-3-opus',
      supportsThinking: true,
    }

    return {
      ...profile,
      models: [defaultModel],
    }
  })
}
```

### 2. Existing Chats

Existing chats have `modelProfileId: null` and `selectedModelId: null`. This is fine - they'll use the fallback chain (lastUsedProfileId → first profile → default).

### 3. LocalStorage Key Rename

Migrate `activeProfileIdAtom` to `lastUsedProfileIdAtom`:

```typescript
// Run once on app start
if (typeof window !== "undefined") {
  const oldKey = "agents:active-profile-id"
  const newKey = "agents:last-used-profile-id"
  const oldValue = localStorage.getItem(oldKey)
  if (oldValue !== null && localStorage.getItem(newKey) === null) {
    localStorage.setItem(newKey, oldValue)
    localStorage.removeItem(oldKey)
  }
}
```

---

## Implementation Tasks

### Phase 1: Data Model (Backend)

- [ ] **1.1** Add `ModelMapping` type to atoms
- [ ] **1.2** Update `ModelProfile` type to include `models: ModelMapping[]`
- [ ] **1.3** Add migration for existing profiles (add default models array)
- [ ] **1.4** Add `modelProfileId` and `selectedModelId` columns to chats schema
- [ ] **1.5** Create Drizzle migration file
- [ ] **1.6** Rename `activeProfileIdAtom` → `lastUsedProfileIdAtom` with migration
- [ ] **1.7** Update Chat type exports

### Phase 2: tRPC API

- [ ] **2.1** Add `chats.updateModelProfile` mutation
- [ ] **2.2** Add `chats.updateSelectedModel` mutation
- [ ] **2.3** Update `chats.create` to accept modelProfileId and selectedModelId
- [ ] **2.4** Update `chats.getById` to return new fields

### Phase 3: UI Components

- [ ] **3.1** Create `ProfileSelector` component
- [ ] **3.2** Update model selector to show `DisplayName (modelId)` format
- [ ] **3.3** Update model selector to source from profile's models array
- [ ] **3.4** Integrate ProfileSelector into ChatInputArea (left of model selector)
- [ ] **3.5** Add "Model Profile" submenu to chat context menu
- [ ] **3.6** Update ModelProfileForm to include models configuration

### Phase 4: State & Logic

- [ ] **4.1** Create `useEffectiveProfileId` hook
- [ ] **4.2** Create `useEffectiveModelId` hook
- [ ] **4.3** Create `useCurrentModel` hook
- [ ] **4.4** Update ChatInputArea to use new hooks
- [ ] **4.5** Update profile change handler (update DB + lastUsedProfileIdAtom)
- [ ] **4.6** Update model change handler (update DB)
- [ ] **4.7** Update new chat creation to inherit from lastUsedProfileIdAtom

### Phase 5: Claude SDK Integration

- [ ] **5.1** Update `claude.ts` router to resolve effective profile
- [ ] **5.2** Update message sending to use profile's model config
- [ ] **5.3** Pass `supportsThinking` from model to SDK

### Phase 6: Testing

- [ ] **6.1** Test profile switching in chat input area
- [ ] **6.2** Test profile switching via context menu
- [ ] **6.3** Test model switching within profile
- [ ] **6.4** Test new chat inherits correct profile
- [ ] **6.5** Test fallback when profile is deleted
- [ ] **6.6** Test migration of existing profiles
- [ ] **6.7** Test migration of existing chats

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/lib/atoms/index.ts` | Modify | Add ModelMapping type, update ModelProfile, rename atom |
| `src/main/lib/db/schema/index.ts` | Modify | Add modelProfileId, selectedModelId to chats |
| `drizzle/XXXX_add_model_profile.sql` | Create | Migration for new columns |
| `src/main/lib/trpc/routers/chats.ts` | Modify | Add mutations, update create |
| `src/renderer/features/agents/ui/profile-selector.tsx` | Create | New profile selector component |
| `src/renderer/features/agents/main/chat-input-area.tsx` | Modify | Add ProfileSelector, update model display |
| `src/renderer/features/agents/main/new-chat-form.tsx` | Modify | Pass profile to chat creation |
| `src/renderer/features/sidebar/components/chat-item.tsx` | Modify | Add profile submenu to context menu |
| `src/renderer/components/dialogs/settings-tabs/model-profile-form.tsx` | Modify | Add models configuration UI |
| `src/renderer/components/dialogs/settings-tabs/model-profiles-section.tsx` | Modify | Update to use new profile structure |
| `src/main/lib/trpc/routers/claude.ts` | Modify | Resolve effective profile for messages |
| `src/renderer/features/agents/atoms/index.ts` | Modify | Add hooks for profile/model resolution |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing profiles break | High | Add migration to add default models array |
| Performance with many profiles | Low | Profiles stored in localStorage, fast lookup |
| Profile deleted while in use | Medium | Fallback chain handles gracefully |
| Model ID mismatch after profile edit | Medium | Re-select first model if current not found |

---

## Future Enhancements

1. **Per-project default profile** - Projects could have a default profile that new chats inherit
2. **Profile sync** - Sync profiles across devices via cloud storage
3. **Profile import/export** - Share profile configs as JSON files
4. **Model usage stats** - Track which models are used most per profile

---

## Appendix: Example Profile Data

```json
{
  "id": "abc123",
  "name": "My OpenRouter Proxy",
  "config": {
    "model": "glm-4.7",
    "token": "sk-or-v1-xxxx",
    "baseUrl": "https://openrouter.ai/api/v1"
  },
  "models": [
    {
      "id": "opus",
      "displayName": "Opus",
      "modelId": "glm-4.7",
      "supportsThinking": true
    },
    {
      "id": "sonnet",
      "displayName": "Sonnet",
      "modelId": "claude-3-sonnet-20240229",
      "supportsThinking": true
    },
    {
      "id": "haiku",
      "displayName": "Haiku",
      "modelId": "claude-3-haiku-20240307",
      "supportsThinking": false
    }
  ],
  "isOffline": false
}
```
