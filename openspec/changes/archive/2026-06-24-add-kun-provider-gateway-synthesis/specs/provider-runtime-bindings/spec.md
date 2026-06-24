# Spec Delta: provider-runtime-bindings

## ADDED Requirements

### Requirement: Kun Provider Profile Target

The system SHALL provide a dedicated `kun` provider-profile target so that
Kun-bound profiles are filtered, diagnosed, and saved consistently with other
runtime targets. Provider gateway diagnostics SHALL cover the `kun` target rather
than treating Kun profiles as an unrelated target.

#### Scenario: Kun profile is filtered and diagnosed by its target
- **WHEN** a provider profile targets `kun`
- **THEN** it is offered for Kun chats and excluded from unrelated runtime target
  filters
- **AND** gateway diagnostics evaluate it under the `kun` target instead of being
  skipped

### Requirement: Kun Provider Gateway Synthesis

The system SHALL let a Kun run be driven by a bound Locus provider profile through
the Locus-owned loopback gateway instead of a hand-written Kun config. When a
profile is bound, the system SHALL synthesize an ephemeral Kun config targeting
the gateway (`baseUrl` = the loopback `responses` gateway endpoint, `apiKey` = a
profile-scoped gateway token, `endpointFormat` = `responses`, `model` from the
profile), written with owner-only permissions to an isolated path and passed via
`--config`. The gateway SHALL inject the stored upstream credential only when
forwarding from the main process; the upstream provider key SHALL NOT appear in
the synthesized config, the Kun process `argv`, the renderer, logs, or traces.
Bring-your-own Kun config SHALL remain supported when no profile is bound, and a
bound profile SHALL take precedence over any BYO path.

#### Scenario: Profile-driven Kun run starts
- **WHEN** a Kun chat starts with a bound Locus provider profile
- **THEN** Locus synthesizes a Kun config targeting the loopback `responses`
  gateway with a profile-scoped token and launches Kun with it
- **AND** the upstream provider key is absent from the synthesized config, `argv`,
  renderer payloads, logs, and traces
- **AND** the gateway injects the upstream credential only when forwarding from the
  main process

#### Scenario: BYO config is the no-profile fallback
- **WHEN** no Locus provider profile is bound to a Kun chat
- **THEN** Locus passes the user-selected BYO Kun config path via `--config`
  without reading its contents
- **AND** a bound profile takes precedence over any BYO path

### Requirement: Kun Synthesized Config and Token Lifecycle

The system SHALL revoke the profile-scoped gateway token and delete the
synthesized Kun config deterministically when a Kun run ends, is canceled, or
errors. Revocation SHALL remove the token from the gateway token store so it no
longer authenticates, and gateway tokens SHALL carry a time-to-live so a missed
cleanup cannot authenticate for the application lifetime. The synthesized config
SHALL be written only to an isolated owner-only path and SHALL contain no secret
other than the scoped token, which SHALL be redacted from diagnostics and
renderer-safe metadata.

#### Scenario: Run end revokes the token and deletes the config
- **WHEN** a profile-driven Kun run completes, is canceled, or errors
- **THEN** Locus deletes the synthesized config file and revokes the scoped token
  on every exit path
- **AND** the revoked token no longer authenticates against the gateway

#### Scenario: Stale token cannot authenticate indefinitely
- **WHEN** a synthesized config or its token is left behind by a missed cleanup
- **THEN** the token's time-to-live causes it to stop authenticating against the
  gateway after expiry
