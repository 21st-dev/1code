"use client"

import { useEffect, useRef } from "react"
import { cn } from "../../../lib/utils"

interface VoiceWaveIndicatorProps {
  isRecording: boolean
  audioLevel: number // 0-1 normalized audio level
  className?: string
}

/**
 * Animated sound wave indicator that visualizes audio input
 * Shows animated bars that respond to real audio levels
 */
export function VoiceWaveIndicator({
  isRecording,
  audioLevel,
  className,
}: VoiceWaveIndicatorProps) {
  const barsRef = useRef<HTMLDivElement[]>([])

  useEffect(() => {
    if (!isRecording) {
      // Reset bar heights when not recording
      barsRef.current.forEach((bar) => {
        if (bar) bar.style.height = "15%"
      })
      return
    }

    // Update bars based on audio level
    // Create a natural wave pattern with slight variations
    barsRef.current.forEach((bar, index) => {
      if (!bar) return

      // Create wave pattern - center bars are taller
      const centerFactor = 1 - Math.abs(index - 2) * 0.12 // 0,1,2,3,4 -> factors 0.76, 0.88, 1, 0.88, 0.76

      // Add slight randomness for organic feel
      const randomVariation = 0.9 + Math.random() * 0.2

      // Calculate height: minimum 10%, scale up to 100% based on audio level
      const baseHeight = 10
      const maxHeight = 100
      const levelHeight = audioLevel * (maxHeight - baseHeight) * centerFactor * randomVariation
      const finalHeight = baseHeight + levelHeight

      bar.style.height = `${finalHeight}%`
    })
  }, [isRecording, audioLevel])

  if (!isRecording) return null

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-[3px] h-5 px-2",
        className
      )}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) barsRef.current[i] = el
          }}
          className="w-[3px] bg-foreground rounded-full transition-[height] duration-75 ease-out"
          style={{ height: "15%" }}
        />
      ))}
    </div>
  )
}
