## MODIFIED Requirements

### Requirement: Runtime-Scoped Plugin Actions
The system SHALL keep plugin actions scoped to the runtime that owns the plugin
package and SHALL expose activation controls only when that runtime provides a
proven, Locus-controllable activation path.

#### Scenario: User views a Claude Code plugin
- **WHEN** the selected plugin belongs to Claude Code
- **THEN** the app may show enable and disable controls backed by Claude settings
- **AND** the control does not affect Codex plugin packages
- **AND** Locus-managed Claude runs use filtered settings so only reviewed+enabled
  plugins reach the run

#### Scenario: User views a Codex plugin
- **WHEN** the selected plugin belongs to Codex
- **THEN** the app shows it as an installed Codex package
- **AND** does not show enable or disable controls unless Codex exposes an action
  that Locus can apply without bypassing review, safe-mode, or MCP-approval gates

### Requirement: Explicit Plugin MCP Approval
The system SHALL require explicit approval before plugin-provided MCP servers become
active tool connections, including when the plugin itself is loaded through a
runtime-native plugin loader.

#### Scenario: User enables a Claude Code plugin with MCP servers
- **WHEN** the user enables the plugin
- **THEN** the plugin package becomes enabled for Claude Code
- **AND** MCP servers from that plugin remain pending until the user explicitly
  approves the current redacted MCP configuration fingerprint

#### Scenario: Native-loaded plugin declares MCP servers
- **WHEN** a reviewed and enabled plugin is eligible for runtime-native loading
- **AND** the plugin declares one or more MCP servers
- **THEN** those MCP servers do not become active tool connections until explicitly
  approved
- **AND** if the owning runtime cannot load the plugin while suppressing unapproved
  MCP servers, the MCP-bearing plugin is blocked before approval or marked partial

#### Scenario: User disables a Claude Code plugin
- **WHEN** the user disables the plugin
- **THEN** the plugin package is disabled for Claude Code
- **AND** approvals for MCP servers from that plugin are revoked

### Requirement: Read-Only Source Handling
The system SHALL stop treating runtime plugin sources as permanently read-only only
after an explicit install, enablement, and activation flow is proven for each owning
runtime. Runtime marketplace mutation controls MUST remain hidden or disabled unless
the owning runtime supports the action and Locus can preserve review, enablement,
safe-mode, and MCP-approval gates.

#### Scenario: User views a source
- **WHEN** the user selects a runtime marketplace source or Locus-native store source
- **THEN** the app shows source details and runtime-specific install/enable guidance
- **AND** mutation controls are shown only where a proven install or activation flow
  exists for that owning runtime
- **AND** controls are gated by review/trust state, safe mode, and MCP approval where
  applicable

#### Scenario: Enabling a reviewed plugin activates it through the runtime
- **WHEN** the user enables a plugin for a runtime with proven native plugin loading
- **AND** the plugin has passed the review/trust gate
- **AND** safe mode is off
- **THEN** Locus makes that plugin available to the owning runtime's native loader
  through a per-run filtered activation path
- **AND** an unreviewed plugin, disabled plugin, unapproved MCP server, or any plugin
  under safe mode is NOT activated

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes plugins from the Sources or Marketplaces view
- **THEN** the app re-runs bounded runtime inventory commands and local fallback scans
- **AND** inventory commands version-probe optional flags such as `--json` rather
  than hard-depending on them
- **AND** refresh does not enable, disable, install, remove, or execute plugin code

### Requirement: Plugin Target Mode Classification
The system SHALL classify each discovered runtime plugin package with a Locus target
mode that describes how Locus may use it in managed runtime execution.

#### Scenario: Existing runtime packages are classified from proof
- **WHEN** Locus discovers existing Claude Code or Codex plugin packages
- **THEN** each package is classified as `manifest-only`, `runtime-native-loadable`,
  `mcp-only`, `not-runtime-loadable`, or `developer-trusted-code`
- **AND** `runtime-native-loadable` is assigned only to component types proven to load
  through the owning runtime's native loader in Locus-managed execution
- **AND** `mcp-only` is shown as partial capability, not full plugin execution

