import { GITHUB_TRIGGER_OPTIONS, LINEAR_TRIGGER_OPTIONS } from "./constants"
import type { TranslationKey } from "@/lib/i18n"

type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>
) => string

export function getTriggerLabel(
  triggerType: string,
  platform: string | undefined,
  t: Translate
): string {
  if (platform === "linear") {
    const trigger = LINEAR_TRIGGER_OPTIONS.find((t) => t.value === triggerType)
    return trigger ? t(trigger.labelKey) : triggerType
  }
  const trigger = GITHUB_TRIGGER_OPTIONS.find((t) => t.value === triggerType)
  return trigger ? t(trigger.labelKey) : triggerType
}

export function getAutomationDescription(
  triggers: Array<{ trigger_type: string; platform?: string }>,
  t: Translate
): string {
  if (triggers.length === 0) return t("automations.description.noTriggers")
  const triggerDescriptions = triggers.map((trigger) => {
    const label = getTriggerLabel(trigger.trigger_type, trigger.platform, t)
    return label
  })
  if (triggerDescriptions.length === 1) {
    return t("automations.description.single", {
      trigger: triggerDescriptions[0]!,
    })
  }
  return t("automations.description.multiple", {
    first: triggerDescriptions[0]!,
    second: triggerDescriptions[1]!,
  })
}
