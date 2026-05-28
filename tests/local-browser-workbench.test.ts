import { describe, expect, test } from "bun:test"
import {
  buildLocalBrowserReport,
  isAllowedLocalBrowserUrl,
  normalizeLocalBrowserUrl,
} from "../src/shared/local-browser-workbench"

describe("local browser workbench", () => {
  test("normalizes localhost and loopback preview targets", () => {
    expect(normalizeLocalBrowserUrl("localhost:5173")).toMatchObject({
      ok: true,
      url: "http://localhost:5173/",
    })
    expect(normalizeLocalBrowserUrl("3000")).toMatchObject({
      ok: true,
      url: "http://localhost:3000/",
    })
    expect(normalizeLocalBrowserUrl("http://127.0.0.1:4173/path")).toMatchObject({
      ok: true,
      url: "http://127.0.0.1:4173/path",
    })
    expect(normalizeLocalBrowserUrl("http://[::1]:8080")).toMatchObject({
      ok: true,
      url: "http://[::1]:8080/",
    })
    expect(normalizeLocalBrowserUrl("file:///tmp/locus-preview.html")).toMatchObject({
      ok: true,
      protocol: "file:",
    })
  })

  test("blocks remote hosts, unsupported schemes, and embedded credentials", () => {
    expect(normalizeLocalBrowserUrl("https://example.com")).toMatchObject({
      ok: false,
      code: "remote-host",
    })
    expect(normalizeLocalBrowserUrl("https://localhost.evil.test")).toMatchObject({
      ok: false,
      code: "remote-host",
    })
    expect(normalizeLocalBrowserUrl("ftp://localhost/file")).toMatchObject({
      ok: false,
      code: "unsupported-scheme",
    })
    expect(normalizeLocalBrowserUrl("http://user:pass@localhost:3000")).toMatchObject({
      ok: false,
      code: "credentials",
    })
    expect(isAllowedLocalBrowserUrl("https://127.0.0.1:8443")).toBe(true)
  })

  test("builds bounded browser QA reports", () => {
    const report = buildLocalBrowserReport({
      url: "http://localhost:5173/dashboard",
      title: "Dashboard",
      capturedAt: "2026-05-29T00:00:00.000Z",
      screenshotCaptured: true,
      viewport: { mode: "desktop", width: 1280, height: 800, scale: 100 },
      note: "The save button does not react after clicking.",
      selectedElement: "button Save changes",
      domSummary: {
        title: "Dashboard",
        url: "http://localhost:5173/dashboard",
        activeElement: "Save changes",
        headings: Array.from({ length: 12 }, (_, index) => `Heading ${index}`),
        buttons: ["Save changes", "Cancel"],
        links: ["Home -> /"],
        inputs: ["Project name"],
        textSample: "A".repeat(400),
      },
      consoleMessages: Array.from({ length: 9 }, (_, index) => ({
        level: "error",
        text: `Console error ${index}`,
        timestamp: "2026-05-29T00:00:00.000Z",
      })),
      loadFailures: [
        {
          url: "http://localhost:5173/api/save",
          reason: "net::ERR_CONNECTION_REFUSED",
          code: -102,
          timestamp: "2026-05-29T00:00:00.000Z",
        },
      ],
    })

    expect(report).toContain("Local Browser Workbench report")
    expect(report).toContain("Screenshot: captured locally in the workbench")
    expect(report).toContain("Selected element:")
    expect(report).toContain("Recent console messages:")
    expect(report).toContain("Console error 8")
    expect(report).not.toContain("Console error 0")
    expect(report).toContain("Recent load/network failures:")
    expect(report.length).toBeLessThan(3_500)
  })
})
