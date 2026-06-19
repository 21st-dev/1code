# runtime-plugins Specification

## Purpose
Define runtime-aware plugin discovery, source browsing, and enablement behavior for Claude Code and Codex plugin formats.
## Requirements
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

### Requirement: Reference-Only Codex++ Learning Boundary
The system SHALL treat Codex++ as a reference repository for governance patterns rather than a Locus plugin runtime dependency.

#### Scenario: Codex++ concepts are reviewed
- **WHEN** maintainers compare Codex++ with Locus
- **THEN** manifest metadata, safe mode, doctor/debug, reviewed commit pins, advisory updates, per-plugin data, and MCP declaration patterns may be tracked as learnable patterns
- **AND** app patching, re-signing, DOM patching, watcher repair, main-process tweak execution, native bridge defaults, and local-code-as-safe-plugin claims are excluded from direct adoption

#### Scenario: Codex++ repository is updated
- **WHEN** the Codex++ reference repository changes
- **THEN** Locus maintainers classify changes as learn, backlog, or ignore
- **AND** Locus does not change plugin execution behavior until a Locus OpenSpec change approves it

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

### Requirement: Plugin Source Pin Metadata
The system SHALL surface available source/store pin metadata as advisory review input.

#### Scenario: Pin metadata is available
- **WHEN** a plugin package exposes a cache version, lock-file source ref, or equivalent stable source pin
- **THEN** Settings > Plugins shows that pin metadata in the plugin detail
- **AND** labels it as advisory review metadata rather than proof of safety

#### Scenario: Pin metadata is unavailable
- **WHEN** no source/store pin can be found
- **THEN** Settings > Plugins clearly reports that no source pin is available
- **AND** does not invent a pin or mark the package as verified

### Requirement: Bounded Plugin Change Summaries
The system SHALL show bounded local summaries of plugin manifest changes.

#### Scenario: Manifest metadata changes
- **WHEN** the current fingerprint differs from the last reviewed fingerprint
- **THEN** the plugin detail shows a bounded summary of changed review fields such as version, target mode, component counts, MCP declarations, or source pin
- **AND** the summary omits plugin source code and secrets

#### Scenario: No reviewed baseline exists
- **WHEN** the plugin has not yet been reviewed locally
- **THEN** the plugin detail asks for local review rather than claiming the package is safe

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

### Requirement: Plugin MCP Runtime Gate
The system SHALL include plugin-provided MCP servers in agent runtime configuration only when all plugin gates pass.

#### Scenario: Enabled plugin MCP passes gates
- **WHEN** a Claude plugin is enabled, safe mode is off, the current plugin fingerprint is reviewed, the current MCP config fingerprint is approved, and no project/global MCP server overrides the same name
- **THEN** Locus may include that plugin MCP server in the agent runtime configuration

#### Scenario: Plugin MCP fails any gate
- **WHEN** a plugin MCP server is unapproved, safe mode is enabled, the plugin fingerprint is unreviewed, or the plugin is not enabled
- **THEN** Locus does not include that plugin MCP server in agent runtime configuration
- **AND** pending approval views distinguish review-gated MCP from approval-gated MCP

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

### Requirement: Plugin Doctor Report
The system SHALL provide a local plugin Doctor report that explains plugin catalog health and runtime gate posture without executing plugin code.

#### Scenario: User opens plugin Doctor
- **WHEN** the user opens Settings > Plugins
- **THEN** the app shows a Doctor summary derived from local plugin metadata
- **AND** the summary includes source status, manifest review posture, safe-mode posture, runtime gate posture, component availability, and MCP declaration posture
- **AND** the summary does not contact remote marketplaces or execute plugin package code

#### Scenario: Doctor sees blocked plugin capabilities
- **WHEN** a plugin is new, changed, read-only, missing review state, or blocked by safe mode
- **THEN** the Doctor report labels the affected checks as blocked or warning
- **AND** explains the concrete local reason without calling the plugin trusted or verified

### Requirement: Plugin Debug Details
The system SHALL provide per-plugin Debug details for local review and recovery.

