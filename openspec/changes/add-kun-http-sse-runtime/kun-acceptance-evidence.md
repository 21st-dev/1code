# Kun HTTP/SSE Runtime — Acceptance & Security Review Evidence

Branch `codex/add-kun-http-sse-runtime`. Consolidates the task-10 acceptance smoke
with the source-level security review. `openspec validate --strict` passes;
`bun run check` = 1212 tests pass / 0 fail.

## Acceptance smoke (real `kun serve`)

- **Launch + stream:** `createKunHttpSseAdapter` + real `kun serve` + BYO config
  pointing at a fake Responses endpoint returned `succeeded`, emitted
  `text-delta`, zero unsupported events.
- **File change approval:** `write`/`edit` (`file_change`) are approval-mediated;
  allow applied the edit, deny left the file unchanged.
- **Shell:** `command_execution` is sandbox-blocked under `workspace-write` before
  any approval; not advertised as supported; no Locus approval expected in v1.
- **Cancel:** mid-run cancel returned `canceled` and left no `serve-entry` /
  `kun serve` process (`pgrep` clean).
- **Error mapping:** real 401 / `turn_failed`, hardened handshake-drift, and
  active-run child-exit all map to a Locus error/canceled run — no hang/crash, no
  restart-and-continue.
- **Flag-off:** Kun absent when `LOCUS_ENABLE_KUN_RUNTIME` off; Claude/Codex/Qwen
  behavior unchanged; non-desktop stays Claude + Codex.
- **Provider profile:** smoke used BYO config directly, NOT the Locus
  profile-scoped gateway → `providerProfiles` stays `degraded` (see decision doc).

## Security review (source-verified, this branch)

| Control | Verified | Reference |
|---|---|---|
| Hardened launch flags (`on-request` / `workspace-write` / `insecure=false` / loopback / random port) | ✅ | `kun-serve-launcher.ts:208-223` |
| `KUN_READY` echo verified, fail-closed on any drift | ✅ | `verifyKunReadyInfo` `:89-112`, called `:271` |
| `--config` override risk mitigated (CLI > config + handshake verify) | ✅ | launcher args order + `verifyKunReadyInfo` |
| `runtimeToken` via `KUN_RUNTIME_TOKEN` env, never argv; random 32-byte | ✅ | `:114-116,148,224` |
| Child env allowlist excludes all `KUN_*` (blocks ambient override) | ✅ | `isSafeKunEnvKey` `:133-136` |
| Permission mapping fail-closed (uncorrelated / `command_execution` / timeout / abort → deny) | ✅ | `kun-http-sse-adapter.ts:405-461`, `waitForKunApproval:195-207` |
| `approvalId === appr_${callId}` invariant correlation | ✅ | `deriveCallIdFromApprovalId:216` |
| Mid-turn child exit → run failed (no restart-and-continue) | ✅ | adapter `:541-547` |
| Plan mode blocked (route + adapter), not coerced to agent | ✅ | route `:374`, adapter `:324` |
| BYO executable: absolute, `execFile` no-shell, cwd/project PATH-shadow excluded | ✅ | `kun-cli-status.ts:306,348-352,369-373` |
| BYO config path validated (absolute/exists/is-file/not-command/not-secret) WITHOUT reading contents | ✅ | `kun-cli-status.ts:146-211`; no config-content read in repo |
| Override provenance: Settings save mutations only (not Local Job API/deep-link/project) | ✅ | `kun-cli-settings.ts` + router save mutations |
| Contract split: `kun` in `EXPERIMENTAL_RUNTIME_IDS`, not `CONTRACT_RUNTIME_IDS` | ✅ | `agent-runtime-capabilities.ts:1-2` |
| Honest manifest (all `degraded`/`unsupported`) | ✅ | `KUN_RUNTIME_MANIFEST:850+` |

**Verdict:** no security defects found. Launch env allowlist + `KUN_READY` strict
verification exceed the hardened spec. Not yet merged to `main`.

## Reviewer-noted residuals (non-blocking)

- `tool_call`/MCP tools are not sandbox-blocked; an `auto`-policy MCP tool would
  skip approval. `mcpAuth` is `degraded` in the manifest, so MCP is not claimed
  supported — acceptable for v1.
- Launcher stderr secret-hint heuristic (`sk-` / `token`) is ad-hoc, but the env
  allowlist already excludes provider keys, so residual risk is low.
- Acceptance smoke requires a local `kun` binary; automated coverage uses fakes
  (`kun-http-sse-adapter.test.ts`, `kun-serve-launcher.test.ts`,
  `kun-cli-status.test.ts`, `runtime-redaction.test.ts`).
