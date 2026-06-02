import type {
  PluginRuntime,
  PluginTargetMode,
} from "./plugin-target-modes"
import type { PluginUpdateReviewStatus } from "./plugin-update-review"

export type PluginControlledUiSurfaceType =
  | "settings-section"
  | "workbench-panel"
  | "command-button"

export type PluginControlledUiFieldType = "text" | "checkbox" | "select"

export type PluginControlledUiItemType = "text" | "fact"

export type PluginControlledUiActionType = "insert-chat-draft"

export type PluginControlledUiDiagnosticSeverity = "info" | "warning" | "blocked"

export type PluginControlledUiDiagnosticCode =
  | "controlled-ui-manifest-missing"
  | "controlled-ui-manifest-invalid"
  | "controlled-ui-unknown-field"
  | "controlled-ui-unsafe-field"
  | "controlled-ui-unsupported-surface"
  | "controlled-ui-unsupported-action"
  | "controlled-ui-limit-exceeded"

export interface PluginControlledUiDiagnostic {
  code: PluginControlledUiDiagnosticCode
  severity: PluginControlledUiDiagnosticSeverity
  path?: string
  message?: string
}

export interface PluginControlledUiField {
  id: string
  type: PluginControlledUiFieldType
  label: string
  description?: string
  options?: string[]
}

export interface PluginControlledUiItem {
  type: PluginControlledUiItemType
  text?: string
  label?: string
  value?: string
}

export interface PluginControlledUiAction {
  id: string
  type: PluginControlledUiActionType
  prompt: string
}

export interface PluginControlledUiSurfaceBase {
  id: string
  type: PluginControlledUiSurfaceType
  title: string
  description?: string
}

export interface PluginControlledUiSettingsSection extends PluginControlledUiSurfaceBase {
  type: "settings-section"
  fields: PluginControlledUiField[]
}

export interface PluginControlledUiWorkbenchPanel extends PluginControlledUiSurfaceBase {
  type: "workbench-panel"
  items: PluginControlledUiItem[]
}

export interface PluginControlledUiCommandButton extends PluginControlledUiSurfaceBase {
  type: "command-button"
  label: string
  action: PluginControlledUiAction
}

export type PluginControlledUiSurface =
  | PluginControlledUiSettingsSection
  | PluginControlledUiWorkbenchPanel
  | PluginControlledUiCommandButton

export interface PluginControlledUiManifest {
  version: 1
  surfaces: PluginControlledUiSurface[]
}

export interface PluginControlledUiParseResult {
  manifest?: PluginControlledUiManifest
  diagnostics: PluginControlledUiDiagnostic[]
  ignoredUnknownFields: string[]
}

export type PluginControlledUiGateReason =
  | "safe-mode"
  | "review-required"
  | "review-changed"
  | "review-unreviewed"
  | "invalid-contribution-manifest"
  | "unsupported-runtime"
  | "unsupported-target-mode"
  | "unsupported-surface"
  | "unsupported-action"
  | "permission-not-granted"
  | "permission-stale"
  | "codex-read-only-cache"

export interface PluginControlledUiGate {
  canRenderControlledUi: boolean
  canInvokeControlledAction: boolean
  reasons: PluginControlledUiGateReason[]
}

export interface PluginControlledUiPermissionGrant {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  permissionId: string
  actionId?: string
  fieldId?: string
  grantedAt: string
}

export type PluginControlledUiGrantStatus =
  | "current"
  | "stale"
  | "mismatch"

const MAX_SURFACES = 16
const MAX_FIELDS = 16
const MAX_ITEMS = 32
const MAX_OPTIONS = 24
const MAX_ID_LENGTH = 64
const MAX_TITLE_LENGTH = 96
const MAX_LABEL_LENGTH = 96
const MAX_DESCRIPTION_LENGTH = 320
const MAX_TEXT_LENGTH = 1200
const MAX_PROMPT_LENGTH = 4000
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i

