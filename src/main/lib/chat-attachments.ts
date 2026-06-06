import { createHash, randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { basename, extname, join, relative, resolve } from "node:path"
import * as electron from "electron"
import {
  CHAT_IMAGE_AGGREGATE_LIMIT_BYTES,
  CHAT_IMAGE_ATTACHMENT_CLEANUP_AGE_MS,
  CHAT_IMAGE_ATTACHMENT_REF_PREFIX,
  CHAT_IMAGE_MAX_COUNT,
  CHAT_IMAGE_SINGLE_LIMIT_BYTES,
  getChatImageExtension,
  getChatImageMediaTypeForExtension,
  isSupportedChatImageMediaType,
  type ChatImageAttachment,
  type ChatImageAttachmentSendInput,
  type ChatImageAttachmentSource,
  type ChatImageMediaType,
  type ResolvedChatImageAttachment,
} from "../../shared/chat-attachments"
import type { DesktopRunPreflightBlocker } from "./agent-runtime/preflight"

const CLEANUP_THROTTLE_MS = 60 * 60 * 1000
let lastCleanupAt = 0
let chatImageAttachmentsRootOverride: string | null = null

type ParsedLocalRef = {
  scopeId: string
  fileName: string
}

export type DesktopChatImageAttachmentsResult =
  | {
      ok: true
      attachments: ResolvedChatImageAttachment[]
    }
  | {
      ok: false
      blocker: DesktopRunPreflightBlocker
    }

export type StageChatImageAttachmentInput = {
  chatId?: string
  subChatId: string
  base64Data: string
  filename?: string
  mediaType: string
  source?: ChatImageAttachmentSource
  width?: number
  height?: number
}

function getChatImageAttachmentsRoot(): string {
  if (chatImageAttachmentsRootOverride) {
    return chatImageAttachmentsRootOverride
  }

  const app = electron.app ?? (electron as any).default?.app
  if (!app?.getPath) {
    throw new Error("Electron app is unavailable for chat image attachments")
  }

  return join(app.getPath("userData"), "chat-image-attachments")
}

export function setChatImageAttachmentsRootForTest(
  root: string | null
): void {
  chatImageAttachmentsRootOverride = root
}

function safePathSegment(value: string, fallback: string): string {
  const sanitized = value
    .replace(/\0/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 160)
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

function validatePathWithinRoot(targetPath: string): void {
  const root = resolve(getChatImageAttachmentsRoot())
  const target = resolve(targetPath)
  const rel = relative(root, target)
  if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith(`..${"\\"}`)) {
    throw new Error("Chat image attachment path escapes storage root")
  }
}

function normalizeImageFilename(
  filename: string | undefined,
  mediaType: ChatImageMediaType
): string {
  const fallback = `image${getChatImageExtension(mediaType)}`
  const raw = basename((filename || fallback).replace(/\\/g, "/"))
    .replace(/\0/g, "")
    .trim()
  const safe = raw.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || fallback
  const ext = extname(safe).toLowerCase()
  if (getChatImageMediaTypeForExtension(ext)) return safe
  return `${safe}${getChatImageExtension(mediaType)}`
}

function normalizeBase64Data(base64Data: string): string {
  const commaIndex = base64Data.indexOf(",")
  const body =
    base64Data.startsWith("data:") && commaIndex >= 0
      ? base64Data.slice(commaIndex + 1)
      : base64Data
  return body.replace(/\s/g, "")
}

function createLocalRef(scopeId: string, fileName: string): string {
  return `${CHAT_IMAGE_ATTACHMENT_REF_PREFIX}${scopeId}/${fileName}`
}

export function isChatImageAttachmentLocalRef(localRef: string): boolean {
  return localRef.startsWith(CHAT_IMAGE_ATTACHMENT_REF_PREFIX)
}

function parseLocalRef(localRef: string): ParsedLocalRef {
  if (!isChatImageAttachmentLocalRef(localRef)) {
    throw new Error("Invalid chat image attachment reference")
  }

  const body = localRef.slice(CHAT_IMAGE_ATTACHMENT_REF_PREFIX.length)
  const [scopeId, fileName, extra] = body.split("/")
  const mediaType = getChatImageMediaTypeForExtension(extname(fileName || ""))
  if (
    extra !== undefined ||
    !isSafeRefSegment(scopeId) ||
    !isSafeRefSegment(fileName) ||
    !mediaType
  ) {
    throw new Error("Invalid chat image attachment reference")
  }

  return { scopeId, fileName }
}

function pathForParsedRef({ scopeId, fileName }: ParsedLocalRef): string {
  const filePath = join(getChatImageAttachmentsRoot(), scopeId, fileName)
  validatePathWithinRoot(filePath)
  return filePath
}

async function maybeCleanupStaleAttachments(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanupAt < CLEANUP_THROTTLE_MS) return
  lastCleanupAt = now
  await cleanupStaleChatImageAttachments().catch((error) => {
    console.warn("[chat-attachments] cleanup failed", error)
  })
}

