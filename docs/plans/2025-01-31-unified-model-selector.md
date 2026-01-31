# Unified Model Selector with Custom Profile Support

## Problem
When a custom model profile is active, the model selector in the chat input is disabled and shows "Custom Model". Users cannot switch between Default/Opus/Sonnet/Haiku options.

## Goal
Keep the model selector (Default, Opus, Sonnet, Haiku) always enabled. When a custom profile is active, these selections map to the profile's configured models:

| UI Selection | Without Profile | With Profile |
|--------------|-----------------|--------------|
| Default | claude-3-7-sonnet | profile.model (ANTHROPIC_MODEL) |
| Opus | opus | profile.defaultOpusModel |
| Sonnet | sonnet | profile.defaultSonnetModel |
| Haiku | haiku | profile.defaultHaikuModel |

## Implementation

### 1. Update `chat-input-area.tsx`

**File:** `src/renderer/features/agents/main/chat-input-area.tsx`

Changes:
- Remove `disabled={hasCustomClaudeConfig}` from the model dropdown (line 1370)
- Remove condition that forces dropdown closed: `open={hasCustomClaudeConfig ? false : isModelDropdownOpen}` → `open={isModelDropdownOpen}` (line 1361)
- Add "Default" option to the model list
- Show profile name in parentheses when profile is active (e.g., "Sonnet (Z.AI Proxy)")

### 2. Update `models.ts`

**File:** `src/renderer/features/agents/lib/models.ts`

Add "default" model option:
```typescript
export const CLAUDE_MODELS = [
  { id: "default", name: "Default" },
  { id: "opus", name: "Opus" },
  { id: "sonnet", name: "Sonnet" },
  { id: "haiku", name: "Haiku" },
]
```

### 3. Update `atoms/index.ts` (agents feature)

**File:** `src/renderer/features/agents/atoms/index.ts`

Update MODEL_ID_MAP to include "default":
```typescript
export const MODEL_ID_MAP: Record<string, string> = {
  default: "default",  // Will use profile's main model
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
}
```

### 4. Backend already supports this

The tRPC schema in `claude.ts` already accepts:
- `model: z.string().optional()` - the selected model (opus/sonnet/haiku/default)
- `customConfig.defaultOpusModel`, `customConfig.defaultSonnetModel`, `customConfig.defaultHaikuModel`

The Claude SDK uses these as environment variables:
- ANTHROPIC_MODEL
- ANTHROPIC_DEFAULT_OPUS_MODEL
- ANTHROPIC_DEFAULT_SONNET_MODEL
- ANTHROPIC_DEFAULT_HAIKU_MODEL

## Files to Modify

1. `src/renderer/features/agents/main/chat-input-area.tsx` - Enable dropdown, add Default option
2. `src/renderer/features/agents/lib/models.ts` - Add "default" to CLAUDE_MODELS
3. `src/renderer/features/agents/atoms/index.ts` - Add "default" to MODEL_ID_MAP

## Testing

1. Create a custom profile with:
   - Model: glm-4.7
   - Default Opus Model: glm-4.7
   - Default Sonnet Model: glm-4.7
   - Default Haiku Model: glm-4.5-air

2. Set profile as active

3. Verify model selector shows Default/Opus/Sonnet/Haiku options

4. Select each option and verify the correct model is used in the request
