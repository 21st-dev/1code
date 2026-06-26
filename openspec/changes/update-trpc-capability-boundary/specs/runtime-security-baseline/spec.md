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

#### Scenario: File search or watch uses an unregistered root
- **WHEN** a renderer asks the file search or watch route to operate on a project path that is not a registered project path or chat worktree path
- **THEN** the main process SHALL reject the request before scanning or watching the directory.

#### Scenario: File rename or delete targets a path outside the registered root
- **WHEN** a renderer asks the file rename or delete route to operate on an absolute path outside the supplied registered project or chat worktree root
- **THEN** the main process SHALL reject the request before renaming or deleting the target.

### Requirement: Runtime And Shell Starts Use Server-Resolved Context
Renderer-reachable runtime and terminal start procedures SHALL derive cwd, project path, runtime permission context, and project-scoped configuration from server-side chat, sub-chat, project, or workspace records.

#### Scenario: Runtime chat request forges cwd
- **WHEN** a renderer starts a Claude, Codex, or experimental runtime chat with a cwd that differs from the server-side chat or sub-chat worktree
- **THEN** the main process SHALL reject or ignore the forged cwd and SHALL NOT start the runtime in the attacker-selected directory.

#### Scenario: Terminal request includes initial commands
- **WHEN** a renderer requests a terminal session with startup commands
- **THEN** the renderer SHALL send only predefined initial command intent IDs, and the main process SHALL reject raw command strings and resolve allowed intents to app-owned commands before starting the PTY.

#### Scenario: Terminal request forges cwd
- **WHEN** a renderer requests a terminal session with a cwd or scope that differs from the server-side chat or workspace record
- **THEN** the main process SHALL reject the forged request and SHALL NOT start the PTY in the attacker-selected directory.

#### Scenario: Terminal writes arbitrary input
- **WHEN** a renderer writes arbitrary terminal input to an existing PTY
- **THEN** the main process SHALL require a future approved terminal input capability before writing to the PTY.

### Requirement: GitHub Clone Uses Constrained Repository Identity
Renderer-reachable GitHub clone procedures SHALL parse renderer input into a GitHub owner/repository identity and SHALL execute Git through argv without shell interpretation.

#### Scenario: GitHub clone receives shell metacharacters
- **WHEN** a renderer submits a repository URL or shorthand containing shell metacharacters, extra URL path/query/fragment data, or Git clone option injection
- **THEN** the main process SHALL reject the input before spawning Git.

#### Scenario: GitHub clone executes
- **WHEN** a renderer submits a valid GitHub repository identity
- **THEN** the main process SHALL construct the canonical `https://github.com/<owner>/<repo>.git` clone URL and SHALL invoke `git clone` with argv, not a shell string.

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
- **THEN** it SHALL NOT allow broad JavaScript `unsafe-eval` or remote script origins, and any remaining inline-script or WebAssembly compilation exception SHALL be documented with the code that blocks removal.

#### Scenario: Previewed web page attempts bridge access
- **WHEN** a local browser preview or webview page executes JavaScript
- **THEN** that page SHALL NOT receive the privileged tRPC bridge or desktop API bridge and SHALL be constrained by navigation and permission policy.
