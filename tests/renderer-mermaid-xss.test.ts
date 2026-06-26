import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import {
  MERMAID_SECURITY_LEVEL,
  sanitizeMermaidSvg,
} from "../src/renderer/lib/security/mermaid-svg-sanitizer"

const originalWindow = (globalThis as typeof globalThis & {
  window?: Window
}).window

describe("renderer Mermaid XSS hardening", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: new Window(),
    })
  })

  afterAll(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      })
      return
    }

    Reflect.deleteProperty(globalThis, "window")
  })

  test("uses Mermaid strict mode", () => {
    expect(MERMAID_SECURITY_LEVEL).toBe("strict")
  })

  test("removes active SVG payloads before insertion", () => {
    const dirtySvg = `
      <svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss = true">
        <script>window.__xss = true</script>
        <foreignObject><body onload="window.__xss = true"></body></foreignObject>
        <a href="javascript:window.__xss = true"
           xlink:href="javascript:window.__xss = true"
           onclick="window.__xss = true">
          <text>Run terminal</text>
        </a>
      </svg>
    `

    const cleanSvg = sanitizeMermaidSvg(dirtySvg)

    expect(cleanSvg).toContain("<svg")
    expect(cleanSvg).not.toMatch(/<script/i)
    expect(cleanSvg).not.toMatch(/foreignObject/i)
    expect(cleanSvg).not.toMatch(/javascript:/i)
    expect(cleanSvg).not.toMatch(/\son[a-z]+\s*=/i)
    expect(cleanSvg).not.toMatch(/\s(?:xlink:)?href\s*=/i)
  })
})