#### Scenario: Future controlled UI mode is unavailable
- **WHEN** a plugin would require Locus-owned settings pages, workbench panels, or
  command buttons
- **THEN** the package is not shown as executable through `controlled-ui`
- **AND** the UI explains that controlled UI execution requires a future approved
  Locus extension surface

#### Scenario: Developer trusted code remains explicit
- **WHEN** a plugin would require local trusted code execution by Locus
- **THEN** the package is not shown as enabled through `developer-trusted-code` unless
  Developer Plugin Mode gates apply
- **AND** the UI does not imply that declared permissions sandbox local code

### Requirement: Plugin Update Review Guidance
The system SHALL provide review guidance for plugin and runtime updates without
automatically trusting new execution surfaces.

#### Scenario: Plugin metadata changes
- **WHEN** a plugin manifest, target mode, permissions, scope, MCP declaration,
  native capability, filesystem capability, network capability, shell-related
  metadata, or runtime activation behavior changes
- **THEN** Locus presents the package as requiring review before new capabilities are
  trusted
- **AND** new MCP declarations remain pending until explicitly approved

#### Scenario: Codex Desktop changes
- **WHEN** Codex Desktop updates outside Locus
- **THEN** Locus plugin target-mode behavior remains independent of Codex++ patch
  repair state
- **AND** any Codex++ breakage is treated as external reference risk, not a Locus
  runtime failure

#### Scenario: Codex CLI/runtime changes
- **WHEN** the Codex CLI or runtime changes in a way that affects plugin discovery,
  execution capability, or per-run filtering
- **THEN** Locus updates runtime capability status before showing new plugin actions
- **AND** unsupported, uncontrolled, or degraded Codex plugin execution remains
  labeled honestly until a safe per-run control primitive exists

### Requirement: Target Mode UI Disclosure
The system SHALL show target mode, runtime ownership, trust posture, execution
status, and per-run controllability in Settings > Plugins.

#### Scenario: User selects a manifest-only plugin
- **WHEN** the user selects a `manifest-only` plugin
- **THEN** Settings > Plugins shows that Locus reads metadata only
- **AND** the detail view does not show controls that imply arbitrary code execution

#### Scenario: User selects a runtime-native-loadable plugin
- **WHEN** the user selects a `runtime-native-loadable` plugin
- **THEN** Settings > Plugins shows the owning runtime, component types that are
  loadable, and the review/safe-mode/MCP gates required before activation
- **AND** the detail view explains that plugin code is loaded by the owning runtime,
  not by Locus importing marketplace plugin code

#### Scenario: User selects a Codex package
- **WHEN** the selected plugin belongs to Codex
- **THEN** Settings > Plugins shows whether Codex is native-loadable, MCP-only,
  unsupported, or blocked because app-server lacks a per-run filter
- **AND** Codex packages are not described as executable merely because they are
  present in the Codex plugin cache

#### Scenario: User views plugin sources
- **WHEN** the user views plugin sources
- **THEN** the source detail explains whether the source is local, official,
  external, cache-backed, read-only, runtime-native-loadable, or blocked
- **AND** the source detail includes update-review guidance instead of automatic
  install/update controls where no proven action exists

### Requirement: Plugin Recovery And Diagnostics Planning
The system SHALL keep recovery and diagnostics explicit before any plugin execution
mode can be enabled.

#### Scenario: Plugin execution is not implemented
- **WHEN** the current plugin target mode is `manifest-only`
- **THEN** diagnostics are limited to metadata, source status, component discovery,
  and approval state
- **AND** safe-mode language states that arbitrary plugin code is not executed in this
  change

#### Scenario: Runtime-native execution mode is proposed
- **WHEN** a change proposes runtime-native plugin execution
- **THEN** that change specifies startup recovery, safe mode, permission visibility,
  revocation, logging, tests, and rollback behavior before implementation
- **AND** native loader failures fail closed for the offending plugin or component
- **AND** non-plugin runtime startup remains available when plugin staging or loading
  fails

#### Scenario: Plugin staging or native load fails
- **WHEN** a plugin package cannot be staged, filtered, loaded, or component-gated for
  a managed run
