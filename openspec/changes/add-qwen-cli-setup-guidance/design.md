## Context

`add-qwen-acp-spike` intentionally keeps Qwen as a local BYO CLI runtime:
Locus launches `qwen --acp`, but Qwen Code itself owns authentication and model
provider setup. The spike also records that the current machine does not resolve
`qwen`, so live smoke cannot proceed without either installing Qwen or pointing
Locus at an installed executable.

The lightest product follow-up is not managed download. It is a setup/readiness
surface that tells users what is missing and lets them correct executable path
resolution from inside Locus.

## Goals / Non-Goals

- Goals:
  - Detect whether Qwen Code CLI is available to the Electron main process.
  - Explain BYO setup clearly: install Qwen Code, run `qwen`, use `/auth`.
  - Allow a user-provided executable path to fix GUI app `PATH` mismatches.
  - Ensure Qwen runs use the resolved executable path and fail before startup
    when it is missing or invalid.
  - Return only renderer-safe status and remediation metadata.
- Non-Goals:
  - Downloading, installing, updating, signing, or checksumming Qwen binaries.
  - Writing Qwen auth/model settings.
  - Binding Locus Provider Profiles or gateway credentials into Qwen.
  - Treating CLI detection as proof that Qwen auth or provider execution works.

## Decisions

- **Main process owns detection.** Renderer asks for status; it does not run
  shell commands or inspect filesystem paths directly.
- **Use existing executable status semantics.** Reuse or extend
  `src/main/lib/runtime-executable.ts` for file existence and executable checks.
  Add Qwen-specific resolution under `src/main/lib/qwen/`, not in renderer code.
- **Explicit path is non-secret but still sanitized.** Persisting an executable
  path is allowed, but renderer/status payloads must avoid raw env dumps and must
  not expose secret-bearing command output. Invalid paths are reported with
  bounded, renderer-safe messages.
- **No install actions.** The UI may show commands/documentation links, but it
  must not execute install commands or write `~/.qwen`.
- **Status is not auth readiness.** A valid CLI path means only that Locus can
  spawn Qwen. Auth/model readiness remains Qwen-owned until a later Provider
  Profile binding or live-smoke change proves more.
- **Qwen option stays flag-gated.** This guidance appears only when the Qwen
  runtime flag exposes Qwen surfaces.

## References

- Qwen Code GitHub documents standalone, npm, and Homebrew installation plus
  launching `qwen` and using `/auth`.
- Qwen Code auth docs describe CLI-owned authentication methods.
