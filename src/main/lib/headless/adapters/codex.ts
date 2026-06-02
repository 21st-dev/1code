import { resolveBundledCodexCliPath } from "../../codex/cli-path"
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
    request.cwd,
    "--color",
    "never",
    "--ask-for-approval",
    "never",
    "--sandbox",
    request.mode === "plan" ? "read-only" : "workspace-write",
    "--skip-git-repo-check",
    request.prompt,
  ]
}

function buildCodexEnv(request: AgentRuntimeRunRequest): NodeJS.ProcessEnv {
  return {
    ...getClaudeShellEnvironment(),
    ...process.env,
    LOCUS_HEADLESS_JOB_ID: request.jobId,
  }
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
    label: "Codex",
  })
}

export const __testCodexHeadless = {
  buildCodexArgs,
}
