# Reusable Agent + Document Modal Architecture

**Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Purpose**: Design a generic dual-pane modal that can be reused across features

## Design Principle

The modal should be **feature-agnostic**, providing a flexible dual-pane layout (agent chat + document viewer) that can be customized for different use cases beyond SpecKit.

## Use Cases

### 1. SpecKit Workflow (Primary)
- **Left Pane**: SpecKit agent executing workflow commands
- **Right Pane**: Live spec/plan/tasks artifacts
- **Top**: Stepper showing workflow phases

### 2. Agent Builder (Existing - internal-v1-legacy)
- **Left Pane**: Agent builder assistant chat
- **Right Pane**: Live agent.md preview
- **Top**: Simple title bar

### 3. Future: Code Review
- **Left Pane**: Review agent analyzing code
- **Right Pane**: Code diff viewer
- **Top**: Review status indicators

### 4. Future: Documentation Generation
- **Left Pane**: Documentation agent
- **Right Pane**: Live markdown documentation
- **Top**: Documentation sections navigator

---

## Component Architecture

### Base Components (Reusable)

```
components/dialogs/
├── agent-document-modal.tsx           # NEW: Generic base modal
├── agent-document-modal/
│   ├── types.ts                       # NEW: Modal configuration types
│   ├── chat-pane.tsx                  # NEW: Generic left pane
│   ├── document-pane.tsx              # NEW: Generic right pane
│   ├── toolbar.tsx                    # NEW: Generic top toolbar (optional)
│   └── hooks/
│       └── use-agent-document-modal.ts  # NEW: Modal state management
```

### Feature-Specific Implementations

```
components/dialogs/
├── speckit-workflow-modal.tsx         # NEW: SpecKit-specific wrapper
│   └── speckit-workflow/
│       ├── stepper.tsx                # SpecKit workflow stepper
│       ├── clarification-questions.tsx # SpecKit question UI
│       └── hooks/
│           └── use-speckit-workflow.ts  # SpecKit workflow logic
│
└── agent-builder-modal.tsx            # EXISTING: Agent Builder wrapper
    └── agent-builder/
        └── ... (existing components)
```

---

## Generic Modal API

### Configuration Interface

```typescript
interface AgentDocumentModalConfig {
  // Modal identification
  id: string                            // e.g., "speckit-workflow", "agent-builder"
  title?: string                        // Optional title (default: none)

  // Chat pane configuration
  chat: {
    sessionId: string                   // Chat session ID
    systemPrompt?: string               // Optional system prompt
    placeholder?: string                // Input placeholder
    enableFileUpload?: boolean          // Allow file attachments
    enableCommands?: boolean            // Enable slash commands
    customCommands?: SlashCommand[]     // Feature-specific commands
  }

  // Document pane configuration
  document: {
    type: 'markdown' | 'code' | 'diff' | 'custom'  // Document type
    content: string                     // Document content
    language?: string                   // For code type
    theme?: 'light' | 'dark'           // Viewer theme
    readOnly?: boolean                  // Allow editing
    customRenderer?: React.ComponentType<{ content: string }>  // Custom renderer
  }

  // Toolbar configuration (optional)
  toolbar?: {
    component: React.ComponentType<ToolbarProps>  // Custom toolbar
    height?: string                     // Toolbar height (default: "auto")
  }

  // Layout configuration
  layout?: {
    initialSplit?: number               // Initial split % (default: 50)
    minChatWidth?: number               // Min left pane width (default: 400px)
    minDocumentWidth?: number           // Min right pane width (default: 400px)
    resizable?: boolean                 // Allow resizing (default: true)
  }

  // Lifecycle hooks
  onOpen?: () => void
  onClose?: () => void
  onChatMessage?: (message: Message) => void
  onDocumentChange?: (content: string) => void
}
```

### Base Component

