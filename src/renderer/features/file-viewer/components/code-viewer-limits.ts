export const MONACO_PREVIEW_MAX_BYTES = 512 * 1024
export const PLAIN_CODE_VIRTUALIZE_MIN_LINES = 1_000

export function shouldUseMonacoPreview(byteLength: number | null, content: string | null): boolean {
  const effectiveLength = byteLength ?? content?.length ?? 0
  return effectiveLength <= MONACO_PREVIEW_MAX_BYTES
}

export function getPlainCodeLineCount(content: string): number {
  return content.split("\n").length
}

export function shouldVirtualizePlainCodeBlock(lineCount: number): boolean {
  return lineCount > PLAIN_CODE_VIRTUALIZE_MIN_LINES
}

export function shouldUsePlainCodePreview(byteLength: number | null, content: string | null): boolean {
  if (!shouldUseMonacoPreview(byteLength, content)) {
    return true
  }

  if (content === null) {
    return false
  }

  return shouldVirtualizePlainCodeBlock(getPlainCodeLineCount(content))
}