- **THEN** Locus blocks that plugin or component for the run
- **AND** Doctor/Debug shows the plugin, component, gate, and bounded failure reason
- **AND** forced safe mode can be used before startup to recover to a no-plugin state

### Requirement: Plugin Manifest Fingerprints
The system SHALL compute bounded local review fingerprints for discovered plugin
packages and SHALL compute a separate runtime-native activation identity before
native plugin activation can be allowed.

#### Scenario: Plugin package is discovered
- **WHEN** Locus scans a Claude Code or Codex plugin package
- **THEN** it computes a deterministic review fingerprint from bounded manifest and
  component declaration metadata
- **AND** for runtime-native activation it also records a bounded activation identity
  from the review fingerprint plus runtime-reported package id, version, source pin,
  package hash, or equivalent stable package identity when available
- **AND** it does not execute plugin JavaScript or native code while computing either
  identity
- **AND** it does not present either identity as proof that plugin code is safe

#### Scenario: Native activation identity changes
- **WHEN** the current runtime-native activation identity differs from the last
  reviewed activation identity
- **THEN** Locus treats the plugin as needing review before native activation
- **AND** the plugin remains visible for metadata browsing, Doctor, and Debug

#### Scenario: Stable runtime package identity is unavailable
- **WHEN** a runtime plugin can be natively loaded but Locus cannot obtain a stable
  source pin, package hash, runtime package identity, or equivalent drift-detection
  field
- **THEN** Locus marks native activation identity as identity-incomplete
- **AND** native activation is blocked or requires an explicit high-risk
  acknowledgement before that plugin can be made available to the runtime loader
- **AND** the UI does not call the plugin verified, trusted, or safe

### Requirement: Plugin Update Review State
The system SHALL persist local update-review state for plugin fingerprints and
runtime-native activation identities, and SHALL recompute effective activation status
from all runtime gates after review state changes.

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes Settings > Plugins
- **THEN** Locus compares the current plugin fingerprint with the previously seen and
  reviewed fingerprints
- **AND** compares the current runtime-native activation identity with the previously
  reviewed activation identity when native loading is in scope
- **AND** reports whether the plugin is new, unchanged, changed, identity-incomplete,
  or locally reviewed
- **AND** does not download, install, update, enable, or execute plugin packages

#### Scenario: User marks a plugin reviewed
- **WHEN** the user marks the selected plugin fingerprint as reviewed
- **THEN** Locus stores the current review fingerprint, runtime-native activation
  identity when applicable, and review timestamp locally
- **AND** does not directly change plugin enablement, MCP approval, or target mode
- **AND** recomputes effective activation status from review state, enablement, safe
  mode, MCP approval, runtime support, activation identity, and recovery state

### Requirement: Plugin MCP Approval Revalidation
The system SHALL bind plugin MCP approval to the current redacted MCP configuration
fingerprint for both injected MCP configuration and runtime-native plugin loading.

#### Scenario: Plugin MCP configuration changes
- **WHEN** an enabled plugin MCP declaration changes its command, URL, args, cwd,
  env/header key set, or other approval-relevant metadata
- **THEN** any previous approval for the old MCP declaration no longer authorizes the
  changed declaration
- **AND** the MCP server is reported as pending approval again
- **AND** Locus does not store raw MCP secret values in approval metadata

#### Scenario: Legacy plugin MCP approval exists
- **WHEN** the settings file contains an older plugin MCP approval that is not bound
  to a current MCP configuration fingerprint
- **THEN** Locus treats that legacy approval as stale for runtime MCP activation
- **AND** requires approval of the current fingerprint-bound identifier before adding
  the plugin MCP server to an agent session

#### Scenario: Native-loaded plugin includes unapproved MCP
- **WHEN** a runtime-native plugin includes an MCP server whose current fingerprint is
  not approved
- **THEN** Locus prevents that MCP server from becoming an active tool connection
- **AND** if the runtime cannot filter MCP components independently, the plugin is
  blocked before approval or shown as partial rather than fully active

### Requirement: Plugin Safe Mode
The system SHALL provide a local plugin safe mode that blocks plugin-provided
runtime capabilities without deleting plugin packages or review metadata.