const MANIFEST_KEYS = new Set(["version", "surfaces"])
const SURFACE_KEYS = new Set(["id", "type", "title", "description", "fields", "items", "label", "action"])
const FIELD_KEYS = new Set(["id", "type", "label", "description", "options"])
const ITEM_KEYS = new Set(["type", "text", "label", "value"])
const ACTION_KEYS = new Set(["id", "type", "prompt"])
const UNSAFE_FIELD_NAMES = new Set([
  "html",
  "script",
  "style",
  "css",
  "onClick",
  "onclick",
  "onSubmit",
  "onsubmit",
  "handler",
  "eventHandler",
  "iframe",
  "webview",
  "srcdoc",
  "dangerouslySetInnerHTML",
])

export function parseControlledUiManifest(value: unknown): PluginControlledUiParseResult {
  const diagnostics: PluginControlledUiDiagnostic[] = []
  const ignoredUnknownFields: string[] = []

  if (!isRecord(value)) {
    return invalidResult("manifest", "Controlled UI manifest must be an object.")
  }

  collectUnknownFields(value, MANIFEST_KEYS, "manifest", diagnostics, ignoredUnknownFields)
  if (hasUnsafeFields(value, "manifest", diagnostics)) {
    return { diagnostics, ignoredUnknownFields }
  }

  if (value.version !== 1) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path: "version",
      message: "Controlled UI manifest version must be 1.",
    })
  }

  if (!Array.isArray(value.surfaces)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path: "surfaces",
      message: "Controlled UI manifest surfaces must be an array.",
    })
  } else if (value.surfaces.length > MAX_SURFACES) {
    diagnostics.push({
      code: "controlled-ui-limit-exceeded",
      severity: "blocked",
      path: "surfaces",
      message: `Controlled UI manifest may declare at most ${MAX_SURFACES} surfaces.`,
    })
  }

  if (hasBlockedDiagnostics(diagnostics)) {
    return { diagnostics, ignoredUnknownFields }
  }

  const surfaces = (value.surfaces as unknown[]).flatMap((surface, index) =>
    parseSurface(surface, `surfaces.${index}`, diagnostics, ignoredUnknownFields),
  )

  if (hasBlockedDiagnostics(diagnostics)) {
    return { diagnostics, ignoredUnknownFields }
  }

  return {
    manifest: {
      version: 1,
      surfaces,
    },
    diagnostics,
    ignoredUnknownFields,
  }
}

export function buildPluginControlledUiGate(input: {
  runtime: PluginRuntime
  targetMode: PluginTargetMode
  updateReviewStatus?: PluginUpdateReviewStatus
  safeModeEnabled: boolean
  hasValidManifest: boolean
  surfaceSupported?: boolean
  actionSupported?: boolean
  permissionGranted?: boolean
  permissionStale?: boolean
}): PluginControlledUiGate {
  const reasons: PluginControlledUiGateReason[] = []
  const isReviewed = input.updateReviewStatus === "reviewed"

  if (input.safeModeEnabled) reasons.push("safe-mode")
  if (!input.hasValidManifest) reasons.push("invalid-contribution-manifest")
  if (input.runtime === "codex") reasons.push("codex-read-only-cache")
  if (input.runtime !== "claude") reasons.push("unsupported-runtime")
  if (input.targetMode !== "controlled-ui") reasons.push("unsupported-target-mode")
  if (!isReviewed) reasons.push(getReviewGateReason(input.updateReviewStatus))
  if (input.surfaceSupported === false) reasons.push("unsupported-surface")
  if (input.actionSupported === false) reasons.push("unsupported-action")
  if (input.permissionStale) reasons.push("permission-stale")
  if (input.permissionGranted === false) reasons.push("permission-not-granted")

  const canRenderControlledUi =
    input.runtime === "claude" &&
    input.targetMode === "controlled-ui" &&
    input.hasValidManifest &&
    isReviewed &&
    !input.safeModeEnabled &&
    input.surfaceSupported !== false

  const canInvokeControlledAction =
    canRenderControlledUi &&
    input.actionSupported !== false &&
    input.permissionGranted !== false &&
    input.permissionStale !== true

  return {
    canRenderControlledUi,
    canInvokeControlledAction,
    reasons: uniqueReasons(reasons),
  }
}

