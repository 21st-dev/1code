# Documentation Updates Summary

This document summarizes all documentation updates made after pulling version 0.0.30.

## Files Updated

### 1. **CHANGELOG.md** (NEW)
Complete changelog from v0.0.26 to v0.0.30 with:
- Added features (custom slash commands, keyboard shortcuts, thinking toggle, hover-to-select)
- Changed features (markdown rendering, model selector UI)
- Fixed issues (newlines, stream stopping, diff sidebar)
- Windows support details (v0.0.29)
- Model selector and workspace icons (v0.0.28)
- Text selection and viewed files tracking (v0.0.27)

### 2. **FEATURES.md** (NEW)
Comprehensive feature documentation covering:
- Core features (Plan/Agent modes, chat sessions)
- Text selection from code blocks (v0.0.27+)
- Custom slash commands with examples (v0.0.30+)
- Keyboard shortcuts configuration (v0.0.30+)
- Model selection with extended thinking (v0.0.28+)
- Git integration with viewed files tracking
- Worktree isolation
- Integrated terminal
- Windows support (v0.0.29+)
- Tips, tricks, and troubleshooting

### 3. **CLAUDE.md** (UPDATED)
Updated development documentation:
- Architecture diagram updated with new routers and components
- Added Custom Slash Commands section with implementation details
- Added Keyboard Shortcuts section with storage format
- Updated Important Files section with new v0.0.27+ files
- Updated Current Status from WIP to stable feature list
- Updated platform support (Windows experimental)
- Removed references to auth-manager.ts and auth-store.ts (deleted files)

### 4. **README.md** (UPDATED)
Enhanced features list:
- Added custom slash commands
- Added configurable keyboard shortcuts
- Added multiple AI models
- Added text selection from code
- Added viewed files tracking
- Updated Windows support note with contributor credits

## Version 0.0.30 Highlights

### New Features
1. **Custom Slash Commands**
   - User-level: `~/.claude/commands/*.md`
   - Project-level: `{project}/.claude/commands/*.md`
   - Namespace support via subdirectories
   - Frontmatter for descriptions and argument hints

2. **Configurable Keyboard Shortcuts**
   - Full customization UI in Settings → Keyboard
   - Conflict detection and resolution
   - Category organization (General, Workspaces, Agents)
   - Reset to defaults option

3. **Thinking Toggle**
   - Enable/disable extended thinking from model selector
   - Per-message control

4. **Hover-to-Select**
   - Quick switch dialogs select on hover
   - Faster navigation

5. **File Stats in Archive**
   - See file counts for archived chats

### Improvements
- GFM (GitHub Flavored Markdown) support for tables
- Better pending indicators for questions and plans
- Fixed diff sidebar in dialog/fullscreen modes
- Fixed React 19 ref cleanup issues

## Version 0.0.29 Highlights (Windows Support)

### Platform Support
- Windows build support (experimental)
- Custom title bar for Windows
- Platform-specific terminal (PowerShell/CMD)
- Fixed path handling for Windows (`os.homedir()` instead of `process.env.HOME`)

### Contributors
- [@jesus-mgtc](https://github.com/jesus-mgtc)
- [@evgyur](https://github.com/evgyur)

## Version 0.0.28 Highlights (Model Selector)

### Features
- Model selector dropdown in chat input
- Choose between Opus 4.5, Sonnet 4.5, etc.
- Per-chat model preference
- Workspace icon toggle in settings

### UX Improvements
- Faster sidebar transitions (200ms → 150ms)
- Cmd+D opens Changes even with no changes
- Hide sub-chat tab when only one chat exists

## Version 0.0.27 Highlights (Text Selection)

### Major Features
1. **Text Selection from Code Blocks**
   - Select any text from code changes and diffs
   - "Copy text" and "Use in reply" actions
   - Visual selection UI with context indicators
   - Works in inline code, diffs, and bash output

2. **Viewed Files Tracking**
   - GitHub-style checkmarks in Changes sidebar
   - Press `V` to mark files as reviewed
   - Persisted across sessions

3. **Quick Comment Input**
   - Press Enter to send answers immediately
   - Selections preserved in interactive prompts

### Performance
- Changes sidebar opens **5x faster**

## Key Implementation Files

### Custom Slash Commands
- `src/main/lib/trpc/routers/commands.ts` - Backend router
- Scans `~/.claude/commands/` and `{project}/.claude/commands/`
- Uses `gray-matter` for frontmatter parsing
- Security: Path traversal prevention

### Keyboard Shortcuts
- `src/renderer/lib/hotkeys/shortcut-registry.ts` - Registry
- `src/renderer/lib/hotkeys/use-hotkey-recorder.ts` - Recording hook
- `src/renderer/lib/hotkeys/types.ts` - Type definitions
- `src/renderer/components/dialogs/settings-tabs/agents-keyboard-tab.tsx` - UI
- Storage: localStorage `custom-hotkeys-config` key

### Text Selection
- `src/renderer/features/agents/context/text-selection-context.tsx` - Context provider
- `src/renderer/features/agents/ui/agent-diff-text-context-item.tsx` - Diff selection UI
- `src/renderer/features/agents/ui/agent-text-context-item.tsx` - Text context display
- `src/renderer/features/agents/mentions/render-file-mentions.tsx` - Mention rendering

### Windows Support
- `src/renderer/components/windows-title-bar.tsx` - Custom title bar
- `src/main/lib/terminal/session.ts` - Platform-specific terminal
- `src/main/windows/main.ts` - Window management

## Documentation Structure

```
ii-client/
├── README.md                     # Main project overview (UPDATED)
├── CLAUDE.md                     # Developer documentation (UPDATED)
├── CONTRIBUTING.md               # Contribution guide (unchanged)
├── FEATURES.md                   # User feature documentation (NEW)
├── CHANGELOG.md                  # Version history (NEW)
├── DOCUMENTATION_UPDATES.md      # This file (NEW)
├── DEBUG_INSTRUCTIONS.md         # Debug guide for dev vs prod (from previous work)
└── DEV_VS_PROD_ANALYSIS.md       # Auth debugging analysis (from previous work)
```

## Documentation Style

All documentation follows these principles:
- **User-facing** (README.md, FEATURES.md): Simple, benefit-focused, with examples
- **Developer-facing** (CLAUDE.md): Technical, architecture-focused, with implementation details
- **Changelog** (CHANGELOG.md): Version-by-version with Added/Changed/Fixed categories
- **Contributing** (CONTRIBUTING.md): Quick start for contributors

## Next Steps

When new features are added:
1. Update CHANGELOG.md with the new version
2. Add feature documentation to FEATURES.md
3. Update CLAUDE.md with implementation details
4. Update README.md if it's a major feature
5. Keep version numbers consistent across all files

## Version Numbering

Currently using semantic versioning: `0.MINOR.PATCH`
- **0.0.x**: Pre-1.0 development
- **MINOR**: New features (27 → 28 → 29 → 30)
- **PATCH**: Bug fixes within a minor version

Once stable: Move to 1.0.0 and follow standard semver.