```typescript
/**
 * AgentDocumentModal - Reusable dual-pane modal for agent + document workflows
 *
 * This component provides a generic foundation for any feature that needs
 * side-by-side agent chat and document viewing/editing.
 */
export function AgentDocumentModal({
  config,
  isOpen,
  onOpenChange,
  children,  // Optional: Custom toolbar or overlay content
}: AgentDocumentModalProps) {
  const {
    chat,
    document,
    toolbar,
    layout = {},
    onOpen,
    onClose,
  } = config

  // Handle modal lifecycle
  useEffect(() => {
    if (isOpen) onOpen?.()
    else onClose?.()
  }, [isOpen, onOpen, onClose])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[75vw] h-[85vh] p-0 flex flex-col">
        <DialogTitle className="sr-only">{config.title || 'Agent Document Modal'}</DialogTitle>

        {/* Optional custom toolbar */}
        {toolbar && (
          <div style={{ height: toolbar.height }}>
            <toolbar.component {...config} />
          </div>
        )}

        {/* Optional children (e.g., SpecKit stepper) */}
        {children}

        {/* Main dual-pane layout */}
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
          {/* Left: Chat Pane */}
          <ResizablePanel
            defaultSize={layout.initialSplit ?? 50}
            minSize={(layout.minChatWidth ?? 400) / window.innerWidth * 100}
          >
            <ChatPane config={chat} />
          </ResizablePanel>

          <ResizableHandle />

          {/* Right: Document Pane */}
          <ResizablePanel
            defaultSize={100 - (layout.initialSplit ?? 50)}
            minSize={(layout.minDocumentWidth ?? 400) / window.innerWidth * 100}
          >
            <DocumentPane config={document} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Generic Chat Pane

```typescript
/**
 * ChatPane - Generic left pane for agent interaction
 *
 * Reuses existing chat infrastructure (useChat, MessagesList, etc.)
 */
function ChatPane({ config }: { config: ChatConfig }) {
  const { sessionId, systemPrompt, placeholder, enableCommands } = config

  // Reuse existing chat hook
  const { messages, sendMessage, isLoading } = useChat({
    sessionId,
    systemPrompt,
  })

  return (
    <div className="flex flex-col h-full">
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto">
        <MessagesList
          messages={messages}
          sessionId={sessionId}
        />
      </div>

      {/* Input area */}
      <ChatInputArea
        onSendMessage={sendMessage}
        isLoading={isLoading}
        placeholder={placeholder ?? 'Type a message...'}
        enableCommands={enableCommands ?? true}
        customCommands={config.customCommands}
      />
    </div>
  )
}
```

---

## Generic Document Pane

```typescript
/**
 * DocumentPane - Generic right pane for document viewing/editing
 *
 * Supports multiple document types with pluggable renderers
 */
function DocumentPane({ config }: { config: DocumentConfig }) {
  const { type, content, customRenderer } = config

  // Use custom renderer if provided
  if (customRenderer) {
    const CustomRenderer = customRenderer
    return <CustomRenderer content={content} />
  }

  // Built-in renderers based on type
  switch (type) {
    case 'markdown':
      return <MarkdownRenderer content={content} theme={config.theme} />

    case 'code':
      return (
        <CodeViewer
          content={content}
          language={config.language ?? 'typescript'}
          theme={config.theme}
          readOnly={config.readOnly ?? true}
        />
      )

    case 'diff':
      return <DiffViewer content={content} theme={config.theme} />

    default:
      return (
        <div className="p-4">
          <pre className="whitespace-pre-wrap">{content}</pre>
        </div>
      )
  }
}
```

---

## SpecKit Implementation (Using Generic Modal)

```typescript
/**
 * SpecKitWorkflowModal - SpecKit-specific wrapper around AgentDocumentModal
 */
