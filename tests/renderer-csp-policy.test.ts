import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(__dirname, "..")

function readRendererHtml(): string {
  return readFileSync(join(repoRoot, "src/renderer/index.html"), "utf-8")
}

function getCsp(html: string): string {
  const match = html.match(
    /http-equiv="Content-Security-Policy" content="([^"]+)"/,
  )
  if (!match) throw new Error("Renderer CSP meta tag not found")
  return match[1]
}

function getDirective(csp: string, name: string): string[] {
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `))

  return directive ? directive.split(/\s+/).slice(1) : []
}

describe("renderer CSP policy", () => {
  test("removes eval and remote script sources", () => {
    const html = readRendererHtml()
    const csp = getCsp(html)
    const scriptSrc = getDirective(csp, "script-src")

    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
    expect(scriptSrc).toContain("'wasm-unsafe-eval'")
    expect(scriptSrc).not.toContain("https://unpkg.com")
    expect(csp).not.toContain("https://unpkg.com")
  })

  test("documents the remaining inline-script exception", () => {
    const html = readRendererHtml()
    const csp = getCsp(html)
    const scriptSrc = getDirective(csp, "script-src")

    expect(scriptSrc).toContain("'unsafe-inline'")
    expect(html).toContain(
      "unsafe-inline remains for the startup theme and error handler scripts below",
    )
  })
})
