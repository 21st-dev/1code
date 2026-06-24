import { TRPCError } from "@trpc/server"
import { observable } from "@trpc/server/observable"
import { z } from "zod"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
  shouldEnableKunRuntime,
  shouldEnableQwenCodeRuntime,
} from "../../../../shared/agent-runtime-capabilities"
import {
  parseProviderProfileSource,
  providerProfileSource,
} from "../../../../shared/provider-profile-types"
import {
  agentScopeContractInputSchema,
  prepareActiveGuardedRunContract,
  type ValidatedAgentScopeContract,
} from "../../agent-guard"
import type { DesktopRunProviderBinding } from "../../agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../../agent-runtime/permission-policy"
import { verifyDesktopRunPreflight } from "../../agent-runtime/preflight"
import type { RunEvent } from "../../agent-runtime/runtime-events"
import {
  listRegisteredAgentRuntimeManifests,
  resolveRegisteredAgentRuntimeCapability,
  resolveRegisteredAgentRuntimeManifest,
} from "../../agent-runtime/runtime-registry"
import {
  desktopScopeExpansionResponseInputSchema,
  respondDesktopScopeExpansion,
} from "../../agent-runtime/scope-expansion"
import {
  appendRunEventsToAgentJob,
  redactRendererRuntimeChunk,
} from "../../agent-runtime/stream-event-mapper"
import { getDatabase } from "../../db"
import {
  completeDesktopChatAgentJobSafely,
  createAndRegisterDesktopChatAgentJob,
} from "../../desktop-agent-jobs"
import { createKunDesktopRunRequest } from "../../kun/desktop-run-request"
import {
  approveKunShellExecutableHash,
  resetKunConfigPathOverride,
  resetKunExecutablePathOverride,
  resetKunShellExecutableHash,
  resolveKunCliSetupStatus,
  saveKunConfigPathOverride,
  saveKunExecutablePathOverride,
  toRendererKunCliSetupStatus,
} from "../../kun/kun-cli-status"
import {
  createKunHttpSseAdapter,
  type KunHttpSseApproval,
} from "../../kun/kun-http-sse-adapter"
import {
  type SynthesizedKunProviderConfig,
  synthesizeKunProviderConfig,
} from "../../kun/kun-provider-config"
import {
  KUN_FILE_ONLY_SANDBOX_MODE,
  KUN_SHELL_SANDBOX_MODE,
} from "../../kun/kun-serve-launcher"
import { getProviderProfileRuntimeConfig } from "../../provider-profiles/storage"
import { createQwenDesktopRunRequest } from "../../qwen/desktop-run-request"
import {
  createQwenAcpClientAdapter,
  type QwenAcpPermissionApproval,
} from "../../qwen/qwen-acp-client"
import {
  resetQwenExecutablePathOverride,
  resolveQwenCliSetupStatus,
  saveQwenExecutablePathOverride,
  toRendererQwenCliSetupStatus,
} from "../../qwen/qwen-cli-status"
import { publicProcedure, router } from "../index"

const capabilityIdSchema = z.enum(AGENT_RUNTIME_CAPABILITY_IDS)

const experimentalRuntimeChatInputSchema = z.object({
  runtimeId: z.enum(["qwen-code", "kun"]),
  subChatId: z.string().min(1),
  chatId: z.string().min(1),
  runId: z.string().optional(),
  prompt: z.string(),
  cwd: z.string(),
  mode: z.enum(["plan", "agent"]).default("agent"),
  sessionId: z.string().optional(),
  modelSource: z.string().optional(),
  providerProfileId: z.string().trim().max(512).nullable().optional(),
  scopeContract: agentScopeContractInputSchema.optional(),
})

const runtimeExecutablePathInputSchema = z.object({
  executablePath: z.string().trim().min(1).max(4096),
})

const runtimeConfigPathInputSchema = z.object({
  configPath: z.string().trim().min(1).max(4096),
})

const runtimeToolApprovalInputSchema = z.object({
  toolUseId: z.string(),
  approved: z.boolean(),
  message: z.string().optional(),
  updatedInput: z.unknown().optional(),
})

type ExperimentalRuntimeChatId = "qwen-code" | "kun"

type RuntimeToolApproval = QwenAcpPermissionApproval | KunHttpSseApproval

