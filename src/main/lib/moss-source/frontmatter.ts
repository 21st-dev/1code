import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const yaml = require("js-yaml") as {
  load(source: string): unknown
  dump(value: unknown, options?: Record<string, unknown>): string
}

export function stringifyMossFrontmatter(
  content: string,
  data: Record<string, unknown>,
): string {
  const frontmatter = yaml
    .dump(data, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd()
  return `---\n${frontmatter}\n---\n${content}`
}

export function parseMossFrontmatter(raw: string): {
  data: Record<string, unknown>
  content: string
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/)
  if (!match) {
    return {
      data: {},
      content: raw,
    }
  }

  const loaded = yaml.load(match[1])
  return {
    data:
      loaded && typeof loaded === "object" && !Array.isArray(loaded)
        ? (loaded as Record<string, unknown>)
        : {},
    content: match[2] ?? "",
  }
}
