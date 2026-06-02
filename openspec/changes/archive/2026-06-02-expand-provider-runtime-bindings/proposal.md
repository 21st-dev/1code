# Change: Expand provider runtime bindings

## Why
Locus already has provider profiles, secure credential storage, diagnostics, and
gateway-backed Claude/Codex runtime paths, but the cc-switch plan still needs a
clear vertical slice proving that runtime binding behavior is intentional,
testable, and safe for both main agent runtimes.

## What Changes
- Define the runtime binding contract for Claude, Codex, and helper defaults.
- Add focused tests for Codex provider-profile ACP configuration and secret
  injection boundaries.
- Harden provider-profile runtime binding security issues found during audit:
  custom secret headers, profile-scoped gateway tokens, plaintext legacy chat
  config, and inherited provider env values.
- Capture real desktop smoke evidence for provider-profile selection and
  runtime binding status without writing `~/.codex` or `~/.claude`.
- Keep this slice limited to Locus-managed provider profiles and per-run runtime
  overrides.

## Non-Goals
- Do not introduce another provider database or runtime config source of truth.
- Do not import, apply, or mutate external CLI configuration files.
- Do not add provider preset sharing, quick switching, or usage/cost tracking.
- Do not claim every provider works with every runtime; unsupported targets must
  fail before provider work starts.

## Impact
- Affected specs: provider-runtime-bindings
- Affected code: provider profile storage/gateway, Claude/Codex runtime binding
  helpers, provider profile tests, runtime smoke evidence