export function buildControlledUiPermissionGrant(input: {
  pluginReviewKey: string
  contributionFingerprint: string
  contributionId: string
  permissionId: string
  actionId?: string
  fieldId?: string
  grantedAt?: string
}): PluginControlledUiPermissionGrant {
  return {
    pluginReviewKey: input.pluginReviewKey,
    contributionFingerprint: input.contributionFingerprint,
    contributionId: input.contributionId,
    permissionId: input.permissionId,
    actionId: input.actionId,
    fieldId: input.fieldId,
    grantedAt: input.grantedAt ?? new Date().toISOString(),
  }
}

export function getControlledUiGrantStatus(
  grant: PluginControlledUiPermissionGrant | undefined,
  input: {
    pluginReviewKey: string
    contributionFingerprint: string
    contributionId: string
    permissionId: string
    actionId?: string
    fieldId?: string
  },
): PluginControlledUiGrantStatus {
  if (!grant) return "mismatch"
  if (
    grant.pluginReviewKey !== input.pluginReviewKey ||
    grant.contributionId !== input.contributionId ||
    grant.permissionId !== input.permissionId ||
    grant.actionId !== input.actionId ||
    grant.fieldId !== input.fieldId
  ) {
    return "mismatch"
  }
  return grant.contributionFingerprint === input.contributionFingerprint
    ? "current"
    : "stale"
}

export function isControlledUiGrantCurrent(
  grant: PluginControlledUiPermissionGrant | undefined,
  input: Parameters<typeof getControlledUiGrantStatus>[1],
): boolean {
  return getControlledUiGrantStatus(grant, input) === "current"
}

export function getControlledUiActionPermissionId(action: PluginControlledUiAction): string {
  return `controlled-ui.action.${action.type}`
}

function parseSurface(
  value: unknown,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
  ignoredUnknownFields: string[],
): PluginControlledUiSurface[] {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI surface must be an object.",
    })
    return []
  }

  collectUnknownFields(value, SURFACE_KEYS, path, diagnostics, ignoredUnknownFields)
  if (hasUnsafeFields(value, path, diagnostics)) return []

  const id = getBoundedId(value.id, `${path}.id`, diagnostics)
  const title = getBoundedString(value.title, `${path}.title`, MAX_TITLE_LENGTH, diagnostics)
  const description = getOptionalBoundedString(
    value.description,
    `${path}.description`,
    MAX_DESCRIPTION_LENGTH,
    diagnostics,
  )

  if (!id || !title) return []

  if (value.type === "settings-section") {
    return [{
      id,
      type: "settings-section",
      title,
      description,
      fields: parseFields(value.fields, `${path}.fields`, diagnostics, ignoredUnknownFields),
    }]
  }

  if (value.type === "workbench-panel") {
    return [{
      id,
      type: "workbench-panel",
      title,
      description,
      items: parseItems(value.items, `${path}.items`, diagnostics, ignoredUnknownFields),
    }]
  }

  if (value.type === "command-button") {
    const label = getBoundedString(value.label, `${path}.label`, MAX_LABEL_LENGTH, diagnostics)
    const action = parseAction(value.action, id, `${path}.action`, diagnostics, ignoredUnknownFields)
    if (!label || !action) return []
    return [{
      id,
      type: "command-button",
      title,
      description,
      label,
      action,
    }]
  }

  diagnostics.push({
    code: "controlled-ui-unsupported-surface",
    severity: "blocked",
    path: `${path}.type`,
    message: "Controlled UI surface type is not supported.",
  })
  return []
}