#### Scenario: User enables plugin safe mode
- **WHEN** the user turns on plugin safe mode in Settings > Plugins
- **THEN** Locus keeps local plugin metadata browsing available
- **AND** blocks plugin enablement, native plugin activation, and plugin MCP runtime
  inclusion
- **AND** does not delete plugin packages, approved MCP identifiers, or review history
- **AND** does not describe safe mode as a sandbox for arbitrary plugin code

#### Scenario: Locus starts a Claude agent run in safe mode
- **WHEN** plugin safe mode is enabled
- **THEN** Locus-managed Claude agent config setup does not expose plugin packages
  through its isolated config directory
- **AND** writes filtered settings with no enabled plugin activation
- **AND** project, global, and non-plugin MCP configuration behavior remains unchanged

#### Scenario: Locus starts a Codex run in safe mode
- **WHEN** plugin safe mode is enabled
- **THEN** Locus does not pass any plugin allowlist, isolated plugin root, or plugin
  activation state to Codex app-server
- **AND** if app-server would still auto-load global plugins, Codex native plugin
  execution is marked blocked rather than safe-mode-compliant

### Requirement: Plugin Review Gates
The system SHALL gate plugin-provided runtime capabilities on the current locally
reviewed manifest fingerprint, the current locally reviewed runtime-native
activation identity when native loading is in scope, and on a runtime path that can
enforce those gates for the current run.

#### Scenario: Plugin is new or changed
- **WHEN** a plugin has no current reviewed manifest fingerprint
- **THEN** Locus allows metadata, component, source pin, diagnostics, and
  change-summary browsing
- **AND** blocks enablement, native plugin activation, and plugin MCP runtime
  inclusion
- **AND** explains that local review is required before plugin-provided capabilities
  can be used

#### Scenario: Plugin fingerprint is reviewed
- **WHEN** the current plugin manifest fingerprint matches the last locally reviewed
  fingerprint
- **AND** the current runtime-native activation identity matches the last locally
  reviewed activation identity when native loading is in scope
- **THEN** review gates may allow plugin-provided capabilities only through component
  types and runtimes with proven per-run control
- **AND** MCP runtime inclusion still requires explicit approval of the current
  redacted MCP configuration fingerprint
- **AND** Locus does not claim the plugin is verified, trusted, or sandboxed

#### Scenario: Native activation identity is incomplete or drifted
- **WHEN** the runtime-native activation identity is missing, identity-incomplete, or
  differs from the last reviewed activation identity
- **THEN** Locus blocks native activation unless the spec-approved flow requires and
  records an explicit high-risk acknowledgement for identity-incomplete packages
- **AND** the UI explains that the block is drift-detection related, not a safety
  verdict

### Requirement: Plugin Gate UI Disclosure
The system SHALL show plugin safe-mode, review-gate, MCP approval, runtime
loadability, per-run controllability, activation identity state, recovery state, and
blocked state in Settings > Plugins.

#### Scenario: User views a blocked plugin
- **WHEN** a selected plugin is blocked by safe mode, review gates, missing runtime
  proof, missing per-run control, missing activation identity, missing MCP approval,
  or recovery failure
- **THEN** the plugin detail shows the gate state and bounded reasons
- **AND** enablement, native activation, or MCP approval actions are disabled or
  explained until the required gate is cleared

#### Scenario: User views a Codex package
- **WHEN** the selected plugin belongs to the Codex plugin cache
- **THEN** Settings > Plugins shows the package as native-loadable, MCP-only,
  unsupported, or blocked according to the Phase-1 activation matrix
- **AND** it does not show controls that imply native execution unless Codex
  app-server thread-level loading and per-run filtering have both been proven

#### Scenario: Codex package is unsupported
- **WHEN** a Codex package has no proven controlled native loading path in
  Locus-managed runs
- **THEN** the UI either hides dead action rows or explains the unsupported/native
  blocked state directly
- **AND** the package is not presented as a fully active plugin

### Requirement: Plugin Runtime Component Gates
The system SHALL gate plugin-provided runtime components consistently before exposing
them to Locus-managed agent workflows.

