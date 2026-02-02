# PR #7 Integration Analysis: ii-client Fork Sync

## Overview

PR #7 is a large-scale sync from the fork's `main` branch (which tracks upstream `anthropics/claude-code`) into the `internal` branch (which contains custom features).

**Statistics:**
- Changed files: 318
- Additions: 43,060
- Deletions: 9,651

---

## Custom Features in `internal` Branch (Must Preserve)

### 1. Agent Builder Feature
**Files:**
- `src/renderer/components/dialogs/agent-builder-modal.tsx`
- `src/renderer/components/dialogs/agent-builder/chat-pane.tsx`
- `src/renderer/components/dialogs/agent-builder/document-pane.tsx`
- `src/renderer/components/dialogs/agent-builder/hooks/use-agent-builder-chat.ts`
- `src/renderer/lib/agent-builder/response-parser.ts`
- `src/renderer/lib/atoms/agent-builder.ts`

**Database:**
- `drizzle/0006_add_agents_table.sql` - Agents table

**tRPC Router:**
- `src/main/lib/trpc/routers/agents.ts`

**Description:** Allows users to create custom Claude Code agents through a chat interface, with chat history tracking for agent creation/modification.

---

### 2. Model Profiles
**Files:**
- `src/main/lib/trpc/routers/model-profiles.ts`
- `drizzle/0007_add_model_profiles_table.sql`
- `src/main/lib/db/schema/index.ts` - Model profiles schema

**Description:** Custom model configurations for API integrations. Stores model configs as JSON with model names array and offline support.

---

### 3. Feedback System
**Files:**
- `src/main/lib/db/schema/feedback.ts`
- `src/main/lib/trpc/routers/feedback.ts`
- `src/renderer/components/dialogs/feedback-dialog.tsx`
- `src/renderer/components/dialogs/feedback-list-dialog.tsx`
- `drizzle/0008_add_feedback_table.sql`

**Schema:**
- `feedback` table with: id, type, priority, description, screenshots, resolved, timestamps
- Types: bug, feature, enhancement, idea, usability, other
- Priority: low, medium, high, critical

---

### 4. File CRUD Router
**Files:**
- `src/main/lib/trpc/routers/file-crud.ts`
- Exported as `workspaceFiles` for backward compatibility

**Description:** File operations router (replaces deprecated workspace-files router).

---

### 5. Claude Settings Router
**Files:**
- `src/main/lib/trpc/routers/claude-settings.ts`

**Description:** Additional Claude configuration settings.

---

### 6. Right Sidebar UI
**Files:**
- `src/renderer/components/ui/right-action-bar.tsx`
- `src/renderer/components/ui/right-sidebar-drawer.tsx`
- `src/renderer/lib/atoms/right-sidebar.ts`

---

### 7. Internal Agent Prompts
**Files:**
- `src/renderer/lib/internal-agent-prompts.ts`

---

### 8. Custom .claude Agents
**Files:**
- `.claude/agents/architecture-specialist.md`
- `.claude/agents/data-flow-architect.md`
- `.claude/agents/feedback-system-specialist.md`

---

### 9. CLAUDE.md Custom Documentation
**Files:**
- `CLAUDE.md` - Extensive custom documentation for the ii (Intelligence Interface) project

---

### 10. Workspace Files Feature (Removed in sync)
**Note:** This feature is being removed by PR #7 but may need to be preserved if still in use:
- `src/renderer/features/workspace-files/`

---

## Upstream Changes Being Integrated (from anthropics/claude-code)

### New Features in PR #7

1. **Voice Dictation**
   - Whisper integration for voice input
   - macOS audio permission support
   - OPENAI_API_KEY support for OSS builds

2. **Multi-Account Anthropic Login**
   - Secure storage for multiple accounts
   - Active account switching

3. **Plugin Discovery**
   - MCP server integration for agents, skills, commands

4. **CLI "1code"**
   - Terminal command to open projects

5. **Beta Update Channel**
   - Opt-in for early releases

6. **Cross-Platform Platform Layer**
   - `src/main/lib/platform/` - base.ts, darwin.ts, linux.ts, windows.ts
   - PATH/shell/env handling

7. **Theme Import**
   - VS Code/Cursor/Windsurf theme import
   - `src/main/lib/vscode-theme-scanner.ts`

8. **Sandbox Import**
   - Import remote sandbox chats into local worktrees

