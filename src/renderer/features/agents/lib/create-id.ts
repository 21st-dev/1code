/**
 * Generate a unique ID (cuid-like)
 */
export function createId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 10)
  return `${timestamp}${randomPart}`
}