#### Scenario: Plugin component is reviewed and runtime-loadable
- **WHEN** a plugin component belongs to a runtime and component type proven
  `runtime-native-loadable`
- **AND** the runtime path can enforce per-run filtering
- **AND** the plugin is enabled, safe mode is disabled, the current fingerprint is
  locally reviewed, the runtime-native activation identity is reviewed when native
  loading is in scope, and required MCP approvals are current
- **THEN** Locus may expose the component to the owning runtime's native plugin loader
- **AND** the component remains blocked from Locus-managed runtime paths when any
  gate fails

#### Scenario: Plugin safe mode is enabled
- **WHEN** global plugin safe mode is enabled
- **THEN** plugin-provided commands, skills, agents, hooks, and MCP servers are
  blocked from Locus-managed runtime paths
- **AND** local plugin metadata, review state, and Doctor/Debug visibility remain
  available

#### Scenario: Codex plugin package has no native proof
- **WHEN** a Codex plugin cache package is discovered but Codex app-server native
  loading or per-run filtering has not been proven
- **THEN** Locus does not expose Codex plugin commands, skills, agents, hooks, or
  executable code as native runtime components
- **AND** any MCP-only capability is labeled as partial and does not satisfy full
  runtime-native plugin execution

### Requirement: Developer Trusted Plugin Gates
The system SHALL load developer trusted plugin code only when all current trust gates
pass in the main process, and SHALL keep this local developer mode separate from
runtime marketplace plugin activation.

#### Scenario: Developer plugin is reviewed and trusted
- **WHEN** Developer Plugin Mode is enabled
- **AND** plugin safe mode is disabled
- **AND** the developer plugin manifest and entrypoint resolve inside the plugin
  directory
- **AND** the current plugin fingerprint is locally reviewed
- **AND** the current plugin fingerprint has a per-plugin trust acknowledgement
- **THEN** Locus may load the declared developer plugin entrypoint

#### Scenario: Developer plugin gate fails
- **WHEN** Developer Plugin Mode is disabled, plugin safe mode is enabled, the plugin
  fingerprint is new or changed, the trust acknowledgement is missing or stale, or
  the entrypoint escapes the plugin root
- **THEN** Locus does not import the developer plugin entrypoint
- **AND** reports the blocking reason in Settings > Plugins and Doctor/Debug

#### Scenario: Runtime marketplace plugin is enabled
- **WHEN** a Claude Code or Codex runtime marketplace plugin is enabled
- **THEN** Locus does not import it through Developer Plugin Mode
- **AND** activation, if available, happens through the owning runtime's native loader
  with per-run Locus filtering

### Requirement: Runtime-Owned Plugin Listings
The system SHALL read installed and available plugin listings through the runtime
that owns each plugin ecosystem and SHALL distinguish listing visibility from
activation support.

#### Scenario: Codex plugin listings are available
- **WHEN** Codex reports plugin listings through its plugin read commands
- **THEN** Locus shows Codex plugin id, marketplace, install or enablement status when
  available, version, path/source, and component summary when discoverable
- **AND** marks Codex plugin actions as runtime-owned
- **AND** separately reports whether Codex app-server can activate the plugin in a
  controlled Locus-managed run

#### Scenario: Claude Code plugin listings are available
- **WHEN** Claude Code reports installed or available plugin listings through its
  plugin read commands
- **THEN** Locus shows Claude plugin id, marketplace, install status, enablement
  status when available, version, scope/source/path when available, and component
  summary when discoverable
- **AND** marks Claude plugin actions as runtime-owned
- **AND** separately reports whether Claude managed runs can activate the plugin with
  filtered config and settings

#### Scenario: Runtime reports no installed plugins
- **WHEN** a runtime read command succeeds and reports no installed plugins
- **THEN** Locus shows a runtime-specific empty state
- **AND** preserves any available marketplace listings for that runtime
- **AND** does not treat the empty installed state as a Locus store failure

### Requirement: Runtime-Specific Plugin Action Support
The system SHALL expose only runtime-supported plugin write and activation actions,
and SHALL not show controls that bypass Locus review, safe-mode, MCP-approval, or
recovery gates.

