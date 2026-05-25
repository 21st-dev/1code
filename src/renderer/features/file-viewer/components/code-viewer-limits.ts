export const MONACO_PREVIEW_MAX_BYTES = 512 * 1024

export function shouldUseMonacoPreview(byteLength: number | null, content: string | null): boolean {
  const effectiveLength = byteLength ?? content?.length ?? 0
  return effectiveLength <= MONACO_PREVIEW_MAX_BYTES
}
