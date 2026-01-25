"use client"

import { Button } from "../../../components/ui/button"
import { ArrowUp, Loader2 } from "lucide-react"
import {
  EnterIcon,
  IconSpinner,
  MicrophoneIcon,
} from "../../../components/ui/icons"
import { Kbd } from "../../../components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { useResolvedHotkeyDisplayWithAlt, useResolvedHotkeyDisplay } from "../../../lib/hotkeys"
import { cn } from "../../../lib/utils"

interface AgentSendButtonProps {
  /** Whether the system is currently streaming */
  isStreaming?: boolean
  /** Whether the system is currently submitting/generating */
  isSubmitting?: boolean
  /** Whether the button should be disabled */
  disabled?: boolean
  /** Main click handler */
  onClick: () => void
  /** Optional stop handler for streaming state */
  onStop?: () => void
  /** Additional CSS classes */
  className?: string
  /** Button size */
  size?: "sm" | "default" | "lg"
  /** Custom aria-label */
  ariaLabel?: string
  /** Whether this is plan mode (orange styling) */
  isPlanMode?: boolean
  /** Whether input has content (used during streaming to show send-to-queue arrow) */
  hasContent?: boolean
  /** Whether to show voice input mode (mic icon when no content) */
  showVoiceInput?: boolean
  /** Whether voice is currently recording */
  isRecording?: boolean
  /** Whether voice is currently transcribing */
  isTranscribing?: boolean
  /** Mouse down handler for voice recording */
  onVoiceMouseDown?: () => void
  /** Mouse up handler for voice recording */
  onVoiceMouseUp?: () => void
  /** Mouse leave handler for voice recording */
  onVoiceMouseLeave?: () => void
}

