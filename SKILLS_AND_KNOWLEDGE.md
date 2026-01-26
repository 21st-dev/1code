# 1Code Project: Skills and Knowledge Base

**Last Updated**: January 26, 2026
**Session Summary**: Electron app security audit, automation setup, and knowledge consolidation

---

## Table of Contents

1. [Electron App Launcher Setup](#electron-app-launcher-setup)
2. [Security Audit Findings](#security-audit-findings)
3. [Electron Development Best Practices](#electron-development-best-practices)
4. [1Code Architecture Overview](#1code-architecture-overview)
5. [GitHub Issue Management](#github-issue-management)
6. [macOS App Bundle Configuration](#macos-app-bundle-configuration)
7. [Environment Configuration](#environment-configuration)
8. [Common Commands](#common-commands)

---

## Electron App Launcher Setup

### RunElectron.app Structure

**Location**: `/Users/kenny/1code/RunElectron.app`
**Symlink**: `/Applications/1Code.app` → `RunElectron.app`

```
RunElectron.app/
├── Contents/
│   ├── Info.plist          # Bundle configuration with 1Code branding
│   ├── Resources/
│   │   └── icon.icns       # 1Code icon (316KB)
│   └── MacOS/
│       └── RunElectron     # Launch script
```

### Launch Script

```bash
#!/bin/bash
cd "/Users/kenny/1code"
exec /opt/homebrew/bin/bun run dev
```

### Shell Aliases Created

Added to `~/.zshrc`:

```bash
# 1Code Electron App
alias 1code='cd /Users/kenny/1code && bun run dev'
alias 1code-bg='cd /Users/kenny/1code && bun run dev &'
```

Standalone script: `~/bin/start-1code`

### Launch Methods

1. **Spotlight**: `Cmd + Space` → type "1Code Dev"
2. **Applications**: Double-click `1Code.app` in `/Applications`
3. **Terminal**: `1code`, `1code-bg`, or `start-1code`
4. **Command Line**: `open -a "1Code"`

---

## Security Audit Findings

### Overview

**Date**: January 26, 2026
**Files Reviewed**: 80+ files (main process, renderer, database, security)
**Issues Found**: 20 (2 Critical, 5 High, 6 Medium, 7 Low)
**Issues Fixed**: 3 (Hardcoded path, XSS protection)

### Security Rating

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Score | 65/100 | 72/100 | 85/100 |
| Status | 🟡 Medium | 🟡 Medium-High | 🟢 High |

### Critical Issues

#### 1. Sandbox Disabled (Issue #103)

**Location**: `src/main/windows/main.ts:361`

```typescript
sandbox: false  // Required for electron-trpc
```

**Risk**: Allows renderer to access Node.js APIs if context isolation breached
**Recommendation**: Investigate electron-trpc alternatives or document tradeoff

#### 2. Permission Bypass in Agent Mode (Issue #104)

**Location**: `src/main/lib/trpc/routers/claude.ts:1056`

```typescript
...(input.mode !== "plan" && {
  allowDangerouslySkipPermissions: true,  // ⚠️
}),
```

**Risk**: Full system access without user prompts
**Recommendation**: Add confirmation dialogs for dangerous operations

### Fixed Issues

#### ✅ Hardcoded User Path (Issue #105)

**Before:**
```typescript
const projectPath = "/Users/kenny/1code"
```

**After:**
```typescript
const autoLoadPath = process.env.AUTO_LOAD_PROJECT
if (autoLoadPath && !app.isPackaged) {
  // Auto-load logic
}
```

#### ✅ XSS Protection (Issue #106)

**Before:**
```typescript
dangerouslySetInnerHTML={{ __html: htmlContent }}
```

**After:**
```typescript
import DOMPurify from "dompurify"
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}
```

**Files Updated:**
- `src/renderer/features/ui/agent-tool-call.tsx`
- `src/renderer/features/ui/agent-edit-tool.tsx`
- `src/renderer/components/chat-markdown-renderer.tsx`

### GitHub Issues Created

| # | Title | Severity | Status |
|---|-------|----------|--------|
| 103 | Sandbox disabled | CRITICAL | 🔴 Open |
| 104 | Permission bypass | CRITICAL | 🔴 Open |
| 105 | Hardcoded path | HIGH | ✅ Fixed |
| 106 | XSS risk | HIGH | ✅ Fixed |
| 107 | Plaintext auth fallback | HIGH | 🔴 Open |
| 108 | Missing IPC validation | MEDIUM | 🔴 Open |
| 109 | Unpaginated queries | MEDIUM | 🔴 Open |
| 110 | No CSRF protection | MEDIUM | 🔴 Open |
| 111 | Memory leak risk | LOW | 🔴 Open |
| 112 | No request timeout | LOW | 🔴 Open |
| 113 | Large router refactor | REFACTOR | 🔴 Open |

**View Issues**: https://github.com/21st-dev/1code/issues

---

## Electron Development Best Practices

### Security Checklist

✅ **Must Have:**
- `contextIsolation: true` - Isolate renderer from Node.js
- `nodeIntegration: false` - Disable Node in renderer
- `sandbox: true` - Enable OS-level sandboxing (if possible)
- Validate IPC sender origins
- Use `safeStorage` for credentials
- Sanitize HTML with DOMPurify
- Add CSRF protection for mutations
- Implement request timeouts

### Common Vulnerabilities

1. **Sandbox Disabled**
   - Often required for IPC libraries (electron-trpc)
   - Increases attack surface significantly
   - Requires additional compensating controls

2. **Permission Bypass**
   - `allowDangerouslySkipPermissions` in automation/agent modes
   - Grants unrestricted system access
   - Must add user confirmation dialogs

3. **XSS in Dynamic Content**
   - Syntax highlighting (Shiki)
   - Markdown rendering
   - Tool output display
   - Always sanitize with DOMPurify

4. **Insecure Credential Storage**
   - Plaintext fallback when safeStorage unavailable
   - Should fail hard or require explicit user consent
   - Never silent fallback to insecure storage

5. **Missing Origin Validation**
   - IPC handlers must validate sender
   - Only auth handlers validated in 1Code
   - Apply to all sensitive operations

6. **Memory Leaks**
   - Unbounded Maps/Sets
   - Missing session cleanup
   - No max-size limits
   - Use LRU cache with TTL

### Good Patterns (from 1Code)

✅ **Symlink Escape Protection**
```typescript
// Comprehensive path validation
function isSecurePath(targetPath: string, allowedRoot: string): boolean {
  const normalized = path.normalize(targetPath)
  const resolved = path.resolve(allowedRoot, normalized)
  return resolved.startsWith(allowedRoot)
}
```

✅ **Token Refresh**
```typescript
// Refresh before expiration
const expiresIn = tokenData.expires_in || 3600
const refreshTime = expiresIn - 300 // 5 min buffer
setTimeout(() => refreshToken(), refreshTime * 1000)
```

✅ **Database Constraints**
```typescript
// Foreign keys enabled
db.pragma("foreign_keys = ON")

// Auto-migrations on startup
await migrate(db, { migrationsFolder: './drizzle' })
```

✅ **Error Tracking**
```typescript
import * as Sentry from "@sentry/electron"

Sentry.init({
  dsn: process.env.MAIN_VITE_SENTRY_DSN,
  environment: app.isPackaged ? 'production' : 'development'
})
```

### Dependencies to Monitor

| Dependency | Risk | Frequency |
|------------|------|-----------|
| `electron` | CRITICAL | Every release |
| `@anthropic-ai/claude-agent-sdk` | HIGH | Weekly |
| `better-sqlite3` | MEDIUM | Monthly |
| `shiki` | MEDIUM | Monthly |
| `dompurify` | LOW | Quarterly |

---

## 1Code Architecture Overview

### Tech Stack

**Desktop Framework:**
- Electron 33.4.5
- electron-vite (build tool)
- electron-builder (packaging)

**Frontend:**
- React 19.2.1
- TypeScript 5.4.5
- Tailwind CSS 3.4
- Radix UI (components)
- Lucide React (icons)
- Motion (animations)
- Sonner (toasts)

**State Management:**
- Jotai (UI state)
- Zustand (persisted state)
- React Query (server state)

**Backend:**
- tRPC (type-safe API)
- trpc-electron (IPC bridge)
- Drizzle ORM
- better-sqlite3

**AI Integration:**
- @anthropic-ai/claude-agent-sdk

**Package Manager:**
- Bun

### Database Schema

**Location**: `{userData}/data/agents.db`

```typescript
// Three main tables
projects {
  id: string (primary key)
  name: string
  path: string
  gitRemoteUrl: string
  gitProvider: string
  gitOwner: string
  gitRepo: string
  createdAt: Date
  updatedAt: Date
}

chats {
  id: string (primary key)
  name: string
  projectId: string (foreign key)
  worktreeFields: object
  createdAt: Date
  updatedAt: Date
}

sub_chats {
  id: string (primary key)
  name: string
  chatId: string (foreign key)
  sessionId: string
  mode: 'plan' | 'agent'
  messages: JSON[]
  createdAt: Date
  updatedAt: Date
}
```

### Key Files

**Main Process:**
```
src/main/
├── index.ts                      # Entry point, window lifecycle
├── auth-manager.ts               # OAuth flow, token refresh
├── auth-store.ts                 # Encrypted credential storage
├── windows/main.ts               # Window creation, IPC handlers
└── lib/
    ├── db/                       # Drizzle ORM, schema, migrations
    │   ├── index.ts              # DB init, auto-migrate
    │   └── schema/               # Table definitions
    ├── trpc/routers/             # tRPC API routers
    │   ├── claude.ts             # Claude SDK (1,800+ lines)
    │   ├── projects.ts           # Project management
    │   ├── chats.ts              # Chat sessions
    │   └── files.ts              # File operations
    └── git/
        └── security/
            └── secure-fs.ts      # Symlink protection
```

**Renderer:**
```
src/renderer/
├── App.tsx                       # Root component
├── features/
│   ├── agents/                   # Main chat interface
│   │   ├── main/                 # active-chat.tsx, forms
│   │   ├── ui/                   # Tool renderers, diffs
│   │   ├── commands/             # /plan, /agent, /clear
│   │   └── atoms/                # Jotai state
│   ├── sidebar/                  # Navigation, chat list
│   └── layout/                   # Resizable panels
├── components/ui/                # Radix UI wrappers
└── lib/
    ├── atoms/                    # Global Jotai atoms
    ├── stores/                   # Zustand stores
    └── trpc.ts                   # tRPC client
```

### Environment Variables

**Required:**
```bash
ANTHROPIC_API_KEY=sk-ant-...      # Claude API access
```

**Optional Development:**
```bash
AUTO_LOAD_PROJECT=/path/to/project  # Auto-load on startup (dev only)
```

**Optional Production:**
```bash
# Code signing (macOS)
APPLE_ID=your-email@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_IDENTITY=Developer ID Application: Name (TEAM_ID)

# Error tracking
MAIN_VITE_SENTRY_DSN=https://xxxxx@xxx.ingest.sentry.io/xxxxx

# Analytics
MAIN_VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
MAIN_VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

---

## GitHub Issue Management

### Issue Creation Process

1. **Cannot Add Labels via API** (permission denied)
   - Create issue without labels parameter
   - Add "Labels:" line in issue body
   - Maintainer adds labels manually

2. **Title Format**
   ```
   [SEVERITY] Brief description
   [FIXED] Brief description (for resolved issues)
   ```

3. **Body Structure**
   ```markdown
   ## Category: Description

   **Severity**: LEVEL
   **Location**: file.ts:line

   ### Description
   Detailed explanation

   ### Code
   ```language
   problematic code
   ```

   ### Risk
   Impact and likelihood

   ### Recommendation
   **Option 1:** ...
   **Option 2:** ...
   **Option 3:** ...

   ### Impact
   Who/what is affected

   Labels: `tag1`, `tag2`, `tag3`
   ```

4. **Severity Levels**
   - CRITICAL: Immediate security risk, full system access
   - HIGH: Significant vulnerability, data exposure
   - MEDIUM: Moderate risk, performance impact
   - LOW: Minor issue, UX improvement
   - REFACTOR: Code quality, maintainability

### Example Issues Created

**Critical Issue:**
```markdown
[CRITICAL] Dangerous permissions bypassed in agent mode

Location: src/main/lib/trpc/routers/claude.ts:1056

Description: allowDangerouslySkipPermissions: true grants full system access

Risk:
- Impact: CRITICAL - Full file system, bash, network
- Likelihood: HIGH - Every agent mode operation
- Overall: CRITICAL

Recommendation:
1. Add confirmation dialogs for dangerous ops
2. Implement permission tiers
3. Add audit logging

Labels: `security`, `critical`, `agent-mode`
```

---

## macOS App Bundle Configuration

### Required Structure

```
MyApp.app/
├── Contents/
│   ├── Info.plist              # Bundle metadata
│   ├── Resources/              # Assets
│   │   └── icon.icns           # App icon
│   └── MacOS/                  # Executables
│       └── MyApp               # Launch script
```

### Info.plist Keys

**Required:**
```xml
<key>CFBundleExecutable</key>
<string>MyApp</string>

<key>CFBundleIdentifier</key>
<string>com.domain.appname</string>

<key>CFBundleName</key>
<string>AppName</string>

<key>CFBundlePackageType</key>
<string>APPL</string>
```

**Optional but Recommended:**
```xml
<key>CFBundleDisplayName</key>
<string>App Display Name</string>

<key>CFBundleIconFile</key>
<string>icon</string>  <!-- without .icns -->

<key>CFBundleVersion</key>
<string>1.0</string>

<key>CFBundleShortVersionString</key>
<string>1.0</string>
```

### Icon Requirements

- **Format**: Apple Icon Image (.icns)
- **Sizes**: 16×16 to 1024×1024 pixels
- **Location**: `Contents/Resources/icon.icns`
- **Reference**: Use filename without extension in Info.plist

**Create from PNG:**
```bash
# Create iconset folder
mkdir MyIcon.iconset

# Add PNG files (icon_16x16.png, icon_32x32.png, etc.)
# ...

# Convert to ICNS
iconutil -c icns MyIcon.iconset
```

### Launch Script

```bash
#!/bin/bash
# Must be executable: chmod +x

# Navigate to app directory
cd "/path/to/app"

# Launch with exec (replaces shell process)
exec /usr/local/bin/command args
```

### Making App Discoverable

```bash
# 1. Create symlink to Applications
ln -sf /path/to/MyApp.app /Applications/MyApp.app

# 2. Update modification time (refresh Launch Services)
touch /path/to/MyApp.app

# 3. Restart Finder and Dock
killall Finder Dock
```

### Validation Commands

```bash
# Validate plist syntax
plutil -lint MyApp.app/Contents/Info.plist

# Check icon configuration
defaults read MyApp.app/Contents/Info CFBundleIconFile

# Test launch
open -a "MyApp"

# Debug mode
open -a "MyApp" --args --debug
```

---

## Environment Configuration

### .env File Structure

```bash
# =============================================================================
# 1Code Configuration
# =============================================================================

# Required: Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-...

# Development: Auto-load project on startup (dev mode only)
AUTO_LOAD_PROJECT=/Users/kenny/1code

# Optional: Apple Developer (for macOS code signing)
APPLE_ID=your-email@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_IDENTITY=Developer ID Application: Your Name (TEAM_ID)

# Optional: Error tracking
MAIN_VITE_SENTRY_DSN=https://xxxxx@xxx.ingest.sentry.io/xxxxx

# Optional: Analytics
MAIN_VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAIN_VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

### .env.example Template

```bash
# Auto-load project on startup (development only)
# Set this to automatically load a project when the app starts in dev mode
# AUTO_LOAD_PROJECT=/path/to/your/project

# Apple Developer credentials (required for macOS code signing & notarization)
# Skip these if you just want to run locally without signing
APPLE_ID=your-email@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_IDENTITY=Developer ID Application: Your Name (TEAM_ID)

# Sentry error tracking (optional - disabled if not set)
# MAIN_VITE_SENTRY_DSN=https://xxxxx@xxx.ingest.sentry.io/xxxxx

# PostHog analytics (optional - disabled if not set)
# MAIN_VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
# MAIN_VITE_POSTHOG_HOST=https://us.i.posthog.com
```

---

## Common Commands

### Development

```bash
# Start dev server with hot reload
bun run dev

# Build TypeScript (no packaging)
bun run build

# Preview built app
bun run preview

# Type checking
bun run ts:check
```

### Database

```bash
# Generate migrations from schema changes
bun run db:generate

# Push schema directly (dev only, dangerous!)
bun run db:push

# Open Drizzle Studio (database UI)
bun run db:studio
```

### Building & Packaging

```bash
# Package for current platform (outputs to release/)
bun run package

# Build macOS DMG + ZIP
bun run package:mac

# Build Windows NSIS + Portable
bun run package:win

# Build Linux AppImage + DEB
bun run package:linux

# Full distribution build
bun run dist
```

### Release Process

```bash
# Download Claude binary (required first time)
bun run claude:download

# Download for all platforms
bun run claude:download:all

# Full release workflow
bun run release
# Steps: claude:download → build → package:mac → dist:manifest → upload

# Generate update manifest
bun run dist:manifest

# Upload to CDN
bun run dist:upload
```

### Git & Deployment

```bash
# Sync to public repository
bun run sync:public

# Generate app icons
bun run icon:generate
```

### Electron Binary

```bash
# Path to Electron binary (for custom launches)
/Users/kenny/1code/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
```

---

## Quick Reference

### Launch 1Code

```bash
# Terminal (foreground)
1code

# Terminal (background)
1code-bg

# Standalone script
start-1code

# Spotlight
Cmd+Space → "1Code Dev"

# Applications
/Applications/1Code.app

# Command line
open -a "1Code"
```

### Check Running Processes

```bash
# Find 1Code processes
ps aux | grep "[b]un run dev" | grep 1code

# Check background tasks
/tasks

# Read task output
tail -f /private/tmp/claude/-Users-kenny/tasks/<task-id>.output
```

### Security Audit Files

```bash
# Full audit report
/Users/kenny/1code/SECURITY_AUDIT_2026-01-26.md

# Skills and knowledge (this file)
/Users/kenny/1code/SKILLS_AND_KNOWLEDGE.md

# GitHub issues
https://github.com/21st-dev/1code/issues/103-113
```

---

## Lessons Learned

### What Worked Well

1. ✅ **Systematic Audit Approach**
   - Comprehensive file review (80+ files)
   - Categorized by severity
   - Created tracking issues immediately

2. ✅ **Immediate Fixes**
   - Fixed 3/20 issues during audit
   - DOMPurify integration
   - Environment variable configuration

3. ✅ **Documentation**
   - Detailed security report
   - Code examples for all issues
   - Implementation roadmap

4. ✅ **Automation Setup**
   - Multiple launch methods
   - Shell aliases
   - macOS app bundle with icon

### Areas for Improvement

1. ⚠️ **Critical Issues Remain**
   - Sandbox still disabled
   - Permission bypass still active
   - Require immediate team attention

2. ⚠️ **Refactoring Needed**
   - Claude router too large (1,800 lines)
   - Multiple cache layers
   - Complex state management

3. ⚠️ **Testing Gaps**
   - No automated security testing
   - Missing penetration tests
   - No load testing

### Next Actions

**Immediate (This Week):**
- [ ] Review critical issues #103, #104 with team
- [ ] Add user confirmation dialogs for agent mode
- [ ] Implement request timeouts

**Short Term (2-3 Weeks):**
- [ ] Fix plaintext auth fallback
- [ ] Add IPC origin validation
- [ ] Implement pagination for file queries

**Long Term (1-2 Months):**
- [ ] Refactor Claude router
- [ ] Add LRU caching
- [ ] Enable Dependabot
- [ ] Create SECURITY.md

---

**End of Knowledge Base**

*Last Session*: January 26, 2026
*Next Review*: After Phase 1 implementation
*Maintained By*: Development team + Security audits
