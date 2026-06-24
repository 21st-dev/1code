export function normalizeCodexRuntimeComparableText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

export function isCodexRuntimeNoticeText(value: unknown): boolean {
  const text = normalizeCodexRuntimeComparableText(value)
  return (
    (text.startsWith("Under-development features enabled: ") &&
      text.includes(
        "Under-development features are incomplete and may behave unpredictably.",
      ) &&
      text.includes("suppress_unstable_features_warning = true") &&
      text.includes("/.codex/config.toml")) ||
    (text.startsWith("Exceeded skills context budget of ") &&
      text.includes("All skill descriptions were removed") &&
      text.includes("model-visible skills list")) ||
    (text.startsWith("Reconnecting...") &&
      text.includes("stream disconnected before completion"))
  )
}

export function stripCodexRuntimeNoticeText(value: unknown): {
  text: string
  changed: boolean
} {
  const original = typeof value === "string" ? value : String(value ?? "")
  if (!original) return { text: original, changed: false }

  const lines = original.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  let changed = false
  const keptLines: string[] = []

  for (const line of lines) {
    if (isCodexRuntimeNoticeText(line)) {
      changed = true
      continue
    }
    keptLines.push(line)
  }

  if (!changed && isCodexRuntimeNoticeText(original)) {
    return { text: "", changed: true }
  }

  if (!changed) return { text: original, changed: false }

  const text = keptLines
    .join("\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/\n{3,}/g, "\n\n")

  return {
    text,
    changed: true,
  }
}