function parseFields(
  value: unknown,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
  ignoredUnknownFields: string[],
): PluginControlledUiField[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI fields must be an array.",
    })
    return []
  }
  if (value.length > MAX_FIELDS) {
    diagnostics.push({
      code: "controlled-ui-limit-exceeded",
      severity: "blocked",
      path,
      message: `Controlled UI settings sections may declare at most ${MAX_FIELDS} fields.`,
    })
    return []
  }

  return value.flatMap((field, index) => {
    const fieldPath = `${path}.${index}`
    if (!isRecord(field)) {
      diagnostics.push({
        code: "controlled-ui-manifest-invalid",
        severity: "blocked",
        path: fieldPath,
        message: "Controlled UI field must be an object.",
      })
      return []
    }
    collectUnknownFields(field, FIELD_KEYS, fieldPath, diagnostics, ignoredUnknownFields)
    if (hasUnsafeFields(field, fieldPath, diagnostics)) return []

    const id = getBoundedId(field.id, `${fieldPath}.id`, diagnostics)
    const label = getBoundedString(field.label, `${fieldPath}.label`, MAX_LABEL_LENGTH, diagnostics)
    const description = getOptionalBoundedString(
      field.description,
      `${fieldPath}.description`,
      MAX_DESCRIPTION_LENGTH,
      diagnostics,
    )
    if (!id || !label) return []
    if (!["text", "checkbox", "select"].includes(String(field.type))) {
      diagnostics.push({
        code: "controlled-ui-manifest-invalid",
        severity: "blocked",
        path: `${fieldPath}.type`,
        message: "Controlled UI field type is not supported.",
      })
      return []
    }

    const parsedField: PluginControlledUiField = {
      id,
      type: field.type as PluginControlledUiFieldType,
      label,
      description,
    }
    if (parsedField.type === "select") {
      parsedField.options = parseOptions(field.options, `${fieldPath}.options`, diagnostics)
    }
    return [parsedField]
  })
}

function parseItems(
  value: unknown,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
  ignoredUnknownFields: string[],
): PluginControlledUiItem[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI items must be an array.",
    })
    return []
  }
  if (value.length > MAX_ITEMS) {
    diagnostics.push({
      code: "controlled-ui-limit-exceeded",
      severity: "blocked",
      path,
      message: `Controlled UI panels may declare at most ${MAX_ITEMS} items.`,
    })
    return []
  }

  return value.flatMap((item, index): PluginControlledUiItem[] => {
    const itemPath = `${path}.${index}`
    if (!isRecord(item)) {
      diagnostics.push({
        code: "controlled-ui-manifest-invalid",
        severity: "blocked",
        path: itemPath,
        message: "Controlled UI item must be an object.",
      })
      return []
    }
    collectUnknownFields(item, ITEM_KEYS, itemPath, diagnostics, ignoredUnknownFields)
    if (hasUnsafeFields(item, itemPath, diagnostics)) return []

    if (item.type === "text") {
      const text = getBoundedString(item.text, `${itemPath}.text`, MAX_TEXT_LENGTH, diagnostics)
      return text ? [{ type: "text", text }] : []
    }
    if (item.type === "fact") {
      const label = getBoundedString(item.label, `${itemPath}.label`, MAX_LABEL_LENGTH, diagnostics)
      const value = getBoundedString(item.value, `${itemPath}.value`, MAX_TEXT_LENGTH, diagnostics)
      return label && value ? [{ type: "fact", label, value }] : []
    }

    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path: `${itemPath}.type`,
      message: "Controlled UI item type is not supported.",
    })
    return []
  })
}

