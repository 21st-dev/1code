import { describe, expect, test } from "bun:test"
import { getStartupSurface } from "./startup-surface"

describe("getStartupSurface", () => {
  test("routes unauthenticated startup into the app shell so renderer onboarding can decide the flow", () => {
    expect(getStartupSurface({ isAuthenticated: false })).toBe("app")
  })

  test("routes authenticated startup into the app shell", () => {
    expect(getStartupSurface({ isAuthenticated: true })).toBe("app")
  })
})
