"use client"

import { useCallback, useState } from "react"
import { Button } from "../../../components/ui/button"
import { IconSpinner } from "../../../components/ui/icons"
import { Input } from "../../../components/ui/input"
import { useI18n } from "../../../lib/i18n"

type ClaudeCodeAuthCodeFormProps = {
  disabled?: boolean
  isSubmitting?: boolean
  onSubmitCode: (code: string) => Promise<boolean>
}

export function ClaudeCodeAuthCodeForm({
  disabled = false,
  isSubmitting = false,
  onSubmitCode,
}: ClaudeCodeAuthCodeFormProps) {
  const { t } = useI18n()
  const [code, setCode] = useState("")
  const trimmedCode = code.trim()

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!trimmedCode || disabled || isSubmitting) return

      const submitted = await onSubmitCode(trimmedCode)
      if (submitted) {
        setCode("")
      }
    },
    [disabled, isSubmitting, onSubmitCode, trimmedCode],
  )

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <Input
        aria-label={t("onboarding.claude.pasteCode")}
        autoComplete="one-time-code"
        className="h-9 min-w-0 flex-1 font-mono text-xs"
        disabled={disabled || isSubmitting}
        onChange={(event) => setCode(event.target.value)}
        placeholder={t("onboarding.claude.pasteCode")}
        spellCheck={false}
        type="password"
        value={code}
      />
      <Button
        className="h-9 shrink-0 px-3"
        disabled={!trimmedCode || disabled || isSubmitting}
        type="submit"
      >
        {isSubmitting ? (
          <IconSpinner className="h-4 w-4" />
        ) : (
          t("onboarding.claude.submitCode")
        )}
      </Button>
    </form>
  )
}
