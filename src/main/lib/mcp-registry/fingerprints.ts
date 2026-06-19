import { createHash } from "node:crypto"
import type { McpRegistryEntry, McpRegistryInstallTarget } from "./normalize"

export type McpRegistryProvenanceKind = "immutable" | "mutable" | "unknown"
export type McpRegistryIntegrityStatus = "present" | "missing"

export type McpRegistryProvenanceClassification = {
  provenance: McpRegistryProvenanceKind
  integrity: McpRegistryIntegrityStatus
  reasons: string[]
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

function toStableJsonValue(value: unknown): JsonValue {
  if (value === null) return null
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map(toStableJsonValue)
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, toStableJsonValue(record[key])]),
    )
  }
  return null
}

function stableJson(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value))
}

function sha256Fingerprint(kind: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`${kind}:v1:${stableJson(value)}`)
    .digest("hex")}`
}

export function fingerprintMcpRegistryEntry(entry: McpRegistryEntry): string {
  return sha256Fingerprint("mcp-registry-entry", entry)
}

export function fingerprintMcpRegistryInstallTarget(input: {
  entry: McpRegistryEntry
  target: McpRegistryInstallTarget
}): string {
  return sha256Fingerprint("mcp-registry-config", {
    providerId: input.entry.providerId,
    entryId: input.entry.entryId,
    versionRef: input.entry.versionRef,
    target: {
      id: input.target.id,
      source: input.target.source,
      transport: input.target.transport,
      commandTemplate: input.target.commandTemplate,
      urlTemplate: input.target.urlTemplate,
      args: input.target.args,
      runtimeArguments: input.target.runtimeArguments,
      packageArguments: input.target.packageArguments,
      cwd: input.target.cwd,
      packageDistribution: input.target.packageDistribution,
      envSchema: input.target.envSchema,
      headerSchema: input.target.headerSchema,
      variableSchema: input.target.variableSchema,
      authMetadata: input.target.authMetadata,
    },
  })
}

function hasIntegrityHash(entry: McpRegistryEntry): boolean {
  return entry.installTargets.some((target) => {
    const hash = target.packageDistribution?.fileSha256?.trim()
    return Boolean(hash)
  })
}

function isMutableVersionRef(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === "" ||
    normalized === "latest" ||
    normalized === "next" ||
    normalized === "canary" ||
    normalized === "nightly" ||
    normalized === "dev" ||
    normalized === "main" ||
    normalized === "master" ||
    normalized.startsWith("refs/heads/")
  )
}

function isExactVersionRef(value: string): boolean {
  const normalized = value.trim()
  return (
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized) ||
    /^[a-f0-9]{40}$/i.test(normalized)
  )
}

export function classifyMcpRegistryProvenance(
  entry: McpRegistryEntry,
): McpRegistryProvenanceClassification {
  const reasons: string[] = []
  const integrity: McpRegistryIntegrityStatus = hasIntegrityHash(entry)
    ? "present"
    : "missing"

  if (integrity === "present") {
    reasons.push("integrity-hash-present")
  } else {
    reasons.push("integrity-hash-missing")
  }

  if (isMutableVersionRef(entry.versionRef)) {
    reasons.push("mutable-version-ref")
    return { provenance: "mutable", integrity, reasons }
  }

  if (isExactVersionRef(entry.versionRef) && integrity === "present") {
    reasons.push("exact-version-ref")
    return { provenance: "immutable", integrity, reasons }
  }

  if (isExactVersionRef(entry.versionRef)) {
    reasons.push("exact-version-ref")
  } else {
    reasons.push("unknown-version-ref")
  }
  return { provenance: "unknown", integrity, reasons }
}