#### Scenario: User selects a plugin
- **WHEN** the user selects a plugin in Settings > Plugins
- **THEN** the app shows per-plugin Debug details including runtime, source path, source pins, manifest fingerprint, last reviewed fingerprint, review status, safety gate, component counts, MCP server names, and local diagnostics
- **AND** redacts raw MCP secret values and does not expose arbitrary plugin source contents

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

### Requirement: Controlled UI Contribution Manifest

The system SHALL support an optional Locus-native controlled UI contribution manifest that is parsed as static data without executing plugin code.

#### Scenario: Plugin declares controlled UI contributions
- **WHEN** Locus scans a plugin package containing a valid controlled UI contribution manifest
- **THEN** the manifest is parsed in the main process using a strict bounded schema
- **AND** the plugin contribution metadata is included in local review fingerprints
- **AND** no plugin JavaScript, TypeScript, JSX, native module, or runtime hook is executed

#### Scenario: Contribution manifest is invalid
- **WHEN** the contribution manifest is malformed, too large, contains unsupported fields, or declares unsupported surfaces
- **THEN** Locus reports a bounded diagnostic for that plugin
- **AND** does not activate the invalid contribution
- **AND** does not expose raw plugin source code or secret values to the renderer

### Requirement: Controlled UI Eligibility Gate

The system SHALL gate controlled UI contributions through review state, safe mode, runtime ownership, and schema validation before exposing active actions.

#### Scenario: Plugin fingerprint is not reviewed
- **WHEN** a plugin declares controlled UI contributions but its current fingerprint is new, changed, or unreviewed
- **THEN** Locus may show read-only contribution metadata
- **AND** blocks contributed actions
- **AND** explains that local review is required

#### Scenario: Safe mode is enabled
- **WHEN** plugin safe mode is enabled
- **THEN** Locus disables contributed command actions and settings writes
- **AND** may continue showing read-only contribution diagnostics
- **AND** labels the contribution as blocked by safe mode

#### Scenario: Codex cache package declares contributions
- **WHEN** a Codex cache package contains controlled UI contribution metadata
- **THEN** Locus keeps the package read-only
- **AND** does not activate the contribution unless a later approved spec adds a Locus-owned Codex controlled UI primitive

#### Scenario: Renderer submits forged action state
- **WHEN** the renderer invokes a controlled UI action with a plugin key, contribution id, action id, fingerprint, or permission state
- **THEN** the main process re-resolves the current plugin package and contribution manifest
- **AND** recomputes safe mode, review state, controlled UI gate, and action eligibility
- **AND** rejects the invocation if the current main-process gate does not allow it

### Requirement: Locus-Owned Contribution Rendering

The system SHALL render controlled UI contributions with Locus-owned renderer components rather than plugin-provided code or DOM mutations.

#### Scenario: User views a controlled settings section
- **WHEN** a reviewed and eligible plugin contributes a settings section
- **THEN** Settings > Plugins renders the section using app-authored controls
- **AND** every contribution remains visibly tied to its plugin identity and review status
- **AND** the renderer does not evaluate plugin-authored JavaScript, HTML, JSX, event handlers, or DOM patches

#### Scenario: User views a controlled workbench panel
- **WHEN** a reviewed and eligible plugin contributes a workbench panel
- **THEN** Locus renders the panel through an app-owned panel host
- **AND** the panel may display bounded static data and app-provided state only
- **AND** the panel cannot access provider secrets, raw SQLite, Node APIs, shell execution, or arbitrary filesystem paths
- **AND** the panel is not an iframe, webview, plugin React component, plugin CSS injection, or DOM patch

### Requirement: Controlled Command Actions

The system SHALL allow contributed command buttons only when their actions map to explicit Locus-owned allowlisted actions.

#### Scenario: User clicks an insert-draft command button
- **WHEN** a reviewed and eligible plugin contributes a command button with an allowlisted insert-draft action
- **THEN** Locus prepares the declared draft text for the active chat
- **AND** does not send the message automatically
- **AND** does not execute an agent, terminal command, file edit, MCP approval, plugin enablement, or provider operation automatically

#### Scenario: Button declares unsupported action
- **WHEN** a contribution declares an action that is not allowlisted
- **THEN** Locus disables the button
- **AND** reports a Doctor/Debug diagnostic for the unsupported action

