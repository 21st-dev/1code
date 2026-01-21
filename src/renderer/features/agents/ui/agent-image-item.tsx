"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, ImageOff, ChevronLeft, ChevronRight } from "lucide-react"
import { IconSpinner } from "../../../components/ui/icons"
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "../../../components/ui/hover-card"

interface ImageData {
  id: string
  filename: string
  url: string
}

interface AgentImageItemProps {
  id: string
  filename: string
  url: string
  isLoading?: boolean
  onRemove?: () => void
  /** All images in the group for gallery navigation */
  allImages?: ImageData[]
  /** Index of this image in the group */
  imageIndex?: number
}

export function AgentImageItem({
  id,
  filename,
  url,
  isLoading = false,
  onRemove,
  allImages,
  imageIndex = 0,
}: AgentImageItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(imageIndex)

  // Use allImages if provided, otherwise create single-image array
  const images = allImages || [{ id, filename, url }]
  const hasMultipleImages = images.length > 1
  const currentImage = images[currentIndex] || images[0]

  const handleImageError = () => {
    console.warn("[AgentImageItem] Failed to load image:", filename, url)
    setHasError(true)
  }

  const openFullscreen = () => {
    setCurrentIndex(imageIndex)
    setIsFullscreen(true)
  }

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false)
  }, [])

  const goToPrevious = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }, [images.length])

  const goToNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }, [images.length])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          closeFullscreen()
          break
        case "ArrowLeft":
          if (hasMultipleImages) goToPrevious()
          break
        case "ArrowRight":
          if (hasMultipleImages) goToNext()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFullscreen, hasMultipleImages, closeFullscreen, goToPrevious, goToNext])

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isLoading ? (
          <div className="size-8 flex items-center justify-center bg-muted rounded">
            <IconSpinner className="size-4 text-muted-foreground" />
          </div>
        ) : hasError ? (
          <div className="size-8 flex items-center justify-center bg-muted/50 rounded border border-destructive/20" title="Failed to load image">
            <ImageOff className="size-4 text-destructive/50" />
          </div>
        ) : url ? (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <img
                src={url}
                alt={filename}
                className="size-8 object-cover rounded cursor-pointer"
                onClick={openFullscreen}
                onError={handleImageError}
              />
            </HoverCardTrigger>
            <HoverCardContent className="w-auto max-w-72 p-0" side="top">
              <img
                src={url}
                alt={filename}
                className="max-w-72 max-h-72 w-auto h-auto object-contain rounded-[10px]"
                onError={handleImageError}
              />
            </HoverCardContent>
          </HoverCard>
        ) : (
          <div className="size-8 bg-muted rounded flex items-center justify-center">
            <IconSpinner className="size-4 text-muted-foreground" />
          </div>
        )}

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className={`absolute -top-1.5 -right-1.5 size-4 rounded-full bg-background border border-border
                       flex items-center justify-center transition-[opacity,transform] duration-150 ease-out active:scale-[0.97] z-10
                       text-muted-foreground hover:text-foreground
                       ${isHovered ? "opacity-100" : "opacity-0"}`}
            type="button"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Fullscreen overlay with gallery navigation - rendered via portal to escape stacking context */}
      {isFullscreen && currentImage?.url && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeFullscreen}
        >
          {/* Close button */}
          <button
            onClick={closeFullscreen}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
            type="button"
            aria-label="Close fullscreen (Esc)"
          >
            <X className="size-6" />
          </button>

          {/* Previous button */}
          {hasMultipleImages && (
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
              type="button"
              aria-label="Previous image (←)"
            >
              <ChevronLeft className="size-8" />
            </button>
          )}

          {/* Image */}
          <img
            src={currentImage.url}
            alt={currentImage.filename}
            className="max-w-[90vw] max-h-[85vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next button */}
          {hasMultipleImages && (
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
              type="button"
              aria-label="Next image (→)"
            >
              <ChevronRight className="size-8" />
            </button>
          )}

          {/* Image counter and dots */}
          {hasMultipleImages && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
              {/* Dots indicator */}
              <div className="flex gap-2">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCurrentIndex(idx)
                    }}
                    className={`size-2 rounded-full transition-all ${
                      idx === currentIndex
                        ? "bg-white scale-125"
                        : "bg-white/40 hover:bg-white/60"
                    }`}
                    type="button"
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
              {/* Counter text */}
              <span className="text-white/70 text-sm">
                {currentIndex + 1} / {images.length}
              </span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
