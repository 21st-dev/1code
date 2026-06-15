import { resolveBundledCodexCliPath } from "../../codex/cli-path"
import { buildCodexProviderEnv } from "../../codex/provider-runtime-binding"
import { getClaudeShellEnvironment } from "../../claude/env"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "../agent-runtime-contract"
import { runProcessAgentTask } from "../process-runner"

function buildCodexArgs(request: AgentRuntimeRunRequest): string[] {
  return [
    "exec",
    "--cd",
    request.context.cwd,
    "--color",
    "never",
    "--sandbox",
    request.context.mode === "plan" ? "read-only" : "workspace-write",
    "--skip-git-repo-check",
    request.prompt,
  ]
}

function buildCodexEnv(
  request: AgentRuntimeRunRequest,
  processEnv: NodeJS.ProcessEnv = process.env,
  shellEnv: NodeJS.ProcessEnv = getClaudeShellEnvironment(),
): NodeJS.ProcessEnv {
  return {
    ...buildCodexProviderEnv({ processEnv, shellEnv }),
    LOCUS_HEADLESS_JOB_ID: request.identity.jobId,
  }
}

function filterCodexStderr(text: string): string {
  return text.replace(/^Reading additional input from stdin\.\.\.\n?/gm, "")
}

export async function runCodexHeadlessTask(
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
): Promise<AgentRuntimeRunResult> {
  return runProcessAgentTask({
    request,
    observer,
    executable: resolveBundledCodexCliPath(),
    args: buildCodexArgs(request),
    env: buildCodexEnv(request),
    stderrFilter: filterCodexStderr,
    label: "Codex headless/batch",
  })
}

export const __testCodexHeadless = {
  buildCodexArgs,
  buildCodexEnv,
  filterCodexStderr,
}
