# Change: Add runtime capability projection

## Why

Locus already has three extension-like surfaces: Skills, MCP servers, and
runtime plugins. They share one product boundary: Locus may manage an installed
capability, but each runtime must separately prove whether that capability is
available in the actual run environment.

The immediate bug class is in Skills. Registry-managed Codex skills can be
installed into the global Codex skills directory while Locus-managed Codex
app-server runs use an isolated `CODEX_HOME`. The UI can therefore report a
Codex skill as installed even though the managed Codex run cannot see it.

The fix is not to make Skills copy MCP's heavier verification model. The shared
model is: canonical Locus-managed capability records, runtime projection
adapters, and explicit runtime availability states. Each capability kind keeps
its own proof bar: Skills prove runtime discovery or staged presence, MCP proves
connection/tools/tool-call evidence, and Plugins prove runtime-native activation
identity.

## What Changes

- Add a Runtime Capability Projection concept for capability kinds that register
  projection adapters and must be materialized into Claude, Codex, or future
  runtime environments.
- Treat Locus-managed capability records as canonical install truth, instead of
  treating runtime global directories as the only source of truth.
- Convert registry-managed Codex Skills to use runtime projection:
  - install records remain Locus-managed metadata
  - the Codex app-server isolated `CODEX_HOME` is a projection target
  - isolated `CODEX_HOME/skills` receives only eligible Locus-managed skills,
    not the entire user global `~/.codex/skills` directory
- Add runtime availability state separate from install state:
  - installed in Locus
  - available in a runtime
  - unavailable in a runtime
  - incompatible with a runtime
  - not projected to a runtime
- Preserve kind-specific verification:
  - Skills: runtime can discover the staged skill package or the package is
    present in the runtime's expected skill location
  - MCP: runtime discovers, connects, lists tools, and proves safe tool use
    according to `add-mcp-registry-install`
  - Plugins: runtime-native activation identity according to runtime plugin
    specs
- Register Skills first. MCP servers and Plugins remain governed by their
  existing owners and verifier semantics until later changes explicitly register
  projection adapters for those kinds.
- Add architecture ownership for runtime capability projection so future runtime
  adapters do not create duplicate install/projection paths.

## Impact

- Affected specs:
  - `runtime-capability-projection` new capability
  - `skill-registry` modified
  - `agent-runtime-capabilities` modified
  - `architecture-ownership` modified
- Affected code:
  - Skills registry/install/listing backend
  - Codex app-server isolated home preparation
  - Codex runtime startup preflight or session materialization
  - Settings > Skills runtime status UI
  - Shared runtime capability manifests only where a runtime class supports
    projected capabilities
  - Architecture ownership map and tests
- Dependency:
  - Implement only after `add-mcp-registry-install` lands with its MCP proof
    semantics preserved.
- Out of scope:
  - Rewriting MCP registry install semantics
  - Rewriting runtime plugin verification semantics
  - Owning MCP config read/write or MCP registry verified state from the
    projection service
  - Requiring MCP or Plugins projection consumers before adapters are registered
  - Moving Commands out of the Skills tab
  - Making Skills require MCP-style tool-call verification
  - Treating projection availability as a second runtime capability manifest
