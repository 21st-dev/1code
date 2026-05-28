import { useState, useCallback } from "react"
import { toast } from "sonner"
import {
  CHAT_IMAGE_MAX_COUNT,
  getChatImageMediaTypeForExtension,
  isSupportedChatImageMediaType,
  type ChatImageAttachmentSource,
  type ChatImageAttachmentStatus,
  type ChatImageMediaType,
} from "../../../../shared/chat-attachments"
import { trpcClient } from "../../../lib/trpc"

export interface UploadedImage {
  id: string
  kind?: "image"
  source?: ChatImageAttachmentSource
  filename: string
  url: string // blob URL for preview
  base64Data?: string // legacy data-image compatibility only; new images use localRef
  localRef?: string
  attachmentId?: string
  sizeBytes?: number
  width?: number
  height?: number
  sha256?: string
  isLoading: boolean
  mediaType?: string // MIME type e.g. "image/png", "image/jpeg"
  status?: ChatImageAttachmentStatus
  error?: string
}

export interface UploadedFile {
  id: string
  filename: string
  url: string
  isLoading: boolean
  size?: number
  type?: string
  mediaType?: string
}

/**
 * Convert a File to base64 data
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data:image/xxx;base64, prefix
      const base64 = result.split(",")[1]
      resolve(base64 || "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function inferImageMediaType(file: File): ChatImageMediaType | null {
  if (isSupportedChatImageMediaType(file.type)) return file.type
  const extension = file.name.includes(".")
    ? `.${file.name.split(".").pop()?.toLowerCase()}`
    : undefined
  return getChatImageMediaTypeForExtension(extension)
}

function getImageDimensions(url: string): Promise<{
  width?: number
  height?: number
}> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => resolve({})
    img.src = url
  })
}

export function useAgentsFileUpload(options?: {
  chatId?: string
  subChatId?: string
}) {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const hydrateLocalImage = useCallback(async (image: UploadedImage) => {
    if (!image.localRef || image.url) return

    try {
      const dataUrl = await trpcClient.chatAttachments.getImageDataUrl.query({
        localRef: image.localRef,
        mediaType: image.mediaType,
      })
      setImages((prev) =>
        prev.map((item) =>
          item.id === image.id
            ? { ...item, url: dataUrl, isLoading: false, status: "ready" }
            : item,
        ),
      )
    } catch (error) {
      setImages((prev) =>
        prev.map((item) =>
          item.id === image.id
            ? {
                ...item,
                isLoading: false,
                status: "failed",
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to load image preview",
              }
            : item,
        ),
      )
    }
  }, [])

  const handleAddAttachments = useCallback(async (
    inputFiles: File[],
    source: ChatImageAttachmentSource = "file-picker",
  ) => {
    setIsUploading(true)

    const imageFiles: File[] = []
    const otherFiles: File[] = []
    const unsupportedImages: File[] = []

    for (const file of inputFiles) {
      const mediaType = inferImageMediaType(file)
      if (mediaType) {
        imageFiles.push(file)
      } else if (file.type.startsWith("image/")) {
        unsupportedImages.push(file)
      } else {
        otherFiles.push(file)
      }
    }

    if (unsupportedImages.length > 0) {
      toast.error("Unsupported image type", {
        description: "Supported formats: PNG, JPEG, WEBP, GIF, BMP.",
      })
    }

    const availableImageSlots = Math.max(0, CHAT_IMAGE_MAX_COUNT - images.length)
    const imagesToStage = imageFiles.slice(0, availableImageSlots)
    if (imageFiles.length > imagesToStage.length) {
      toast.error("Too many images", {
        description: `Attach up to ${CHAT_IMAGE_MAX_COUNT} images per message.`,
      })
    }

    await Promise.all(
      imagesToStage.map(async (file) => {
        const id = crypto.randomUUID()
        const filename = file.name || `screenshot-${Date.now()}.png`
        const mediaType = inferImageMediaType(file) || "image/png"
        const url = URL.createObjectURL(file)

        const pendingImage: UploadedImage = {
          id,
          kind: "image",
          source,
          filename,
          url,
          isLoading: true,
          mediaType,
          sizeBytes: file.size,
          status: "staging",
        }

        setImages((prev) => [...prev, pendingImage])

        try {
          const [base64Data, dimensions] = await Promise.all([
            fileToBase64(file),
            getImageDimensions(url),
          ])
          const staged = await trpcClient.chatAttachments.stageImage.mutate({
            chatId: options?.chatId,
            subChatId: options?.subChatId || "draft",
            base64Data,
            filename,
            mediaType,
            source,
            width: dimensions.width,
            height: dimensions.height,
          })

          setImages((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    attachmentId: staged.id,
                    localRef: staged.localRef,
                    filename: staged.filename,
                    mediaType: staged.mediaType,
                    sizeBytes: staged.sizeBytes,
                    width: staged.width,
                    height: staged.height,
                    sha256: staged.sha256,
                    isLoading: false,
                    status: "ready",
                  }
                : item,
            ),
          )
        } catch (err) {
          console.error("[useAgentsFileUpload] Failed to stage image:", err)
          setImages((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    isLoading: false,
                    status: "failed",
                    error:
                      err instanceof Error ? err.message : "Failed to stage image",
                  }
                : item,
            ),
          )
        }
      }),
    )

    const newFiles: UploadedFile[] = otherFiles.map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      url: URL.createObjectURL(file),
      isLoading: false,
      size: file.size,
      type: file.type,
      mediaType: file.type,
    }))

    setFiles((prev) => [...prev, ...newFiles])
    setIsUploading(false)
  }, [images.length, options?.chatId, options?.subChatId])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const image = prev.find((img) => img.id === id)
      if (image?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(image.url)
      }
      if (image?.localRef) {
        void trpcClient.chatAttachments.deleteImage
          .mutate({ localRef: image.localRef })
          .catch(() => undefined)
      }
      return prev.filter((img) => img.id !== id)
    })
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((item) => item.id === id)
      if (file?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(file.url)
      }
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const clearImages = useCallback(() => {
    setImages((prev) => {
      for (const image of prev) {
        if (image.url?.startsWith("blob:")) {
          URL.revokeObjectURL(image.url)
        }
      }
      return []
    })
  }, [])

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      for (const file of prev) {
        if (file.url?.startsWith("blob:")) {
          URL.revokeObjectURL(file.url)
        }
      }
      return []
    })
  }, [])

  const clearAll = useCallback(() => {
    clearImages()
    clearFiles()
  }, [clearFiles, clearImages])

  // Direct state setters for restoring from draft
  const setImagesFromDraft = useCallback((draftImages: UploadedImage[]) => {
    setImages(draftImages)
    for (const image of draftImages) {
      void hydrateLocalImage(image)
    }
  }, [hydrateLocalImage])

  const setFilesFromDraft = useCallback((draftFiles: UploadedFile[]) => {
    setFiles(draftFiles)
  }, [])

  return {
    images,
    files,
    handleAddAttachments,
    removeImage,
    removeFile,
    clearImages,
    clearFiles,
    clearAll,
    isUploading,
    setImagesFromDraft,
    setFilesFromDraft,
  }
}
