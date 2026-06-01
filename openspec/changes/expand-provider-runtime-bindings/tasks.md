## 1. OpenSpec
- [x] 1.1 Add runtime provider binding proposal, design, tasks, and spec delta.
- [x] 1.2 Validate `expand-provider-runtime-bindings` strictly.

## 2. Codex Binding Contract
- [ ] 2.1 Extract Codex provider-profile ACP binding helpers.
- [ ] 2.2 Ensure provider-profile runs receive loopback gateway config and a
      process-local gateway token only through main-process env.
- [ ] 2.3 Ensure provider-profile runs clear inherited `CODEX_API_KEY` and
      `OPENAI_API_KEY` values.
- [ ] 2.4 Keep Codex ChatGPT/API-key auth paths explicit when no provider profile
      is selected.
- [ ] 2.5 Keep Codex provider-profile log args redacted.

## 3. Security Hardening
- [ ] 3.1 Reject or scrub secret-bearing custom provider headers before they are
      stored as plaintext profile metadata.
- [ ] 3.2 Scope provider gateway tokens to the issued profile and gateway kind.
- [ ] 3.3 Remove plaintext `customConfig.token` from the Claude chat runtime API.
- [ ] 3.4 Clear legacy renderer-stored Claude provider tokens after migration
      attempts, including secure-storage failures.
- [ ] 3.5 Strip inherited provider/API secret env vars from Codex provider-profile
      runtime processes.

## 4. Verification
- [ ] 4.1 Add focused unit tests for Codex provider-profile binding args, env,
      auth method, and redacted log preview.
- [ ] 4.2 Add negative tests for custom header storage, profile-scoped gateway
      auth, legacy Claude token cleanup, and plaintext chat config rejection.
- [ ] 4.3 Run targeted provider/runtime/security regression tests.
- [ ] 4.4 Run `bun run ts:check`, `bun run build`, full `bun test tests`, and
      `git diff --check`.
- [ ] 4.5 Capture local desktop smoke evidence for provider-profile runtime
      binding status.
