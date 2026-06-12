import { atom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo } from "react"

import type {
  AgentRuntimeAlias,
  AgentRuntimeCapability,
  AgentRuntimeCapabilityId,
  AgentRuntimeCapabilityManifest,
  AgentRuntimeId,
} from "../../../../shared/agent-runtime-capabilities"
import { trpc } from "../../../lib/trpc"

export const runtimeCapabilityManifestsAtom = atom<
  Map<AgentRuntimeId, AgentRuntimeCapabilityManifest>
>(new Map())

function normalizeRuntimeId(
  runtime: AgentRuntimeAlias | string | null | undefined,
): AgentRuntimeId | null {
  if (runtime === "claude" || runtime === "claude-code") return "claude-code"
  if (runtime === "codex") return "codex"
  return null
}

function mapManifests(
  manifests?: AgentRuntimeCapabilityManifest[],
): Map<AgentRuntimeId, AgentRuntimeCapabilityManifest> | null {
  if (!manifests) return null
  return new Map(manifests.map((manifest) => [manifest.runtimeId, manifest]))
}

export type RuntimeCapabilityManifestStoreResult = {
  data: AgentRuntimeCapabilityManifest[] | undefined
}

export function useRuntimeCapabilityManifestStore(): RuntimeCapabilityManifestStoreResult {
  const setManifests = useSetAtom(runtimeCapabilityManifestsAtom)
  const query = trpc.agentRuntime.listManifests.useQuery(undefined, {
    staleTime: 60_000,
  })

  useEffect(() => {
    const manifests = mapManifests(query.data)
    if (manifests) {
      setManifests(manifests)
    }
  }, [query.data, setManifests])

  return { data: query.data }
}

export function useRuntimeCapability(
  runtime: AgentRuntimeAlias | string | null | undefined,
  capabilityId: AgentRuntimeCapabilityId,
): AgentRuntimeCapability | null {
  const cachedManifests = useAtomValue(runtimeCapabilityManifestsAtom)
  const query = useRuntimeCapabilityManifestStore()
  const queriedManifests = useMemo(() => mapManifests(query.data), [query.data])
  const runtimeId = normalizeRuntimeId(runtime)
  if (!runtimeId) return null

  const manifest =
    queriedManifests?.get(runtimeId) ?? cachedManifests.get(runtimeId)
  return (
    manifest?.capabilities.find((capability) => capability.id === capabilityId) ??
    null
  )
}

export function useRuntimeCapabilitySupported(
  runtime: AgentRuntimeAlias | string | null | undefined,
  capabilityId: AgentRuntimeCapabilityId,
): boolean {
  return useRuntimeCapability(runtime, capabilityId)?.status === "supported"
}
