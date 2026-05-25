import { describe, expect, test } from "bun:test"

import {
  MONACO_PREVIEW_MAX_BYTES,
  shouldUseMonacoPreview,
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
})