export async function stageChatImageAttachment(
  input: StageChatImageAttachmentInput
): Promise<ChatImageAttachment> {
  if (!isSupportedChatImageMediaType(input.mediaType)) {
    throw new Error(
      `Unsupported image type. Supported formats: PNG, JPEG, WEBP, GIF, BMP`
    )
  }

  const base64Data = normalizeBase64Data(input.base64Data)
  if (!base64Data) {
    throw new Error("Image attachment is empty")
  }

  const buffer = Buffer.from(base64Data, "base64")
  if (buffer.length === 0) {
    throw new Error("Image attachment is empty")
  }
  if (buffer.length > CHAT_IMAGE_SINGLE_LIMIT_BYTES) {
    throw new Error(
      `Image attachment is too large (${buffer.length} bytes, limit ${CHAT_IMAGE_SINGLE_LIMIT_BYTES} bytes)`
    )
  }

  const attachmentId = randomUUID()
  const scopeId = safePathSegment(
    [input.chatId, input.subChatId].filter(Boolean).join("_"),
    "unknown"
  )
  const safeFilename = normalizeImageFilename(input.filename, input.mediaType)
  const fileName = `${attachmentId}${getChatImageExtension(input.mediaType)}`
  const dir = join(getChatImageAttachmentsRoot(), scopeId)
  const filePath = pathForParsedRef({ scopeId, fileName })
  const sha256 = createHash("sha256").update(buffer).digest("hex")

  await mkdir(dir, { recursive: true })
  await writeFile(filePath, buffer)
  void maybeCleanupStaleAttachments()

  console.log(
    `[chat-attachments] staged id=${attachmentId} filename=${safeFilename} mediaType=${input.mediaType} bytes=${buffer.length}`
  )

  return {
    id: attachmentId,
    kind: "image",
    source: input.source ?? "file-picker",
    filename: safeFilename,
    mediaType: input.mediaType,
    sizeBytes: buffer.length,
    width: input.width,
    height: input.height,
    sha256,
    localRef: createLocalRef(scopeId, fileName),
    status: "ready",
  }
}

export async function readChatImageAttachment(
  input: Pick<
    ChatImageAttachmentSendInput,
    "localRef" | "mediaType" | "filename" | "sizeBytes"
  >
): Promise<ResolvedChatImageAttachment> {
  if (!input.localRef) {
    throw new Error("Chat image attachment reference is missing")
  }

  const parsed = parseLocalRef(input.localRef)
  const filePath = pathForParsedRef(parsed)
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    throw new Error("Chat image attachment reference does not point to a file")
  }
  if (fileStat.size > CHAT_IMAGE_SINGLE_LIMIT_BYTES) {
    throw new Error("Chat image attachment exceeds the single-attachment limit")
  }
  if (input.sizeBytes && input.sizeBytes !== fileStat.size) {
    throw new Error("Chat image attachment size changed")
  }

  const mediaType =
    isSupportedChatImageMediaType(input.mediaType)
      ? input.mediaType
      : getChatImageMediaTypeForExtension(extname(parsed.fileName))
  if (!mediaType) {
    throw new Error("Unsupported chat image attachment type")
  }

  const buffer = await readFile(filePath)
  return {
    localRef: input.localRef,
    filename: input.filename,
    mediaType,
    sizeBytes: buffer.length,
    base64Data: buffer.toString("base64"),
  }
}

