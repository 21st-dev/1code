## ADDED Requirements

### Requirement: App Agents Remain Canonical Locus Agents

The system SHALL evolve App Agents into the canonical Locus-managed Agent model
rather than treating runtime-native file agents as an equal product-level
canonical source.

#### Scenario: App Agent is shown in Agent Builder
- **WHEN** an existing App Agent is displayed in the Agent Builder
- **THEN** it is treated as a Locus-managed Agent record
- **AND** it retains its prompt, description, tool guidance, local storage
  identity, and registry provenance when available

#### Scenario: Runtime-native agent has similar fields
- **WHEN** a runtime-native agent has name, description, prompt, tools, or model
  fields similar to a Locus Agent
- **THEN** the system does not merge it into the canonical Locus Agent list by
  field shape alone
- **AND** the user must explicitly import or duplicate it before it becomes a
  Locus-managed Agent

### Requirement: Agent Mentions Resolve To Locus Agents

The system SHALL reserve the `@[agent:name]` mention flow for canonical
Locus-managed Agents.

#### Scenario: Mention menu shows agents
- **WHEN** the user opens the `@agent` mention menu
- **THEN** the suggestions come from Locus-managed Agents
- **AND** runtime-native or plugin-provided listings appear only if they have been
  imported or duplicated into a Locus Agent, unless a later approved change adds
  a distinct mention namespace

#### Scenario: Runtime receives an agent mention
- **WHEN** a runtime path accepts a prompt containing `@[agent:name]`
- **THEN** it resolves the Agent from Locus-managed storage before provider work
  starts
- **AND** either applies prompt-context instructions or rejects/gates the request
  with a runtime capability reason

