// File upload hook for desktop app with base64 conversion for Claude API
import { useState, useCallback } from "react"

export interface UploadedImage {
  id: string
  filename: string
  url: string // blob URL for preview
  base64Data?: string // base64 encoded data for API
  isLoading: boolean
  mediaType?: string // MIME type e.g. "image/png", "image/jpeg"
}

export interface UploadedFile {
  id: string
  filename: string
  url: string
  isLoading: boolean
  size?: number
  type?: string
}

/**
 * Convert a blob URL to base64 data
 */
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data:image/xxx;base64, prefix
      const base64 = result.split(",")[1]
      resolve(base64 || "")
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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

export function useAgentsFileUpload() {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleAddAttachments = useCallback(async (inputFiles: File[]) => {
    setIsUploading(true)

    const imageFiles = inputFiles.filter((f) => f.type.startsWith("image/"))
    const otherFiles = inputFiles.filter((f) => !f.type.startsWith("image/"))

    // Process images with base64 conversion
    const newImages: UploadedImage[] = await Promise.all(
      imageFiles.map(async (file) => {
        const id = crypto.randomUUID()
        const filename = file.name || `screenshot-${Date.now()}.png`
        const mediaType = file.type || "image/png"
        const url = URL.createObjectURL(file)
        
        // Convert to base64 for API
        let base64Data: string | undefined
        try {
          base64Data = await fileToBase64(file)
        } catch (err) {
          console.error("[useAgentsFileUpload] Failed to convert image to base64:", err)
        }

        return {
          id,
          filename,
          url,
          base64Data,
          isLoading: false,
          mediaType,
        }
      })
    )

    const newFiles: UploadedFile[] = otherFiles.map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      url: URL.createObjectURL(file),
      isLoading: false,
      size: file.size,
      type: file.type,
    }))

    setImages((prev) => [...prev, ...newImages])
    setFiles((prev) => [...prev, ...newFiles])
    setIsUploading(false)
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const clearImages = useCallback(() => {
    setImages([])
  }, [])

  const clearFiles = useCallback(() => {
    setFiles([])
  }, [])

  const clearAll = useCallback(() => {
    setImages([])
    setFiles([])
  }, [])

  // Direct state setters for restoring from draft
  const setImagesFromDraft = useCallback((draftImages: UploadedImage[]) => {
    setImages(draftImages)
  }, [])

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