### Requirement: Fingerprint-Bound Controlled UI Grants

The system SHALL bind controlled UI permission grants to the current reviewed contribution fingerprint.

#### Scenario: User grants a controlled UI action permission
- **WHEN** a user approves a controlled UI permission for a contribution action or settings field
- **THEN** Locus stores the grant with the plugin review key, contribution id, action or field id, requested permission, and current contribution fingerprint
- **AND** does not treat the grant as valid for a different contribution fingerprint

#### Scenario: Contribution metadata changes after grant
- **WHEN** a plugin contribution manifest changes after a grant was stored
- **THEN** Locus treats the previous grant as stale
- **AND** blocks controlled action invocation until the current fingerprint is reviewed and the required permission is granted again
- **AND** reports the stale grant in Doctor/Debug without exposing plugin source code or secrets

### Requirement: Developer Trusted Plugin Mode
The system SHALL provide a developer trusted-code plugin mode that is available only for explicitly registered local developer plugin directories.

#### Scenario: User opens a local developer plugin
- **WHEN** the user registers a local developer plugin directory
- **THEN** Locus parses the developer plugin manifest without executing plugin code
- **AND** labels the plugin target mode as `developer-trusted-code`
- **AND** states that this mode is equivalent to running local code
- **AND** does not present the plugin as sandboxed, marketplace trusted, or Codex++ compatible

#### Scenario: Remote or cache package requests developer trust
- **WHEN** a remote marketplace, Codex cache, or ordinary runtime plugin package declares developer trusted-code metadata
- **THEN** Locus ignores the trusted-code request
- **AND** does not load executable plugin code from that package

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

### Requirement: Developer Trust Review Binding
The system SHALL bind developer plugin trust acknowledgements to the current reviewed plugin fingerprint and executable content fingerprint.

#### Scenario: Developer plugin changes after trust
- **WHEN** the developer plugin manifest, entrypoint metadata, source pins, or review-relevant plugin metadata changes
- **THEN** previous trust acknowledgement no longer authorizes loading
- **AND** Locus requires the user to review and trust the new fingerprint before loading code

#### Scenario: Developer plugin entrypoint changes after trust
- **WHEN** the developer plugin entrypoint file content changes while manifest metadata stays the same
- **THEN** previous trust acknowledgement no longer authorizes loading
- **AND** Locus reports that executable content changed

#### Scenario: User revokes developer trust
- **WHEN** the user revokes trust for a developer plugin
- **THEN** Locus prevents future loads and invocations for that plugin
- **AND** preserves review history and plugin files

### Requirement: Developer Plugin Permission Disclosure
The system SHALL disclose developer plugin permissions as review metadata, not as same-process sandbox enforcement.

#### Scenario: Developer plugin declares permissions
- **WHEN** a developer plugin declares permissions or capabilities
- **THEN** Locus displays those declarations for review
- **AND** states that same-process developer plugin code is not confined by those labels
- **AND** does not describe the permissions as a security sandbox

### Requirement: Developer Plugin Recovery And Diagnostics
The system SHALL keep safe mode and Doctor/Debug available as recovery and diagnostic surfaces for developer trusted plugins.

#### Scenario: Safe mode is enabled before startup
- **WHEN** plugin safe mode is enabled
- **THEN** Locus blocks developer plugin loading before any entrypoint import
- **AND** still allows the user to view plugin metadata, diagnostics, and trust state
- **AND** allows the user to disable Developer Plugin Mode or revoke plugin trust

#### Scenario: Forced safe mode is requested before startup
- **WHEN** the user starts Locus with a forced safe-mode startup override
- **THEN** Locus blocks developer plugin loading before any entrypoint import
- **AND** keeps the core UI available for recovery actions

#### Scenario: Developer plugin fails to load
- **WHEN** a trusted developer plugin entrypoint fails during load
- **THEN** Locus records a bounded load error in Doctor/Debug
- **AND** does not dump plugin source code, provider secrets, OAuth tokens, or MCP secret values to the renderer

### Requirement: Developer Plugin UI Warnings
The system SHALL make the full-trust nature of developer plugins visible before trust is granted.

