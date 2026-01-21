import { useState, useEffect } from "react"
import type {
  UploadedImage,
  UploadedFile,
} from "../hooks/use-agents-file-upload"
import type { SelectedTextContext } from "./queue-utils"

// Constants
export const DRAFTS_STORAGE_KEY = "agent-drafts-global"
export const DRAFT_ID_PREFIX = "draft-"
export const DRAFTS_CHANGE_EVENT = "drafts-changed"
const MAX_DRAFT_STORAGE_BYTES = 4 * 1024 * 1024 // 4MB safe limit

// Track blob URLs for cleanup (prevents memory leaks)
const draftBlobUrls = new Map<string, string[]>()

// Types for persisted attachments
export interface DraftImage {
  id: string
  filename: string
  base64Data: string
  mediaType: string
}

export interface DraftFile {
  id: string
  filename: string
  base64Data: string
  size?: number
  type?: string
}

export interface DraftTextContext {
  id: string
  text: string
  sourceMessageId: string
  preview: string
  createdAt: string // ISO string instead of Date
}

// Types
export interface DraftContent {
  text: string
  updatedAt: number
  images?: DraftImage[]
  files?: DraftFile[]
  textContexts?: DraftTextContext[]
}

export interface DraftProject {
  id: string
  name: string
  path: string
  gitOwner?: string | null
  gitRepo?: string | null
  gitProvider?: string | null
}

export interface NewChatDraft {
  id: string
  text: string
  updatedAt: number
  project?: DraftProject
  isVisible?: boolean // Only show in sidebar when user navigates away from the form
  images?: DraftImage[]
  files?: DraftFile[]
  textContexts?: DraftTextContext[]
}

// SubChatDraft uses key format: "chatId:subChatId"
export type SubChatDraft = DraftContent

// Raw drafts from localStorage (mixed format)
type GlobalDraftsRaw = Record<string, DraftContent | NewChatDraft>

// Emit custom event when drafts change (for same-tab sync)
export function emitDraftsChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(DRAFTS_CHANGE_EVENT))
}

// Load all drafts from localStorage
export function loadGlobalDrafts(): GlobalDraftsRaw {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(DRAFTS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

// Save all drafts to localStorage
export function saveGlobalDrafts(drafts: GlobalDraftsRaw): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
    emitDraftsChanged()
  } catch {
    // Ignore localStorage errors
  }
}

