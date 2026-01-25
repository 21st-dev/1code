import { useEffect, useRef, useState, useCallback } from "react"
import { Presentation, Loader2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"

interface PptPreviewProps {
  filePath: string
  className?: string
}

export function PptPreview({ filePath, className }: PptPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const slidesContainerRef = useRef<HTMLDivElement>(null)
  const slidesRef = useRef<HTMLElement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const previewerRef = useRef<any>(null)

  // Read file as binary via tRPC
  const { data, error: fetchError } = trpc.files.readBinaryFile.useQuery(
    { path: filePath, maxSize: 100 * 1024 * 1024 }, // 100MB max
    { staleTime: 30000 }
  )

  // Animate slide transition
  const animateSlideTransition = useCallback((fromIndex: number, toIndex: number, direction: number) => {
    const slides = slidesRef.current
    if (!slides.length || isAnimating) return

    const fromSlide = slides[fromIndex]
    const toSlide = slides[toIndex]
    if (!fromSlide || !toSlide) return

    setIsAnimating(true)

    // Get slide width for animation offset
    const slideWidth = fromSlide.offsetWidth

    // Set up initial state for incoming slide
    toSlide.style.display = 'block'
    toSlide.style.position = 'absolute'
    toSlide.style.left = `calc(50% + ${direction > 0 ? slideWidth : -slideWidth}px)`
    toSlide.style.transform = 'translateX(-50%)'
    toSlide.style.opacity = '0'
    toSlide.style.transition = 'none'

    // Force reflow
    toSlide.offsetHeight

    // Animate both slides
    requestAnimationFrame(() => {
      fromSlide.style.transition = 'left 0.3s ease-out, opacity 0.3s ease-out'
      toSlide.style.transition = 'left 0.3s ease-out, opacity 0.3s ease-out'

      fromSlide.style.left = `calc(50% + ${direction > 0 ? -slideWidth : slideWidth}px)`
      fromSlide.style.opacity = '0'

      toSlide.style.left = '50%'
      toSlide.style.opacity = '1'

      // Cleanup after animation
      setTimeout(() => {
        fromSlide.style.display = 'none'
        fromSlide.style.left = '50%'
        fromSlide.style.opacity = ''
        fromSlide.style.transition = ''
        fromSlide.style.position = 'absolute'

        toSlide.style.transition = ''
        toSlide.style.position = 'relative'

        setIsAnimating(false)
      }, 300)
    })
  }, [isAnimating])

  // Navigation handlers
  const goToSlide = useCallback((index: number, direction: number) => {
    if (index >= 0 && index < totalSlides && index !== currentSlide && !isAnimating) {
      animateSlideTransition(currentSlide, index, direction)
      setCurrentSlide(index)
    }
  }, [totalSlides, currentSlide, isAnimating, animateSlideTransition])

  const nextSlide = useCallback(() => {
    goToSlide(currentSlide + 1, 1)
  }, [currentSlide, goToSlide])

  const prevSlide = useCallback(() => {
    goToSlide(currentSlide - 1, -1)
  }, [currentSlide, goToSlide])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        nextSlide()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        prevSlide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextSlide, prevSlide])

  // Initialize previewer and load PPTX when data is available
  useEffect(() => {
    if (fetchError) {
      setHasError(true)
      setErrorMessage(fetchError.message)
      setIsLoading(false)
      return
    }

    if (!data || !containerRef.current) return

    const loadPptx = async () => {
      try {
        // Convert base64 to ArrayBuffer
        const binaryString = atob(data.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const arrayBuffer = bytes.buffer

        // Dynamically import pptx-preview
        const { init } = await import("pptx-preview")

        // Get container dimensions
        const container = containerRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        // Use available space with some padding
        const availableHeight = rect.height - 20
        const availableWidth = rect.width - 20

        // Calculate dimensions maintaining 16:9 aspect ratio
        const aspectRatio = 16 / 9
        let width = availableWidth
        let height = width / aspectRatio

        if (height > availableHeight) {
          height = availableHeight
          width = height * aspectRatio
        }

        // Create a wrapper div for slides
        const slidesWrapper = document.createElement('div')
        slidesWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; position: relative; overflow: hidden;'
        slidesContainerRef.current = slidesWrapper
        container.appendChild(slidesWrapper)

        // Initialize previewer with calculated size
        const slideWidth = Math.max(width, 400)
        const slideHeight = Math.max(height, 225)

        previewerRef.current = init(slidesWrapper, {
          width: slideWidth,
          height: slideHeight,
        })

        // Preview the PPTX file
        await previewerRef.current.preview(arrayBuffer)

        // Find the main wrapper and disable its scrolling
        const pptxWrapper = slidesWrapper.querySelector<HTMLElement>('.pptx-preview-wrapper')
        if (pptxWrapper) {
          pptxWrapper.style.overflow = 'hidden'
          pptxWrapper.style.background = 'transparent'
          pptxWrapper.style.position = 'relative'
        }

        // Find slides by class name - pptx-preview uses 'pptx-preview-slide-wrapper' class
        const slides = slidesWrapper.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper')
        const slideCount = slides.length
        setTotalSlides(slideCount)

        // Store slides reference for navigation
        slidesRef.current = Array.from(slides)

        // Style and hide all slides except the first one
        slides.forEach((slide, index) => {
          slide.style.display = index === 0 ? 'block' : 'none'
          slide.style.position = index === 0 ? 'relative' : 'absolute'
          slide.style.top = '0'
          slide.style.left = '50%'
          slide.style.transform = index === 0 ? 'translateX(-50%)' : 'translateX(-50%)'
          slide.style.margin = '0'
          // Add some styling for better appearance
          slide.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)'
          slide.style.borderRadius = '4px'
        })

        setCurrentSlide(0)
        setIsLoading(false)
      } catch (err) {
        console.error("[PptPreview] Failed to preview PPTX:", err)
        setHasError(true)
        setErrorMessage(err instanceof Error ? err.message : "Preview failed")
        setIsLoading(false)
      }
    }

    loadPptx()

    // Cleanup
    return () => {
      if (previewerRef.current?.destroy) {
        previewerRef.current.destroy()
      }
      previewerRef.current = null
      slidesRef.current = []
      if (slidesContainerRef.current && containerRef.current) {
        containerRef.current.removeChild(slidesContainerRef.current)
      }
      slidesContainerRef.current = null
    }
  }, [data, fetchError])

  // Open file in external app
  const handleOpenExternal = () => {
    if (window.desktopApi?.openPath) {
      window.desktopApi.openPath(filePath)
    }
  }

  if (hasError) {
    return (
      <div className={cn("h-full w-full flex flex-col items-center justify-center gap-4 text-muted-foreground", className)}>
        <Presentation className="h-12 w-12 opacity-40" />
        <div className="text-center">
          <p className="text-sm">Unable to preview PPT file</p>
          {errorMessage && (
            <p className="text-xs text-muted-foreground/60 max-w-[300px] mt-1">
              {errorMessage}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleOpenExternal}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Open with external app
        </Button>
      </div>
    )
  }

  return (
    <div className={cn("h-full w-full flex flex-col overflow-hidden", className)}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading presentation...</p>
        </div>
      )}

      {/* Slide container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden bg-muted/30"
      />

      {/* Navigation bar */}
      {!isLoading && totalSlides > 0 && (
        <div className="flex items-center justify-center gap-4 py-3 px-4 border-t bg-background flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={prevSlide}
            disabled={currentSlide === 0 || isAnimating}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 min-w-[100px] justify-center">
            <span className="text-sm font-medium">{currentSlide + 1}</span>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">{totalSlides}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={nextSlide}
            disabled={currentSlide === totalSlides - 1 || isAnimating}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
