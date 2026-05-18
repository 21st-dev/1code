import { describe, expect, test } from "bun:test"
import {
  isOfficialCloudHostname,
  isOfficialCloudUrl,
  shouldEnableLocalOnly,
} from "../src/shared/local-only"

describe("local-only boundary", () => {
  test("defaults to enabled when no env override is present", () => {
    expect(shouldEnableLocalOnly({}, {})).toBe(true)
  })

  test.each(["0", "false", "off", "no", " FALSE "])(
    "disables local-only for false-like env value %p",
    (value) => {
      expect(shouldEnableLocalOnly({ LOCUS_LOCAL_ONLY: value }, {})).toBe(false)
    },
  )

  test("checks both process env and vite env overrides", () => {
    expect(
      shouldEnableLocalOnly(
        { AGENT_CODE_FOR_ME_LOCAL_ONLY: "true" },
        { VITE_LOCAL_ONLY: "0" },
      ),
    ).toBe(false)
  })

  test("matches only official hosted roots and subdomains", () => {
    expect(isOfficialCloudHostname("21st.dev")).toBe(true)
    expect(isOfficialCloudHostname("sandbox-3000.21st.sh")).toBe(true)
    expect(isOfficialCloudHostname("API.1CODE.DEV")).toBe(true)
    expect(isOfficialCloudHostname("21st.dev.example.com")).toBe(false)
    expect(isOfficialCloudHostname("not21st.dev")).toBe(false)
  })

  test("guards only http and https official cloud URLs", () => {
    expect(isOfficialCloudUrl("https://api.21st.dev/auth")).toBe(true)
    expect(isOfficialCloudUrl("http://sandbox.codesandbox.io")).toBe(true)
    expect(isOfficialCloudUrl("file:///tmp/21st.dev")).toBe(false)
    expect(isOfficialCloudUrl("not a url")).toBe(false)
  })
})
