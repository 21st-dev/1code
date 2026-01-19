# Roadmap: 21st Agents — Workflow Inspector

## Overview

Build a Workflow Inspector feature for the 21st Agents desktop app that lets users visualize and understand Claude Code agents, commands, and their dependencies. The journey starts with discovering agents/commands from the Claude config directory, then visualizing their dependency tree in a sidebar, and finally showing full source content on click.

## Domain Expertise

None

## Phases

- [x] **Phase 1: Discovery Layer** — SDK/file parsing to find agents, commands, skills
- [x] **Phase 2: Tree Visualization** — Sidebar entries + nested dependency tree UI
- [x] **Phase 3: Content Preview** — Full source code/file content on node click

## Phase Details

### Phase 1: Discovery Layer ✅
**Goal**: Establish data pipeline for discovering and parsing Claude Code agents, commands, and their dependencies
**Depends on**: Nothing (first phase)
**Research**: Likely (Claude Code SDK API for dependency discovery is unknown; may need file parsing fallback)
**Research topics**: @anthropic-ai/claude-agent-sdk 0.2.5 capabilities for dependency graph extraction, Claude config directory structure, YAML frontmatter parsing for skills/commands
**Plans**: 2 (consolidated from 3 items during planning for quick depth)

Plans:
- [x] 01-01: Claude config directory integration + Agent and command discovery
- [x] 01-02: Dependency extraction (skills → tools → MCP → calls)

### Phase 2: Tree Visualization ✅
**Goal**: Build sidebar UI with Agents/Commands entries and nested tree view of dependencies
**Depends on**: Phase 1
**Research**: Unlikely (standard React tree components; project has UI patterns established)
**Plans**: 2 (consolidated from 3 during planning for quick depth)

Plans:
- [x] 02-01: Workflows state management (atoms for tree state, expand/collapse, selection)
- [x] 02-02: Dependency tree component with nested rendering and sidebar integration

### Phase 3: Content Preview ✅
**Goal**: Show full source code/file content when clicking any node in the tree
**Depends on**: Phase 2
**Research**: Unlikely (code preview is well-trodden UI pattern)
**Plans**: 1 (consolidated feature implementation)

Plans:
- [x] 03-01: Content preview pane with syntax highlighting (includes file type detection)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Discovery Layer | 2/2 | Complete | 2025-01-18 |
| 2. Tree Visualization | 2/2 | Complete | 2025-01-18 |
| 3. Content Preview | 1/1 | Complete | 2026-01-18 |
