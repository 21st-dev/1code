import type {
  RuntimeCapabilityProjectionDiagnostic,
  RuntimeCapabilityProjectionRecord,
} from "./types"
import { RUNTIME_CAPABILITY_PROJECTION_STATES } from "./types"

const DIAGNOSTIC_CODE_RE = /^[a-z][a-z0-9_.-]*$/
const SECRET_TEXT_PATTERNS = [
  /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{12,}/,
  /access_token/i,
  /authorization/i,
  /bearer\s+[A-Za-z0-9._-]+/i,
  /refresh_token/i,
]

function assertNoSecretText(value: string, context: string): void {
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`Projection ${context} contains secret-like text.`)
  }
}

export function validateProjectionDiagnostic(
  diagnostic: RuntimeCapabilityProjectionDiagnostic,
): void {
  if (!DIAGNOSTIC_CODE_RE.test(diagnostic.code)) {
    throw new Error(`Invalid projection diagnostic code: ${diagnostic.code}`)
  }
  if (!diagnostic.message.trim()) {
    throw new Error(`Projection diagnostic ${diagnostic.code} needs a message.`)
  }

  assertNoSecretText(diagnostic.code, `${diagnostic.code} code`)
  assertNoSecretText(diagnostic.message, `${diagnostic.code} message`)
  if (diagnostic.remediation) {
    assertNoSecretText(diagnostic.remediation, `${diagnostic.code} remediation`)
  }
}

export function validateProjectionRecord(
  record: RuntimeCapabilityProjectionRecord,
): void {
  if (!record.kind.trim()) {
    throw new Error("Projection record needs a capability kind.")
  }
  if (!record.capabilityId.trim()) {
    throw new Error(`Projection ${record.kind} record needs a capability id.`)
  }
  if (!RUNTIME_CAPABILITY_PROJECTION_STATES.includes(record.state)) {
    throw new Error(
      `Projection ${record.kind}:${record.capabilityId} has invalid state ${record.state}.`,
    )
  }
  if (!record.source.id.trim()) {
    throw new Error(
      `Projection ${record.kind}:${record.capabilityId} needs a source id.`,
    )
  }

  assertNoSecretText(record.kind, `${record.kind} kind`)
  assertNoSecretText(
    record.capabilityId,
    `${record.kind}:${record.capabilityId} capability id`,
  )
  assertNoSecretText(
    record.source.id,
    `${record.kind}:${record.capabilityId} source id`,
  )
  if (record.source.version) {
    assertNoSecretText(
      record.source.version,
      `${record.kind}:${record.capabilityId} source version`,
    )
  }
  if (record.projectionFingerprint) {
    assertNoSecretText(
      record.projectionFingerprint,
      `${record.kind}:${record.capabilityId} projection fingerprint`,
    )
  }

  for (const diagnostic of record.diagnostics) {
    validateProjectionDiagnostic(diagnostic)
  }
}
