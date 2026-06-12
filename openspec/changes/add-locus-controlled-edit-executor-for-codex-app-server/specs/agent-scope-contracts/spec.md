## ADDED Requirements
### Requirement: Locus-Controlled Edit Adoption Probe
The system SHALL prove Codex app-server model adoption of a Locus-owned structured edit tool for each auth/provider path before enabling that path for productive controlled edit execution.

#### Scenario: Direct auth model adopts Locus edit tool
- **WHEN** a direct-auth Codex app-server guarded run has a ready `locus_edit` MCP tool
- **AND** guarded shell writes are denied
- **AND** the user asks for an in-scope file edit using natural task language that does not name `locus_edit`, prescribe a shell command, or prescribe a patch format
- **AND** the prompt is either natural zero-prompt text or a light generic structured-editing hint that does not name `locus_edit`
- **THEN** the adoption probe records a `locus_edit.propose_file_edit` tool call
- **AND** the tool call includes a relative path inside the approved editable scope
- **AND** the probe records proposed content or a proposed patch
- **AND** the probe does not write to the filesystem
- **AND** the evidence classifies the adoption as `zero-prompt` or `light-hint`
- **AND** the executor may proceed only for auth/provider paths with this proof

#### Scenario: Model only adopts Locus edit tool when named explicitly
- **WHEN** a Codex app-server guarded run calls `locus_edit.propose_file_edit` only after the prompt names `locus_edit` or prescribes the exact tool call
- **THEN** the evidence classifies the result as `explicit-tool-name-only`
- **AND** that auth/provider path remains degraded for productive controlled edits
- **AND** the result does not count as adoption proof for enabling that path

#### Scenario: Model does not adopt Locus edit tool
- **WHEN** a Codex app-server guarded run keeps trying shell writes, refuses to edit, or answers without calling `locus_edit`
- **THEN** that auth/provider path remains degraded for productive controlled edits
- **AND** the evidence records the non-adoption result without claiming controlled edit support

#### Scenario: Provider path discovers MCP but does not surface callable tool
- **WHEN** a Codex app-server provider path initializes the `locus_edit` MCP server and requests `tools/list`
- **BUT** the model does not receive `locus_edit.propose_file_edit` as a callable function
- **THEN** that provider path remains degraded for MCP-backed controlled edits
- **AND** another auth/provider path SHALL NOT inherit support from it or lend support to it

#### Scenario: Provider gateway path proves namespace tool adoption
- **WHEN** a Codex app-server provider-profile gateway path receives a Responses `type:"namespace"` tool for `locus_edit`
- **AND** the gateway forwards that nested tool as a callable upstream function without logging prompts or secrets
- **AND** a live guarded adoption probe records a `locus_edit.propose_file_edit` call under zero-prompt or light-hint conditions
- **THEN** that provider path may proceed to productive controlled-edit smoke

### Requirement: Locus-Controlled Edit Execution
The system SHALL keep productive Codex app-server guarded file edits under Locus main-process control.

#### Scenario: Proposed edit is approved
- **WHEN** Codex app-server calls the Locus-controlled edit dynamic tool with an in-scope path and valid edit payload
- **AND** Locus validates the path against the approved guarded scope contract
- **AND** Locus renders a bounded diff
- **AND** the user explicitly approves the edit
- **THEN** Locus applies the edit from the main process
- **AND** persists normalized runtime events and audit data
- **AND** no shell write is required for the edit

#### Scenario: Provider gateway path is enabled only after productive proof
- **WHEN** Codex app-server uses a provider-profile gateway binding
- **AND** gateway evidence proves non-shell tool definitions are surfaced as callable model tools
- **AND** productive controlled-edit smoke proves the dynamic tool returns to Locus, renders a diff, obtains approval, and writes the canary file
- **THEN** Locus MAY expose the productive controlled edit dynamic tool on that path behind the explicit executor gate
- **AND** unknown or unproven auth/provider paths remain degraded

#### Scenario: Proposed edit is not safe to apply
- **WHEN** the proposed edit is out of scope, malformed, stale, too large, missing approval UI, rejected, or times out
- **THEN** Locus fails closed before filesystem writes
- **AND** records a guarded denial or controlled-edit failure event
- **AND** does not ask app-server to retry the edit through a shell write fallback

#### Scenario: Dynamic tool is gated
- **WHEN** the explicit controlled edit executor gate is disabled
- **THEN** Locus SHALL NOT advertise the controlled edit dynamic tool to Codex app-server
- **AND** any unexpected `item/tool/call` request for the tool SHALL fail closed without filesystem writes