// Generate a new draft ID
export function generateDraftId(): string {
  return `${DRAFT_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Check if a key is a new chat draft (starts with draft-)
export function isNewChatDraftKey(key: string): boolean {
  return key.startsWith(DRAFT_ID_PREFIX)
}

// Check if a key is a sub-chat draft (contains :)
export function isSubChatDraftKey(key: string): boolean {
  return key.includes(":")
}

// Get new chat drafts as sorted array (only visible ones)
export function getNewChatDrafts(): NewChatDraft[] {
  const globalDrafts = loadGlobalDrafts()
  return Object.entries(globalDrafts)
    .filter(([key]) => isNewChatDraftKey(key))
    .map(([id, data]) => ({
      id,
      text: (data as NewChatDraft).text || "",
      updatedAt: data.updatedAt || 0,
      project: (data as NewChatDraft).project,
      isVisible: (data as NewChatDraft).isVisible,
    }))
    .filter((draft) => draft.isVisible === true)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// Save a new chat draft
export function saveNewChatDraft(
  draftId: string,
  text: string,
  project?: DraftProject
): void {
  const globalDrafts = loadGlobalDrafts()
  if (text.trim()) {
    globalDrafts[draftId] = {
      text,
      updatedAt: Date.now(),
      ...(project && { project }),
    }
  } else {
    delete globalDrafts[draftId]
  }
  saveGlobalDrafts(globalDrafts)
}

// Delete a new chat draft
export function deleteNewChatDraft(draftId: string): void {
  const globalDrafts = loadGlobalDrafts()
  delete globalDrafts[draftId]
  saveGlobalDrafts(globalDrafts)
}

// Mark a draft as visible (called when user navigates away from the form)
export function markDraftVisible(draftId: string): void {
  const globalDrafts = loadGlobalDrafts()
  if (globalDrafts[draftId]) {
    ;(globalDrafts[draftId] as NewChatDraft).isVisible = true
    saveGlobalDrafts(globalDrafts)
  }
}

// Get sub-chat draft key
export function getSubChatDraftKey(chatId: string, subChatId: string): string {
  return `${chatId}:${subChatId}`
}

// Get sub-chat draft text
export function getSubChatDraft(chatId: string, subChatId: string): string | null {
  const globalDrafts = loadGlobalDrafts()
  const key = getSubChatDraftKey(chatId, subChatId)
  const draft = globalDrafts[key] as DraftContent | undefined
  return draft?.text || null
}

// Save sub-chat draft
export function saveSubChatDraft(
  chatId: string,
  subChatId: string,
  text: string
): void {
  const globalDrafts = loadGlobalDrafts()
  const key = getSubChatDraftKey(chatId, subChatId)
  if (text.trim()) {
    globalDrafts[key] = { text, updatedAt: Date.now() }
  } else {
    delete globalDrafts[key]
  }
  saveGlobalDrafts(globalDrafts)
}

// Clear sub-chat draft (also revokes any blob URLs)
export function clearSubChatDraft(chatId: string, subChatId: string): void {
  const globalDrafts = loadGlobalDrafts()
  const key = getSubChatDraftKey(chatId, subChatId)
  const draft = globalDrafts[key] as DraftContent | undefined

  // Revoke blob URLs for images and files before deleting
  if (draft?.images) {
    draft.images.forEach((img) => revokeDraftBlobUrls(img.id))
  }
  if (draft?.files) {
    draft.files.forEach((file) => revokeDraftBlobUrls(file.id))
  }

  delete globalDrafts[key]
  saveGlobalDrafts(globalDrafts)
}

// Build drafts cache from localStorage (for sidebar display)
export function buildDraftsCache(): Record<string, string> {
  const globalDrafts = loadGlobalDrafts()
  const cache: Record<string, string> = {}
  for (const [key, value] of Object.entries(globalDrafts)) {
    if ((value as DraftContent)?.text) {
      cache[key] = (value as DraftContent).text
    }
  }
  return cache
}

/**
 * Hook to get new chat drafts with automatic updates
 * Uses custom events for same-tab sync and storage events for cross-tab sync
 */
export function useNewChatDrafts(): NewChatDraft[] {
  const [drafts, setDrafts] = useState<NewChatDraft[]>(() => getNewChatDrafts())

  useEffect(() => {
    const handleChange = (e?: Event) => {
      // For storage events, only react to draft-related keys
      // This prevents re-renders when other localStorage keys change (e.g., sub-chat active state)
      if (e instanceof StorageEvent) {
        if (!e.key?.startsWith("new-chat-draft-")) {
          return
        }
      }

      const newDrafts = getNewChatDrafts()
      // Only update state if drafts actually changed (compare by content)
      setDrafts((prev) => {
        if (prev.length !== newDrafts.length) return newDrafts
        const prevIds = prev.map((d) => d.id).sort().join(",")
        const newIds = newDrafts.map((d) => d.id).sort().join(",")
        if (prevIds !== newIds) return newDrafts
        // Also compare text content
        const prevTexts = prev.map((d) => `${d.id}:${d.text}`).sort().join("|")
        const newTexts = newDrafts.map((d) => `${d.id}:${d.text}`).sort().join("|")
        if (prevTexts !== newTexts) return newDrafts
        return prev // No change, return previous reference
      })
    }

    // Listen for custom event (same-tab changes)
    window.addEventListener(DRAFTS_CHANGE_EVENT, handleChange)
    // Listen for storage event (cross-tab changes)
    window.addEventListener("storage", handleChange)

    return () => {
      window.removeEventListener(DRAFTS_CHANGE_EVENT, handleChange)
      window.removeEventListener("storage", handleChange)
    }
  }, [])

  return drafts
}

/**
 * Hook to get sub-chat drafts cache with automatic updates
 * Returns a Record<key, text> for quick lookups
 */
export function useSubChatDraftsCache(): Record<string, string> {
  const [draftsCache, setDraftsCache] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {}
    return buildDraftsCache()
  })

  useEffect(() => {
    const handleChange = () => {
      const newCache = buildDraftsCache()
      setDraftsCache(newCache)
    }

    // Listen for custom event (same-tab changes)
    window.addEventListener(DRAFTS_CHANGE_EVENT, handleChange)
    // Listen for storage event (cross-tab changes)
    window.addEventListener("storage", handleChange)

    return () => {
      window.removeEventListener(DRAFTS_CHANGE_EVENT, handleChange)
      window.removeEventListener("storage", handleChange)
    }
  }, [])

  return draftsCache
}

/**
 * Hook to get a specific sub-chat draft
 */
export function useSubChatDraft(
  parentChatId: string | null,
  subChatId: string
): string | null {
  const draftsCache = useSubChatDraftsCache()

  if (!parentChatId) return null
  const key = getSubChatDraftKey(parentChatId, subChatId)
  return draftsCache[key] || null
}

// ============================================
// Attachment persistence utilities
// ============================================

/**
 * Estimate size of draft in bytes (for storage limit checks)
 */
export function estimateDraftSize(
  draft: DraftContent | NewChatDraft
): number {
  return JSON.stringify(draft).length * 2 // UTF-16 chars = 2 bytes each
}

/**
 * Check if adding a draft would exceed storage limits
 */
function wouldExceedStorageLimit(
  existingDrafts: GlobalDraftsRaw,
  newDraft: DraftContent | NewChatDraft
): boolean {
  const existingSize = JSON.stringify(existingDrafts).length * 2
  const newSize = estimateDraftSize(newDraft)
  return existingSize + newSize > MAX_DRAFT_STORAGE_BYTES
}

/**
 * Convert blob URL to base64 data
 */
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data:xxx;base64, prefix
      const base64 = result.split(",")[1]
      resolve(base64 || "")
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert UploadedImage to DraftImage (filter out images without base64)
 */
export function toDraftImage(img: UploadedImage): DraftImage | null {
  if (!img.base64Data) return null
  return {
    id: img.id,
    filename: img.filename,
    base64Data: img.base64Data,
    mediaType: img.mediaType || "image/png",
  }
}

/**
 * Convert UploadedFile to DraftFile (requires async conversion)
 */
export async function toDraftFile(
  file: UploadedFile
): Promise<DraftFile | null> {
  if (!file.url) return null
  try {
    const base64Data = await blobUrlToBase64(file.url)
    return {
      id: file.id,
      filename: file.filename,
      base64Data,
      size: file.size,
      type: file.type,
    }
  } catch (err) {
    console.error("[drafts] Failed to convert file to base64:", err)
    return null
  }
}

/**
 * Convert SelectedTextContext to DraftTextContext
 */
export function toDraftTextContext(
  ctx: SelectedTextContext
): DraftTextContext {
  return {
    id: ctx.id,
    text: ctx.text,
    sourceMessageId: ctx.sourceMessageId,
    preview: ctx.preview,
    createdAt:
      ctx.createdAt instanceof Date
        ? ctx.createdAt.toISOString()
        : String(ctx.createdAt),
  }
}

/**
 * Revoke blob URLs associated with a draft item
 */
export function revokeDraftBlobUrls(draftId: string): void {
  const urls = draftBlobUrls.get(draftId)
  if (urls) {
    urls.forEach((url) => URL.revokeObjectURL(url))
    draftBlobUrls.delete(draftId)
  }
}

/**
 * Revoke all tracked blob URLs (call on unmount or cleanup)
 */
export function revokeAllDraftBlobUrls(): void {
  draftBlobUrls.forEach((urls) => {
    urls.forEach((url) => URL.revokeObjectURL(url))
  })
  draftBlobUrls.clear()
}

/**
 * Restore UploadedImage from DraftImage (creates blob URL)
 * Tracks blob URL for cleanup to prevent memory leaks
 */
export function fromDraftImage(draft: DraftImage): UploadedImage | null {
  if (!draft.base64Data) return null
  try {
    const byteCharacters = atob(draft.base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: draft.mediaType })
    const url = URL.createObjectURL(blob)

    // Track blob URL for cleanup
    const existing = draftBlobUrls.get(draft.id) || []
    draftBlobUrls.set(draft.id, [...existing, url])

    return {
      id: draft.id,
      filename: draft.filename,
      url,
      base64Data: draft.base64Data,
      mediaType: draft.mediaType,
      isLoading: false,
    }
  } catch (err) {
    console.error("[drafts] Failed to restore image:", err)
    return null
  }
}

/**
 * Restore UploadedFile from DraftFile (creates blob URL)
 * Tracks blob URL for cleanup to prevent memory leaks
 */
export function fromDraftFile(draft: DraftFile): UploadedFile | null {
  if (!draft.base64Data) return null
  try {
    const byteCharacters = atob(draft.base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], {
      type: draft.type || "application/octet-stream",
    })
    const url = URL.createObjectURL(blob)

    // Track blob URL for cleanup
    const existing = draftBlobUrls.get(draft.id) || []
    draftBlobUrls.set(draft.id, [...existing, url])

    return {
      id: draft.id,
      filename: draft.filename,
      url,
      size: draft.size,
      type: draft.type,
      isLoading: false,
    }
  } catch (err) {
    console.error("[drafts] Failed to restore file:", err)
    return null
  }
}

/**
 * Restore SelectedTextContext from DraftTextContext
 */
export function fromDraftTextContext(
  draft: DraftTextContext
): SelectedTextContext {
  return {
    id: draft.id,
    text: draft.text,
    sourceMessageId: draft.sourceMessageId,
    preview: draft.preview,
    createdAt: new Date(draft.createdAt),
  }
}

/**
 * Full draft data including attachments
 */
export interface FullDraftData {
  text: string | null
  images: UploadedImage[]
  files: UploadedFile[]
  textContexts: SelectedTextContext[]
}

/**
 * Get full sub-chat draft including attachments and text contexts
 */
export function getSubChatDraftFull(
  chatId: string,
  subChatId: string
): FullDraftData | null {
  const globalDrafts = loadGlobalDrafts()
  const key = getSubChatDraftKey(chatId, subChatId)
  const draft = globalDrafts[key] as DraftContent | undefined

  if (!draft) return null

  return {
    text: draft.text || null,
    images:
      draft.images
        ?.map(fromDraftImage)
        .filter((img): img is UploadedImage => img !== null) ?? [],
    files:
      draft.files
        ?.map(fromDraftFile)
        .filter((f): f is UploadedFile => f !== null) ?? [],
    textContexts: draft.textContexts?.map(fromDraftTextContext) ?? [],
  }
}

/**
 * Save sub-chat draft with attachments (async version)
 */
export async function saveSubChatDraftWithAttachments(
  chatId: string,
  subChatId: string,
  text: string,
  options?: {
    images?: UploadedImage[]
    files?: UploadedFile[]
    textContexts?: SelectedTextContext[]
  }
): Promise<{ success: boolean; error?: string }> {
  const globalDrafts = loadGlobalDrafts()
  const key = getSubChatDraftKey(chatId, subChatId)

  const hasContent =
    text.trim() ||
    (options?.images?.length ?? 0) > 0 ||
    (options?.files?.length ?? 0) > 0 ||
    (options?.textContexts?.length ?? 0) > 0

  if (!hasContent) {
    delete globalDrafts[key]
    saveGlobalDrafts(globalDrafts)
    return { success: true }
  }

  // Convert attachments to persistable format
  const draftImages =
    options?.images
      ?.map(toDraftImage)
      .filter((img): img is DraftImage => img !== null) ?? []

  const draftFiles = options?.files
    ? await Promise.all(options.files.map(toDraftFile)).then((results) =>
        results.filter((f): f is DraftFile => f !== null)
      )
    : []

  const draftTextContexts = options?.textContexts?.map(toDraftTextContext) ?? []

  const draft: DraftContent = {
    text,
    updatedAt: Date.now(),
    ...(draftImages.length > 0 && { images: draftImages }),
    ...(draftFiles.length > 0 && { files: draftFiles }),
    ...(draftTextContexts.length > 0 && { textContexts: draftTextContexts }),
  }

  // Check storage limits before saving
  if (wouldExceedStorageLimit(globalDrafts, draft)) {
    console.warn(
      "[drafts] Storage limit would be exceeded, skipping attachment persistence"
    )
    // Save without attachments as fallback
    globalDrafts[key] = { text, updatedAt: Date.now() }
    try {
      saveGlobalDrafts(globalDrafts)
      return { success: true, error: "attachments_skipped" }
    } catch {
      return { success: false, error: "storage_full" }
    }
  }

  globalDrafts[key] = draft

  try {
    saveGlobalDrafts(globalDrafts)
    return { success: true }
  } catch (err) {
    console.error("[drafts] Failed to save draft:", err)
    return { success: false, error: "save_failed" }
  }
}

