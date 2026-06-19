import { createHash } from "node:crypto"
import type { PluginRuntime } from "../../../shared/plugin-target-modes"
import {
  type PluginManifestReviewDocument,
  type PluginRuntimeNativeActivationIdentityStatus,
  type PluginRuntimeNativeActivationMissingIdentityField,
  type PluginSourcePin,
  type PluginUpdateReviewStatus,
  stableJsonStringify,
} from "../../../shared/plugin-update-review"

export type RuntimeNativeActivationMissingIdentityField =
  PluginRuntimeNativeActivationMissingIdentityField

export type RuntimeNativeActivationIdentityStatus =
  PluginRuntimeNativeActivationIdentityStatus

export interface RuntimeNativeActivationIdentity {
  schemaVersion: 1
  runtime: PluginRuntime
  pluginSource: string
  reviewFingerprint: string
  packageIdentity?: string
  packageVersion?: string
  sourcePins: PluginSourcePin[]
  packageHash?: string
  identityFingerprint: string
  status: RuntimeNativeActivationIdentityStatus
  missingFields: RuntimeNativeActivationMissingIdentityField[]
}

export type RuntimeNativeActivationStatus = "allowed" | "blocked"

export type RuntimeNativeActivationIdentityGateStatus =
  | "reviewed"
  | "identity-incomplete"
  | "identity-incomplete-acknowledged"
  | "identity-unreviewed"
  | "identity-drifted"

export type RuntimeNativeActivationBlockedReason =
  | "plugin-disabled"
  | "global-safe-mode"
  | "manifest-review-required"
  | "runtime-native-unsupported"
  | "per-run-plugin-control-missing"
  | "activation-identity-incomplete"
  | "activation-identity-unreviewed"
  | "activation-identity-drifted"
  | "mcp-approval-required"
  | "native-load-failed"

export interface RuntimeNativeActivationPolicy {
  status: RuntimeNativeActivationStatus
  canActivateNative: boolean
  identityStatus: RuntimeNativeActivationIdentityGateStatus
  reasons: RuntimeNativeActivationBlockedReason[]
}

export interface RuntimeNativeActivationState {
  current: RuntimeNativeActivationPolicy
  enableCandidate: RuntimeNativeActivationPolicy
}

export function buildRuntimeNativeActivationIdentity(input: {
  reviewDocument: PluginManifestReviewDocument
  reviewFingerprint: string
  packageIdentity?: string
  packageVersion?: string
  sourcePins?: PluginSourcePin[]
  packageHash?: string
}): RuntimeNativeActivationIdentity {
  const packageIdentity = normalizeString(
    input.packageIdentity ?? input.reviewDocument.source,
  )
  const packageVersion = normalizeString(
    input.packageVersion ?? input.reviewDocument.version,
  )
  const sourcePins = normalizeSourcePins(
    input.sourcePins ?? input.reviewDocument.sourcePins,
  )
  const packageHash = normalizeString(input.packageHash)
  const missingFields = getMissingIdentityFields({
    packageIdentity,
    packageVersion,
    sourcePins,
    packageHash,
  })
  const fingerprintDocument = {
    schemaVersion: 1,
    runtime: input.reviewDocument.runtime,
    pluginSource: input.reviewDocument.source,
    reviewFingerprint: input.reviewFingerprint,
    packageIdentity,
    packageVersion,
    sourcePins,
    packageHash,
  }

  return {
    schemaVersion: 1,
    runtime: input.reviewDocument.runtime,
    pluginSource: input.reviewDocument.source,
    reviewFingerprint: input.reviewFingerprint,
    packageIdentity,
    packageVersion,
    sourcePins,
    packageHash,
    identityFingerprint: hashStableJson(fingerprintDocument),
    status: missingFields.length === 0 ? "complete" : "identity-incomplete",
    missingFields,
  }
}

export function buildRuntimeNativeActivationState(input: {
  runtime: PluginRuntime
  sourceKind: string
  pluginEnabled: boolean
  safeModeEnabled: boolean
  manifestReviewStatus?: PluginUpdateReviewStatus
  identity: RuntimeNativeActivationIdentity
  reviewedIdentityFingerprint?: string
  hasMcpServers: boolean
  mcpServerNames: string[]
  mcpApprovalIdentifiers: Record<string, string>
  approvedPluginMcpServers: string[]
  nativeLoadFailure?: boolean
}): RuntimeNativeActivationState {
  const supportsNativeLoading =
    input.sourceKind !== "developer-local" &&
    (input.runtime === "claude" || input.runtime === "codex")
  const sharedPolicyInput = {
    safeModeEnabled: input.safeModeEnabled,
    manifestReviewStatus: input.manifestReviewStatus,
    runtimeSupportsNativeLoading: supportsNativeLoading,
    runtimeSupportsPerRunPluginControl: supportsNativeLoading,
    identity: input.identity,
    reviewedIdentityFingerprint: input.reviewedIdentityFingerprint,
    hasMcpServers: input.hasMcpServers,
    mcpServersApprovedOrFiltered: areRuntimeNativeMcpServersApprovedOrFiltered({
      runtime: input.runtime,
      mcpServerNames: input.mcpServerNames,
      mcpApprovalIdentifiers: input.mcpApprovalIdentifiers,
      approvedPluginMcpServers: input.approvedPluginMcpServers,
    }),
    nativeLoadFailure: input.nativeLoadFailure,
  }

  return {
    current: buildRuntimeNativeActivationPolicy({
      ...sharedPolicyInput,
      pluginEnabled: input.pluginEnabled,
    }),
    enableCandidate: buildRuntimeNativeActivationPolicy({
      ...sharedPolicyInput,
      pluginEnabled: true,
    }),
  }
}

