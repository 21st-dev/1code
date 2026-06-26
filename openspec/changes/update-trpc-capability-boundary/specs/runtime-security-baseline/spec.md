## ADDED Requirements
### Requirement: Renderer-Reachable Privileged Procedures Are Inventoried
The system SHALL maintain an auditable inventory of renderer-reachable tRPC procedures that can cause main-process filesystem access, process execution, external navigation, network writes, credential writes, runtime startup, plugin/native activation, git mutations, or destructive data changes.

#### Scenario: New dangerous route is added
- **WHEN** a tRPC router procedure accepts dangerous input such as `path`, `cwd`, `command`, `url`, `token`, `env`, `headers`, or `absolutePath`
- **THEN** the procedure SHALL be classified in the privileged-operation inventory or rejected by an architecture guard before merge.

### Requirement: Renderer Inputs Do Not Carry Raw Filesystem Authority
Renderer-reachable procedures SHALL resolve filesystem targets from registered main-process entities, opaque local references, or dialog-issued tokens before reading, writing, watching, renaming, deleting, or passing paths to local processes.

#### Scenario: Renderer supplies forged project path
- **WHEN** a renderer-reachable route receives a project path or cwd that does not resolve to the registered project, chat worktree, terminal workspace, or dialog token for the request
- **THEN** the main process SHALL reject the request before touching the filesystem or starting a process.

#### Scenario: Renderer supplies path traversal
- **WHEN** a renderer-reachable route receives a path containing traversal, a null byte, or a symlink escape outside the approved root
- **THEN** the main process SHALL reject the request before reading, writing, watching, opening, or deleting the target.

### Requirement: Runtime And Shell Starts Use Server-Resolved Context
Renderer-reachable runtime and terminal start procedures SHALL derive cwd, project path, runtime permission context, and project-scoped configuration from server-side chat, sub-chat, project, or workspace records.

#### Scenario: Runtime chat request forges cwd
- **WHEN** a renderer starts a Claude, Codex, or experimental runtime chat with a cwd that differs from the server-side chat or sub-chat worktree
- **THEN** the main process SHALL reject or ignore the forged cwd and SHALL NOT start the runtime in the attacker-selected directory.

#### Scenario: Terminal request includes initial commands
- **WHEN** a renderer requests a terminal session with initial commands or terminal input
- **THEN** the main process SHALL require an approved terminal workspace capability before starting or writing to the PTY.

### Requirement: Dangerous Operations Require Capability Decisions
Renderer-reachable procedures that perform shell execution, arbitrary file writes or deletes, external app or URL opens, plugin/native activation, MCP command writes, credential imports/removals, remote git writes, update install, or destructive debug actions SHALL declare a capability class and pass a capability decision before performing the side effect.

#### Scenario: Dangerous operation lacks capability metadata
- **WHEN** a dangerous tRPC procedure is implemented with a bare public procedure and no capability classification
- **THEN** architecture checks SHALL fail before merge.

#### Scenario: Capability decision denies operation
- **WHEN** a dangerous operation is denied by user consent, policy, local-only mode, safe mode, or a kill-switch
- **THEN** the main process SHALL skip the side effect and return a bounded denial result.

### Requirement: Untrusted Renderer Content Is Isolated From Privileged Bridges
The renderer SHALL treat repository content, chat markdown, tool output, MCP output, and previewed web pages as untrusted and SHALL prevent them from directly executing privileged app JavaScript or calling the tRPC bridge.

#### Scenario: Untrusted markdown contains active content
- **WHEN** chat, repository, MCP, or tool-output markdown renders active HTML, SVG, scriptable links, or code-highlighted HTML
- **THEN** the renderer SHALL sanitize or sandbox the content before insertion into the privileged app document.

#### Scenario: Mermaid diagram contains scriptable content
- **WHEN** chat, repository, MCP, or tool-output markdown renders a Mermaid diagram containing `click`, `javascript:` URLs, script tags, event handler attributes, or foreign-object content
- **THEN** the renderer SHALL use Mermaid strict mode and SHALL sanitize the resulting SVG before insertion into the privileged app document.

#### Scenario: Tool subtitle contains HTML
- **WHEN** a tool-call subtitle is derived from model, repository, MCP, tool input, or tool output text containing HTML or event handler payloads
- **THEN** the renderer SHALL render the subtitle as text or through an approved sanitizer and SHALL NOT insert it as raw HTML.

#### Scenario: Renderer CSP permits script execution
- **WHEN** the renderer CSP is evaluated for the privileged app document
- **THEN** it SHALL NOT allow `unsafe-eval` or remote script origins, and any remaining inline-script exception SHALL be documented with the code that blocks removal.

#### Scenario: Previewed web page attempts bridge access
- **WHEN** a local browser preview or webview page executes JavaScript
- **THEN** that page SHALL NOT receive the privileged tRPC bridge or desktop API bridge and SHALL be constrained by navigation and permission policy.
