import { trpcClient } from "../../../lib/trpc"
import {
  BUILTIN_SLASH_COMMANDS,
  getBuiltinCommandPrompt,
  type BuiltinCommandAction,
} from "../commands"

export async function expandCustomSlashCommand(
  text: string,
  projectPath?: string,
) {
  const slashMatch = text.match(/^\/(\S+)\s*(.*)$/s)
  if (!slashMatch) return text

  const [, commandName, args] = slashMatch
  const commandKey = commandName.toLowerCase() as BuiltinCommandAction["type"]
  const prompt = getBuiltinCommandPrompt(commandKey, args)
  if (prompt) {
    return prompt
  }

  const builtinNames = new Set(BUILTIN_SLASH_COMMANDS.map((cmd) => cmd.name))
  if (builtinNames.has(commandKey)) return text

  try {
    const commands = await trpcClient.commands.list.query({ projectPath })
    const cmd = commands.find(
      (candidate) =>
        candidate.name.toLowerCase() === commandName.toLowerCase(),
    )
    if (!cmd) return text

    const { content } = await trpcClient.commands.getContent.query({
      path: cmd.path,
      projectPath,
    })
    return content.replace(/\$ARGUMENTS/g, args.trim())
  } catch (error) {
    console.error("Failed to expand custom slash command:", error)
    return text
  }
}
