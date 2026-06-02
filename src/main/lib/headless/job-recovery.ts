import {
  interruptStaleAgentJobs,
  type AgentJobDatabase,
} from "./job-store"

export const DEFAULT_STALE_RUNNING_JOB_MS = 2 * 60 * 1000

export function recoverStaleAgentJobs(
  db: AgentJobDatabase,
  now = new Date(),
) {
  return interruptStaleAgentJobs(
    db,
    new Date(now.getTime() - DEFAULT_STALE_RUNNING_JOB_MS),
    now,
  )
}
