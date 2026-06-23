# Qwen ACP Smoke Runbook

Provider call authorization: required

Use this runbook to finish the remaining Qwen ACP spike acceptance tasks from a
clean machine or clean profile. Do not paste raw API keys, OAuth tokens, cookies,
or provider headers into the evidence file.

## 1. Create An Isolated Smoke Root

```bash
export QWEN_SMOKE_ROOT="/private/tmp/locus-qwen-acp-smoke-$(date +%Y%m%d%H%M%S)"
mkdir -p "$QWEN_SMOKE_ROOT/home" "$QWEN_SMOKE_ROOT/user-data" "$QWEN_SMOKE_ROOT/project"
```

All following commands should use:

```bash
export HOME="$QWEN_SMOKE_ROOT/home"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export LOCUS_USER_DATA_DIR="$QWEN_SMOKE_ROOT/user-data"
```

## 2. Install Or Discover Qwen CLI

Persistent user install:

```bash
npm install -g @qwen-code/qwen-code
qwen --version
```

Fully isolated install:

```bash
npm install --prefix "$QWEN_SMOKE_ROOT/qwen-cli" @qwen-code/qwen-code
export PATH="$QWEN_SMOKE_ROOT/qwen-cli/node_modules/.bin:$PATH"
qwen --version
```

Verify ACP initialize before launching Locus:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false},"clientInfo":{"name":"locus-smoke","title":"Locus Smoke","version":"0.0.0"}}}' | qwen --acp
```

Expected evidence: `agentInfo.name` is `qwen-code`, `agentInfo.version` is
recorded, and no secret values appear in stdout/stderr.

## 3. Stand Up Headless Auth

For Qwen Code `0.19.1`, a fresh HOME needs explicit OpenAI-compatible auth type
selection. `OPENAI_API_KEY` alone is not enough for `session/new`.

```bash
export LOCUS_QWEN_CODE_AUTH_TYPE="openai"
export OPENAI_API_KEY="$YOUR_QWEN_SMOKE_OPENAI_KEY"
```

Then verify a non-interactive ACP session without asking for a model response:

```bash
{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false},"clientInfo":{"name":"locus-smoke","title":"Locus Smoke","version":"0.0.0"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"'$QWEN_SMOKE_ROOT/project'","mcpServers":[]}}'
} | qwen --auth-type=openai --acp
```

Expected evidence: response `id:2` contains a `sessionId`. If it still returns
`Authentication required`, do not check task 0.4.

## 4. Launch Locus With Qwen Enabled

From the repo root:

```bash
LOCUS_ENABLE_QWEN_CODE_RUNTIME=1 \
LOCUS_QWEN_CODE_AUTH_TYPE=openai \
LOCUS_USER_DATA_DIR="$LOCUS_USER_DATA_DIR" \
HOME="$HOME" \
XDG_CONFIG_HOME="$XDG_CONFIG_HOME" \
XDG_DATA_HOME="$XDG_DATA_HOME" \
XDG_CACHE_HOME="$XDG_CACHE_HOME" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
PATH="$PATH" \
bun run dev
```

If the Qwen CLI is not found, open Settings -> Models -> Qwen Code CLI and set
the absolute path to the isolated `qwen` binary.

## 5. Acceptance Scenarios

Use the isolated project folder only. Do not run these against a real worktree.

1. Launch + stream: create a Qwen Code chat and ask `Reply with exactly qwen-smoke-ok and do not edit files.`
2. File edit: create `$QWEN_SMOKE_ROOT/project/qwen-smoke.txt`, ask Qwen to edit only that file, and record whether Locus permission handling allows, denies, or blocks it.
3. Permission request: trigger a file edit or shell command and record the prompt/decision behavior. Current spike policy may fail closed; if no allow prompt exists, keep tasks 9.2 and 9.3 unchecked.
4. Cancel: start a long response and cancel mid-run; confirm the desktop job reaches canceled state and the Qwen process exits.
5. Error mapping: force a bad auth/path/runtime failure and confirm Locus emits a renderer-safe error instead of hanging or crashing.

## 6. Record Evidence

Update `qwen-acp-smoke-evidence.md`, then run:

```bash
bun run qwen-acp:smoke:evidence
openspec validate add-qwen-acp-spike --strict --no-interactive
bun test --isolate tests/qwen-acp-client.test.ts tests/qwen-cli-status.test.ts tests/proof-evidence-gates.test.ts
```

Only check a task in `tasks.md` when the matching evidence scenario is `passed`.
