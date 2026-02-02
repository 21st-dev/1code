<!--
  ============================================================================
  SYNC IMPACT REPORT
  ============================================================================
  Version Change: INITIAL (0.1.0) → 1.0.0
  Ratification Date: 2026-02-01 (initial adoption)
  Last Amended: 2026-02-01

  Modified Principles:
  - All principles are newly defined (initial constitution)

  Added Sections:
  - Core Principles (5 principles)
  - Development Standards
  - Quality Gates
  - Governance

  Removed Sections:
  - None (initial version)

  Templates Requiring Updates:
  ✅ plan-template.md - Constitution Check section already references constitution file
  ✅ spec-template.md - Already includes mandatory user scenarios and requirements
  ✅ tasks-template.md - Already organized by user story with test-first approach
  ⚠ checklist-template.md - Should reference constitution compliance verification
  ⚠ agent-file-template.md - Should reference constitution principles

  Follow-up TODOs:
  - Add constitution compliance checklist to checklist-template.md
  - Add principle references to agent-file-template.md
  - Create runtime guidance document (CONTRIBUTING.md or DEVELOPMENT.md)
  ============================================================================
-->

# 1Code Constitution

## Core Principles

### I. Desktop-First Experience

**Principle**: 1Code is a desktop application built on Electron that prioritizes local-first workflows and native platform integration.

**Rules**:
- All features MUST work offline-first with local data storage
- UI components MUST use native Electron APIs when superior to web alternatives (dialogs, notifications, clipboard, window controls)
- IPC communication MUST use type-safe tRPC patterns, not raw IPC handlers
- Application state MUST persist across restarts using appropriate storage mechanisms
- Platform-specific features (macOS, Windows, Linux) MUST degrade gracefully on unsupported platforms

**Rationale**: Users expect desktop applications to be fast, reliable, and work without constant internet connectivity. Native integration provides better UX than web-only approaches.

### II. Git Worktree Isolation (NON-NEGOTIABLE)

**Principle**: Each chat session MUST run in an isolated Git worktree to prevent accidental changes to the main branch and enable parallel work.

**Rules**:
- Every chat session MUST create a dedicated Git worktree before any code execution
- Worktrees MUST be automatically cleaned up when chats are archived or deleted
- All file operations in agent mode MUST execute within the chat's worktree path
- Main branch MUST remain protected from direct commits during agent execution
- Worktree creation failures MUST block agent mode activation and show clear error messages

**Rationale**: Git worktree isolation is the core safety mechanism that allows users to run multiple agents in parallel without conflicts and prevents catastrophic mistakes like committing experimental changes to production branches.

### III. Type Safety & Data Integrity

**Principle**: All data flows—IPC, database, API—MUST use strict TypeScript types and validated schemas.

**Rules**:
- All tRPC routers MUST define Zod schemas for input validation
- Database schema changes MUST use Drizzle migrations (no manual SQL)
- Auto-migration MUST run on app startup to ensure database compatibility
- TypeScript MUST be configured with `strict: true` and no `any` types without explicit justification
- IPC bridge MUST expose typed APIs via preload context isolation

**Rationale**: Type safety prevents entire classes of runtime errors. The combination of TypeScript, Zod validation, and Drizzle ORM ensures data consistency from UI to storage.

### IV. User Transparency & Control

**Principle**: Users MUST see what the agent is doing in real-time and have control over execution.

**Rules**:
- All tool executions (bash, file edits, web search) MUST render in real-time in the UI
- Diff previews MUST show exact changes before they land in the codebase
- Plan mode MUST present structured plans for user approval before execution
- Error messages MUST be actionable and include recovery suggestions
- Background agents MUST show progress indicators and allow cancellation

**Rationale**: AI agents modify user code. Transparency builds trust, control prevents disasters, and clear feedback reduces support burden.

### V. Performance & Responsiveness

**Principle**: The UI MUST remain responsive during agent execution, and common operations MUST feel instant.

**Rules**:
- Main process operations that take >100ms MUST move to background workers or separate processes
- Large file operations MUST stream data rather than loading entire contents into memory
- Database queries MUST use indexes and avoid N+1 patterns
- React components MUST use proper memoization to prevent unnecessary re-renders
- Message streaming MUST render incrementally, not wait for completion

**Rationale**: A slow UI destroys user experience. Desktop apps are judged against native standards, not web app standards.

## Development Standards

### Testing Requirements

- **Integration Tests**: Required for Git worktree operations, database migrations, and tRPC router contracts
- **E2E Tests**: Required for critical user flows (create chat, run agent, view diff, commit changes)
- **Unit Tests**: Required for complex business logic (session management, auth flows, file system operations)
- Tests MUST be written before implementation for new features (TDD) unless explicitly justified

### Code Organization

- **File Naming**: Components PascalCase, utilities/hooks camelCase, stores kebab-case
- **Module Structure**: Follow existing patterns (main/, preload/, renderer/, lib/, features/)
- **Feature Folders**: Group related UI components by feature (agents/, sidebar/, sub-chats/)
- No circular dependencies between modules

### Version Control

- **Branching**: Feature branches from `main`, use descriptive names (`###-feature-name` format)
- **Commits**: Conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- **PRs**: Must include description, testing steps, and screenshots for UI changes

## Quality Gates

### Before Commit

- TypeScript compilation MUST pass (`bun run build`)
- No ESLint errors (warnings allowed with justification)
- Drizzle schema MUST match migrations (`bun run db:generate` produces no changes)

### Before Release

- All integration tests MUST pass
- Critical E2E flows MUST be manually verified
- electron-builder packaging MUST succeed for target platforms
- Auto-update manifest MUST be generated and validated
- Notarization MUST complete (macOS) before CDN upload

### Breaking Changes

- Database schema breaking changes MUST include migration path
- tRPC contract changes MUST maintain backward compatibility OR increment major version
- Electron version upgrades MUST be tested on all supported platforms

## Governance

### Amendment Process

1. Propose change via issue or PR with rationale and impact analysis
2. Review with team (or solo decision for individual contributors)
3. Update constitution with version bump (see versioning rules below)
4. Update dependent templates (plan-template.md, spec-template.md, tasks-template.md)
5. Propagate to agent-file-template.md and runtime guidance docs

### Versioning Rules

- **MAJOR**: Backward incompatible governance changes (removing/redefining core principles)
- **MINOR**: New principles added or material expansions to existing guidance
- **PATCH**: Clarifications, wording improvements, typo fixes, non-semantic refinements

### Compliance Review

- All feature specifications MUST include Constitution Check section
- Plans MUST justify any deviations from core principles
- Code reviews MUST verify adherence to type safety and testing requirements
- Complexity (new abstractions, architectural changes) MUST be justified against Principle V

### Runtime Guidance

For day-to-day development guidance beyond these constitutional rules, refer to:
- `/CLAUDE.md` - AI assistant development instructions
- `/README.md` - Setup and build instructions
- `/openspec/AGENTS.md` - Change proposal workflow (when applicable)

**Version**: 1.0.0 | **Ratified**: 2026-02-01 | **Last Amended**: 2026-02-01
