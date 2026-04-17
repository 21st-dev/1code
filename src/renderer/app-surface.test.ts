import { describe, expect, test } from "bun:test"
import { getAppSurface } from "./app-surface"

const defaultParams = {
  hasBackendConfiguration: false,
  hasValidatedProject: false,
  isProjectsLoading: false,
} as const

describe("getAppSurface", () => {
  test("routes a fresh local launch into backend route setup", () => {
    expect(getAppSurface(defaultParams)).toBe("backend-setup")
  })

  test("routes completed onboarding without a project into repo selection", () => {
    expect(
      getAppSurface({
        ...defaultParams,
        hasBackendConfiguration: true,
      }),
    ).toBe("select-repo")
  })

  test("keeps project selection pending while projects are still loading", () => {
    expect(
      getAppSurface({
        ...defaultParams,
        hasBackendConfiguration: true,
        isProjectsLoading: true,
      }),
    ).toBe("agents-layout")
  })

  test("routes fully configured state into the main workspace", () => {
    expect(
      getAppSurface({
        ...defaultParams,
        hasBackendConfiguration: true,
        hasValidatedProject: true,
      }),
    ).toBe("agents-layout")
  })
})
