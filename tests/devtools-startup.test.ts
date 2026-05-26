import { describe, expect, test } from "bun:test"
import { shouldOpenDevToolsOnStartup } from "../src/main/lib/devtools-startup"

describe("DevTools startup gate", () => {
  test("does not open DevTools by default", () => {
    expect(shouldOpenDevToolsOnStartup({})).toBe(false)
  })

  test("opens DevTools only when explicitly requested", () => {
    expect(shouldOpenDevToolsOnStartup({ LOCUS_OPEN_DEVTOOLS: "1" })).toBe(true)
    expect(shouldOpenDevToolsOnStartup({ LOCUS_OPEN_DEVTOOLS: "true" })).toBe(true)
    expect(
      shouldOpenDevToolsOnStartup({ AGENT_CODE_FOR_ME_OPEN_DEVTOOLS: "yes" }),
    ).toBe(true)
    expect(shouldOpenDevToolsOnStartup({ LOCUS_OPEN_DEVTOOLS: "0" })).toBe(false)
  })
})
