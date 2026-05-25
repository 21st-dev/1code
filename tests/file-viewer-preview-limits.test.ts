import { describe, expect, test } from "bun:test"

import {
  MONACO_PREVIEW_MAX_BYTES,
  PLAIN_CODE_VIRTUALIZE_MIN_LINES,
  getPlainCodeLineCount,
  shouldUseMonacoPreview,
  shouldUsePlainCodePreview,
  shouldVirtualizePlainCodeBlock,
} from "../src/renderer/features/file-viewer/components/code-viewer-limits"

describe("file viewer preview limits", () => {
  test("uses Monaco only for content at or below the preview limit", () => {
    expect(shouldUseMonacoPreview(MONACO_PREVIEW_MAX_BYTES, null)).toBe(true)
    expect(shouldUseMonacoPreview(MONACO_PREVIEW_MAX_BYTES + 1, null)).toBe(false)
  })

  test("falls back to content length when byte length is not available", () => {
    expect(shouldUseMonacoPreview(null, "x".repeat(MONACO_PREVIEW_MAX_BYTES))).toBe(true)
    expect(shouldUseMonacoPreview(null, "x".repeat(MONACO_PREVIEW_MAX_BYTES + 1))).toBe(false)
  })

  test("counts plain code lines consistently with the renderer split", () => {
    expect(getPlainCodeLineCount("")).toBe(1)
    expect(getPlainCodeLineCount("one")).toBe(1)
    expect(getPlainCodeLineCount("one\ntwo")).toBe(2)
    expect(getPlainCodeLineCount("one\n")).toBe(2)
  })

  test("virtualizes only larger plain code fallbacks", () => {
    expect(shouldVirtualizePlainCodeBlock(PLAIN_CODE_VIRTUALIZE_MIN_LINES)).toBe(false)
    expect(shouldVirtualizePlainCodeBlock(PLAIN_CODE_VIRTUALIZE_MIN_LINES + 1)).toBe(true)
  })

  test("uses plain preview for oversized or line-heavy code", () => {
    expect(shouldUsePlainCodePreview(MONACO_PREVIEW_MAX_BYTES + 1, "short")).toBe(true)
    expect(shouldUsePlainCodePreview(100, "line\n".repeat(PLAIN_CODE_VIRTUALIZE_MIN_LINES))).toBe(true)
    expect(shouldUsePlainCodePreview(100, "line\n".repeat(PLAIN_CODE_VIRTUALIZE_MIN_LINES - 1))).toBe(false)
    expect(shouldUsePlainCodePreview(100, null)).toBe(false)
  })
})
