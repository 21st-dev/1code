import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  RuntimeCapabilityProjectionAdapter,
  RuntimeCapabilityProjectionResult,
} from "./types"
import { validateProjectionRecord } from "./validation"

function adapterKey(kind: string, runtimeId: AgentRuntimeId): string {
  return `${kind}:${runtimeId}`
}

export class RuntimeCapabilityProjectionService {
  private readonly adapters = new Map<
    string,
    RuntimeCapabilityProjectionAdapter
  >()

  constructor(adapters: RuntimeCapabilityProjectionAdapter[] = []) {
    for (const adapter of adapters) {
      this.registerAdapter(adapter)
    }
  }

  registerAdapter(adapter: RuntimeCapabilityProjectionAdapter): void {
    const key = adapterKey(adapter.kind, adapter.runtimeId)
    if (this.adapters.has(key)) {
      throw new Error(
        `Projection adapter already registered for ${adapter.kind}:${adapter.runtimeId}.`,
      )
    }
    this.adapters.set(key, adapter)
  }

  hasAdapter(kind: string, runtimeId: AgentRuntimeId): boolean {
    return this.adapters.has(adapterKey(kind, runtimeId))
  }

  async project<Kind extends string, Payload>(input: {
    kind: Kind
    runtimeId: AgentRuntimeId
    payload: Payload
    now?: Date
  }): Promise<RuntimeCapabilityProjectionResult<Kind>> {
    const adapter = this.adapters.get(adapterKey(input.kind, input.runtimeId))
    if (!adapter) {
      return {
        registered: false,
        kind: input.kind,
        runtimeId: input.runtimeId,
        records: [],
      }
    }

    const records = await adapter.project(input.payload, {
      now: input.now ?? new Date(),
    })
    for (const record of records) {
      if (record.kind !== input.kind || record.runtimeId !== input.runtimeId) {
        throw new Error(
          `Projection adapter ${input.kind}:${input.runtimeId} returned mismatched record ${record.kind}:${record.runtimeId}.`,
        )
      }
      validateProjectionRecord(record)
    }

    return {
      registered: true,
      kind: input.kind,
      runtimeId: input.runtimeId,
      records: records as RuntimeCapabilityProjectionResult<Kind>["records"],
    }
  }
}

export function createRuntimeCapabilityProjectionService(
  adapters: RuntimeCapabilityProjectionAdapter[] = [],
): RuntimeCapabilityProjectionService {
  return new RuntimeCapabilityProjectionService(adapters)
}
