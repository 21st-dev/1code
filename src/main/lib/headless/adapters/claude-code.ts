import { buildClaudeEnv, getBundledClaudeBinaryPath } from "../../claude/env"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "../agent-runtime-contract"
import { runProcessAgentTask } from "../process-runner"

function buildClaudeArgs(request: AgentRuntimeRunRequest): string[] {
  return [
    "-p",
    "--output-format",
    "text",
    "--no-session-persistence",
    "--permission-mode",
    request.mode === "plan" ? "plan" : "acceptEdits",
    request.prompt,
  ]
}

export async function runClaudeCodeHeadlessTask(
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
): Promise<AgentRuntimeRunResult> {
  return runProcessAgentTask({
    request,
    observer,
    executable: getBundledClaudeBinaryPath(),
    args: buildClaudeArgs(request),
    env: {
      ...buildClaudeEnv({ enableTasks: true }),
      LOCUS_HEADLESS_JOB_ID: request.jobId,
    },
    label: "Claude Code",
  })
}

export const __testClaudeCodeHeadless = {
  buildClaudeArgs,
}
