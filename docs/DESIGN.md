# Locus UI Design Contract v0

This document records the current Locus UI rules as a product contract. It is
not a visual refresh plan. New UI should stay consistent with these rules unless
an explicit design change updates this file.

## Intent

Locus is a local-first desktop workbench for operating on real project folders.
The UI should feel quiet, dense, inspectable, and recoverable. It should show
what the agent did, what it can do, what it is blocked on, and what the user can
do next.

Prefer operational clarity over marketing polish. A user should be able to scan
a run, understand runtime/provider/MCP/guard state, inspect file changes, and
recover from errors without reading logs.

## Source Files

- Base tokens: `src/renderer/styles/globals.css`
- Agents page overrides: `src/renderer/styles/agents-styles.css`
- Tailwind mapping: `tailwind.config.js`
- Built-in editor themes: `src/renderer/lib/themes/builtin-themes.ts`
- UI primitives: `src/renderer/components/ui/`
- Agent workbench and trace surfaces:
  `src/renderer/features/agents/workbench/agent-workbench.tsx`,
  `src/renderer/features/agents/ui/`

## Visual Tokens

### Color

Use semantic Tailwind colors backed by CSS variables. Do not hard-code new
theme colors unless they are a deliberate local status color.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `0 0% 100%` | `240 10% 3.9%` | App background |
| `foreground` | `240 10% 3.9%` | `240 4.8% 95.9%` | Primary text |
| `primary` | `228 100% 50%` (`#0034ff`) | same | Primary action and focus |
| `secondary` | `240 4.8% 95.9%` | `240 3.7% 15.9%` | Secondary surfaces |
| `muted` | `240 4.8% 95.9%` | `240 5.9% 10%` | Inactive surfaces |
| `muted-foreground` | `240 3.8% 46.1%` | `240 4.4% 58%` | Secondary text |
| `border` | `240 5.9% 90%` | `240 3.7% 15.9%` | Hairlines and dividers |
| `destructive` | `0 84.2% 60.2%` | `0 62.8% 30.6%` | Destructive actions and severe failures |
| `input-background` | `240 4.8% 95.9%` | `60 2% 18%` | Chat input and editor-like fields |
| `tl-background` | `0 0% 98%` | `60 2% 18%` | Timeline and panel background |
| `plan-mode` | `33 83% 67%` | same | Plan mode affordance |

Status colors should be sparse and semantic:

- Green/emerald: completed, approved, passed.
- Amber: warning, pending scope expansion, degraded but usable.
- Red/destructive: failed, blocked, denied, out of scope.
- Blue/primary: selected, focused, primary action, active provider/runtime.

### Typography

- Agents pages use `var(--font-geist-sans), system-ui, -apple-system,
  sans-serif`.
- Body text is generally `text-sm`; dense metadata is `text-xs` or
  `text-[11px]`.
- Monospace is for tokens, paths, job IDs, event types, command output, and
  usage numbers.
- Do not use hero-sized type inside workbench panels, cards, sidebars, dialogs,
  or trace rows.

### Spacing And Density

Locus is an operational desktop app. Prefer compact, stable controls.

- Default button height is `h-7`.
- Icon button size is `h-7 w-7`.
- Common control gaps are `gap-1.5`, `gap-2`, and `gap-3`.
- Compact row padding should stay around `px-2 py-1.5` or `px-3 py-2`.
- Dialog section padding uses `px-5 py-4` headers and `px-5 pb-5` bodies.
- Long panels should scroll internally instead of growing the viewport.

### Shape, Border, Shadow

- Base radius is `--radius: 0.5rem`.
- Repeated workbench rows and cards should use `rounded-sm`, `rounded-md`, or
  `rounded-lg` only when the component already uses that scale.
- Dialogs may use `rounded-xl` or `rounded-[16px]` because the current dialog
  primitives already do.
- Use borders and muted backgrounds before heavy shadows.
- Shadows are for popovers, dialogs, and floating menus, not page sections.

### Motion

- Keep motion short and functional: existing fade/slide utilities use 200ms.
- Use motion to clarify entry, exit, loading, and popover state.
- Avoid decorative or continuous animation in workbench surfaces. Streaming and
  loading indicators are enough.

## Component Rules

### Buttons

Use `src/renderer/components/ui/button.tsx`.