9. **Anthropic Accounts Router**
   - `src/main/lib/trpc/routers/anthropic-accounts.ts`

10. **Voice Router**
    - `src/main/lib/trpc/routers/voice.ts`

11. **Plugins Router**
    - `src/main/lib/trpc/routers/plugins.ts`

12. **Sandbox Import Router**
    - `src/main/lib/trpc/routers/sandbox-import.ts`

13. **Platform Provider**
    - `src/main/lib/platform/`

---

## Database Migration Conflicts

### Custom Migrations (internal branch)
```
drizzle/0005_motionless_colonel_america.sql  → REMOVED
drizzle/0006_add_agents_table.sql            → REMOVED
drizzle/0007_add_model_profiles_table.sql    → REMOVED
drizzle/0008_add_feedback_table.sql          → REMOVED
```

### Upstream Migrations (main branch)
```
drizzle/0005_add_subchat_stats.sql           → KEEP
drizzle/0006_anthropic_multi_account.sql     → NEW
drizzle/0007_clammy_grim_reaper.sql          → NEW
```

**Action Required:** Need to reconcile migration numbering and potentially merge custom tables into a cohesive migration strategy.

---

## Conflict Areas Summary

| Category | Files | Action |
|----------|-------|--------|
| **Database Schema** | `schema/index.ts`, `feedback.ts`, migration files | Merge custom tables with upstream schema |
| **tRPC Routers** | `index.ts`, `agents.ts`, `model-profiles.ts`, `feedback.ts`, `claude-settings.ts` | Add custom routers to updated index |
| **UI Components** | `agent-builder-*`, `feedback-*`, `right-sidebar-*` | Port to new component patterns |
| **Atoms/State** | `agent-builder.ts`, `right-sidebar.ts`, `internal-agent-prompts.ts` | Merge into updated atom structure |
| **CLAUDE.md** | Project documentation | Preserve custom docs, merge upstream changes |

---

## Integration Strategy

### Phase 1: Prepare Upstream Base
1. Checkout to a new integration branch from `internal`
2. Apply upstream changes incrementally

### Phase 2: Port Custom Database Schema
1. Extract custom tables (agents, model_profiles, feedback)
2. Create new migration(s) with non-conflicting numbers
3. Update `schema/index.ts` with custom schemas

### Phase 3: Port tRPC Routers
1. Add `model-profiles.ts` router
2. Add `feedback.ts` router
3. Add `claude-settings.ts` router
4. Add `file-crud.ts` as `workspaceFiles` alias
5. Update `routers/index.ts` with all custom routes

### Phase 4: Port UI Components
1. Agent Builder modal and hooks
2. Feedback dialogs
3. Right sidebar components
4. Update imports to match new structure

### Phase 5: Port State Management
1. Agent builder atoms
2. Right sidebar atoms
3. Internal agent prompts

### Phase 6: Port Documentation
1. Update `CLAUDE.md` with new architecture info
2. Preserve custom agent documentation

### Phase 7: Test & Verify
1. Build the application
2. Test database migrations
3. Test custom features work with new architecture

---

## Key Files to Watch

### Critical Custom Files (Must Not Lose)
```
src/main/lib/db/schema/feedback.ts
src/main/lib/db/schema/index.ts
src/main/lib/trpc/routers/agents.ts
src/main/lib/trpc/routers/feedback.ts
src/main/lib/trpc/routers/model-profiles.ts
src/main/lib/trpc/routers/index.ts
src/renderer/components/dialogs/agent-builder-modal.tsx
src/renderer/components/dialogs/feedback-dialog.tsx
src/renderer/lib/atoms/agent-builder.ts
CLAUDE.md
```

### High-Risk Conflict Files
```
src/main/lib/trpc/routers/claude.ts      - Major refactor expected
src/main/lib/trpc/routers/chats.ts       - Chat logic changes
src/main/lib/trpc/routers/claude-code.ts - OAuth changes
src/main/index.ts                        - Entry point changes
src/main/windows/main.ts                  - Window management changes
```

---

## Notes

- PR #7 body mentions voice dictation, multi-account login, plugin discovery, CLI launching, and cross-platform platform layer
- The upstream has moved to Anthropic multi-account support, which may conflict with custom auth
- `ii` (Intelligence Interface) wrapper is a custom feature that needs special attention
- Platform layer (`darwin`, `linux`, `windows`) is new and may affect existing platform-specific code
