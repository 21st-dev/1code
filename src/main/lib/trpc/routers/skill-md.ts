import {
  parseMossFrontmatter,
  stringifyMossFrontmatter,
} from "../../moss-source/frontmatter"

export function parseSkillMd(rawContent: string): {
  name?: string
  description?: string
  content: string
} {
  try {
    const { data, content } = parseMossFrontmatter(rawContent)
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      content: content.trim(),
    }
  } catch (err) {
    console.error("[skills] Failed to parse frontmatter:", err)
    return { content: rawContent.trim() }
  }
}

export function generateSkillMd(skill: {
  name: string
  description: string
  content: string
}): string {
  const frontmatter: Record<string, unknown> = {
    name: skill.name,
  }
  if (skill.description) {
    frontmatter.description = skill.description
  }
  const body = skill.content ? `\n${skill.content}` : ""
  return stringifyMossFrontmatter(body, frontmatter)
}
