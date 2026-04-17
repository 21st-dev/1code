import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("renderer branding seams", () => {
  test("sidebar shell label uses OpenCodex branding", () => {
    const sidebarSource = readFileSync(
      join(import.meta.dir, "features", "sidebar", "agents-sidebar.tsx"),
      "utf-8",
    )

    expect(sidebarSource).toContain("OpenCodex")
    expect(sidebarSource).not.toContain("1Code")
  })

  test("renderer logo accessibility labels use OpenCodex branding", () => {
    const logoSource = readFileSync(
      join(import.meta.dir, "components", "ui", "logo.tsx"),
      "utf-8",
    )
    const previewSource = readFileSync(
      join(import.meta.dir, "features", "agents", "ui", "agent-preview.tsx"),
      "utf-8",
    )

    expect(logoSource).toContain('aria-label="OpenCodex logo"')
    expect(logoSource).not.toContain('aria-label="21st logo"')
    expect(previewSource).toContain('aria-label="OpenCodex logo"')
    expect(previewSource).not.toContain('aria-label="21st logo"')
  })
})
