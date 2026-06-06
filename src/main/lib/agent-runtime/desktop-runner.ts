import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  DesktopRunRequest,
  DesktopRunResult,
} from "./desktop-run-request"
import type { DesktopPermissionRuntime } from "./permission-policy"

export type DesktopRuntimeAdapterSource =
  | "claude-agent-sdk"
  | "codex-acp-temporary-compat"
  | "codex-app-server"

export type DesktopRuntimeAdapterMetadata = {
  runtimeId: DesktopPermissionRuntime
  source: DesktopRuntimeAdapterSource
  label: string
  temporaryFallback: boolean
  fallbackReason?: string | null
}

export type DesktopRuntimeAdapter = {
  metadata: DesktopRuntimeAdapterMetadata
  run(request: DesktopRunRequest): Promise<DesktopRunResult>
}

export type DesktopRuntimeAdapterLookup = {
  runtimeId: AgentRuntimeId
  source?: DesktopRuntimeAdapterSource
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
    if (runtimeId !== "claude-code" && runtimeId !== "codex") {
      throw new Error(`Unsupported desktop runtime adapter: ${runtimeId}`)
    }

    if (source) {
      const adapter = this.adapters.get(adapterKey(runtimeId, source))
      if (!adapter) {
        throw new Error(`Desktop runtime adapter not registered: ${runtimeId}:${source}`)
      }
      return adapter
    }

    const adapter = [...this.adapters.values()].find(
      (candidate) => candidate.metadata.runtimeId === runtimeId,
    )
    if (!adapter) {
      throw new Error(`Desktop runtime adapter not registered: ${runtimeId}`)
    }
    return adapter
  }

  listMetadata(): DesktopRuntimeAdapterMetadata[] {
    return [...this.adapters.values()].map((adapter) => ({ ...adapter.metadata }))
  }
}
