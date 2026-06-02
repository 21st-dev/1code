# runtime-plugins Specification

## Purpose
Define runtime-aware plugin discovery, source browsing, and enablement behavior for Claude Code and Codex plugin formats.
## Requirements
### Requirement: Runtime-Aware Plugin Catalog
The system SHALL list local plugin packages by runtime so Claude Code plugins and Codex plugins are not presented as the same installation format.

#### Scenario: User opens Plugins settings
- **WHEN** the user opens Settings > Plugins
- **THEN** the app shows plugins grouped or filterable by runtime
- **AND** Claude Code plugins are discovered from the Claude plugin marketplace directory
- **AND** Codex plugins are discovered from the Codex plugin cache directory

#### Scenario: Runtime has no plugins
- **WHEN** one runtime has no discoverable plugin packages
- **THEN** the app shows an empty state for that runtime
- **AND** does not imply that the other runtime's plugins apply to it

### Requirement: Runtime-Scoped Plugin Actions
The system SHALL keep plugin actions scoped to the runtime that owns the plugin package.

#### Scenario: User views a Claude Code plugin
- **WHEN** the selected plugin belongs to Claude Code
- **THEN** the app may show enable and disable controls backed by Claude settings
- **AND** the control does not affect Codex plugin packages

#### Scenario: User views a Codex plugin
- **WHEN** the selected plugin belongs to Codex
- **THEN** the app shows it as an installed Codex package
- **AND** does not show a fake enable or disable control

### Requirement: Explicit Plugin MCP Approval
The system SHALL require explicit approval before plugin-provided MCP servers become active tool connections.

#### Scenario: User enables a Claude Code plugin with MCP servers
- **WHEN** the user enables the plugin
- **THEN** the plugin package becomes enabled for Claude Code
- **AND** MCP servers from that plugin remain pending until the user explicitly approves them

#### Scenario: User disables a Claude Code plugin
- **WHEN** the user disables the plugin
- **THEN** the plugin package is disabled for Claude Code
- **AND** approvals for MCP servers from that plugin are revoked

### Requirement: Plugin Source Browser
The system SHALL provide a read-only view of known plugin sources so users can distinguish where runtime plugin packages are discovered from.

#### Scenario: User opens plugin sources
- **WHEN** the user opens the Sources view in Settings > Plugins
- **THEN** the app lists known plugin sources by runtime
- **AND** each source shows its path, status, source type, trust label, and plugin count

#### Scenario: Source root is empty or missing
- **WHEN** a runtime has no discovered plugin packages
- **THEN** the app still shows the runtime's expected local source root
- **AND** labels it as empty or missing instead of hiding the runtime

### Requirement: Read-Only Source Handling
The system SHALL keep plugin source browsing read-only until explicit install/update flows are designed.

#### Scenario: User views a source
- **WHEN** the user selects a plugin source
- **THEN** the app shows install guidance for that runtime
- **AND** does not show remote install, update, enable, or delete controls

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes plugins from the Sources view
- **THEN** the app re-scans local/cache plugin metadata
- **AND** does not contact remote plugin marketplaces

### Requirement: Plugin Target Mode Classification
The system SHALL classify each discovered runtime plugin package with a Locus target mode that describes how Locus may use it.

#### Scenario: Existing runtime packages are metadata-only
- **WHEN** Locus discovers existing Claude Code or Codex plugin packages
- **THEN** each package is classified as `manifest-only`
- **AND** Locus may display metadata, component lists, source paths, and MCP declarations
- **AND** Locus does not execute arbitrary plugin JavaScript for that package

#### Scenario: Future controlled UI mode is unavailable
- **WHEN** a plugin would require Locus-owned settings pages, workbench panels, or command buttons
- **THEN** the package is not shown as executable through `controlled-ui`
- **AND** the UI explains that controlled UI execution requires a future approved Locus extension surface

#### Scenario: Future developer trusted code mode is unavailable
- **WHEN** a plugin would require local trusted code execution
- **THEN** the package is not shown as enabled through `developer-trusted-code`
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
The system SHALL provide review guidance for plugin and runtime updates without automatically installing or enabling new execution surfaces.

#### Scenario: Plugin metadata changes
- **WHEN** a plugin manifest, target mode, permissions, scope, MCP declaration, native capability, filesystem capability, network capability, or shell-related metadata changes
- **THEN** Locus presents the package as requiring review before new capabilities are trusted
- **AND** new MCP declarations remain pending until explicitly approved