function parseAction(
  value: unknown,
  fallbackId: string,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
  ignoredUnknownFields: string[],
): PluginControlledUiAction | undefined {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI action must be an object.",
    })
    return undefined
  }
  collectUnknownFields(value, ACTION_KEYS, path, diagnostics, ignoredUnknownFields)
  if (hasUnsafeFields(value, path, diagnostics)) return undefined

  if (value.type !== "insert-chat-draft") {
    diagnostics.push({
      code: "controlled-ui-unsupported-action",
      severity: "blocked",
      path: `${path}.type`,
      message: "Controlled UI action type is not allowlisted.",
    })
    return undefined
  }

  const id = value.id === undefined
    ? fallbackId
    : getBoundedId(value.id, `${path}.id`, diagnostics)
  const prompt = getBoundedString(value.prompt, `${path}.prompt`, MAX_PROMPT_LENGTH, diagnostics)
  if (!id || !prompt) return undefined
  return {
    id,
    type: "insert-chat-draft",
    prompt,
  }
}

function parseOptions(
  value: unknown,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
): string[] {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI select fields require an options array.",
    })
    return []
  }
  if (value.length > MAX_OPTIONS) {
    diagnostics.push({
      code: "controlled-ui-limit-exceeded",
      severity: "blocked",
      path,
      message: `Controlled UI select fields may declare at most ${MAX_OPTIONS} options.`,
    })
    return []
  }
  return value.flatMap((option, index) => {
    const parsed = getBoundedString(option, `${path}.${index}`, MAX_LABEL_LENGTH, diagnostics)
    return parsed ? [parsed] : []
  })
}

function getBoundedId(
  value: unknown,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
): string | undefined {
  const id = getBoundedString(value, path, MAX_ID_LENGTH, diagnostics)
  if (!id) return undefined
  if (!ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI ids may contain letters, numbers, dots, underscores, and dashes.",
    })
    return undefined
  }
  return id
}

function getOptionalBoundedString(
  value: unknown,
  path: string,
  maxLength: number,
  diagnostics: PluginControlledUiDiagnostic[],
): string | undefined {
  if (value === undefined) return undefined
  return getBoundedString(value, path, maxLength, diagnostics)
}

function getBoundedString(
  value: unknown,
  path: string,
  maxLength: number,
  diagnostics: PluginControlledUiDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push({
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message: "Controlled UI value must be a non-empty string.",
    })
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    diagnostics.push({
      code: "controlled-ui-limit-exceeded",
      severity: "blocked",
      path,
      message: `Controlled UI value must be ${maxLength} characters or less.`,
    })
    return undefined
  }
  return trimmed
}

function collectUnknownFields(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
  ignoredUnknownFields: string[],
) {
  for (const key of Object.keys(value)) {
    if (allowedKeys.has(key) || UNSAFE_FIELD_NAMES.has(key)) continue
    const fieldPath = `${path}.${key}`
    ignoredUnknownFields.push(fieldPath)
    diagnostics.push({
      code: "controlled-ui-unknown-field",
      severity: "warning",
      path: fieldPath,
      message: "Controlled UI ignored an unknown manifest field.",
    })
  }
}

function hasUnsafeFields(
  value: Record<string, unknown>,
  path: string,
  diagnostics: PluginControlledUiDiagnostic[],
): boolean {
  let unsafe = false
  for (const key of Object.keys(value)) {
    if (!UNSAFE_FIELD_NAMES.has(key)) continue
    unsafe = true
    diagnostics.push({
      code: "controlled-ui-unsafe-field",
      severity: "blocked",
      path: `${path}.${key}`,
      message: "Controlled UI manifests cannot declare executable, DOM, iframe, webview, or style fields.",
    })
  }
  return unsafe
}

function getReviewGateReason(
  status: PluginUpdateReviewStatus | undefined,
): PluginControlledUiGateReason {
  if (status === "changed") return "review-changed"
  if (status === "new") return "review-required"
  return "review-unreviewed"
}

function uniqueReasons(reasons: PluginControlledUiGateReason[]): PluginControlledUiGateReason[] {
  return Array.from(new Set(reasons))
}

function hasBlockedDiagnostics(diagnostics: PluginControlledUiDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "blocked")
}

function invalidResult(path: string, message: string): PluginControlledUiParseResult {
  return {
    diagnostics: [{
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path,
      message,
    }],
    ignoredUnknownFields: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
