import { z } from "zod"
import {
  AGENT_JOB_SOURCES,
  AGENT_JOB_STATUSES,
  isTerminalAgentJobStatus,
  type AgentJobStatus,
} from "../../../../shared/agent-jobs"
import { completeAgentJob } from "../../headless/job-store"
import {
  getAgentJob,
  listAgentJobEvents,
  listAgentJobs,
  requestCancelAgentJob,
  retryAgentJob,
} from "../../headless/job-store"
import {
  serializeAgentJob,
  serializeAgentJobEvent,
} from "../../headless/cli-output"
import { requestCancelDesktopAgentJob } from "../../desktop-agent-jobs"
import { getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

const sourceSchema = z.enum(AGENT_JOB_SOURCES)
const statusSchema = z.enum(AGENT_JOB_STATUSES)

export const agentJobsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        source: sourceSchema.default("cli"),
        status: statusSchema.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        includeFolderless: z.boolean().default(false),
      }).optional(),
    )
    .query(({ input }) => {
      const db = getDatabase()
      const jobs = listAgentJobs(db, {
        source: input?.source ?? "cli",
        status: input?.status,
        limit: input?.limit ?? 20,
        projectOnly: input?.includeFolderless !== true,
      })
      return {
        jobs: jobs.map(serializeAgentJob),
        loadedAt: new Date(),
      }
    }),

  show: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const job = getAgentJob(db, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      return { job: serializeAgentJob(job) }
    }),

  logs: publicProcedure
    .input(
      z.object({
        jobId: z.string(),
        afterSequence: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) => {
      const db = getDatabase()
      const job = getAgentJob(db, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      const events = listAgentJobEvents(db, input.jobId, input.afterSequence)
      return {
        job: serializeAgentJob(job),
        events: events.map(serializeAgentJobEvent),
      }
    }),

  cancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const job = getAgentJob(db, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      let updated =
        job.source === "desktop"
          ? requestCancelDesktopAgentJob(db, input.jobId, "desktop").job
          : requestCancelAgentJob(db, input.jobId, "desktop")
      if (updated.status === "queued") {
        updated = completeAgentJob(db, {
          jobId: input.jobId,
          status: "canceled",
          exitCode: 130,
          errorCode: "job_canceled",
          errorMessage: "Job was canceled before it started.",
        })
      }
      return { job: serializeAgentJob(updated) }
    }),

  retry: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const job = getAgentJob(db, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      if (job.source === "desktop") {
        throw new Error(
          "Desktop chat jobs must be retried from their linked chat.",
        )
      }
      if (job.source === "api") {
        throw new Error(
          "API jobs must be retried through locus api runs retry.",
        )
      }
      if (!isTerminalAgentJobStatus(job.status as AgentJobStatus)) {
        throw new Error(`Job ${job.id} is not finished yet.`)
      }
      const retry = retryAgentJob(db, input.jobId)
      return { job: serializeAgentJob(retry) }
    }),
})
