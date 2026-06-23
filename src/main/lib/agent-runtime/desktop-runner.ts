import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  DesktopRunRequest,
  DesktopRunResult,
} from "./desktop-run-request"
import type { DesktopPermissionRuntime } from "./permission-policy"
import { createRunEvent } from "./runtime-events"

export type DesktopRuntimeAdapterSource =
  | "claude-agent-sdk"
  | "codex-app-server"
  | "qwen-acp-client"
  | "kun-http-sse"

export type DesktopRuntimeAdapterMetadata = {
  runtimeId: DesktopPermissionRuntime
  source: DesktopRuntimeAdapterSource
  label: string
  temporaryFallback: boolean
  fallbackReason?: string | null
  defaultDisableCondition?: string | null
  removalCondition?: string | null
}

export type DesktopRuntimeAdapter = {
  metadata: DesktopRuntimeAdapterMetadata
  run(request: DesktopRunRequest): Promise<DesktopRunResult>
}

export type DesktopRuntimeAdapterLookup = {
  runtimeId: AgentRuntimeId
  source?: DesktopRuntimeAdapterSource
}

export function assertDesktopRuntimeAdapterMatchesRequest(
  request: DesktopRunRequest,
  metadata: DesktopRuntimeAdapterMetadata,
): void {
  if (metadata.runtimeId !== request.context.runtimeId) {
    throw new Error(
      `Desktop runtime adapter metadata mismatch: ${metadata.source} cannot run ${request.context.runtimeId}`,
    )
  }
}

export function emitDesktopRuntimeAdapterStarted(
  request: DesktopRunRequest,
  metadata: DesktopRuntimeAdapterMetadata,
): void {
  assertDesktopRuntimeAdapterMatchesRequest(request, metadata)

  request.trace.emit(
    createRunEvent({
      runId: request.identity.runId,
      jobId: request.identity.jobId,
      runtimeId: request.context.runtimeId,
      sequence: 0,
      type: "status",
      payload: {
        status: "desktop_runtime_adapter_started",
        adapterSource: metadata.source,
        adapterLabel: metadata.label,
        attempt: request.identity.attempt ?? 1,
        temporaryFallback: metadata.temporaryFallback,
        fallbackReason: metadata.fallbackReason ?? null,
        defaultDisableCondition: metadata.defaultDisableCondition ?? null,
        removalCondition: metadata.removalCondition ?? null,
      },
    }),
  )
}

function adapterKey(
  runtimeId: DesktopPermissionRuntime,
  source: DesktopRuntimeAdapterSource,
): string {
  return `${runtimeId}:${source}`
}

export class DesktopRuntimeAdapterFactory {
  private readonly adapters = new Map<string, DesktopRuntimeAdapter>()

  constructor(adapters: DesktopRuntimeAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter)
    }
  }

  register(adapter: DesktopRuntimeAdapter): void {
    const { runtimeId, source } = adapter.metadata
    const key = adapterKey(runtimeId, source)
    if (this.adapters.has(key)) {
      throw new Error(`Duplicate desktop runtime adapter: ${key}`)
    }
    this.adapters.set(key, adapter)
  }

  get({ runtimeId, source }: DesktopRuntimeAdapterLookup): DesktopRuntimeAdapter {
    if (
      runtimeId !== "claude-code" &&
      runtimeId !== "codex" &&
      runtimeId !== "qwen-code" &&
      runtimeId !== "kun"
    ) {
      throw new Error(`Unsupported desktop runtime adapter: ${runtimeId}`)
    }

    if (source) {
      const adapter = this.adapters.get(adapterKey(runtimeId, source))
      if (!adapter) {
        throw new Error(`Desktop runtime adapter not registered: ${runtimeId}:${source}`)
      }
      return adapter
    }

    const matchingAdapters = [...this.adapters.values()].filter(
      (candidate) => candidate.metadata.runtimeId === runtimeId,
    )
    if (matchingAdapters.length > 1) {
      throw new Error(
        `Desktop runtime adapter source required for runtime with multiple adapters: ${runtimeId}`,
      )
    }
    const adapter = matchingAdapters[0]
    if (!adapter) {
      throw new Error(`Desktop runtime adapter not registered: ${runtimeId}`)
    }
    return adapter
  }

  listMetadata(): DesktopRuntimeAdapterMetadata[] {
    return [...this.adapters.values()].map((adapter) => ({ ...adapter.metadata }))
  }
}