type PendingRuntimeToolApproval = {
  runtimeId: ExperimentalRuntimeChatId
  subChatId: string
  resolve: (approval: RuntimeToolApproval) => void
}

const activeRuntimeStreams = new Map<
  string,
  {
    runtimeId: ExperimentalRuntimeChatId
    runId: string
    controller: AbortController
  }
>()

const pendingRuntimeToolApprovals = new Map<
  string,
  PendingRuntimeToolApproval
>()

function runtimeStreamKey(
  runtimeId: ExperimentalRuntimeChatId,
  subChatId: string,
): string {
  return `${runtimeId}:${subChatId}`
}

function isExperimentalRuntimeEnabled(runtimeId: ExperimentalRuntimeChatId) {
  switch (runtimeId) {
    case "qwen-code":
      return shouldEnableQwenCodeRuntime(process.env)
    case "kun":
      return shouldEnableKunRuntime(process.env)
  }
}

function runtimeProviderProfileId(input: {
  modelSource?: string | null
  providerProfileId?: string | null
}): string | null {
  const providerProfileId = input.providerProfileId?.trim()
  return providerProfileId || parseProviderProfileSource(input.modelSource)
}

function runtimeDisabledMessage(runtimeId: ExperimentalRuntimeChatId): string {
  switch (runtimeId) {
    case "qwen-code":
      return "Qwen Code runtime is disabled. Set LOCUS_ENABLE_QWEN_CODE_RUNTIME=1 to enable the desktop ACP spike."
    case "kun":
      return "Kun runtime is disabled. Set LOCUS_ENABLE_KUN_RUNTIME=1 to enable the desktop HTTP/SSE runtime."
  }
}

