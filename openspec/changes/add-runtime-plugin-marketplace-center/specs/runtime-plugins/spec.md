## ADDED Requirements

### Requirement: Runtime Marketplace Center
The system SHALL provide a runtime-scoped marketplace center that distinguishes Codex marketplaces, Claude Code marketplaces, and Locus-native pinned store candidates.

#### Scenario: User opens the plugin marketplace center
- **WHEN** the user opens Settings > Plugins
- **THEN** the app presents Codex, Claude Code, and Locus-native plugin scopes separately
- **AND** does not present one runtime's plugin marketplace as applying to another runtime
- **AND** labels Locus-native pinned store candidates separately from Codex and Claude Code marketplaces

#### Scenario: Locus store has no candidates
- **WHEN** the Locus-native pinned store catalog is empty
- **THEN** the app shows the Locus store as empty
- **AND** still shows Codex and Claude Code marketplace/plugin state when those runtimes report inventory
- **AND** does not imply that the overall plugin ecosystem is empty

### Requirement: Runtime-Owned Marketplace Inventory
The system SHALL read marketplace inventory through runtime-owned read surfaces before falling back to local filesystem scans.

#### Scenario: Codex marketplace inventory is available
- **WHEN** the Codex CLI can run marketplace read commands
- **THEN** Locus reads Codex marketplace sources from Codex-owned command output
- **AND** captures marketplace name, root/source path when available, status, and diagnostics
- **AND** treats local Codex cache scans as fallback or component enrichment rather than the primary source of marketplace truth

#### Scenario: Claude Code marketplace inventory is available
- **WHEN** the Claude Code CLI can run marketplace read commands
- **THEN** Locus reads Claude Code marketplace sources from Claude-owned command output
- **AND** captures marketplace name, source/root when available, status, and diagnostics
- **AND** treats local Claude marketplace directory scans as fallback or component enrichment rather than the primary source of marketplace truth

### Requirement: Runtime-Owned Plugin Listings
The system SHALL read installed and available plugin listings through the runtime that owns each plugin ecosystem.

#### Scenario: Codex plugin listings are available
- **WHEN** Codex reports plugin listings through its plugin read commands
- **THEN** Locus shows Codex plugin id, marketplace, install or enablement status when available, version, path/source, and component summary when discoverable
- **AND** marks Codex plugin actions as runtime-owned and read-only in this slice

#### Scenario: Claude Code plugin listings are available
- **WHEN** Claude Code reports installed or available plugin listings through its plugin read commands
- **THEN** Locus shows Claude plugin id, marketplace, install status, enablement status when available, version, scope/source/path when available, and component summary when discoverable
- **AND** marks Claude plugin actions as runtime-owned and read-only in this slice

#### Scenario: Runtime reports no installed plugins
- **WHEN** a runtime read command succeeds and reports no installed plugins
- **THEN** Locus shows a runtime-specific empty state
- **AND** preserves any available marketplace listings for that runtime
- **AND** does not treat the empty installed state as a Locus store failure

### Requirement: Runtime Marketplace Read-Only Actions
The system SHALL keep external runtime marketplace actions read-only until a later approved change defines write behavior.

#### Scenario: User views an available runtime plugin
- **WHEN** the plugin is available through a Codex or Claude Code marketplace but not installed
- **THEN** Locus may show install guidance naming the owning runtime
- **AND** does not run install, update, remove, enable, disable, marketplace add, marketplace update, or marketplace remove commands

#### Scenario: User views an installed runtime plugin
- **WHEN** the plugin is installed or enabled in Codex or Claude Code
- **THEN** Locus may show runtime-reported status and component metadata
- **AND** does not change runtime plugin state in this slice
- **AND** does not execute plugin code, hooks, MCP servers, native modules, or app connectors while listing it

### Requirement: No Cross-Runtime Plugin Conversion
The system SHALL prevent cross-runtime install, conversion, or compatibility claims between Codex and Claude Code plugins.

#### Scenario: Codex plugin appears in the marketplace center
- **WHEN** a plugin belongs to Codex
- **THEN** Locus shows it only under the Codex runtime scope
- **AND** does not offer to install it into Claude Code
- **AND** does not translate Codex plugin manifests into Claude Code plugin manifests