#### Scenario: Codex Desktop changes
- **WHEN** Codex Desktop updates outside Locus
- **THEN** Locus plugin target-mode behavior remains independent of Codex++ patch repair state
- **AND** any Codex++ breakage is treated as external reference risk, not a Locus runtime failure

#### Scenario: Codex CLI/runtime changes
- **WHEN** the Codex CLI or runtime changes in a way that affects plugin discovery or execution capability
- **THEN** Locus updates runtime capability status before showing new plugin actions
- **AND** unsupported or degraded Codex plugin execution remains labeled honestly until a safe primitive exists

### Requirement: Target Mode UI Disclosure
The system SHALL show target mode, runtime ownership, trust posture, and execution status in Settings > Plugins.

#### Scenario: User selects a manifest-only plugin
- **WHEN** the user selects a `manifest-only` plugin
- **THEN** Settings > Plugins shows that Locus reads metadata only
- **AND** the detail view does not show controls that imply arbitrary code execution
- **AND** Codex packages remain read-only unless a future Locus-owned execution path exists

#### Scenario: User views plugin sources
- **WHEN** the user views plugin sources
- **THEN** the source detail explains whether the source is local, official, external, cache-backed, or read-only
- **AND** the source detail includes update-review guidance instead of automatic install/update controls

### Requirement: Plugin Recovery And Diagnostics Planning
The system SHALL keep recovery and diagnostics explicit before any plugin execution mode can be enabled.

#### Scenario: Plugin execution is not implemented
- **WHEN** the current plugin target mode is `manifest-only`
- **THEN** diagnostics are limited to metadata, source status, component discovery, and approval state
- **AND** safe-mode language states that arbitrary plugin code is not executed in this change

#### Scenario: Future execution mode is proposed
- **WHEN** a future change proposes `controlled-ui` or `developer-trusted-code` execution
- **THEN** that change must specify startup recovery, safe mode, permission visibility, revocation, logging, tests, and rollback behavior before implementation

### Requirement: Plugin Manifest Fingerprints
The system SHALL compute local manifest fingerprints for discovered plugin packages without executing plugin code.

#### Scenario: Plugin package is discovered
- **WHEN** Locus scans a Claude Code or Codex plugin package
- **THEN** it computes a deterministic fingerprint from bounded manifest and component declaration metadata
- **AND** it does not hash arbitrary source code as proof of trust
- **AND** it does not execute plugin JavaScript or native code

### Requirement: Plugin Update Review State
The system SHALL persist local update-review state for plugin fingerprints.

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes Settings > Plugins
- **THEN** Locus compares the current plugin fingerprint with the previously seen and reviewed fingerprints
- **AND** reports whether the plugin is new, unchanged, changed, or locally reviewed
- **AND** does not download, install, update, enable, or execute plugin packages

#### Scenario: User marks a plugin reviewed
- **WHEN** the user marks the selected plugin fingerprint as reviewed
- **THEN** Locus stores the current fingerprint and review timestamp locally
- **AND** does not change plugin enablement, MCP approval, target mode, or execution status

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
The system SHALL bind plugin MCP approval to the current redacted MCP configuration fingerprint.

#### Scenario: Plugin MCP configuration changes
- **WHEN** an enabled Claude plugin MCP declaration changes its command, URL, args, cwd, env/header key set, or other approval-relevant metadata
- **THEN** any previous approval for the old MCP declaration no longer authorizes the changed declaration
- **AND** the MCP server is reported as pending approval again
- **AND** Locus does not store raw MCP secret values in approval metadata

#### Scenario: Legacy plugin MCP approval exists
- **WHEN** the settings file contains an older plugin MCP approval that is not bound to a current MCP configuration fingerprint
- **THEN** Locus treats that legacy approval as stale for runtime MCP activation
- **AND** requires approval of the current fingerprint-bound identifier before adding the plugin MCP server to an agent session

### Requirement: Plugin Safe Mode
The system SHALL provide a local plugin safe mode that blocks plugin-provided runtime capabilities without deleting plugin packages or review metadata.

#### Scenario: User enables plugin safe mode
- **WHEN** the user turns on plugin safe mode in Settings > Plugins
- **THEN** Locus keeps local plugin metadata browsing available
- **AND** blocks plugin enablement and plugin MCP runtime inclusion
- **AND** does not delete plugin packages, approved MCP identifiers, or review history
- **AND** does not describe safe mode as a sandbox for arbitrary plugin code

