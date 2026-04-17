import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("renderer CSP host seam", () => {
  test("renderer html does not hardcode 21st.dev in connect-src", () => {
    const indexHtml = readFileSync(join(import.meta.dir, "index.html"), "utf-8")
    const loginHtml = readFileSync(join(import.meta.dir, "login.html"), "utf-8")

    expect(indexHtml).not.toContain("https://21st.dev")
    expect(indexHtml).not.toContain("https://*.21st.dev")
    expect(loginHtml).not.toContain("https://21st.dev")
    expect(loginHtml).not.toContain("https://*.21st.dev")
    expect(indexHtml).toContain("connect-src 'self' ws://localhost:* http://localhost:* https:")
  })
})