#### Scenario: Claude Code plugin appears in the marketplace center
- **WHEN** a plugin belongs to Claude Code
- **THEN** Locus shows it only under the Claude Code runtime scope
- **AND** does not offer to install it into Codex
- **AND** does not translate Claude Code plugin manifests into Codex plugin manifests

### Requirement: Runtime Marketplace Doctor
The system SHALL diagnose runtime marketplace health without executing plugin code or changing runtime configuration.

#### Scenario: Runtime CLI is unavailable
- **WHEN** Codex or Claude Code marketplace read commands are unavailable, fail, time out, or return unsupported output
- **THEN** Doctor reports a runtime-specific warning or blocked check
- **AND** includes bounded command/status diagnostics
- **AND** does not expose secrets, raw config values, OAuth tokens, or MCP secret values

#### Scenario: Runtime CLI and filesystem fallback disagree
- **WHEN** runtime-owned marketplace output disagrees with a local filesystem scan
- **THEN** Doctor reports the mismatch
- **AND** identifies the runtime-owned read surface as authoritative for marketplace inventory in this slice
- **AND** keeps filesystem scan details as fallback or component-enrichment diagnostics

## MODIFIED Requirements

### Requirement: Runtime-Aware Plugin Catalog
The system SHALL list plugin packages and marketplace listings by owning runtime so Claude Code plugins, Codex plugins, and Locus-native plugin packages are not presented as the same installation format.

#### Scenario: User opens Plugins settings
- **WHEN** the user opens Settings > Plugins
- **THEN** the app shows plugin data grouped or tabbed by runtime scope
- **AND** Claude Code marketplace/listing state is read from Claude-owned read surfaces when available
- **AND** Codex marketplace/listing state is read from Codex-owned read surfaces when available
- **AND** local filesystem scans remain fallback or component-enrichment inputs with visible diagnostics

#### Scenario: Runtime has no plugins
- **WHEN** one runtime has no installed plugin packages
- **THEN** the app shows an empty state for that runtime's installed plugins
- **AND** still shows that runtime's configured marketplaces or available plugins when the runtime reports them
- **AND** does not imply that another runtime's plugins apply to it

### Requirement: Plugin Source Browser
The system SHALL provide a read-only view of known plugin sources so users can distinguish runtime-owned marketplaces, local filesystem fallbacks, developer sources, and Locus-native pinned store candidates.

#### Scenario: User opens plugin sources
- **WHEN** the user opens the Sources or Marketplaces view in Settings > Plugins
- **THEN** the app lists known sources by runtime scope
- **AND** each source shows its path or source identifier, status, source type, trust label, plugin count when known, and whether it came from a runtime-owned read surface or filesystem fallback

#### Scenario: Source root is empty or missing
- **WHEN** a runtime has no discovered plugin packages from fallback filesystem scans
- **THEN** the app still shows runtime-owned marketplace state when the runtime reports it
- **AND** labels missing fallback paths as fallback diagnostics instead of hiding the runtime

### Requirement: Read-Only Source Handling
The system SHALL keep plugin source and marketplace browsing read-only until explicit install/update flows are designed for each owning runtime.

#### Scenario: User views a source
- **WHEN** the user selects a runtime marketplace source or Locus-native store source
- **THEN** the app shows source details and runtime-specific install guidance
- **AND** does not show remote install, update, enable, disable, remove, or marketplace mutation controls for Codex or Claude Code runtime marketplaces

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes plugins from the Sources or Marketplaces view
- **THEN** the app re-runs bounded read-only runtime inventory commands and local fallback scans
- **AND** does not add marketplaces, update marketplace snapshots, install packages, update packages, remove packages, enable plugins, disable plugins, or execute plugin code

### Requirement: Plugin Store Commit Pins
The system SHALL model Locus-native plugin store entries with immutable source pins before install or update approval.

#### Scenario: Locus store entry has immutable source pin
- **WHEN** Locus previews a Locus-native pinned store plugin entry with a full commit SHA and bounded package metadata
- **THEN** Locus shows the repo, commit, path, package hash when available, runtime, target mode, and declared capabilities
- **AND** labels the pin as review metadata rather than proof of safety
- **AND** does not present the entry as a Codex or Claude Code marketplace listing

#### Scenario: Locus store entry uses mutable source ref
- **WHEN** a Locus-native pinned store entry uses `latest`, a branch name, an unresolved tag, or another mutable ref for an approved write action
- **THEN** Locus blocks install or update approval
- **AND** reports that an immutable commit pin is required