function areRuntimeNativeMcpServersApprovedOrFiltered(input: {
  runtime: PluginRuntime
  mcpServerNames: string[]
  mcpApprovalIdentifiers: Record<string, string>
  approvedPluginMcpServers: string[]
}): boolean {
  if (input.mcpServerNames.length === 0) return true

  if (input.runtime === "claude") {
    const approved = new Set(input.approvedPluginMcpServers)
    return input.mcpServerNames.every((serverName) => {
      const identifier = input.mcpApprovalIdentifiers[serverName]
      return Boolean(identifier && approved.has(identifier))
    })
  }

  return false
}

export function buildRuntimeNativeActivationPolicy(input: {
  pluginEnabled: boolean
  safeModeEnabled: boolean
  manifestReviewStatus?: PluginUpdateReviewStatus
  runtimeSupportsNativeLoading: boolean
  runtimeSupportsPerRunPluginControl: boolean
  identity: RuntimeNativeActivationIdentity
  reviewedIdentityFingerprint?: string
  identityIncompleteAcknowledgedFingerprint?: string
  hasMcpServers: boolean
  mcpServersApprovedOrFiltered: boolean
  nativeLoadFailure?: boolean
}): RuntimeNativeActivationPolicy {
  const reasons: RuntimeNativeActivationBlockedReason[] = []

  if (!input.pluginEnabled) reasons.push("plugin-disabled")
  if (input.safeModeEnabled) reasons.push("global-safe-mode")
  if (input.manifestReviewStatus !== "reviewed") {
    reasons.push("manifest-review-required")
  }
  if (!input.runtimeSupportsNativeLoading) {
    reasons.push("runtime-native-unsupported")
  }
  if (!input.runtimeSupportsPerRunPluginControl) {
    reasons.push("per-run-plugin-control-missing")
  }
  if (input.nativeLoadFailure) {
    reasons.push("native-load-failed")
  }

  const identityStatus = getIdentityGateStatus({
    identity: input.identity,
    reviewedIdentityFingerprint: input.reviewedIdentityFingerprint,
    identityIncompleteAcknowledgedFingerprint:
      input.identityIncompleteAcknowledgedFingerprint,
  })
  if (identityStatus === "identity-incomplete") {
    reasons.push("activation-identity-incomplete")
  } else if (identityStatus === "identity-unreviewed") {
    reasons.push("activation-identity-unreviewed")
  } else if (identityStatus === "identity-drifted") {
    reasons.push("activation-identity-drifted")
  }

  if (input.hasMcpServers && !input.mcpServersApprovedOrFiltered) {
    reasons.push("mcp-approval-required")
  }

  const uniqueReasons = Array.from(new Set(reasons))
  const canActivateNative = uniqueReasons.length === 0

  return {
    status: canActivateNative ? "allowed" : "blocked",
    canActivateNative,
    identityStatus,
    reasons: uniqueReasons,
  }
}

function getIdentityGateStatus(input: {
  identity: RuntimeNativeActivationIdentity
  reviewedIdentityFingerprint?: string
  identityIncompleteAcknowledgedFingerprint?: string
}): RuntimeNativeActivationIdentityGateStatus {
  if (input.identity.status === "identity-incomplete") {
    return input.identityIncompleteAcknowledgedFingerprint ===
      input.identity.identityFingerprint
      ? "identity-incomplete-acknowledged"
      : "identity-incomplete"
  }

  if (!input.reviewedIdentityFingerprint) {
    return "identity-unreviewed"
  }

  return input.reviewedIdentityFingerprint ===
    input.identity.identityFingerprint
    ? "reviewed"
    : "identity-drifted"
}

function getMissingIdentityFields(input: {
  packageIdentity?: string
  packageVersion?: string
  sourcePins: PluginSourcePin[]
  packageHash?: string
}): RuntimeNativeActivationMissingIdentityField[] {
  const missing: RuntimeNativeActivationMissingIdentityField[] = []

  if (!input.packageIdentity) missing.push("package-identity")
  if (!input.packageVersion) missing.push("package-version")
  if (input.sourcePins.length === 0 && !input.packageHash) {
    missing.push("drift-detection-field")
  }

  return missing
}

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeSourcePins(pins: PluginSourcePin[]): PluginSourcePin[] {
  return [...pins]
    .filter((pin) => pin.value.trim().length > 0)
    .map((pin) => ({
      kind: pin.kind,
      value: pin.value.trim(),
      label: normalizeString(pin.label),
      repo: normalizeString(pin.repo),
      path: normalizeString(pin.path),
    }))
    .sort((a, b) => {
      const byKind = a.kind.localeCompare(b.kind)
      if (byKind !== 0) return byKind
      const byValue = a.value.localeCompare(b.value)
      if (byValue !== 0) return byValue
      return (a.path ?? "").localeCompare(b.path ?? "")
    })
}

function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex")
}
