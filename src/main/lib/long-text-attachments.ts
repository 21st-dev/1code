import { randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import { readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises"
import {
  join,
  resolve,
  relative,
  basename,
  extname,
  isAbsolute,
} from "node:path"
import { app } from "electron"
import {
  LONG_TEXT_ATTACHMENT_REF_PREFIX,
  type LongTextAttachment,
  type LongTextAttachmentKind,
} from "../../shared/long-text-attachments"

export const LONG_TEXT_ATTACHMENT_SINGLE_LIMIT_BYTES = 1 * 1024 * 1024
export const LONG_TEXT_ATTACHMENT_AGGREGATE_LIMIT_BYTES = 3 * 1024 * 1024
export const LONG_TEXT_ATTACHMENT_CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000

const CLEANUP_THROTTLE_MS = 60 * 60 * 1000
let lastCleanupAt = 0

export type StageLongTextAttachmentInput = {
  subChatId: string
  text: string
  filename?: string
  kind?: LongTextAttachmentKind
}

export type ResolveLongTextAttachmentInput = Pick<
  LongTextAttachment,
  "localRef" | "filename" | "kind" | "byteLength"
> & {
  attachmentId?: string
}

export type ResolvedLongTextAttachment = ResolveLongTextAttachmentInput & {
  text: string
}

type ParsedLocalRef = {
  scopeId: string
  attachmentId: string
}

function getLongTextAttachmentsRoot(): string {
  return join(app.getPath("userData"), "long-text-attachments")
}

function getLegacyPastedTextRoot(): string {
  return join(app.getPath("userData"), "claude-sessions")
}

function safePathSegment(value: string, fallback: string): string {
  const sanitized = value
    .replace(/\0/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 128)
  if (sanitized === "." || sanitized === "..") return fallback
  return sanitized || fallback
}

function isSafeRefSegment(value: string | undefined): value is string {
  return Boolean(
    value &&
      value !== "." &&
      value !== ".." &&
      /^[A-Za-z0-9._-]+$/.test(value)
  )
}

function validatePathWithin(
  targetPath: string,
  rootPath: string,
  message: string
): void {
  const root = resolve(rootPath)
  const target = resolve(targetPath)
  const rel = relative(root, target)
  if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith(`..${"\\"}`)) {
    throw new Error(message)
  }
}

function validatePathWithinRoot(targetPath: string): void {
  validatePathWithin(
    targetPath,
    getLongTextAttachmentsRoot(),
    "Long text attachment path escapes storage root"
  )
}

function normalizeAttachmentFilename(
  filename: string | undefined,
  kind: LongTextAttachmentKind
): string {
  const fallback = kind === "chatHistory" ? "chat_history.txt" : "pasted_text.txt"
  const raw = basename((filename || fallback).replace(/\\/g, "/"))
    .replace(/\0/g, "")
    .trim()
  const safe = raw.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || fallback
  return extname(safe) ? safe : `${safe}.txt`
}

function createPreview(text: string): string {
  const preview = text.slice(0, 50).replace(/\s+/g, " ").trim()
  return preview.length < text.trim().length ? `${preview}...` : preview
}

function createLocalRef(scopeId: string, attachmentId: string): string {
  return `${LONG_TEXT_ATTACHMENT_REF_PREFIX}${scopeId}/${attachmentId}`
}

export function isLongTextAttachmentLocalRef(localRef: string): boolean {
  return localRef.startsWith(LONG_TEXT_ATTACHMENT_REF_PREFIX)
}

function parseLocalRef(localRef: string): ParsedLocalRef {
  if (!isLongTextAttachmentLocalRef(localRef)) {
    throw new Error("Invalid long text attachment reference")
  }

  const body = localRef.slice(LONG_TEXT_ATTACHMENT_REF_PREFIX.length)
  const [scopeId, attachmentId, extra] = body.split("/")
  if (
    extra !== undefined ||
    !isSafeRefSegment(scopeId) ||
    !isSafeRefSegment(attachmentId)
  ) {
    throw new Error("Invalid long text attachment reference")
  }

  return { scopeId, attachmentId }
}

function pathForParsedRef({ scopeId, attachmentId }: ParsedLocalRef): string {
  const filePath = join(getLongTextAttachmentsRoot(), scopeId, `${attachmentId}.txt`)
  validatePathWithinRoot(filePath)
  return filePath
}

function pathForLegacyPastedTextRef(localRef: string): string {
  if (!isAbsolute(localRef)) {
    throw new Error("Invalid legacy long text attachment reference")
  }

  const root = getLegacyPastedTextRoot()
  const target = resolve(localRef)
  validatePathWithin(
    target,
    root,
    "Legacy long text attachment path escapes storage root"
  )

  const relParts = relative(resolve(root), target).split(/[\\/]+/)
  if (
    relParts.length !== 3 ||
    !isSafeRefSegment(relParts[0]) ||
    relParts[1] !== "pasted" ||
    !relParts[2]
  ) {
    throw new Error("Invalid legacy long text attachment reference")
  }

  return target
}

async function maybeCleanupStaleAttachments(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanupAt < CLEANUP_THROTTLE_MS) return
  lastCleanupAt = now
  await cleanupStaleLongTextAttachments().catch((error) => {
    console.warn("[long-text-attachments] cleanup failed", error)
  })
}

