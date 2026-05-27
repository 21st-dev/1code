const DEFAULT_CHAT_NAMES = new Set(["New Chat", "新对话"])

export function isDefaultChatName(name?: string | null): boolean {
  const normalized = name?.trim()
  return !normalized || DEFAULT_CHAT_NAMES.has(normalized)
}

export function getDisplayChatName(
  name: string | null | undefined,
  fallback: string,
): string {
  return isDefaultChatName(name) ? fallback : name!.trim()
}
