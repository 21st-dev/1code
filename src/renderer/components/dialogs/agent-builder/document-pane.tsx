import { useAtom } from 'jotai'
import { agentBuilderDraftAtom, agentBuilderPhaseAtom } from '@/lib/atoms'
import { ChatMarkdownRenderer } from '@/components/chat-markdown-renderer'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useAgentBuilderChat } from './hooks/use-agent-builder-chat'
import { useState } from 'react'

/**
 * Agent Builder Document Pane
 *
 * Right pane of agent builder modal.
 * Shows live preview of:
 * - Formalized requirements (Phase 2)
 * - Research notes (Phase 3)
 * - Generated agent.md (Phase 4+)
 *
 * Provides review and feedback capabilities.
 */
export function AgentDocumentPane() {
  const [draft] = useAtom(agentBuilderDraftAtom)
  const [phase] = useAtom(agentBuilderPhaseAtom)
  const { sendMessage } = useAgentBuilderChat()

  const [showFeedbackInput, setShowFeedbackInput] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')

  console.log('[AgentBuilder DocumentPane] Render with draft:', {
    hasDraft: !!draft,
    phase,
    draftName: draft?.name,
    hasRawMarkdown: !!draft?.rawMarkdown,
    rawMarkdownLength: draft?.rawMarkdown?.length,
    requirementsCount: draft?.requirements?.length,
    researchNotesCount: draft?.researchNotes?.length,
  })

  if (!draft) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No draft yet</p>
          <p className="text-xs mt-1">
            Start by describing your agent requirements
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">
              {draft.name || 'agent'}.md
            </h3>
            <Badge variant="outline">{phase}</Badge>
          </div>

          {draft.rawMarkdown && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFeedbackInput(true)}
            >
              Provide Feedback
            </Button>
          )}
        </div>
      </div>

      {/* Document Content */}
      <ScrollArea className="flex-1 p-4">
        {draft.rawMarkdown ? (
          // Phase 4+: Show generated agent.md
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ChatMarkdownRenderer content={draft.rawMarkdown} />
          </div>
        ) : (
          // Phase 2-3: Show requirements and research notes
          <div className="space-y-4">
            {draft.requirements.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Requirements</h4>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  {draft.requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.researchNotes.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Research Notes</h4>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  {draft.researchNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Feedback Input (appears when user clicks Provide Feedback) */}
      {showFeedbackInput && (
        <div className="flex-shrink-0 p-4 border-t bg-muted/30">
          <h4 className="text-sm font-semibold mb-2">
            What would you like to change?
          </h4>
          <textarea
            className="w-full h-20 p-2 text-sm border rounded resize-none"
            placeholder="E.g., 'Make the agent more concise' or 'Add error handling for edge cases'"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={() => {
                sendMessage(
                  `Please update the agent based on this feedback: ${feedbackText}`
                )
                setShowFeedbackInput(false)
                setFeedbackText('')
              }}
              disabled={!feedbackText.trim()}
            >
              Submit Feedback
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowFeedbackInput(false)
                setFeedbackText('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
