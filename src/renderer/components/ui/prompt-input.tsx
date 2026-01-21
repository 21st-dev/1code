"use client"

import { Textarea } from "./textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip"
import { cn } from "../../lib/utils"
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  forwardRef,
} from "react"

type PromptInputContextType = {
  isLoading: boolean
  value: string
  setValue: (_value: string) => void
  maxHeight: number | string
  onSubmit?: () => void
  disabled?: boolean
  selectedVariant?: {
    id: string
    name: string
  } | null
  contextItems?: React.ReactNode
}

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  selectedVariant: null,
  contextItems: null,
})

function usePromptInput() {
  const context = useContext(PromptInputContext)
  if (!context) {
    throw new Error("usePromptInput must be used within a PromptInput")
  }
  return context
}

type PromptInputProps = {
  isLoading?: boolean
  value?: string
  onValueChange?: (_value: string) => void
  maxHeight?: number | string
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
  selectedVariant?: {
    id: string
    name: string
  } | null
  contextItems?: React.ReactNode
}

function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onSubmit,
  children,
  selectedVariant,
  contextItems,
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(value || "")

  const handleChange = (newValue: string) => {
    setInternalValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <PromptInputContext.Provider
      value={{
        isLoading,
        value: value ?? internalValue,
        setValue: onValueChange ?? handleChange,
        maxHeight,
        onSubmit,
        selectedVariant,
        contextItems,
      }}
    >
      <div className={cn("flex flex-col gap-2", className)}>{children}</div>
    </PromptInputContext.Provider>
  )
}

export type PromptInputTextareaProps = {
  disableAutosize?: boolean
} & React.ComponentProps<typeof Textarea>

const PromptInputTextareaInner = (
  {
    className,
    onKeyDown,
    disableAutosize = false,
    ...props
  }: PromptInputTextareaProps,
  forwardedRef: React.Ref<HTMLTextAreaElement>,
) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Expose internal ref
  useEffect(() => {
    if (!forwardedRef) return
    if (typeof forwardedRef === "function") {
      forwardedRef(textareaRef.current)
    } else if (forwardedRef) {
      ;(
        forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>
      ).current = textareaRef.current
    }
  }, [forwardedRef])

  useLayoutEffect(() => {
    if (disableAutosize || !textareaRef.current) return

    const textarea = textareaRef.current
    // Reset height to auto to measure correctly
    textarea.style.height = "auto"

    const scrollHeight = textarea.scrollHeight
    const maxHeightPx =
      typeof maxHeight === "number"
        ? maxHeight
        : parseInt(maxHeight as string, 10) || 240

    const newHeight = Math.min(scrollHeight, maxHeightPx)
    textarea.style.height = `${newHeight}px`
    textarea.style.overflowY = scrollHeight > maxHeightPx ? "auto" : "hidden"
  }, [value, disableAutosize, maxHeight])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent submission during IME composition (e.g., Chinese/Japanese/Korean input)
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSubmit?.()
    }
    onKeyDown?.(e)
  }

  const maxHeightStyle =
    typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "min-h-[44px] w-full resize-none border-none bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
        className,
      )}
      style={{
        maxHeight: maxHeightStyle,
        overflowY: "hidden",
      }}
      rows={1}
      disabled={disabled}
      {...props}
    />
  )
}

const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(PromptInputTextareaInner)

PromptInputTextarea.displayName = "PromptInputTextarea"

type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>

function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  )
}

type PromptInputActionProps = {
  className?: string
  tooltip: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
} & React.ComponentProps<typeof Tooltip>

function PromptInputAction({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}: PromptInputActionProps) {
  const { disabled } = usePromptInput()

  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

// Used for displaying context items (components, shapes, etc.) that are added to the chat context
function PromptInputContextItems() {
  const { contextItems } = usePromptInput()

  if (!contextItems) return null

  return <>{contextItems}</>
}

// Used for displaying the selected variant context
function PromptInputVariantContext() {
  const { selectedVariant } = usePromptInput()

  if (!selectedVariant) return null

  return (
    <div className="mx-2 mt-1">
      <div className="inline-flex items-center gap-1 px-1.5 py-1 bg-muted text-foreground rounded-md">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="flex-shrink-0"
        >
          <path
            d="M5.58953 0.937438C5.26408 0.612 4.73645 0.612 4.41099 0.937438L3.54193 1.80652C3.21649 2.13195 3.21649 2.65959 3.54193 2.98502L4.41099 3.8541C4.73645 4.17954 5.26408 4.17954 5.58953 3.8541L6.45862 2.98502C6.78403 2.65959 6.78403 2.13195 6.45858 1.80652L5.58953 0.937438Z"
            fill="currentColor"
            fillOpacity="0.8"
          />
          <path
            d="M2.98502 3.54156C2.65959 3.21613 2.13195 3.21613 1.80652 3.54156L0.937438 4.41063C0.612 4.73608 0.612 5.26371 0.937438 5.58917L1.80652 6.45825C2.13195 6.78367 2.65959 6.78367 2.98502 6.45821L3.8541 5.58917C4.17954 5.26371 4.17954 4.73608 3.8541 4.41063L2.98502 3.54156Z"
            fill="currentColor"
            fillOpacity="0.8"
          />
          <path
            d="M8.19306 3.54156C7.8676 3.21613 7.33997 3.21613 7.01451 3.54156L6.14543 4.41063C5.82001 4.73608 5.82001 5.26371 6.14543 5.58917L7.01451 6.45825C7.33997 6.78367 7.8676 6.78367 8.19306 6.45821L9.06214 5.58917C9.38756 5.26371 9.38755 4.73608 9.0621 4.41063L8.19306 3.54156Z"
            fill="currentColor"
            fillOpacity="0.8"
          />
          <path
            d="M5.58953 6.1458C5.26408 5.82038 4.73645 5.82038 4.41099 6.1458L3.54193 7.01488C3.21649 7.34034 3.21649 7.86796 3.54193 8.19342L4.41099 9.0625C4.73645 9.38792 5.26408 9.38792 5.58953 9.06246L6.45862 8.19342C6.78403 7.86796 6.78403 7.34034 6.45858 7.01488L5.58953 6.1458Z"
            fill="currentColor"
            fillOpacity="0.8"
          />
        </svg>
        <span className="truncate text-[10px]">{selectedVariant.name}</span>
      </div>
    </div>
  )
}

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
  PromptInputContextItems,
  PromptInputVariantContext,
}