#### Scenario: Locus starts a Claude agent run in safe mode
- **WHEN** plugin safe mode is enabled
- **THEN** Locus-managed Claude agent config setup does not expose the user plugin directory through its isolated config directory
- **AND** project, global, and non-plugin MCP configuration behavior remains unchanged

### Requirement: Plugin Review Gates
The system SHALL gate plugin-provided runtime capabilities on the current locally reviewed manifest fingerprint.

#### Scenario: Plugin is new or changed
- **WHEN** a plugin has no current reviewed manifest fingerprint
- **THEN** Locus allows metadata, component, source pin, diagnostics, and change-summary browsing
- **AND** blocks enablement and plugin MCP runtime inclusion
- **AND** explains that local review is required before plugin-provided capabilities can be used

#### Scenario: Plugin fingerprint is reviewed
- **WHEN** the current plugin manifest fingerprint matches the last locally reviewed fingerprint
- **THEN** review gates may allow plugin-provided capabilities
- **AND** MCP runtime inclusion still requires explicit approval of the current redacted MCP configuration fingerprint
- **AND** Locus does not claim the plugin is verified, trusted, or sandboxed

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
The system SHALL show plugin safe-mode and review-gate state in Settings > Plugins.

#### Scenario: User views a blocked plugin
- **WHEN** a selected plugin is blocked by safe mode or review gates
- **THEN** the plugin detail shows the gate state and bounded reasons
- **AND** enablement or MCP approval actions are disabled or explained until the required gate is cleared

#### Scenario: User views a read-only Codex package
- **WHEN** the selected plugin belongs to the Codex plugin cache
- **THEN** Settings > Plugins continues to show it as read-only metadata
- **AND** does not show controls that imply Locus can execute the Codex package

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
The system SHALL gate plugin-provided runtime components consistently before exposing them to Locus agent workflows.

#### Scenario: Plugin command, skill, or agent is not reviewed
- **WHEN** a Claude plugin source is enabled but its current fingerprint is not locally reviewed
- **THEN** plugin-provided commands, skills, and agents from that plugin are not returned by Locus runtime component APIs
- **AND** the plugin remains visible in the plugin catalog and Doctor report

#### Scenario: Plugin safe mode is enabled
- **WHEN** global plugin safe mode is enabled
- **THEN** plugin-provided commands, skills, agents, and MCP servers are blocked from Locus-managed runtime paths
- **AND** local plugin metadata, review state, and Doctor/Debug visibility remain available

#### Scenario: Codex plugin package is discovered
- **WHEN** a Codex plugin cache package is discovered
- **THEN** Locus keeps it as read-only metadata
- **AND** does not expose Codex plugin commands, skills, agents, MCP servers, or executable code as Locus runtime components

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
The system SHALL load developer trusted plugin code only when all current trust gates pass in the main process.

#### Scenario: Developer plugin is reviewed and trusted
- **WHEN** Developer Plugin Mode is enabled
- **AND** plugin safe mode is disabled
- **AND** the developer plugin manifest and entrypoint resolve inside the plugin directory
- **AND** the current plugin fingerprint is locally reviewed
- **AND** the current plugin fingerprint has a per-plugin trust acknowledgement
- **THEN** Locus may load the declared developer plugin entrypoint

#### Scenario: Developer plugin gate fails
- **WHEN** Developer Plugin Mode is disabled, plugin safe mode is enabled, the plugin fingerprint is new or changed, the trust acknowledgement is missing or stale, or the entrypoint escapes the plugin root
- **THEN** Locus does not import the developer plugin entrypoint
- **AND** reports the blocking reason in Settings > Plugins and Doctor/Debug

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
The system SHALL model plugin store entries with immutable source pins before install or update approval.

#### Scenario: Store entry has immutable source pin
- **WHEN** Locus previews a store plugin entry with a full commit SHA and bounded package metadata
- **THEN** Locus shows the repo, commit, path, package hash when available, runtime, target mode, and declared capabilities
- **AND** labels the pin as review metadata rather than proof of safety

#### Scenario: Store entry uses mutable source ref
- **WHEN** a store plugin entry uses `latest`, a branch name, an unresolved tag, or another mutable ref for an approved write action
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
