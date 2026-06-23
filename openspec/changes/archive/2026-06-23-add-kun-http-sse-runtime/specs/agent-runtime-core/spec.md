# Spec Delta: agent-runtime-core

## ADDED Requirements

### Requirement: Experimental Runtime Desktop Chat Dispatch

The runtime core SHALL provide a single envelope-only desktop chat subscription
route that dispatches by `runtimeId` across enabled experimental runtimes, rather
than a route hard-coded to one experimental runtime. The route SHALL key its
active-stream and pending-approval state per runtime and per sub-chat, admit only
runtimes whose feature flag is enabled, and delegate preflight, provider binding,
permission policy, adapter execution, event normalization, and redaction to their
canonical owners.

#### Scenario: Route dispatches by runtime id
- **WHEN** the renderer starts a desktop chat for an enabled experimental runtime
- **THEN** the shared route selects the adapter for that `runtimeId` and delegates
  to the canonical preflight, permission policy, provider binding, adapter
  execution, event normalization, and redaction owners
- **AND** it does not add a second route per experimental runtime

#### Scenario: Per-runtime state does not collide
- **WHEN** two experimental runtimes have active runs in different sub-chats
- **THEN** active-stream and pending-approval state is keyed per runtime and
  sub-chat so cancelling or approving one run does not affect the other

#### Scenario: Disabled runtime is rejected
- **WHEN** a desktop chat request names an experimental runtime whose flag is off
- **THEN** the route rejects it with a capability/disabled diagnostic and starts
  no run
