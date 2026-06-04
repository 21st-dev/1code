"use client"

import { Loader2 } from "lucide-react"
import { useRef, type ReactNode } from "react"

import { Button } from "../../components/ui/button"
import { MicrophoneIcon } from "../../components/ui/icons"
import { Kbd } from "../../components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { useI18n } from "../i18n"
import { cn } from "../utils"

type VoiceInputControlProps = {
  isRecording?: boolean
  isTranscribing?: boolean
  disabled?: boolean
  className?: string
  hotkeyLabel?: ReactNode
  accent?: "default" | "plan"
  onStart: () => void
  onStop: () => void
  onCancel: () => void
}

export function VoiceInputControl({
  isRecording = false,
  isTranscribing = false,
  disabled = false,
  className,
  hotkeyLabel,
  accent = "default",
  onStart,
  onStop,
  onCancel,
}: VoiceInputControlProps) {
  const { t } = useI18n()
  const pointerStartedRef = useRef(false)
  const stopRequestedRef = useRef(false)

  const accentClass =
    accent === "plan"
      ? "!bg-plan-mode hover:!bg-plan-mode/90 !text-background !shadow-none"
      : "!bg-foreground hover:!bg-foreground/90 !text-background !shadow-none"

  const handleStart = () => {
    if (disabled || isTranscribing) return
    pointerStartedRef.current = true
    stopRequestedRef.current = false
    onStart()
  }

  const handleStop = () => {
    if (
      disabled ||
      !pointerStartedRef.current ||
      stopRequestedRef.current
    ) {
      return
    }
    stopRequestedRef.current = true
    onStop()
  }

  const handleCancel = () => {
    if (
      disabled ||
      !pointerStartedRef.current ||
      stopRequestedRef.current
    ) {
      return
    }
    stopRequestedRef.current = true
    pointerStartedRef.current = false
    onCancel()
  }

  const handleClick = () => {
    if (disabled || isTranscribing) return

    if (!pointerStartedRef.current && !isRecording) {
      handleStart()
      return
    }

    if ((isRecording || pointerStartedRef.current) && !stopRequestedRef.current) {
      stopRequestedRef.current = true
      onStop()
    }
    pointerStartedRef.current = false
  }

  const icon = isTranscribing ? (
    <Loader2 className="size-4 animate-spin" />
  ) : isRecording ? (
    <div className="w-2.5 h-2.5 bg-current rounded-[2px] flex-shrink-0 mx-auto" />
  ) : (
    <MicrophoneIcon className="size-4" />
  )

  const tooltip = isTranscribing ? (
    t("agent.send.transcribing")
  ) : isRecording ? (
    t("agent.send.clickToStop")
  ) : (
    <div className="flex flex-col items-start gap-0.5">
      <span>{t("agent.send.voiceInput")}</span>
      {hotkeyLabel && (
        <span className="text-muted-foreground">
          {typeof hotkeyLabel === "string" ? <Kbd>{hotkeyLabel}</Kbd> : hotkeyLabel}
        </span>
      )}
    </div>
  )

  return (
    <Tooltip delayDuration={1_000} open={isRecording ? false : undefined}>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          className={cn(
            "h-7 w-7 rounded-full transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.97] flex items-center justify-center",
            "shadow-[0_0_0_2px_white,0_0_0_4px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_2px_#1a1a1a,0_0_0_4px_rgba(255,255,255,0.08)]",
            accentClass,
            className,
          )}
          disabled={disabled || isTranscribing}
          type="button"
          onClick={handleClick}
          onMouseDown={handleStart}
          onMouseUp={handleStop}
          onMouseLeave={handleCancel}
          aria-label={
            isTranscribing
              ? t("agent.send.transcribing")
              : isRecording
                ? t("agent.send.stopRecording")
                : t("agent.send.voiceInput")
          }
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{tooltip}</TooltipContent>
    </Tooltip>
  )
}
