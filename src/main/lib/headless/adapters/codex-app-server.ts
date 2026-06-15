import type {
  DesktopRunRequest,
  DesktopRunResult,
} from "../../agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../../agent-runtime/permission-policy"
import type { RunEvent } from "../../agent-runtime/runtime-events"
import { createCodexAppServerAdapter } from "../../codex/app-server-adapter"
import type { CodexDesktopAdapter } from "../../codex/adapter-types"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "../agent-runtime-contract"

export type CodexAppServerHeadlessAdapterFactory = () => Pick<
  CodexDesktopAdapter,
  "metadata" | "run"
>

export type CreateCodexAppServerHeadlessTaskRunnerOptions = {
  createDesktopAdapter?: CodexAppServerHeadlessAdapterFactory
}

function syntheticId(prefix: string, request: AgentRuntimeRunRequest): string {
  return `${prefix}:${request.identity.jobId}`
}

function createFailClosedResult(input: {
  errorCode: string
  errorMessage: string
}): AgentRuntimeRunResult {
  return {
    status: "failed",
    exitCode: 1,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    result: {
      error: input.errorMessage,
    },
  }
}

function assertAppServerPolicyGrantRequest(
  request: AgentRuntimeRunRequest,
): AgentRuntimeRunResult | null {
  if (request.context.runtimeId !== "codex") {
    return createFailClosedResult({
      errorCode: "unsupported_runtime",
      errorMessage: "Codex app-server headless adapter can only run Codex jobs.",
    })
  }
  if (request.context.executionProfile !== "policy-grant") {
    return createFailClosedResult({
      errorCode: "unsupported_execution_profile",
      errorMessage:
        "Codex app-server headless adapter requires the policy-grant execution profile.",
    })
  }
  if (
    request.permissionPolicy.kind !== "policy-grant" ||
    !request.permissionPolicy.grantedScopes?.length
  ) {
    return createFailClosedResult({
      errorCode: "permission_policy_fail_closed",
      errorMessage:
        "Codex app-server headless adapter requires a bounded non-desktop policy grant.",
    })
  }
  return null
}

function appendTraceEvent(
  observer: AgentRuntimeObserver,
  event: RunEvent,
): void {
  if (event.type === "completed") return
  observer.appendEvent(event.type, event.payload ?? {})
}

function createDesktopRequestFromHeadless(
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
): DesktopRunRequest {
  const permissionPolicy = resolveDesktopPermissionPolicy({
    runtimeId: "codex",
    mode: request.context.mode,
    hasScopeContract: request.context.hasScopeContract ?? false,
    codexAdapterSource: "codex-app-server",
  })
  return {
    identity: {
      runId: request.identity.runId ?? request.identity.jobId,
      jobId: request.identity.jobId,
      attempt: request.identity.attempt,
    },
    context: {
      runtimeId: "codex",
      mode: request.context.mode,
      source: "desktop",
      executionProfile: "interactive",
      projectId:
        request.context.projectId ?? syntheticId("headless-project", request),
      chatId: request.context.chatId ?? syntheticId("headless-chat", request),
      subChatId:
        request.context.subChatId ?? syntheticId("headless-subchat", request),
      cwd: request.context.cwd,
    },
    prompt: request.prompt,
    requestedCapabilities: request.requestedCapabilities,
    permissionPolicy,
    providerBinding: {
      model: request.providerBinding?.model ?? null,
      modelSource: request.providerBinding?.modelSource ?? null,
      providerProfileId: request.providerBinding?.providerProfileId ?? null,
      gatewayEndpoint: request.providerBinding?.gatewayEndpoint ?? null,
      authMode:
        request.providerBinding?.authMode &&
        request.providerBinding.authMode !== "none"
          ? request.providerBinding.authMode
          : "runtime-managed",
      diagnostics: permissionPolicy.diagnostics.map((message, index) => ({
        id: `headless-permission-policy-${index + 1}`,
        status: "ready",
        message,
      })),
    },
    mcp: {
      status: "skipped",
      serverNames: [],
      blockers: [],
    },
    attachments: [],
    trace: {
      emit(event) {
        appendTraceEvent(observer, event)
      },
    },
    signal: request.signal,
    session: {},
  }
}

function mapDesktopRunResult(
  result: DesktopRunResult,
): AgentRuntimeRunResult {
  const exitCode =
    result.status === "succeeded" ? 0 : result.status === "canceled" ? 5 : 1
  return {
    status: result.status,
    exitCode,
    errorCode:
      result.status === "succeeded" ? null : "codex_app_server_failed",
    errorMessage: result.error?.message ?? null,
    result: {
      adapterSource: "codex-app-server",
      sessionId: result.sessionId ?? null,
      usage: result.usage ?? null,
      error: result.error ?? null,
    },
    sessionId: result.sessionId ?? null,
    usage: result.usage,
    error: result.error,
  }
}

export function createCodexAppServerHeadlessTaskRunner({
  createDesktopAdapter = () =>
    createCodexAppServerAdapter({
      enabled: true,
    }),
}: CreateCodexAppServerHeadlessTaskRunnerOptions = {}) {
  return async function runCodexAppServerHeadlessTaskWithAdapter(
    request: AgentRuntimeRunRequest,
    observer: AgentRuntimeObserver,
  ): Promise<AgentRuntimeRunResult> {
    const rejected = assertAppServerPolicyGrantRequest(request)
    if (rejected) return rejected

    try {
      const desktopRequest = createDesktopRequestFromHeadless(request, observer)
      return mapDesktopRunResult(
        await createDesktopAdapter().run(desktopRequest),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      observer.appendEvent("error", {
        errorCode: "codex_app_server_failed",
        errorMessage: message,
      })
      return createFailClosedResult({
        errorCode: "codex_app_server_failed",
        errorMessage: message,
      })
    }
  }
}

export const runCodexAppServerHeadlessTask =
  createCodexAppServerHeadlessTaskRunner()
