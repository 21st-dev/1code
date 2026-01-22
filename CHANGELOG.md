# Changelog

All notable changes to 1Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.30] - 2026-01-21

### Added
- **Custom Slash Commands** — Create your own slash commands with custom prompts in `.claude/commands/` directory
  - Support for nested namespaces (e.g., `git/commit.md` → `/git:commit`)
  - Commands can have descriptions and argument hints via frontmatter
  - Automatically discovered from user (`~/.claude/commands/`) and project-specific directories
- **Configurable Keyboard Shortcuts** — Customize keyboard shortcuts in Settings → Keyboard tab
  - Record new shortcuts with visual feedback
  - Conflict detection and resolution
  - Category organization (General, Workspaces, Agents)
  - Reset to defaults option
- **Thinking Toggle** — Enable/disable extended thinking mode from the model selector dropdown
- **Hover-to-Select** — Quick switch dialogs now select items on hover for faster navigation
- **File Stats in Archive** — See file counts for each archived chat in the archive popover

### Changed
- Markdown tables now render correctly with full GFM (GitHub Flavored Markdown) support
- Model selector UI improvements with thinking toggle integration
- Improved keyboard shortcuts system with better organization and customization

### Fixed
- Fixed newlines being lost in user messages
- Fixed "Send now" not stopping the current stream before sending queued message
- Improved pending question and plan approval indicators
- Fixed diff sidebar issues in dialog and fullscreen modes
- Fixed React 19 ref cleanup error when closing diff sidebar
- Workspace icon setting now respected in archive popover

## [0.0.29] - 2026-01-21

### Added
- **Windows Support (Experimental)** — 1Code now runs on Windows
  - Thanks to [@jesus-mgtc](https://github.com/jesus-mgtc) and [@evgyur](https://github.com/evgyur) for their contributions
  - Added Windows-specific title bar component
  - Platform-specific binary path handling
- **Desktop Notifications** — Get notified when Claude finishes a response in background chats

### Changed
- Terminal session management improved with platform-specific shell detection
- Window management now properly handles Windows platform differences

### Fixed
- Fixed sidebar loading spinners synchronization
- Fixed token metadata reading from flat structure
- Fixed `process.env.HOME` issue on Windows (now uses `os.homedir()`)
- Fixed Claude binary path resolution for Windows (.exe extension)

## [0.0.28] - 2026-01-21

### Added
- **Model Selector** — Choose between different AI models (Claude Opus 4.5, Sonnet 4.5, etc.)
  - Dropdown in chat input area
  - Per-chat model preference
  - Visual model indicators
- **Workspace Icon Toggle** — Show or hide workspace icons in Settings → Appearance

### Changed
- Faster sidebar and sub-chats hover transitions (200ms → 150ms)
- Cmd+D now opens Changes sidebar even when there are no changes
- Hide sub-chat tab when there's only one chat in the workspace
- Improved image-only message styling
- Better spacing and layout for model selector

### Fixed
- Fixed ESC key stopping stream when closing image preview or full-page diff
- Fixed attaching files while Claude is responding
- Added toast notification for reply actions

## [0.0.27] - 2026-01-20

### Added
- **Text Selection from Code Blocks** — Select any text from code changes and diffs to reference in follow-up messages
  - Visual selection UI with context indicators
  - "Copy text" and "Use in reply" actions
  - Supports both inline code and diff blocks
- **Viewed Files Tracking** — GitHub-style checkmarks in the Changes sidebar
  - Press `V` to mark files as reviewed
  - Visual indicators for viewed vs unviewed files
  - Persisted across sessions
- **Quick Comment Input** — Faster question responses in Ask User Questions
  - Press Enter to send immediately
  - Selections are preserved
  - Better UX for interactive prompts

### Changed
- Changes sidebar now opens **5x faster** (optimized rendering)
- Better loading indicators for Git operations (push, force push, create PR)
- Improved line break rendering in messages
- Image-only messages now show "Using image" indicator

### Fixed
- Fixed search highlighting when using CMD+F
- Fixed messages not updating properly in background tabs
- Fixed Force Push button appearing when it shouldn't
- Fixed display issues with new files in Changes view
- Fixed line breaks not rendering correctly in messages

## [0.0.26] - Earlier

Previous versions (see git history for details).

---

## Release Process

Versions follow semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (not yet applicable in 0.x series)
- **MINOR**: New features, significant improvements
- **PATCH**: Bug fixes, small improvements

### Categories

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