#### Scenario: Codex plugin actions are shown
- **WHEN** a Codex plugin listing is available
- **THEN** Locus may offer Codex plugin and marketplace actions only when the bundled
  Codex CLI or app-server exposes those actions
- **AND** Locus does not show Codex enable, disable, install, uninstall, or activation
  controls unless the runtime supports them and Locus can enforce per-run filtering
- **AND** unsupported Codex actions are hidden or explained as blocked rather than
  presented as dead controls

#### Scenario: Claude plugin actions are shown
- **WHEN** a Claude Code plugin listing is available
- **THEN** Locus may offer Claude plugin install, update, enable, disable, and
  uninstall controls according to runtime-reported status
- **AND** may offer Claude marketplace add, list, update, and remove actions
- **AND** shows `/reload-plugins` guidance after plugin mutations instead of trying
  to run the slash command from Locus

## ADDED Requirements

### Requirement: Controlled Runtime-Native Plugin Activation
The system SHALL mark a runtime plugin component as native-loadable only when the
owning runtime loads it through its native loader and Locus can control the plugin
set for the current managed run.

#### Scenario: Native loading and per-run control both pass
- **WHEN** a plugin is installed, enabled, locally reviewed, and safe mode is off
- **AND** the owning runtime has a proven per-run plugin filter or isolated config
- **AND** the current runtime-native activation identity is complete and reviewed, or
  an identity-incomplete package has passed the explicit high-risk acknowledgement
  flow
- **AND** any plugin MCP servers have current MCP approval or can be filtered out
- **THEN** Locus may make the plugin component available to the owning runtime's
  native plugin loader
- **AND** Locus records the component as `runtime-native-loadable`

#### Scenario: Native activation identity drifts
- **WHEN** the reviewed activation identity no longer matches the package that would
  be exposed to the runtime loader
- **THEN** Locus blocks runtime-native activation for that plugin
- **AND** reports the mismatch in Settings > Plugins and Doctor/Debug

#### Scenario: Runtime auto-loads global plugins
- **WHEN** a runtime can load plugins but only by auto-consuming global runtime
  configuration that Locus cannot filter for the current run
- **THEN** Locus marks native plugin execution for that runtime as blocked
- **AND** the UI does not present review, MCP approval, or safe mode as effective
  runtime gates for native plugin execution

### Requirement: Claude Managed Plugin Settings Are Filtered
The system SHALL generate filtered Claude settings for Locus-managed runs whenever
plugin activation is in scope.

#### Scenario: Reviewed plugin is enabled
- **WHEN** a reviewed Claude plugin is enabled and safe mode is off
- **THEN** the isolated Claude config includes only approved plugin package exposure
  and filtered `enabledPlugins` entries for reviewed+enabled plugins
- **AND** unreviewed globally enabled plugins are absent from the managed run

#### Scenario: Safe mode filters Claude settings
- **WHEN** plugin safe mode is enabled
- **THEN** the isolated Claude config writes an empty plugin activation set
- **AND** raw user `~/.claude/settings.json` is not symlinked in a way that can
  re-enable plugins for the managed run

### Requirement: Settings Plugins Management Remains Trustworthy
Settings > Plugins SHALL remain the Plugins management surface for this change and
SHALL resolve audited in-tab trust issues that would otherwise make plugin execution
state misleading or unsafe.

#### Scenario: Plugins navigation is deferred
- **WHEN** this change is implemented
- **THEN** Plugins remains inside Settings
- **AND** promoting Plugins to a standalone extension/product surface remains a
  deferred navigation decision

#### Scenario: Plugin MCP ownership is clear
- **WHEN** plugin-provided MCP servers require approval, OAuth, revoke-all, or status
  management
- **THEN** Settings > Plugins either bridges to the MCP tab or makes ownership between
  Plugins and MCP explicit
- **AND** dead tab-switch state such as an unused `setActiveTab` is removed

#### Scenario: Destructive plugin actions require proportional confirmation
- **WHEN** the user revokes developer-plugin trust, removes a developer source, or
  performs another destructive or security-sensitive plugin action
- **THEN** the UI requires confirmation proportional to the action's risk
- **AND** lower-risk actions do not inherit unnecessary type-to-confirm friction
