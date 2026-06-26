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

### Requirement: MCP OAuth Tokens Are Not Stored In Shared Claude Config
The system SHALL store MCP OAuth access and refresh tokens only in app-owned safeStorage-backed storage, not in shared Claude CLI configuration.

#### Scenario: OAuth tokens are saved or refreshed
- **WHEN** an MCP OAuth access token or refresh token is saved after login or refresh
- **THEN** `~/.claude.json` SHALL contain only non-sensitive OAuth metadata and SHALL NOT contain bearer Authorization headers, access tokens, or refresh tokens.

#### Scenario: Runtime prepares OAuth MCP config
- **WHEN** the runtime prepares an OAuth MCP server for SDK/tool access
- **THEN** it SHALL decrypt the stored token and materialize the Authorization header only in the in-memory runtime config.

#### Scenario: Legacy plaintext OAuth config is encountered
- **WHEN** an existing Claude config contains plaintext MCP OAuth access or refresh tokens
- **THEN** the system SHALL migrate the tokens into safeStorage-backed app storage and scrub the plaintext fields from Claude config.
