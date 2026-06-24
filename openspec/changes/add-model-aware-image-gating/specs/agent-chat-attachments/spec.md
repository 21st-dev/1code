## MODIFIED Requirements
### Requirement: Provider Image Capability
The system SHALL determine image-attachment support from the combination of the selected runtime's
ability to deliver images (transport) AND the resolved target model's vision capability, and SHALL
block image send whenever either is unavailable. First-party Claude/Codex sources with runtime-known
image support SHALL resolve to an explicit supported vision state. Provider Profile/custom sources
whose vision capability is unknown or unset SHALL be treated as unsupported (fail closed). The block
explanation SHALL identify the actual cause (runtime/transport, offline local model, or text-only
model) rather than a generic or mismatched reason. For desktop UI requests, raw Claude selector
values such as `auto` and `custom-provider` SHALL be normalized by renderer/transport run admission
before model vision lookup; the main process SHALL consume the resulting target identity rather than
importing renderer-only normalization logic.

#### Scenario: First-party provider source supports images
- **WHEN** the input contains image attachments
- **AND** the selected runtime can deliver images
- **AND** the active source is first-party Claude OAuth, Codex ChatGPT, or Codex `openai-api-key`
  with runtime-known image support
- **THEN** the app allows send subject to size and count limits

#### Scenario: Claude raw source normalizes before capability lookup
- **WHEN** the selected Claude model source is `auto` or `custom-provider`
- **AND** the input contains image attachments
- **THEN** renderer/transport run admission normalizes that source to the effective run source before
  resolving model vision
- **AND** uses the normalized `claude-oauth` or `provider-profile:*` source for image capability
  lookup

#### Scenario: Provider profile model supports images
- **WHEN** the input contains image attachments
- **AND** the selected runtime can deliver images
- **AND** the active Provider Profile declares `vision: true`
- **THEN** the app allows send subject to size and count limits

#### Scenario: Runtime transport cannot deliver images
- **WHEN** the input contains image attachments
- **AND** the selected runtime does not support image delivery (for example `qwen-code` or `kun`)
- **THEN** the app blocks send
- **AND** explains that the current runtime does not support image attachments

#### Scenario: Selected model is text-only
- **WHEN** the input contains image attachments
- **AND** the selected Provider Profile/model does not support vision (for example a text-only
  third-party model behind a custom provider)
- **THEN** the app blocks send
- **AND** explains that the current model cannot process images

#### Scenario: Provider profile vision capability is unknown
- **WHEN** the input contains image attachments
- **AND** the selected Provider Profile has not declared a vision capability
- **THEN** the app treats the model as unable to process images and blocks send (fail closed)
- **AND** explains how to enable image support for that provider/model

#### Scenario: Provider profile metadata is missing
- **WHEN** the input contains image attachments
- **AND** the selected target identity references a Provider Profile id
- **AND** main-process Provider Profile metadata lookup returns `null`
- **THEN** the app treats the model vision capability as unknown and blocks send (fail closed)
- **AND** does not fall back to first-party image support

#### Scenario: Claude custom-provider uses normalized Provider Profile vision
- **WHEN** the selected Claude model source is `custom-provider`
- **AND** the source normalizes to a legacy/usable Provider Profile
- **AND** that Provider Profile has not declared `vision: true`
- **THEN** the app blocks image send as `model-no-vision`
- **AND** does not fall back to a raw `custom-provider` allow path

#### Scenario: Claude run-admission blocker precedes image gating
- **WHEN** the selected Claude model source is `auto`, `claude-oauth`, or `custom-provider`
- **AND** run admission cannot produce a usable normalized target identity
- **THEN** the run is blocked by the run-admission blocker
- **AND** the image capability gate does not convert that blocker into a model-vision decision

#### Scenario: Offline local model
- **WHEN** the input contains image attachments
- **AND** the active path is an offline local model that cannot receive images
- **THEN** the app blocks send
- **AND** explains the offline limitation as a distinct reason from a text-only remote model

#### Scenario: Provider selection changes
- **WHEN** the user changes provider or model while image attachments are staged
- **THEN** the app re-evaluates image support and limits
- **AND** updates warnings or blocking state without losing the staged attachments

## ADDED Requirements
### Requirement: Main-Process Image Capability Enforcement
The system SHALL enforce image-capability rules in the main process before image bytes, provider
gateway endpoints, provider tokens, or runtime adapter work are resolved, independently of
renderer-side warnings, so that an unsupported image can never reach a text-only or non-image-capable
target.

#### Scenario: Main process trusts target identity and verifies capability
- **WHEN** a desktop run request includes image attachments
- **AND** the request carries a normalized `modelSource` or `providerProfileId`
- **THEN** the main process resolves image capability from that target identity and main-process
  metadata
- **AND** does not trust a renderer-supplied vision boolean
- **AND** does not import renderer-only source normalization or maintain a separate main-process copy
  of Claude source fallback policy

#### Scenario: Image send to a text-only model is stopped before provider work
- **WHEN** a desktop run request includes image attachments
- **AND** the resolved target model does not support vision
- **THEN** the main process returns a preflight blocker before resolving image bytes
- **AND** no provider gateway, provider token, runtime config, or runtime adapter call is made with
  the image content

#### Scenario: Unknown model vision is blocked in the main process
- **WHEN** a desktop run request includes image attachments
- **AND** the resolved Provider Profile target's vision capability is unknown, unset, or its metadata
  lookup returns `null`
- **THEN** the main process blocks the run fail-closed before provider work starts

#### Scenario: Missing attachment capability input fails closed
- **WHEN** image attachments reach `prepareChatImageAttachmentsForDesktopRun`
- **AND** the caller did not supply a resolved image capability result
- **THEN** the main process treats the capability as unknown
- **AND** blocks the run with the model-no-vision reason before resolving image bytes

#### Scenario: Image capability check uses non-secret provider metadata
- **WHEN** a desktop run request includes image attachments for a Provider Profile target
- **THEN** the main process resolves image capability from non-secret Provider Profile metadata
- **AND** does not decrypt provider tokens or resolve gateway tokens before deciding whether images
  are allowed

#### Scenario: Queued or resent image message is re-checked
- **WHEN** an image-bearing message is queued or resent against a target model that cannot process
  images
- **THEN** the main-process check blocks it before runtime startup
- **AND** the renderer surfaces the same reason to the user

#### Scenario: Programmatic image-bearing entrypoint uses the same gate
- **WHEN** a Local Job API, headless, or other programmatic request path accepts image attachments
- **THEN** it uses the same normalized target identity plus main-process image capability gate before runtime
  startup
- **AND** if no explicit image capability is available, it fails closed before provider work starts
