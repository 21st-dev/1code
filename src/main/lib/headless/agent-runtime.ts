import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "./agent-runtime-contract"
export {
  getAgentRuntimeAdapter,
  type AgentRuntimeAdapter,
} from "./adapter-selector"
import { selectAgentRuntimeAdapter } from "./adapter-selector"

export async function runAgentTask(
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
): Promise<AgentRuntimeRunResult> {
  const selection = selectAgentRuntimeAdapter(request)
  if (!selection.ok) {
    observer.appendEvent("status", {
      status: "runtime_selection_refused",
      runtime: selection.diagnostic.runtime,
      source: selection.diagnostic.source,
      adapterSource: selection.diagnostic.adapterSource ?? null,
      executionProfile: selection.diagnostic.executionProfile,
      reason: selection.diagnostic.reason,
      message: selection.diagnostic.message,
      errorCode: selection.result.errorCode,
    })
    return selection.result
  }

  const { adapter, diagnostic } = selection
  observer.appendEvent("status", {
    status: "runtime_selected",
    runtime: adapter.id,
    label: adapter.manifest.label,
    source: diagnostic.source,
    adapterSource: diagnostic.adapterSource,
    executionProfile: diagnostic.executionProfile,
    fallbackReason: diagnostic.fallbackReason ?? null,
    ...(diagnostic.policyGrantScopeBinding
      ? { policyGrantScopeBinding: diagnostic.policyGrantScopeBinding }
      : {}),
  })
  return adapter.run(request, observer)
}
