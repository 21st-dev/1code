"use client"

import { useAtomValue } from "jotai"
import { Cloud } from "lucide-react"
import { memo } from "react"
import { Button } from "../../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { ClaudeCodeIcon, KeyFilledIcon } from "../../../components/ui/icons"
import {
  billingMethodAtom,
} from "../../../lib/atoms"
import { useAuthMode } from "../hooks/use-auth-mode"

/**
 * Provider Status Badge
 *
 * Shows the active authentication provider in the chat input toolbar:
 * - "Bedrock" with Cloud icon when using AWS Bedrock
 * - "API Key" with Key icon when using direct API key
 * - Nothing for default OAuth mode (keeps UI clean)
 */
export const ProviderStatusBadge = memo(function ProviderStatusBadge() {
  const { isBedrockMode, awsRegion } = useAuthMode()
  const billingMethod = useAtomValue(billingMethodAtom)

  // Only show badge for non-default auth modes
  if (!isBedrockMode && billingMethod !== "api-key" && billingMethod !== "custom-model") {
    return null
  }

  if (isBedrockMode) {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded-md cursor-default"
            aria-label="AWS Bedrock"
          >
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Bedrock</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Connected via AWS Bedrock ({awsRegion})
        </TooltipContent>
      </Tooltip>
    )
  }

  if (billingMethod === "api-key") {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md cursor-default"
            aria-label="API Key"
          >
            <KeyFilledIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>API Key</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Connected via Anthropic API Key
        </TooltipContent>
      </Tooltip>
    )
  }

  if (billingMethod === "custom-model") {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md cursor-default"
            aria-label="Custom Model"
          >
            <ClaudeCodeIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Custom</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Connected via custom model configuration
        </TooltipContent>
      </Tooltip>
    )
  }

  return null
})
