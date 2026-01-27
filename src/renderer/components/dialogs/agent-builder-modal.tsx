import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAtom } from 'jotai'
import { agentBuilderModalOpenAtom } from '@/lib/atoms'
import { AgentBuilderChatPane } from './agent-builder/chat-pane'
import { AgentDocumentPane } from './agent-builder/document-pane'

/**
 * Agent Builder Modal
 *
 * Dual-pane modal for creating and modifying Claude Code agents:
 * - Left pane: Chat interface with agent builder assistant
 * - Right pane: Live preview of generated agent.md file
 *
 * Fully reuses existing chat streaming infrastructure (IPCChatTransport, useChat, MessagesList)
 */
export function AgentBuilderModal() {
  const [isOpen, setIsOpen] = useAtom(agentBuilderModalOpenAtom)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="w-[75vw] h-[85vh] p-0 flex flex-col">
        <DialogTitle className="sr-only">Agent Builder</DialogTitle>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Chat Interface */}
          <div className="flex-1 border-r min-w-0">
            <AgentBuilderChatPane />
          </div>

          {/* Right: Document Preview */}
          <div className="flex-1 min-w-0">
            <AgentDocumentPane />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
