import { describe, expect, test } from "bun:test"
import { en, zhCN } from "../src/renderer/lib/i18n/dictionaries"

describe("i18n dictionary parity", () => {
  test("Simplified Chinese dictionary has the same keys as English", () => {
    const enKeys = Object.keys(en).sort()
    const zhKeys = Object.keys(zhCN).sort()
    const missingInZh = enKeys.filter((key) => !zhKeys.includes(key))
    const extraInZh = zhKeys.filter((key) => !enKeys.includes(key))

    expect(missingInZh).toEqual([])
    expect(extraInZh).toEqual([])
    expect(zhKeys.length).toBe(enKeys.length)
  })

  test("all dictionary values are non-empty strings", () => {
    const emptyEnglish = Object.entries(en)
      .filter(([, value]) => !String(value).trim())
      .map(([key]) => key)
    const emptyChinese = Object.entries(zhCN)
      .filter(([, value]) => !String(value).trim())
      .map(([key]) => key)

    expect(emptyEnglish).toEqual([])
    expect(emptyChinese).toEqual([])
  })
})
