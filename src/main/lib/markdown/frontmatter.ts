import { load as parseYaml } from "js-yaml"

export type MarkdownFrontmatterResult = {
  data: Record<string, unknown>
  content: string
  language: "yaml" | "json" | ""
  matter: string
}

const OPEN_DELIMITER = "---"
const CLOSE_DELIMITER_PATTERN = /\r?\n---[ \t]*(?:\r?\n|$)/
const EXECUTABLE_FRONTMATTER_LANGUAGES = new Set(["js", "javascript"])

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseFrontmatterBlock(
  rawBlock: string,
  language: string,
): Record<string, unknown> {
  const normalizedLanguage = language.toLowerCase()
  const block = rawBlock.replace(/^\s*#[^\n]+/gm, "").trim()

  if (!block) return {}

  if (
    normalizedLanguage === "" ||
    normalizedLanguage === "yaml" ||
    normalizedLanguage === "yml"
  ) {
    return asRecord(parseYaml(block))
  }

  if (normalizedLanguage === "json") {
    return asRecord(JSON.parse(block))
  }

  if (EXECUTABLE_FRONTMATTER_LANGUAGES.has(normalizedLanguage)) {
    throw new Error(
      `Executable frontmatter language "${language}" is not supported`,
    )
  }

  throw new Error(`Unsupported frontmatter language "${language}"`)
}

export function parseMarkdownFrontmatter(
  input: string,
): MarkdownFrontmatterResult {
  const source = input.replace(/^\uFEFF/, "")

  if (
    !source.startsWith(OPEN_DELIMITER) ||
    source.startsWith(`${OPEN_DELIMITER}-`)
  ) {
    return {
      data: {},
      content: source,
      language: "",
      matter: "",
    }
  }

  let body = source.slice(OPEN_DELIMITER.length)
  let language = ""
  const firstLineMatch = body.match(/^([^\r\n]*)(?:\r?\n|$)/)
  const firstLine = firstLineMatch?.[1]?.trim() ?? ""

  if (firstLine) {
    language = firstLine
    body = body.slice(firstLineMatch?.[0]?.length ?? 0)
  } else if (firstLineMatch) {
    body = body.slice(firstLineMatch[0].length)
  }

  const closeMatch = CLOSE_DELIMITER_PATTERN.exec(body)
  const matter =
    closeMatch?.index === undefined ? body : body.slice(0, closeMatch.index)
  const content =
    closeMatch?.index === undefined
      ? ""
      : body.slice(closeMatch.index + closeMatch[0].length)

  return {
    data: parseFrontmatterBlock(matter, language),
    content,
    language: language === "json" ? "json" : language ? "yaml" : "",
    matter,
  }
}
