import { z } from "zod"
import { AGENT_SCHEDULE_STATUSES } from "../../../../shared/agent-schedules"
import {
  deleteAgentSchedule,
  listAgentSchedules,
  pauseAgentSchedule,
  resumeAgentSchedule,
  runAgentScheduleNow,
} from "../../headless/schedules"
import {
  serializeAgentJob,
  serializeAgentSchedule,
} from "../../headless/cli-output"
import { getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

const scheduleStatusSchema = z.enum(AGENT_SCHEDULE_STATUSES)

export const agentSchedulesRouter = router({
  list: publicProcedure
    .input(
      z.object({
        includeDisabled: z.boolean().default(false),
        status: scheduleStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }).optional(),
    )
    .query(({ input }) => {
      const db = getDatabase()
      const schedules = listAgentSchedules(db, {
        includeDisabled: input?.includeDisabled ?? false,
        status: input?.status,
        limit: input?.limit ?? 20,
      })
      return {
        schedules: schedules.map(serializeAgentSchedule),
        loadedAt: new Date(),
      }
    }),

  pause: publicProcedure
    .input(z.object({ scheduleId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const schedule = pauseAgentSchedule(db, input.scheduleId)
      return { schedule: serializeAgentSchedule(schedule) }
    }),

  resume: publicProcedure
    .input(z.object({ scheduleId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const schedule = resumeAgentSchedule(db, input.scheduleId)
      return { schedule: serializeAgentSchedule(schedule) }
    }),

  delete: publicProcedure
    .input(z.object({ scheduleId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const schedule = deleteAgentSchedule(db, input.scheduleId)
      return { schedule: serializeAgentSchedule(schedule) }
    }),

  runNow: publicProcedure
    .input(z.object({ scheduleId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const fired = runAgentScheduleNow(db, input.scheduleId)
      return {
        schedule: serializeAgentSchedule(fired.schedule),
        job: serializeAgentJob(fired.job),
      }
    }),
})
