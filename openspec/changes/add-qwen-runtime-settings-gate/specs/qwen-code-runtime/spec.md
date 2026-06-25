## MODIFIED Requirements

### Requirement: Flag-gated Qwen Code runtime registration

The system SHALL distinguish desktop/manifest exposure for `qwen-code` from
non-desktop contract runtime IDs. Product Qwen Code runtime exposure SHALL be
controlled by a persisted, off-by-default Settings value owned by the
main-process runtime-feature settings owner. The `LOCUS_ENABLE_QWEN_CODE_RUNTIME`
environment variable SHALL NOT be the product gate; it MAY be honored only as a
dev/test override outside packaged product gating. Non-desktop contract surfaces
SHALL consume a narrower contract runtime set that remains Claude Code + Codex,
independent of the Qwen desktop gate.

#### Scenario: Default off keeps two-runtime behavior
- **WHEN** the persisted Qwen runtime setting is off
- **THEN** the experimental runtime chat route fails closed for `qwen-code`
- **AND** the runtime registry and manifest lookup omit or reject `qwen-code`
- **AND** renderer surfaces that follow manifests do not show Qwen Code
- **AND** Local Job API, headless CLI, schedules, headless job store, and
  `locus acp` reject the runtime from their static contract runtime set
- **AND** no `qwen-code` option is offered in the renderer new-chat, engine, or
  onboarding surfaces

#### Scenario: Setting on admits the third runtime
- **WHEN** the persisted Qwen runtime setting is on
- **THEN** the experimental runtime chat route admits `qwen-code` and constructs
  the Qwen ACP adapter with adapter source `qwen-acp-client`
- **AND** the runtime registry and manifest lookup include `qwen-code` for
  desktop callers
- **AND** the permission layer recognizes `qwen-code` as a permission runtime
- **AND** non-desktop entrypoints remain rejected because `qwen-code` is not in
  the contract runtime set

#### Scenario: Env is a dev/test-only override
- **WHEN** `LOCUS_ENABLE_QWEN_CODE_RUNTIME=1` is set in an unpackaged dev/test
  run
- **THEN** Qwen Code runtime surfaces may be enabled for tests and explicit smoke
  harnesses
- **AND** the same env value does not enable Qwen Code in packaged product mode

#### Scenario: Disabling Qwen stops active Qwen work
- **WHEN** the user disables Qwen while a Qwen desktop run is active or waiting
  on a tool approval
- **THEN** active Qwen streams are aborted and pending Qwen approvals are
  denied/cleared
- **AND** a later approval response for that disabled Qwen run fails closed

#### Scenario: Qwen remains runtime-managed rather than provider-bound
- **WHEN** Qwen Code runtime is enabled by the Settings gate
- **THEN** Qwen still uses its own CLI-managed auth/model/provider configuration
- **AND** Locus does not expose Qwen as a Provider Profile target or route Qwen
  through the Locus provider gateway
