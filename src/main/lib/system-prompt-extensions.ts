/**
 * Centralized manager for system prompt extensions
 * Automatically called before every agent invocation to inject context
 */

interface WorkspaceContext {
  chatId: string | null
  workspacePath?: string
  filesCount?: number
}

export class SystemPromptExtensionsManager {
  /**
   * Build system prompt extensions based on current context
   * Returns markdown-formatted instructions to append to base prompt
   */
  buildExtensions(context: WorkspaceContext): string {
    const sections: string[] = []

    // Add workspace context if available
    if (context.chatId) {
      sections.push(this.buildWorkspaceSection(context))
    }

    // Join all sections with proper spacing
    return sections.join('\n\n')
  }

  private buildWorkspaceSection(context: WorkspaceContext): string {
    const { chatId, workspacePath, filesCount = 0 } = context

    return `# Workspace Files

**Current Workspace ID:** \`${chatId}\`
**Workspace Path:** \`${workspacePath || '.ii/workspaces/' + chatId}\`
**Files in Workspace:** ${filesCount}

## CRITICAL REQUIREMENT - File Mentions

When you reference workspace files in your text responses using @ mentions, you MUST ALWAYS include the full path from the project root:

✅ **CORRECT:** \`@[file:local:.ii/workspaces/${chatId}/notes.md]\`
❌ **WRONG:** \`@[file:local:notes.md]\`

This applies to ALL workspace files you write, edit, or reference. The @ mention MUST contain the full path \`.ii/workspaces/${chatId}/filename\`, not just the filename.

## How to Use Workspace Files

Workspace files are persistent documents that belong to this conversation. They are stored in the workspace directory and persist across sessions.

**IMPORTANT:** Always write temporary files, task-specific files, reports, reviews, and other documents to \`.ii/workspaces/${chatId}\`

### Available Operations:

Use standard file writing tools to interact with workspace files:

1. **Write workspace file:**
   - Tool: \`Write\`
   - Path: \`.ii/workspaces/${chatId}/filename.md\`
   - Example: Write a requirements document to \`.ii/workspaces/${chatId}/requirements.md\`

2. **Read workspace file:**
   - Tool: \`Read\`
   - Path: \`.ii/workspaces/${chatId}/filename.md\`
   - Example: Read \`.ii/workspaces/${chatId}/notes.md\`

3. **Edit workspace file:**
   - Tool: \`Edit\`
   - Path: \`.ii/workspaces/${chatId}/filename.md\`
   - Update existing workspace files

4. **List workspace files:**
   - Tool: \`Glob\`
   - Pattern: \`.ii/workspaces/${chatId}/**/*\`
   - Lists all files in the workspace

### Best Practices:
- **Always use the full path in Write/Read/Edit tools:** \`.ii/workspaces/${chatId}/filename.md\`
- **CRITICAL - Always use full path in @ mentions:** After using Write/Edit tools, when you mention the file in your response, you MUST use: \`@[file:local:.ii/workspaces/${chatId}/filename.md]\` - never just the filename!
- Use descriptive filenames (e.g., \`api-design.md\`, \`requirements.md\`, \`review.md\`)
- Organize related content in separate files
- Reference workspace files when user asks about previous work
- Update existing files rather than creating duplicates
- Use markdown format for documentation files

### When to Write to Workspace:
- User asks to save/document information
- Creating specifications, designs, or plans
- Writing reports or reviews
- Tracking decisions or requirements
- Building knowledge base for the conversation
- Any temporary or task-specific files
- Sharing structured data between sessions

### File Mentions:
When referencing workspace files in your responses using @ mentions, you MUST use the full path:
- **Correct:** \`@[file:local:.ii/workspaces/${chatId}/notes.md]\`
- **Incorrect:** \`@[file:local:notes.md]\` ← This will NOT work!

The file mention path must be relative to the project root, not just the filename. This allows the user to click the mention and open the file.`
  }

  /**
   * Get singleton instance
   */
  private static instance: SystemPromptExtensionsManager

  static getInstance(): SystemPromptExtensionsManager {
    if (!this.instance) {
      this.instance = new SystemPromptExtensionsManager()
    }
    return this.instance
  }
}

// Export singleton
export const systemPromptExtensions = SystemPromptExtensionsManager.getInstance()
