## ADDED Requirements
### Requirement: Renderer-Reachable File Reads Stay Inside Registered Roots
The system SHALL reject renderer-reachable file read requests unless the requested file resolves inside a registered project root or chat worktree root.

#### Scenario: Renderer requests an arbitrary absolute path
- **WHEN** a renderer-reachable file read route receives an absolute file path outside the supplied registered root
- **THEN** the main process SHALL reject the request before reading the file.

#### Scenario: Renderer supplies an unregistered read root
- **WHEN** a renderer-reachable file read route receives a root that is not a registered project path or chat worktree path
- **THEN** the main process SHALL reject the request before reading the file.

### Requirement: Command File Mutations Stay Inside Command Roots
The system SHALL restrict command file read, update, and delete paths to the Claude user command directory or the selected project's `.claude/commands` directory.

#### Scenario: Renderer supplies an absolute command path
- **WHEN** a command file route receives an absolute path or a path traversal segment
- **THEN** the main process SHALL reject the request before reading, writing, or deleting the target.
