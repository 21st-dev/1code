import { observable } from "@trpc/server/observable"
import { z } from "zod"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
  shouldEnableQwenCodeRuntime,
} from "../../../../shared/agent-runtime-capabilities"
import {
  completeDesktopChatAgentJobSafely,
  createAndRegisterDesktopChatAgentJob,
} from "../../desktop-agent-jobs"
import { resolveDesktopPermissionPolicy } from "../../agent-runtime/permission-policy"
import { verifyDesktopRunPreflight } from "../../agent-runtime/preflight"
import {
  appendRunEventsToAgentJob,
  redactRendererRuntimeChunk,
} from "../../agent-runtime/stream-event-mapper"
import {
  listRegisteredAgentRuntimeManifests,
  resolveRegisteredAgentRuntimeCapability,
  resolveRegisteredAgentRuntimeManifest,
} from "../../agent-runtime/runtime-registry"
import { getDatabase } from "../../db"
import {
  desktopScopeExpansionResponseInputSchema,
  respondDesktopScopeExpansion,
} from "../../agent-runtime/scope-expansion"
import { createQwenAcpClientAdapter } from "../../qwen/qwen-acp-client"
import { createQwenDesktopRunRequest } from "../../qwen/desktop-run-request"
import { publicProcedure, router } from "../index"

const capabilityIdSchema = z.enum(AGENT_RUNTIME_CAPABILITY_IDS)

const qwenChatInputSchema = z.object({
  runtimeId: z.literal("qwen-code"),
  subChatId: z.string().min(1),
  chatId: z.string().min(1),
  runId: z.string().optional(),
  prompt: z.string(),
  cwd: z.string(),
  mode: z.enum(["plan", "agent"]).default("agent"),
  sessionId: z.string().optional(),
})

const activeQwenStreams = new Map<
  string,
  {
    runId: string
    controller: AbortController
  }
>()

export const agentRuntimeRouter = router({
  listManifests: publicProcedure.query(() => {
    return listRegisteredAgentRuntimeManifests({ scope: "desktop" })
  }),

  getManifest: publicProcedure
    .input(z.object({ runtimeId: z.string().min(1) }))
    .query(({ input }) => {
      return resolveRegisteredAgentRuntimeManifest(input.runtimeId, {
        scope: "desktop",
      })
    }),

  checkCapability: publicProcedure
    .input(
      z.object({
        runtimeId: z.string().min(1),
        capabilityId: capabilityIdSchema,
      }),
    )
    .query(({ input }) => {
      return resolveRegisteredAgentRuntimeCapability({
        runtime: input.runtimeId,
        capabilityId: input.capabilityId,
        options: { scope: "desktop" },
      })
    }),

  respondScopeExpansion: publicProcedure
    .input(desktopScopeExpansionResponseInputSchema)
    .mutation(({ input }) => {
      return respondDesktopScopeExpansion(input)
    }),

  chat: publicProcedure
    .input(qwenChatInputSchema)
    .subscription(({ input }) => {
      return observable<Record<string, unknown>>((emit) => {
        const existingStream = activeQwenStreams.get(input.subChatId)
        if (existingStream) {
          existingStream.controller.abort()
        }

        const abortController = new AbortController()
        const runId = input.runId ?? crypto.randomUUID()
        activeQwenStreams.set(input.subChatId, {
          runId,
          controller: abortController,
        })

        let isActive = true
        let desktopJobId: string | null = null
        let desktopJobSawError = false
        let desktopJobReachedNaturalFinish = false
        let desktopJobDb: ReturnType<typeof getDatabase> | null = null

        const safeEmit = (chunk: Record<string, unknown>) => {
          if (!isActive) return
          if (chunk.type === "error" || chunk.type === "capability-error") {
            desktopJobSawError = true
          }
          try {
            emit.next(
              redactRendererRuntimeChunk({
                runtimeId: "qwen-code",
                runId,
                jobId: desktopJobId,
                chunk,
              }) as Record<string, unknown>,
            )
          } catch {
            isActive = false
          }
        }

        const complete = () => {
          if (!isActive) return
          isActive = false
          activeQwenStreams.delete(input.subChatId)
          emit.complete()
        }

        void (async () => {
          try {
            if (!shouldEnableQwenCodeRuntime(process.env)) {
              safeEmit({
                type: "capability-error",
                errorText:
                  "Qwen Code runtime is disabled. Set LOCUS_ENABLE_QWEN_CODE_RUNTIME=1 to enable the desktop ACP spike.",
              })
              return
            }

            const db = getDatabase()
            desktopJobDb = db
            const preflight = verifyDesktopRunPreflight(db, {
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: input.cwd,
            })
            const permissionPolicy = resolveDesktopPermissionPolicy({
              runtimeId: "qwen-code",
              mode: input.mode,
              workspaceKind: preflight.kind,
            })
            const desktopJob = createAndRegisterDesktopChatAgentJob(db, {
              runtime: "qwen-code",
              mode: input.mode,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: preflight.cwd,
              prompt: input.prompt,
              runId,
              permissionPolicy,
              cancel: () => {
                const activeStream = activeQwenStreams.get(input.subChatId)
                if (activeStream?.runId !== runId) return
                activeStream.controller.abort()
              },
            })
            desktopJobId = desktopJob.job.id

            const desktopRunRequest = createQwenDesktopRunRequest({
              runId,
              jobId: desktopJobId,
              mode: input.mode,
              preflight,
              prompt: input.prompt,
              permissionPolicy,
              signal: abortController.signal,
              resumeSessionId: input.sessionId ?? null,
              parentSessionId: input.sessionId ?? null,
              emitTrace: (event) => {
                appendRunEventsToAgentJob(db, [event])
              },
            })

            const adapter = createQwenAcpClientAdapter({ emit: safeEmit })
            const result = await adapter.run(desktopRunRequest)
            desktopJobSawError = desktopJobSawError || result.status === "failed"
            desktopJobReachedNaturalFinish =
              result.status === "succeeded" && !desktopJobSawError
            if (result.status === "failed" && result.error?.message) {
              safeEmit({
                type: "error",
                errorText: result.error.message,
              })
            }
          } catch (error) {
            desktopJobSawError = true
            safeEmit({
              type: "error",
              errorText: error instanceof Error ? error.message : String(error),
            })
          } finally {
            if (desktopJobDb) {
              completeDesktopChatAgentJobSafely(desktopJobDb, {
                runtime: "qwen-code",
                jobId: desktopJobId,
                aborted: abortController.signal.aborted,
                reachedNaturalFinish: desktopJobReachedNaturalFinish,
                sawError: desktopJobSawError,
              })
            }
            complete()
          }
        })()

        return () => {
          abortController.abort()
          activeQwenStreams.delete(input.subChatId)
          isActive = false
        }
      })
    }),
})