export function SpecKitWorkflowModal() {
  const [isOpen, setIsOpen] = useAtom(speckitModalOpenAtom)
  const workflowStore = useSpecKitWorkflowStore()

  // Build configuration for generic modal
  const modalConfig: AgentDocumentModalConfig = {
    id: 'speckit-workflow',

    chat: {
      sessionId: workflowStore.activeSession?.chatSessionId ?? '',
      systemPrompt: 'You are a SpecKit workflow assistant...',
      placeholder: 'Describe your feature or ask a question...',
      enableCommands: true,
      customCommands: [
        { name: 'specify', description: 'Create feature specification' },
        { name: 'plan', description: 'Generate implementation plan' },
        { name: 'tasks', description: 'Generate task list' },
        // ... other SpecKit commands
      ],
    },

    document: {
      type: 'markdown',
      content: workflowStore.currentDocument ?? '',
      readOnly: true,  // SpecKit artifacts are read-only
    },

    layout: {
      initialSplit: 50,
      minChatWidth: 500,
      minDocumentWidth: 500,
    },

    onOpen: () => {
      // Initialize or resume workflow session
      workflowStore.resumeOrCreateSession()
    },

    onClose: () => {
      // Pause workflow session
      workflowStore.pauseSession()
    },

    onChatMessage: (message) => {
      // Parse for SpecKit commands, update workflow state
      if (message.content.startsWith('/speckit.')) {
        workflowStore.handleCommand(message.content)
      }
    },
  }

  return (
    <AgentDocumentModal
      config={modalConfig}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      {/* SpecKit-specific stepper overlay */}
      <SpecKitStepper
        currentStep={workflowStore.activeSession?.currentStep}
        stepStatus={workflowStore.activeSession?.stepStatus}
        onStepClick={(step) => workflowStore.navigateToStep(step)}
      />

      {/* SpecKit-specific clarification UI overlay */}
      {workflowStore.showClarifications && (
        <ClarificationQuestionsOverlay
          questions={workflowStore.clarifications.questions}
          onSubmit={(answers) => workflowStore.submitClarifications(answers)}
        />
      )}
    </AgentDocumentModal>
  )
}
```

---

## Agent Builder Implementation (Migrating to Generic Modal)

```typescript
/**
 * AgentBuilderModal - Migrate existing agent builder to use generic modal
 */
export function AgentBuilderModal() {
  const [isOpen, setIsOpen] = useAtom(agentBuilderModalOpenAtom)
  const { sessionId, agentContent } = useAgentBuilder()

  const modalConfig: AgentDocumentModalConfig = {
    id: 'agent-builder',
    title: 'Agent Builder',

    chat: {
      sessionId,
      systemPrompt: 'You are an agent builder assistant...',
      placeholder: 'Describe your agent...',
      enableCommands: false,
    },

    document: {
      type: 'markdown',
      content: agentContent,
      readOnly: false,  // Agent Builder allows editing
    },
  }

  return (
    <AgentDocumentModal
      config={modalConfig}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    />
  )
}
```

---

## Benefits of Reusable Design

### 1. **Code Reuse**
- Chat infrastructure (useChat, MessagesList, input) used once, shared everywhere
- Document rendering logic centralized
- Layout and resizing handled generically

### 2. **Consistent UX**
- All dual-pane modals have same interaction patterns
- Familiar layout for users across features
- Shared keyboard shortcuts and accessibility

### 3. **Easy Feature Addition**
- New features just configure the modal, don't rebuild it
- Example: Code Review feature in < 100 lines of wrapper code

### 4. **Testability**
- Test generic modal once comprehensively
- Feature-specific tests focus on business logic, not UI plumbing

### 5. **Maintainability**
- Bug fixes in generic modal benefit all features
- Performance optimizations centralized
- Easier to reason about component hierarchy

---

## File Structure (Updated)

```
src/renderer/components/dialogs/
├── agent-document-modal/               # NEW: Generic reusable modal
│   ├── index.tsx                       # Main modal component
│   ├── chat-pane.tsx                   # Generic chat pane
│   ├── document-pane.tsx               # Generic document pane
│   ├── toolbar.tsx                     # Optional toolbar wrapper
│   ├── types.ts                        # Configuration types
│   └── hooks/
│       └── use-agent-document-modal.ts # Modal state management
│
├── speckit-workflow-modal.tsx          # SpecKit-specific wrapper
│   └── speckit-workflow/
│       ├── stepper.tsx                 # SpecKit stepper (overlay)
│       ├── clarification-questions.tsx # SpecKit clarifications (overlay)
│       └── hooks/
│           └── use-speckit-workflow.ts # SpecKit workflow logic
│
└── agent-builder-modal.tsx             # MIGRATE: Use generic modal
    └── agent-builder/
        └── ... (minimal wrapper logic)