export function AgentSendButton({
  isStreaming = false,
  isSubmitting = false,
  disabled = false,
  onClick,
  onStop,
  className = "",
  size = "sm",
  ariaLabel,
  isPlanMode = false,
  hasContent = false,
  showVoiceInput = false,
  isRecording = false,
  isTranscribing = false,
  onVoiceMouseDown,
  onVoiceMouseUp,
  onVoiceMouseLeave,
}: AgentSendButtonProps) {
  // Resolved hotkeys for stop-generation tooltip
  const stopHotkey = useResolvedHotkeyDisplayWithAlt("stop-generation")
  // Resolved hotkey for voice input
  const voiceHotkey = useResolvedHotkeyDisplay("voice-input")

  // Note: Enter shortcut is now handled by input components directly

  // When streaming AND user has typed content, show arrow to add to queue
  // Otherwise during streaming, show stop button
  const shouldShowQueueArrow = isStreaming && hasContent

  // Determine the actual click handler based on state
  const handleClick = () => {
    if (isStreaming && !hasContent && onStop) {
      // Stop only when streaming and no content to queue
      onStop()
    } else {
      // Send (or add to queue if streaming)
      onClick()
    }
  }

  // Check if currently in voice mode (showing mic/stop when no content)
  const isVoiceMode = showVoiceInput && !isStreaming && !hasContent

  // Determine if button should be disabled
  // During streaming with content, enable the button for queue
  // In voice mode, button should always be enabled (unless transcribing)
  const isDisabled = isVoiceMode ? false : (isStreaming ? false : disabled)

  // Determine icon to show
  const getIcon = () => {
    // Voice input mode: show mic/stop when no content and not streaming
    if (isVoiceMode) {
      if (isTranscribing) {
        return <Loader2 className="size-4 animate-spin" />
      }
      if (isRecording) {
        // Show stop icon during recording
        return (
          <div className="w-2.5 h-2.5 bg-current rounded-[2px] flex-shrink-0 mx-auto" />
        )
      }
      return <MicrophoneIcon className="size-4" />
    }
    if (isStreaming && !hasContent) {
      return (
        <div className="w-2.5 h-2.5 bg-current rounded-[2px] flex-shrink-0 mx-auto" />
      )
    }
    if (isSubmitting) {
      return <IconSpinner className="size-4" />
    }
    return <ArrowUp className="size-4" />
  }

  // Determine tooltip content
  const getTooltipContent = () => {
    // Voice input mode
    if (isVoiceMode) {
      if (isTranscribing) return "Transcribing..."
      if (isRecording) return "Click to stop"
      return (
        <div className="flex flex-col items-start gap-0.5">
          <span>Voice input</span>
          {voiceHotkey && (
            <span className="text-muted-foreground">{voiceHotkey}</span>
          )}
        </div>
      )
    }
    if (isStreaming && !hasContent)
      return (
        <span className="flex items-center gap-1">
          Stop
          {stopHotkey.primary && <Kbd className="ms-0.5">{stopHotkey.primary}</Kbd>}
          {stopHotkey.alt && (
            <>
              <span className="text-muted-foreground/60">or</span>
              <Kbd className="-me-1">{stopHotkey.alt}</Kbd>
            </>
          )}
        </span>
      )
    if (isStreaming && hasContent)
      return (
        <span className="flex items-center gap-1">
          Add to queue
          <Kbd className="ms-0.5">
            <EnterIcon className="size-2.5 inline" />
          </Kbd>
          <span className="text-muted-foreground/60">or</span>
          Send now
          <Kbd className="ms-0.5">Alt</Kbd>
          <Kbd className="-me-1">
            <EnterIcon className="size-2.5 inline" />
          </Kbd>
        </span>
      )
    if (isSubmitting) return "Generating..."
    return (
      <div className="flex flex-col items-start gap-0.5">
        <div className="flex items-center gap-1">
          <span>Send</span>
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Kbd>
              <EnterIcon className="size-2.5 inline" />
            </Kbd>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span>Send now</span>
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Kbd>Alt</Kbd>
            <Kbd>
              <EnterIcon className="size-2.5 inline" />
            </Kbd>
          </span>
        </div>
      </div>
    )
  }

  // Determine aria-label
  const getAriaLabel = () => {
    if (ariaLabel) return ariaLabel
    if (isVoiceMode) {
      if (isTranscribing) return "Transcribing..."
      if (isRecording) return "Stop recording"
      return "Voice input"
    }
    if (isStreaming && !hasContent) return "Stop generation"
    if (isStreaming && hasContent) return "Add to queue"
    if (isSubmitting) return "Generating..."
    return "Send message"
  }

  // Apply glow effect when button is active and ready to send/queue
  // Also apply for voice mode when not recording/transcribing
  const shouldShowGlow =
    ((!isStreaming && !isSubmitting && !disabled) || shouldShowQueueArrow) &&
    !isRecording

  const glowClass = shouldShowGlow
    ? "shadow-[0_0_0_2px_white,0_0_0_4px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_2px_#1a1a1a,0_0_0_4px_rgba(255,255,255,0.08)]"
    : undefined

  // Mode-specific styling (agent=foreground, plan=orange)
  // Recording state uses same styling as normal mode (wave indicator shows recording state)
  const modeClass = isPlanMode
    ? "!bg-plan-mode hover:!bg-plan-mode/90 !text-background !shadow-none"
    : "!bg-foreground hover:!bg-foreground/90 !text-background !shadow-none"

  // Handle button interactions for voice mode
  // Supports both hold-to-talk AND click-to-toggle
  const handleMouseDown = () => {
    if (isVoiceMode && !isRecording && onVoiceMouseDown) {
      onVoiceMouseDown()
    }
  }

  const handleMouseUp = () => {
    // Only handle mouseUp for hold-to-talk if we started recording on mouseDown
    // Click-to-toggle is handled in handleButtonClick
  }

  const handleMouseLeave = () => {
    if (isVoiceMode && isRecording && onVoiceMouseLeave) {
      onVoiceMouseLeave()
    }
  }

  const handleButtonClick = () => {
    // In voice mode: if recording, stop it; if not recording, start it
    if (isVoiceMode) {
      if (isRecording && onVoiceMouseUp) {
        onVoiceMouseUp()
      }
      // Starting is handled by mouseDown
      return
    }
    handleClick()
  }

  // Hide tooltip during recording so wave indicator is visible
  const tooltipOpen = isRecording ? false : undefined

  return (
    <Tooltip delayDuration={1_000} open={tooltipOpen}>
      <TooltipTrigger asChild>
        <Button
          size={size}
          className={`h-7 w-7 rounded-full transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] flex items-center justify-center ${glowClass || ""} ${modeClass} ${className}`}
          disabled={isDisabled || isTranscribing}
          type="button"
          onClick={handleButtonClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          aria-label={getAriaLabel()}
        >
          {getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{getTooltipContent()}</TooltipContent>
    </Tooltip>
  )
}