#### Scenario: User reviews developer plugin trust
- **WHEN** the user opens the trust panel for a developer plugin
- **THEN** Locus shows the local path, manifest identity, current fingerprint, trust status, and safe-mode status
- **AND** warns that trusting the plugin may run local code on this machine
- **AND** requires an explicit user action before storing the trust acknowledgement

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

### Requirement: Store Candidate Review Preview
The system SHALL compute store install and update previews without executing plugin code.

#### Scenario: User previews a store install
- **WHEN** the user opens a not-installed pinned store candidate
- **THEN** Locus computes a bounded candidate review document
- **AND** shows manifest, target mode, source pin, package hash, permissions, MCP declarations, and controlled UI declarations
- **AND** does not write plugin files

#### Scenario: User previews a store update
- **WHEN** an installed plugin has a pinned store update candidate
- **THEN** Locus compares the installed review document with the candidate review document
- **AND** shows bounded diffs for review-relevant fields
- **AND** does not execute candidate plugin code

### Requirement: Exact Candidate Approval
The system SHALL bind store install and update approval to the exact current candidate.

#### Scenario: User approves pinned candidate
- **WHEN** the user approves a store candidate
- **THEN** Locus stores the store entry id, commit pin, package hash when available, candidate fingerprint, and approval timestamp
- **AND** does not approve MCP activation, controlled UI actions, or developer trusted-code execution

#### Scenario: Candidate changes after approval
- **WHEN** the store entry commit, package hash, target mode, permissions, MCP declarations, controlled UI declarations, or candidate fingerprint changes after approval
- **THEN** previous approval no longer authorizes install or update
- **AND** Locus requires a new review of the changed candidate

### Requirement: Store Install And Update Writes
The system SHALL perform store install and update writes only after exact-candidate approval and backup-first validation.

#### Scenario: Approved candidate is installed or updated
- **WHEN** the user installs or updates an approved current candidate
- **THEN** Locus validates the candidate again in the main process
- **AND** backs up replaced package metadata before replacement when an installed package exists
- **AND** writes only paths contained in the intended plugin package directory
- **AND** records installed source pin, package hash, and backup metadata

#### Scenario: Candidate package escapes target directory
- **WHEN** a store candidate package contains path traversal, symlink escape, or files outside the intended plugin package directory
- **THEN** Locus blocks the install or update
- **AND** reports the package containment failure in Doctor/Debug

### Requirement: Store Target Mode Restrictions
The system SHALL prevent remote store entries from enabling developer trusted-code mode.

#### Scenario: Store entry requests developer trusted-code
- **WHEN** a remote store candidate declares `developer-trusted-code`
- **THEN** Locus blocks install or update approval
- **AND** explains that developer trusted-code is only available for explicitly registered local developer directories

#### Scenario: Store entry declares MCP or controlled UI
- **WHEN** a store candidate declares MCP servers or controlled UI contributions
- **THEN** Locus includes those declarations in the candidate review preview
- **AND** keeps MCP approvals and controlled UI action grants separate after install or update

### Requirement: Store Pin Diagnostics
The system SHALL report store pin and candidate review status in Settings > Plugins and Doctor/Debug.

#### Scenario: Store candidate is stale or blocked
- **WHEN** a store candidate approval is stale, mutable, hash-mismatched, missing required hash metadata, or blocked by target-mode policy
- **THEN** Settings > Plugins and Doctor/Debug show the reason
- **AND** do not describe the candidate as verified safe or marketplace trusted

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

### Requirement: Runtime Marketplace Read-Only Actions
The system SHALL keep runtime marketplace browsing read-only by default, while allowing separately confirmed runtime-owned write actions defined by this change.

#### Scenario: User refreshes runtime metadata
- **WHEN** the user refreshes plugins from the Sources or Marketplaces view
- **THEN** the app re-runs bounded read-only runtime inventory commands and local fallback scans
- **AND** does not add marketplaces, update marketplace snapshots, install packages, update packages, remove packages, enable plugins, disable plugins, or execute plugin code merely because the user refreshed

#### Scenario: User opens a write action
- **WHEN** the user chooses a supported runtime-owned marketplace or plugin mutation
- **THEN** the app opens a confirmation preview before any write occurs
- **AND** keeps the action visually separate from Locus-native pinned store installs

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

