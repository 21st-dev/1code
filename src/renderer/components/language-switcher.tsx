import { cn } from "../lib/utils"
import {
  useI18n,
  type ResolvedLanguage,
} from "../lib/i18n"
import type { AppLanguagePreference } from "../lib/atoms"

const LANGUAGE_OPTIONS: Array<{
  value: AppLanguagePreference
  labelKey: "language.systemShort" | "language.english" | "language.simplifiedChineseShort"
}> = [
  { value: "system", labelKey: "language.systemShort" },
  { value: "en", labelKey: "language.english" },
  { value: "zh-CN", labelKey: "language.simplifiedChineseShort" },
]

function isResolvedMatch(
  preference: AppLanguagePreference,
  resolvedLanguage: ResolvedLanguage,
) {
  return preference !== "system" && preference === resolvedLanguage
}

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const {
    languagePreference,
    resolvedLanguage,
    setLanguagePreference,
    t,
  } = useI18n()

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full bg-muted p-1",
        compact && "shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]",
        className,
      )}
      aria-label={t("language.label")}
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const isActive = languagePreference === option.value
        const isSystemResolved =
          languagePreference === "system" &&
          isResolvedMatch(option.value, resolvedLanguage)

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLanguagePreference(option.value)}
            className={cn(
              "rounded-full font-medium transition-colors",
              compact ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              isSystemResolved && "text-foreground",
            )}
          >
            {t(option.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