- Use icons from `lucide-react` or existing app icons for tool actions.
- Use text buttons for commands that need explicit wording: `Approve`,
  `Retry`, `Cancel`, `Open settings`.
- Use `variant="default"` for the single primary action in a local scope.
- Use `variant="outline"` for reversible secondary actions.
- Use `variant="ghost"` for toolbar actions and low-emphasis commands.
- Destructive actions must use destructive styling or an explicit confirmation.

### Badges

Use badges for small status facts, not as buttons.

Good badge content:

- Runtime: `codex`, `claude-code`
- Capability: `supported`, `degraded`, `unsupported`
- Guard state: `draft`, `approved`, `hard`, `audit`
- Job status: `running`, `failed`, `canceled`, `succeeded`

Badges must not hide the action. If the user can fix the state, pair the badge
with a visible action.

### Dialogs And Popovers

- Use `Dialog` for tasks that need focus and can be dismissed.
- Use `AlertDialog` for destructive or irreversible confirmation.
- Use `Popover` or `Command` for compact selection flows.
- Use `HoverCard` for secondary metadata such as usage details.
- Dialogs must include a clear title and next action. Avoid raw stack traces as
  primary dialog text.

### Toasts

Sonner toasts are neutral by default. Use them for short completion or failure
feedback, not for durable state.

Toast copy should be:

- Title: what failed or completed.
- Description: concrete detail or next step.
- No secrets, tokens, raw headers, or large command output.

### Workbench Trace Surfaces

Workbench trace UI should use structured rows before raw payloads.

Each trace row should answer:

- What happened?
- Which runtime/provider/tool/path was involved?
- Is it pending, completed, failed, denied, or degraded?
- What can the user do next?

Raw JSON payloads may exist for debugging, but they must be secondary and
already redacted before they reach the renderer.

### Errors

Error UI is part of the product, not a logging fallback.

Every user-visible runtime/job/provider/MCP error should have:

- Stable code.
- Human summary.
- Cause or affected component when known.
- Next action.
- Optional details, already redacted.

Preferred structure:

```text
Title: Provider profile is missing
Body: This run needs a Codex-capable provider profile before it can start.
Action: Open Settings
Details: runtime=codex, profile=not configured
```

Do not show raw stack traces, raw IPC errors, provider tokens, Authorization
headers, OAuth codes, MCP secrets, or full environment variables in renderer
state.

## Product Surface Rules

### Agent Workbench

The workbench should make agent activity inspectable. Prioritize these surfaces:

- Project and job history.
- Conversation and semantic run timeline.
- Runtime capability and provider binding.
- MCP readiness and authentication state.
- Guard/approval state.
- File changes and diff review.
- Usage, duration, and final state.

Do not add new runtime-specific UI paths when a shared runtime capability,
RunEvent, or workbench trace surface can represent the same behavior.

### Settings

Settings are for configuration and diagnostics. Runtime availability should be
clear there, but execution history belongs in the workbench.

Provider secrets stay in the main process. Renderer settings may show labels,
profile IDs, target runtimes, test status, and redacted metadata only.

### Local-First Boundaries

When a feature needs hosted auth, external providers, network access, MCP, or a
runtime binary, the UI must distinguish:

- Not configured.
- Configured but unavailable.
- Available with degraded capability.
- Ready for this run.

Do not collapse startup failures, MCP warmup failures, provider-auth failures,
and runtime capability failures into one generic "agent failed" message.

## Anti-Patterns

Do not:

- Add page-level marketing hero sections inside the app.
- Add decorative gradients, blobs, or visual effects that do not explain state.
- Use raw provider messages as the primary user-facing error.
- Add a second durable runtime event, provider, guard, or capability truth table
  in the renderer.
- Display provider secrets, tokens, OAuth codes, raw headers, or unredacted MCP
  payloads.
- Build runtime-specific timeline components when normalized events can drive a
  shared trace row.
- Hide a degraded runtime behind a green status.
- Add cards inside cards or use floating cards as page sections.
- Use color alone to communicate status.
- Let long paths, model IDs, commands, or error text overflow their containers.
- Use toasts as the only record of important run state.

## Change Rule

When a UI change alters colors, spacing, component semantics, error copy,
runtime trace display, or workbench state language, update this document in the
same change. If the change introduces a new capability, architecture boundary,
security-sensitive behavior, or durable runtime contract, create an OpenSpec
change before implementation.