### Requirement: Runtime Plugin Write Action Preview
The system SHALL preview every runtime-owned plugin marketplace write action before it can run.

#### Scenario: User previews a runtime marketplace action
- **WHEN** the user chooses a Codex or Claude Code marketplace add, update, upgrade, or remove action
- **THEN** the main process maps the typed action id to an allowlisted runtime CLI command
- **AND** returns the exact command, args, runtime, target, destructive flag, impact summary, and confirmation token
- **AND** the renderer does not provide raw command strings or arbitrary args

#### Scenario: User previews a runtime plugin action
- **WHEN** the user chooses a runtime plugin install, update, enable, disable, or uninstall action
- **THEN** the preview names the owning runtime and plugin selector
- **AND** only includes actions supported by that runtime's CLI
- **AND** does not describe the action as a Locus-native install, cross-runtime conversion, or plugin code execution

### Requirement: Confirmed Runtime Plugin Write Execution
The system SHALL execute runtime-owned plugin marketplace writes only after explicit user confirmation.

#### Scenario: User confirms a write action
- **WHEN** the user confirms the exact previewed runtime plugin action
- **THEN** the main process revalidates the action id, target, scope, and confirmation token
- **AND** spawns only the bundled owning runtime CLI with allowlisted args
- **AND** returns redacted stdout, stderr, command diagnostics, and reload guidance
- **AND** refreshes runtime marketplace inventory and plugin diagnostics after a successful write

#### Scenario: Confirmation does not match
- **WHEN** the confirmation token or destructive target confirmation does not match the preview
- **THEN** the system blocks execution before spawning any runtime CLI process
- **AND** reports the action as rejected rather than partially executed

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

### Requirement: Runtime Plugin Write Boundaries
The system SHALL keep runtime-owned plugin writes separate from Locus-native store installs and plugin execution surfaces.

#### Scenario: User performs a runtime write
- **WHEN** Locus runs a confirmed Codex or Claude Code plugin marketplace command
- **THEN** the command changes only that runtime's plugin or marketplace state
- **AND** does not install a Codex plugin into Claude Code or a Claude plugin into Codex
- **AND** does not translate plugin manifests between runtimes
- **AND** does not execute plugin JavaScript, hooks, MCP servers, native modules, app connectors, or developer trusted code in the Locus process

#### Scenario: Runtime write output contains sensitive text
- **WHEN** the runtime CLI writes stdout, stderr, errors, URLs, or environment-like text
- **THEN** Locus redacts tokens, passwords, bearer values, API keys, and credentialed URLs before exposing the output to the renderer
- **AND** Doctor and toast copy do not include raw secrets

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

### Requirement: Codex App-Server Plugin Run Control
The system SHALL mark Codex plugins as runtime-native-loadable only when app-server
starts from a Locus-managed isolated `CODEX_HOME` whose plugin cache and plugin
enablement config are rebuilt for the current run from review, safe mode,
activation identity, MCP approval, and recovery gates.

#### Scenario: Codex app-server lacks per-run plugin control
- **WHEN** app-server only exposes global plugin inventory, global skill or hook
  inventory, generic thread settings, or cache-backed plugin files
- **THEN** Locus keeps Codex native plugin execution blocked
- **AND** Settings > Plugins explains that cache presence or global enablement is
  not sufficient execution proof

#### Scenario: Locus starts app-server from an isolated plugin home
- **WHEN** Locus starts Codex app-server for a managed run
- **THEN** it points `CODEX_HOME` at a run-owned isolated home
- **AND** stages only allowed plugin cache entries into
  `plugins/cache/<marketplace>/<plugin>/<version>`
- **AND** writes plugin enablement config for the current Locus decision instead
  of copying global Codex plugin configuration
- **AND** proves allowed plugin components appear while sampled global plugins do
  not leak into the isolated home

#### Scenario: A Codex plugin is blocked before startup
- **WHEN** a plugin is disabled, unreviewed, drifted, safe-mode-blocked, failed to
  stage, or declares unapproved MCP servers
- **THEN** Locus does not stage that plugin into the isolated Codex home
- **AND** writes that plugin's app-server config override as disabled
- **AND** non-plugin Codex startup remains available

