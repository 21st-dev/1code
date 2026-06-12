## 1. Adoption Proof
- [x] 1.1 Record current Codex app-server guarded UI truth: plan/no-guard/denial work, productive guarded editing is degraded.
- [x] 1.2 Define the minimal `locus_edit.propose_file_edit` MCP schema and non-writing probe server.
- [x] 1.3 Run a real app-server adoption probe with guarded shell writes denied and a natural canary edit prompt that does not name `locus_edit`, prescribe a shell command, or prescribe a patch format.
- [x] 1.4 Record adoption in three tiers: zero-prompt adoption, light tool-description/system-hint adoption, or explicit-tool-name-only adoption; include raw redacted tool-call evidence and secret scan results.
- [x] 1.5 Treat only zero-prompt or light-hint adoption as adoption proven; keep executor implementation blocked for explicit-tool-name-only or no-adoption results. Result: direct ChatGPT app-server light-hint adoption is proven; provider-profile was initially blocked until gateway namespace-tool translation was fixed and re-proven in 4.8.

## 2. Design Gate
- [x] 2.1 Decide whether the first real executor accepts full file replacement, unified diff, or both. Result: first slice accepts full-file `create` and `replace`; unified diff is deferred.
- [x] 2.2 Decide whether approval UI reuses AskUserQuestion, an existing diff surface, or a new controlled-edit component. Result: reuse AskUserQuestion for explicit approval and emit bounded `file-change-diff` / `file-change-delta` runtime events.
- [x] 2.3 Identify the main-process owner for controlled filesystem writes and remove any duplicate adapter-local write path. Result: `src/main/lib/codex/app-server-controlled-edit.ts` is the single Codex app-server controlled-edit owner, invoked only from the approval bridge after policy and user approval.
- [x] 2.4 Define failure behavior for out-of-scope paths, invalid diffs, stale file contents, missing approval UI, and delayed approval hooks. Result: fail closed with `success:false` before filesystem writes; the app-server safety gate still blocks `item/tool/call` when approval hooks are missing or delayed.

## 3. Implementation After Adoption
- [x] 3.1 Implement the controlled edit executor behind an explicit gate.
- [x] 3.2 Validate every proposed path against the approved guarded scope contract before diff rendering or writes.
- [x] 3.3 Render a bounded diff and require explicit user approval before applying.
- [x] 3.4 Apply accepted edits from the main process and persist normalized runtime events.
- [x] 3.5 Fail closed for rejected, timed out, stale, invalid, or out-of-scope edits.

## 4. Verification
- [x] 4.1 Add fake dynamic-tool tests for accepted, denied, malformed, stale, out-of-scope, and timeout cases.
- [x] 4.2 Run focused unit tests for guard validation, runtime event mapping, approval redaction, and provider secret rejection.
- [x] 4.3 Run a real desktop app-server smoke proving controlled guarded edit reaches the filesystem.
- [x] 4.4 Run a real UI dogfood smoke proving the visible guarded flow can complete a controlled edit.
- [x] 4.5 Only after 4.3 and 4.4 pass, update Codex app-server `hardToolGuard` to supported for direct/app-managed auth context while initially keeping unknown/provider-profile gateway context degraded.
- [x] 4.6 Re-check stale file contents at apply time, after user approval and before the main-process write.
- [x] 4.7 Add provider gateway tool-payload trace diagnostics and focused tests proving standard Responses function tools are preserved through the gateway transform without logging prompts or secrets.
- [x] 4.8 Fix provider-profile gateway namespace-tool translation, prove `locus_edit` tool adoption through the gateway, prove provider-profile controlled edit reaches the filesystem, and then upgrade `hardToolGuard` for provider-profile auth context while keeping unknown auth context degraded.
- [x] 4.9 Scrub Locus-injected Codex app-server secret env entries from production `CODEX_HOME/shell_snapshots` before startup and after shutdown, covering provider-profile gateway tokens and app-managed `CODEX_API_KEY`.