function clearPendingRuntimeApprovals(
  message = "Session cancelled.",
  runtimeId?: ExperimentalRuntimeChatId,
  subChatId?: string,
): void {
  for (const [toolUseId, pending] of pendingRuntimeToolApprovals) {
    if (runtimeId && pending.runtimeId !== runtimeId) continue
    if (subChatId && pending.subChatId !== subChatId) continue
    pending.resolve({ approved: false, message })
    pendingRuntimeToolApprovals.delete(toolUseId)
  }
}

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

  getQwenCliStatus: publicProcedure.query(async () => {
    const resolved = await resolveQwenCliSetupStatus({
      enabled: shouldEnableQwenCodeRuntime(process.env),
    })
    return toRendererQwenCliSetupStatus(resolved)
  }),

  updateQwenExecutablePath: publicProcedure
    .input(runtimeExecutablePathInputSchema)
    .mutation(async ({ input }) => {
      if (!shouldEnableQwenCodeRuntime(process.env)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Qwen Code runtime is disabled. Enable it before changing Qwen setup.",
        })
      }
      const resolved = await saveQwenExecutablePathOverride(
        input.executablePath,
      )
      if (!resolved.status.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            resolved.status.blocker?.message ??
            resolved.status.executable.error ??
            "Qwen executable path is invalid.",
        })
      }
      return toRendererQwenCliSetupStatus(resolved)
    }),

  resetQwenExecutablePath: publicProcedure.mutation(async () => {
    if (!shouldEnableQwenCodeRuntime(process.env)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Qwen Code runtime is disabled. Enable it before changing Qwen setup.",
      })
    }
    const resolved = await resetQwenExecutablePathOverride()
    return toRendererQwenCliSetupStatus(resolved)
  }),

  getKunCliStatus: publicProcedure.query(async () => {
    const resolved = await resolveKunCliSetupStatus({
      enabled: shouldEnableKunRuntime(process.env),
    })
    return toRendererKunCliSetupStatus(resolved)
  }),

  updateKunExecutablePath: publicProcedure
    .input(runtimeExecutablePathInputSchema)
    .mutation(async ({ input }) => {
      if (!shouldEnableKunRuntime(process.env)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Kun runtime is disabled. Enable it before changing Kun setup.",
        })
      }
      const resolved = await saveKunExecutablePathOverride(input.executablePath)
      if (!resolved.executablePath || !resolved.status.executable.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            resolved.status.blocker?.message ??
            resolved.status.executable.error ??
            "Kun executable path is invalid.",
        })
      }
      return toRendererKunCliSetupStatus(resolved)
    }),

  resetKunExecutablePath: publicProcedure.mutation(async () => {
    if (!shouldEnableKunRuntime(process.env)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Kun runtime is disabled. Enable it before changing Kun setup.",
      })
    }
    const resolved = await resetKunExecutablePathOverride()
    return toRendererKunCliSetupStatus(resolved)
  }),

  updateKunConfigPath: publicProcedure
    .input(runtimeConfigPathInputSchema)
    .mutation(async ({ input }) => {
      if (!shouldEnableKunRuntime(process.env)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Kun runtime is disabled. Enable it before changing Kun setup.",
        })
      }
      const resolved = await saveKunConfigPathOverride(input.configPath)
      if (!resolved.status.config.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            resolved.status.config.error ??
            resolved.status.blocker?.message ??
            "Kun config path is invalid.",
        })
      }
      return toRendererKunCliSetupStatus(resolved)
    }),

  resetKunConfigPath: publicProcedure.mutation(async () => {
    if (!shouldEnableKunRuntime(process.env)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Kun runtime is disabled. Enable it before changing Kun setup.",
      })
    }
    const resolved = await resetKunConfigPathOverride()
    return toRendererKunCliSetupStatus(resolved)
  }),

  approveKunShellExecutableHash: publicProcedure.mutation(async () => {
    if (!shouldEnableKunRuntime(process.env)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Kun runtime is disabled. Enable it before approving Kun shell.",
      })
    }
    const resolved = await approveKunShellExecutableHash()
    if (!resolved.status.shell.currentHash) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          resolved.status.shell.error ??
          resolved.status.blocker?.message ??
          "Kun executable hash is unavailable.",
      })
    }
    return toRendererKunCliSetupStatus(resolved)
  }),

  resetKunShellExecutableHash: publicProcedure.mutation(async () => {
    if (!shouldEnableKunRuntime(process.env)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Kun runtime is disabled. Enable it before changing Kun shell approval.",
      })
    }
    const resolved = await resetKunShellExecutableHash()
    return toRendererKunCliSetupStatus(resolved)
  }),

  chat: publicProcedure
    .input(experimentalRuntimeChatInputSchema)
    .subscription(({ input }) => {
      return observable<Record<string, unknown>>((emit) => {
        const streamKey = runtimeStreamKey(input.runtimeId, input.subChatId)
        const existingStream = activeRuntimeStreams.get(streamKey)
        if (existingStream) {
          existingStream.controller.abort()
          clearPendingRuntimeApprovals(
            "Session cancelled.",
            input.runtimeId,
            input.subChatId,
          )
        }

        const abortController = new AbortController()
        const runId = input.runId ?? crypto.randomUUID()
        activeRuntimeStreams.set(streamKey, {
          runtimeId: input.runtimeId,
          runId,
          controller: abortController,
        })

        let isActive = true
        let desktopJobId: string | null = null
        let desktopJobSawError = false
        let desktopJobReachedNaturalFinish = false
        let desktopJobDb: ReturnType<typeof getDatabase> | null = null
        let kunProviderConfig: SynthesizedKunProviderConfig | null = null

        const safeEmit = (chunk: Record<string, unknown>) => {
          if (!isActive) return
          if (chunk.type === "error" || chunk.type === "capability-error") {
            desktopJobSawError = true
          }
          try {
            emit.next(
              redactRendererRuntimeChunk({
                runtimeId: input.runtimeId,
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
          activeRuntimeStreams.delete(streamKey)
          emit.complete()
        }

        void (async () => {
          try {
            if (!isExperimentalRuntimeEnabled(input.runtimeId)) {
              safeEmit({
                type: "capability-error",
                errorText: runtimeDisabledMessage(input.runtimeId),
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
            let guardedContract: ValidatedAgentScopeContract | null = null
            if (input.scopeContract) {
              if (input.runtimeId !== "kun") {
                safeEmit({
                  type: "capability-error",
                  errorText:
                    "Guarded scope contracts are only wired for Kun shell in this experimental runtime endpoint.",
                })
                return
              }
              const activeGuardedRun = await prepareActiveGuardedRunContract({
                scopeContract: input.scopeContract,
                cwd: preflight.cwd,
                chatId: input.chatId,
                subChatId: input.subChatId,
                runId,
                fallbackRunId: runId,
              })
              if (!activeGuardedRun.ok) {
                safeEmit({
                  type: "capability-error",
                  errorText: `Guarded run contract rejected: ${activeGuardedRun.error}`,
                })
                return
              }
              guardedContract = activeGuardedRun.contract
            }

            if (input.runtimeId === "kun" && input.mode === "plan") {
              safeEmit({
                type: "capability-error",
                errorText:
                  "Kun plan mode is degraded in v1 and is blocked before starting a turn.",
              })
              return
            }

            let executablePath: string
            let kunConfigPath: string | null = null
            let kunSandboxMode:
              | typeof KUN_FILE_ONLY_SANDBOX_MODE
              | typeof KUN_SHELL_SANDBOX_MODE = KUN_FILE_ONLY_SANDBOX_MODE
            let kunShellEnabled = false
            let kunProviderBinding:
              | Omit<DesktopRunProviderBinding, "diagnostics">
              | undefined
            if (input.runtimeId === "qwen-code") {
              const qwenCli = await resolveQwenCliSetupStatus({
                cwd: preflight.cwd,
              })
              if (!qwenCli.status.ok || !qwenCli.executablePath) {
                safeEmit({
                  type: "capability-error",
                  errorText:
                    qwenCli.status.blocker?.message ??
                    "Qwen Code CLI is not available.",
                  runtimeStatus: toRendererQwenCliSetupStatus(qwenCli),
                })
                return
              }
              executablePath = qwenCli.executablePath
            } else {
              const selectedKunProviderProfileId = runtimeProviderProfileId({
                modelSource: input.modelSource,
                providerProfileId: input.providerProfileId,
              })
              const kunCli = await resolveKunCliSetupStatus({
                cwd: preflight.cwd,
              })
              if (!kunCli.status.executable.ok || !kunCli.executablePath) {
                safeEmit({
                  type: "capability-error",
                  errorText:
                    kunCli.status.blocker?.message ??
                    "Kun CLI is not available.",
                  runtimeStatus: toRendererKunCliSetupStatus(kunCli),
                })
                return
              }

              if (selectedKunProviderProfileId) {
                let profile: ReturnType<typeof getProviderProfileRuntimeConfig>
                try {
                  profile = getProviderProfileRuntimeConfig(
                    selectedKunProviderProfileId,
                  )
                } catch (error) {
                  safeEmit({
                    type: "capability-error",
                    errorText:
                      error instanceof Error ? error.message : String(error),
                  })
                  return
                }
                if (!profile) {
                  safeEmit({
                    type: "capability-error",
                    errorText: "Selected Kun provider profile was not found.",
                  })
                  return
                }
                if (!profile.targetRuntimes.includes("kun")) {
                  safeEmit({
                    type: "capability-error",
                    errorText:
                      "Selected provider profile is not enabled for Kun.",
                  })
                  return
                }
                kunProviderConfig = await synthesizeKunProviderConfig({
                  runId,
                  profile,
                })
                kunProviderBinding = {
                  model: profile.defaultModel,
                  modelSource: providerProfileSource(profile.id),
                  providerProfileId: profile.id,
                  gatewayEndpoint: kunProviderConfig.gatewayBaseUrl,
                  authMode: "provider-profile",
                }
              } else if (!kunCli.status.ok || !kunCli.configPath) {
                safeEmit({
                  type: "capability-error",
                  errorText:
                    kunCli.status.blocker?.message ??
                    "Kun CLI config is not available.",
                  runtimeStatus: toRendererKunCliSetupStatus(kunCli),
                })
                return
              }

              executablePath = kunCli.executablePath
              kunConfigPath = kunProviderConfig?.configPath ?? kunCli.configPath
              if (kunCli.status.shell.approved && guardedContract) {
                kunSandboxMode = KUN_SHELL_SANDBOX_MODE
                kunShellEnabled = true
              } else {
                const shellReason = !kunCli.status.shell.approved
                  ? kunCli.status.shell.reason
                  : "missing-guarded-scope-contract"
                safeEmit({
                  type: "runtime-status",
                  ok: true,
                  degraded: true,
                  component: "kun-shell",
                  code: `kun-shell-${shellReason}`,
                  message:
                    shellReason === "missing-guarded-scope-contract"
                      ? "Kun shell is disabled because this run does not have an approved guarded scope contract."
                      : "Kun shell is disabled because the current Kun executable hash is not approved for shell.",
                  runtimeStatus: toRendererKunCliSetupStatus(kunCli),
                })
              }
            }
            const permissionPolicy = resolveDesktopPermissionPolicy({
              runtimeId: input.runtimeId,
              mode: input.mode,
              workspaceKind: preflight.kind,
              hasScopeContract: Boolean(guardedContract),
            })
            const desktopJob = createAndRegisterDesktopChatAgentJob(db, {
              runtime: input.runtimeId,
              mode: input.mode,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: preflight.cwd,
              prompt: input.prompt,
              runId,
              permissionPolicy,
              cancel: () => {
                const activeStream = activeRuntimeStreams.get(streamKey)
                if (activeStream?.runId !== runId) return
                activeStream.controller.abort()
              },
            })
            desktopJobId = desktopJob.job.id

            const requestInput = {
              runId,
              jobId: desktopJobId,
              mode: input.mode,
              preflight,
              prompt: input.prompt,
              permissionPolicy,
              providerBinding:
                input.runtimeId === "kun" ? kunProviderBinding : undefined,
              signal: abortController.signal,
              resumeSessionId: input.sessionId ?? null,
              parentSessionId: input.sessionId ?? null,
              emitTrace: (event: RunEvent) => {
                appendRunEventsToAgentJob(db, [event])
              },
            }
            const desktopRunRequest =
              input.runtimeId === "qwen-code"
                ? createQwenDesktopRunRequest(requestInput)
                : createKunDesktopRunRequest(requestInput)

            const adapter =
              input.runtimeId === "qwen-code"
                ? createQwenAcpClientAdapter({
                    executable: executablePath,
                    emit: safeEmit,
                    registerPendingPermission: (toolUseId, pending) => {
                      pendingRuntimeToolApprovals.set(toolUseId, {
                        runtimeId: "qwen-code",
                        subChatId: pending.subChatId,
                        resolve: (approval) =>
                          pending.resolve(
                            approval as QwenAcpPermissionApproval,
                          ),
                      })
                    },
                    unregisterPendingPermission: (toolUseId) => {
                      pendingRuntimeToolApprovals.delete(toolUseId)
                    },
                  })
                : createKunHttpSseAdapter({
                    executable: executablePath,
                    configPath: kunConfigPath,
                    configSecretHints: kunProviderConfig?.secretHints ?? [],
                    sandboxMode: kunSandboxMode,
                    shellEnabled: kunShellEnabled,
                    guardedContract,
                    emit: safeEmit,
                    registerPendingApproval: (toolUseId, pending) => {
                      pendingRuntimeToolApprovals.set(toolUseId, {
                        runtimeId: "kun",
                        subChatId: pending.subChatId,
                        resolve: (approval) =>
                          pending.resolve(approval as KunHttpSseApproval),
                      })
                    },
                    unregisterPendingApproval: (toolUseId) => {
                      pendingRuntimeToolApprovals.delete(toolUseId)
                    },
                  })
            const result = await adapter.run(desktopRunRequest)
            desktopJobSawError =
              desktopJobSawError || result.status === "failed"
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
            kunProviderConfig?.cleanup()
            if (desktopJobDb) {
              clearPendingRuntimeApprovals(
                "Session cancelled.",
                input.runtimeId,
                input.subChatId,
              )
              completeDesktopChatAgentJobSafely(desktopJobDb, {
                runtime: input.runtimeId,
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
          clearPendingRuntimeApprovals(
            "Session cancelled.",
            input.runtimeId,
            input.subChatId,
          )
          activeRuntimeStreams.delete(streamKey)
          isActive = false
        }
      })
    }),

  respondToolApproval: publicProcedure
    .input(runtimeToolApprovalInputSchema)
    .mutation(({ input }) => {
      const pending = pendingRuntimeToolApprovals.get(input.toolUseId)
      if (!pending) {
        return { ok: false }
      }
      const response: RuntimeToolApproval = {
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      }
      pending.resolve(response)
      pendingRuntimeToolApprovals.delete(input.toolUseId)
      return { ok: true }
    }),
})