export async function stageLongTextAttachment(
  input: StageLongTextAttachmentInput
): Promise<LongTextAttachment> {
  const kind = input.kind ?? "pasted"
  const byteLength = Buffer.byteLength(input.text, "utf8")
  if (byteLength > LONG_TEXT_ATTACHMENT_SINGLE_LIMIT_BYTES) {
    throw new Error(
      `Long text attachment is too large (${byteLength} bytes, limit ${LONG_TEXT_ATTACHMENT_SINGLE_LIMIT_BYTES} bytes)`
    )
  }

  const scopeId = safePathSegment(input.subChatId, "unknown")
  const attachmentId = randomUUID()
  const filename = normalizeAttachmentFilename(input.filename, kind)
  const dir = join(getLongTextAttachmentsRoot(), scopeId)
  const filePath = pathForParsedRef({ scopeId, attachmentId })

  await mkdir(dir, { recursive: true })
  await writeFile(filePath, input.text, "utf8")
  void maybeCleanupStaleAttachments()

  console.log(
    `[long-text-attachments] staged id=${attachmentId} kind=${kind} filename=${filename} bytes=${byteLength}`
  )

  return {
    id: attachmentId,
    filename,
    byteLength,
    preview: createPreview(input.text),
    localRef: createLocalRef(scopeId, attachmentId),
    kind,
  }
}

export async function readLongTextAttachment(localRef: string): Promise<{
  text: string
  byteLength: number
}> {
  const filePath = isLongTextAttachmentLocalRef(localRef)
    ? pathForParsedRef(parseLocalRef(localRef))
    : pathForLegacyPastedTextRef(localRef)
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    throw new Error("Long text attachment reference does not point to a file")
  }
  if (fileStat.size > LONG_TEXT_ATTACHMENT_SINGLE_LIMIT_BYTES) {
    throw new Error("Long text attachment exceeds the single-attachment limit")
  }
  const text = await readFile(filePath, "utf8")
  const byteLength = Buffer.byteLength(text, "utf8")
  return { text, byteLength }
}

export async function resolveLongTextAttachments(
  attachments: ResolveLongTextAttachmentInput[]
): Promise<ResolvedLongTextAttachment[]> {
  const resolved: ResolvedLongTextAttachment[] = []
  let totalBytes = 0

  for (const attachment of attachments) {
    const { text, byteLength } = await readLongTextAttachment(attachment.localRef)
    if (attachment.byteLength > 0 && attachment.byteLength !== byteLength) {
      throw new Error("Long text attachment byte length changed")
    }

    totalBytes += byteLength
    if (totalBytes > LONG_TEXT_ATTACHMENT_AGGREGATE_LIMIT_BYTES) {
      throw new Error(
        `Long text attachments are too large for one send (${totalBytes} bytes, limit ${LONG_TEXT_ATTACHMENT_AGGREGATE_LIMIT_BYTES} bytes)`
      )
    }

    resolved.push({ ...attachment, byteLength, text })
  }

  return resolved
}

function escapePromptBlockAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapePromptBlockBody(value: string): string {
  return value.replace(/<\/attached_text>/gi, "</ attached_text>")
}

export function buildLongTextAttachmentPromptBlocks(
  attachments: ResolvedLongTextAttachment[]
): string {
  return attachments
    .map((attachment) => {
      const id = escapePromptBlockAttribute(
        attachment.attachmentId || attachment.localRef
      )
      const kind = escapePromptBlockAttribute(attachment.kind)
      const filename = escapePromptBlockAttribute(attachment.filename)
      return `<attached_text id="${id}" kind="${kind}" filename="${filename}" bytes="${attachment.byteLength}">
${escapePromptBlockBody(attachment.text)}
</attached_text>`
    })
    .join("\n\n")
}

export async function prependLongTextAttachmentPromptBlocks(
  prompt: string,
  attachments: ResolveLongTextAttachmentInput[] | undefined
): Promise<string> {
  if (!attachments || attachments.length === 0) return prompt

  const resolved = await resolveLongTextAttachments(attachments)
  const blocks = buildLongTextAttachmentPromptBlocks(resolved)
  return prompt.trim() ? `${blocks}\n\n${prompt}` : blocks
}

export async function deleteLongTextAttachment(localRef: string): Promise<boolean> {
  const parsed = parseLocalRef(localRef)
  const filePath = pathForParsedRef(parsed)
  await rm(filePath, { force: true })

  const dir = join(getLongTextAttachmentsRoot(), parsed.scopeId)
  await rm(dir, { recursive: false }).catch(() => undefined)
  return true
}

export async function cleanupStaleLongTextAttachments(
  olderThanMs = LONG_TEXT_ATTACHMENT_CLEANUP_AGE_MS
): Promise<number> {
  const root = getLongTextAttachmentsRoot()
  const cutoff = Date.now() - olderThanMs
  let deleted = 0

  let scopes: Dirent[]
  try {
    scopes = await readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const scope of scopes) {
    if (!scope.isDirectory()) continue
    const scopeDir = join(root, scope.name)
    validatePathWithinRoot(scopeDir)

    let files: Dirent[]
    try {
      files = await readdir(scopeDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".txt")) continue
      const filePath = join(scopeDir, file.name)
      validatePathWithinRoot(filePath)
      const fileStat = await stat(filePath).catch(() => null)
      if (!fileStat || fileStat.mtimeMs > cutoff) continue
      await rm(filePath, { force: true })
      deleted += 1
    }

    await rm(scopeDir, { recursive: false }).catch(() => undefined)
  }

  if (deleted > 0) {
    console.log(`[long-text-attachments] cleaned stale attachments count=${deleted}`)
  }
  return deleted
}
