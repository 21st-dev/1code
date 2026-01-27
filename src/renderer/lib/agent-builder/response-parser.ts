import type { AgentDraft, AgentBuilderPhase } from '@/lib/atoms/agent-builder'
import matter from 'gray-matter'

/**
 * Agent Builder Response Parser
 *
 * Extracts structured data from agent builder assistant responses:
 * - Requirements lists (Phase 2: Formalization)
 * - Research notes (Phase 3: Research)
 * - Generated agent.md content (Phase 4: Generation - file created automatically)
 * - Phase transitions based on content patterns
 *
 * Note: Agent files are created automatically by the assistant using Write tool.
 * No review/approval phase - the file is written as part of the chat flow.
 */
export class AgentBuilderResponseParser {
  /**
   * Parse assistant message content to extract draft updates and phase changes
   *
   * @param content - Raw assistant message content
   * @param currentDraft - Current draft state (for merging updates)
   * @returns Updated draft and phase (or null if no changes detected)
   */
  static parse(
    content: string,
    currentDraft: AgentDraft | null
  ): {
    draft: AgentDraft | null
    phase: AgentBuilderPhase | null
  } {
    // Safety check: ensure content is a valid string
    if (!content || typeof content !== 'string') {
      console.warn('[AgentBuilder] Parser received invalid content:', typeof content)
      return { draft: null, phase: null }
    }

    console.log('[AgentBuilder ResponseParser] Parsing content, length:', content.length)
    console.log('[AgentBuilder ResponseParser] Content preview:', content.substring(0, 200))

    // Priority 1: Look for complete agent.md in markdown code block
    const agentMdMatch = content.match(/```markdown\n(---[\s\S]*?---[\s\S]*?)\n```/)

    if (agentMdMatch) {
      console.log('[AgentBuilder ResponseParser] Found markdown code block!')
      const rawMarkdown = agentMdMatch[1]
      console.log('[AgentBuilder ResponseParser] Raw markdown length:', rawMarkdown.length)
      const parsed = parseAgentMarkdown(rawMarkdown)
      console.log('[AgentBuilder ResponseParser] Parsed agent:', {
        name: parsed.name,
        description: parsed.description,
        hasPrompt: !!parsed.prompt,
        tools: parsed.tools,
        model: parsed.model,
      })

      const draft = {
        name: parsed.name || currentDraft?.name || '',
        description: parsed.description || currentDraft?.description || '',
        prompt: parsed.prompt || currentDraft?.prompt || '',
        tools: parsed.tools,
        disallowedTools: parsed.disallowedTools,
        model: parsed.model,
        requirements: currentDraft?.requirements || [],
        researchNotes: currentDraft?.researchNotes || [],
        rawMarkdown,
      }

      console.log('[AgentBuilder ResponseParser] Returning draft, staying in generate phase')
      return {
        draft,
        phase: 'generate', // Keep in generate phase - no review needed
      }
    }

    // Priority 2: Look for requirements list (Phase 2: Formalization)
    const reqMatch = content.match(/## Requirements\n([\s\S]*?)(?=\n##|$)/)
    if (reqMatch) {
      const requirements = reqMatch[1]
        .split('\n')
        .filter((line) => line.trim().startsWith('-'))
        .map((line) => line.replace(/^-\s*/, '').trim())
        .filter((line) => line.length > 0)

      if (requirements.length > 0) {
        return {
          draft: {
            ...(currentDraft || {
              name: '',
              description: '',
              prompt: '',
              requirements: [],
              researchNotes: [],
              rawMarkdown: '',
            }),
            requirements,
          } as AgentDraft,
          phase: 'research', // Requirements formalized -> move to research
        }
      }
    }

    // Priority 3: Look for research notes (Phase 3: Research)
    const researchMatch = content.match(/## Research Notes\n([\s\S]*?)(?=\n##|$)/)
    if (researchMatch) {
      const notes = researchMatch[1]
        .split('\n')
        .filter((line) => line.trim().startsWith('-'))
        .map((line) => line.replace(/^-\s*/, '').trim())
        .filter((line) => line.length > 0)

      if (notes.length > 0) {
        return {
          draft: {
            ...(currentDraft || {
              name: '',
              description: '',
              prompt: '',
              requirements: [],
              researchNotes: [],
              rawMarkdown: '',
            }),
            researchNotes: [...(currentDraft?.researchNotes || []), ...notes],
          } as AgentDraft,
          phase: 'generate', // Research complete -> move to generation
        }
      }
    }

    // No structured content found
    console.log('[AgentBuilder ResponseParser] No structured content found in response')
    return { draft: null, phase: null }
  }
}

/**
 * Parse agent.md frontmatter and content using gray-matter
 *
 * @param markdown - Raw markdown with YAML frontmatter
 * @returns Partial agent draft with parsed fields
 */
function parseAgentMarkdown(markdown: string): Partial<AgentDraft> {
  const parsed = matter(markdown)

  return {
    name: parsed.data.name,
    description: parsed.data.description,
    prompt: parsed.content.trim(),
    tools: parseTools(parsed.data.tools),
    disallowedTools: parseTools(parsed.data.disallowedTools),
    model: parsed.data.model,
    creationChatId: parsed.data.creationChatId,
  }
}

/**
 * Parse tools field (handles both array and comma-separated string)
 *
 * @param tools - Tools from frontmatter (string or array)
 * @returns Array of tool names or undefined
 */
function parseTools(tools: unknown): string[] | undefined {
  if (!tools) return undefined

  if (Array.isArray(tools)) {
    return tools.map((t) => String(t).trim()).filter((t) => t.length > 0)
  }

  if (typeof tools === 'string') {
    return tools
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  }

  return undefined
}