export async function resolveChatImageAttachments(
  attachments: ChatImageAttachmentSendInput[] | undefined
): Promise<ResolvedChatImageAttachment[]> {
  if (!attachments || attachments.length === 0) return []
  if (attachments.length > CHAT_IMAGE_MAX_COUNT) {
    throw new Error(
      `Too many image attachments (${attachments.length}, limit ${CHAT_IMAGE_MAX_COUNT})`
    )
  }

  const resolved: ResolvedChatImageAttachment[] = []
  let totalBytes = 0

  for (const attachment of attachments) {
    let image: ResolvedChatImageAttachment
    if (attachment.localRef) {
      image = await readChatImageAttachment(attachment)
    } else if (
      attachment.base64Data &&
      isSupportedChatImageMediaType(attachment.mediaType)
    ) {
      const base64Data = normalizeBase64Data(attachment.base64Data)
      const sizeBytes = Buffer.from(base64Data, "base64").length
      if (sizeBytes > CHAT_IMAGE_SINGLE_LIMIT_BYTES) {
        throw new Error("Image attachment exceeds the single-attachment limit")
      }
      image = {
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        sizeBytes,
        width: attachment.width,
        height: attachment.height,
        sha256: attachment.sha256,
        base64Data,
      }
    } else {
      throw new Error("Invalid image attachment")
    }

    totalBytes += image.sizeBytes
    if (totalBytes > CHAT_IMAGE_AGGREGATE_LIMIT_BYTES) {
      throw new Error(
        `Image attachments are too large for one send (${totalBytes} bytes, limit ${CHAT_IMAGE_AGGREGATE_LIMIT_BYTES} bytes)`
      )
    }

    resolved.push({
      ...image,
      attachmentId: attachment.attachmentId,
      localRef: attachment.localRef,
      filename: attachment.filename ?? image.filename,
      width: attachment.width,
      height: attachment.height,
      sha256: attachment.sha256,
    })
  }

  return resolved
}

export function createChatImageAttachmentPreflightBlocker(
  error: unknown
): DesktopRunPreflightBlocker {
  return {
    id: "attachment",
    status: "blocked",
    message:
      error instanceof Error
        ? `Image attachment unavailable: ${error.message}`
        : `Image attachment unavailable: ${String(error)}`,
  }
}

export async function prepareChatImageAttachmentsForDesktopRun(input: {
  images?: ChatImageAttachmentSendInput[]
  emitPreflightBlocker?: (blocker: DesktopRunPreflightBlocker) => void
}): Promise<DesktopChatImageAttachmentsResult> {
  try {
    return {
      ok: true,
      attachments: await resolveChatImageAttachments(input.images),
    }
  } catch (error) {
    const blocker = createChatImageAttachmentPreflightBlocker(error)
    input.emitPreflightBlocker?.(blocker)
    return { ok: false, blocker }
  }
}

export async function getChatImageAttachmentDataUrl(
  localRef: string,
  mediaType?: string
): Promise<string> {
  const image = await readChatImageAttachment({ localRef, mediaType })
  return `data:${image.mediaType};base64,${image.base64Data}`
}

export async function deleteChatImageAttachment(localRef: string): Promise<boolean> {
  const parsed = parseLocalRef(localRef)
  const filePath = pathForParsedRef(parsed)
  await rm(filePath, { force: true })

  const dir = join(getChatImageAttachmentsRoot(), parsed.scopeId)
  await rm(dir, { recursive: false }).catch(() => undefined)
  return true
}

export async function cleanupStaleChatImageAttachments(
  olderThanMs = CHAT_IMAGE_ATTACHMENT_CLEANUP_AGE_MS
): Promise<number> {
  const root = getChatImageAttachmentsRoot()
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
      if (!file.isFile()) continue
      const mediaType = getChatImageMediaTypeForExtension(extname(file.name))
      if (!mediaType) continue
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
    console.log(`[chat-attachments] cleaned stale images count=${deleted}`)
  }
  return deleted
}
