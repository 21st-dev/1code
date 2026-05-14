import { useAtom } from "jotai"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import {
  appLanguagePreferenceAtom,
  type AppLanguagePreference,
} from "../atoms"
import { en, zhCN, type TranslationKey } from "./dictionaries"

export type ResolvedLanguage = "en" | "zh-CN"
type TranslationValues = Record<string, string | number>

type I18nContextValue = {
  languagePreference: AppLanguagePreference
  resolvedLanguage: ResolvedLanguage
  setLanguagePreference: (language: AppLanguagePreference) => void
  t: (key: TranslationKey, values?: TranslationValues) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getSystemLanguage(): ResolvedLanguage {
  if (typeof navigator === "undefined") return "en"
  const locale = navigator.language || navigator.languages?.[0] || "en"
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
}

function resolveLanguage(preference: AppLanguagePreference): ResolvedLanguage {
  if (preference === "system") return getSystemLanguage()
  return preference
}

function interpolate(template: string, values?: TranslationValues) {
  if (!values) return template

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [languagePreference, setLanguagePreference] = useAtom(
    appLanguagePreferenceAtom,
  )
  const resolvedLanguage = resolveLanguage(languagePreference)

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => {
      const template =
        resolvedLanguage === "zh-CN" ? zhCN[key] ?? en[key] : en[key]
      return interpolate(template, values)
    },
    [resolvedLanguage],
  )

  const value = useMemo(
    () => ({
      languagePreference,
      resolvedLanguage,
      setLanguagePreference,
      t,
    }),
    [languagePreference, resolvedLanguage, setLanguagePreference, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider")
  }
  return context
}

export type { TranslationKey }