```

---

## Migration Path

### Phase 1: Create Generic Modal (Week 1)
1. Extract common patterns from Agent Builder
2. Build `agent-document-modal/` with configuration API
3. Test with simple example (markdown viewer)

### Phase 2: Migrate Agent Builder (Week 1)
1. Wrap Agent Builder with generic modal
2. Verify feature parity
3. Remove old dual-pane code

### Phase 3: Implement SpecKit Workflow (Week 2-3)
1. Use generic modal as foundation
2. Add SpecKit-specific overlays (stepper, clarifications)
3. Implement workflow state management

### Phase 4: Document & Examples (Week 4)
1. Write usage documentation
2. Create example configurations
3. Add Storybook stories for generic modal

---

## Testing Strategy

### Generic Modal Tests
```typescript
describe('AgentDocumentModal', () => {
  it('renders with markdown document', () => {
    const config = {
      id: 'test',
      chat: { sessionId: '123' },
      document: { type: 'markdown', content: '# Hello' }
    }
    render(<AgentDocumentModal config={config} isOpen={true} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('resizes panes correctly', () => {
    // Test ResizablePanel behavior
  })

  it('calls lifecycle hooks', () => {
    const onOpen = jest.fn()
    const onClose = jest.fn()
    // Test hook invocations
  })
})
```

### SpecKit Workflow Tests
```typescript
describe('SpecKitWorkflowModal', () => {
  it('shows stepper for workflow navigation', () => {
    // Test SpecKit-specific stepper overlay
  })

  it('displays clarification questions when needed', () => {
    // Test clarification UI overlay
  })

  it('updates document pane when step changes', () => {
    // Test document switching between spec/plan/tasks
  })
})
```

---

## Implementation Priority

**P1 (Must Have)**:
- Generic modal base component
- Chat pane with existing infrastructure reuse
- Document pane with markdown support
- Basic layout and resizing

**P2 (Should Have)**:
- Toolbar support
- Code viewer document type
- Diff viewer document type
- Custom renderer support

**P3 (Nice to Have)**:
- Keyboard shortcuts (Cmd+K to focus chat, etc.)
- Full-screen mode toggle
- Multiple document tabs in right pane
- Split document view (compare two artifacts)

---

## Exported API Summary

```typescript
// Main component
export { AgentDocumentModal } from './agent-document-modal'

// Types
export type {
  AgentDocumentModalConfig,
  ChatConfig,
  DocumentConfig,
  ToolbarProps,
  LayoutConfig,
} from './agent-document-modal/types'

// Hooks
export { useAgentDocumentModal } from './agent-document-modal/hooks/use-agent-document-modal'

// Built-in renderers
export { MarkdownRenderer } from './agent-document-modal/renderers/markdown'
export { CodeViewer } from './agent-document-modal/renderers/code'
export { DiffViewer } from './agent-document-modal/renderers/diff'
```

---

## Example: Future Code Review Feature

```typescript
function CodeReviewModal() {
  const [isOpen, setIsOpen] = useAtom(codeReviewModalOpenAtom)
  const { sessionId, currentDiff } = useCodeReview()

  const modalConfig: AgentDocumentModalConfig = {
    id: 'code-review',

    chat: {
      sessionId,
      systemPrompt: 'You are a code review assistant...',
      placeholder: 'Ask about this code...',
    },

    document: {
      type: 'diff',
      content: currentDiff,
    },
  }

  return (
    <AgentDocumentModal
      config={modalConfig}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      {/* Custom toolbar for review actions */}
      <CodeReviewToolbar onApprove={...} onReject={...} />
    </AgentDocumentModal>
  )
}
```

**Result**: Full code review feature in ~50 lines of code! 🎉
