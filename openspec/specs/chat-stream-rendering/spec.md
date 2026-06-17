# chat-stream-rendering Specification

## Purpose
TBD - created by archiving change optimize-chat-stream-code-highlighting. Update Purpose after archive.
## Requirements
### Requirement: Streaming Code Highlight Deferral
The chat stream SHALL defer syntax highlighting of a code block until the block is settled, so a streaming code block is not re-highlighted on every streamed update.

#### Scenario: Code block is still streaming
- **WHEN** a code block is still being streamed (its content is growing / its fence is not yet closed and the message is still streaming)
- **THEN** the block is rendered as plain escaped text without running the syntax highlighter
- **AND** the highlighter does not re-run on every streamed update of that block

#### Scenario: Code block settles
- **WHEN** a code block becomes complete (fence closed) or the message finishes streaming
- **THEN** the block is syntax-highlighted after it settles rather than on every streamed update
- **AND** the final rendered message shows full syntax highlighting

#### Scenario: Re-highlight on a real input change is still allowed
- **WHEN** a settled block's code content, language, or the active theme changes
- **THEN** the block may re-highlight to reflect the change
- **AND** "do not re-run per streaming tick" does not mean "never re-highlight"

#### Scenario: Non-code and completed content are unaffected
- **WHEN** non-code content streams, or already-completed content is rendered
- **THEN** existing rendering behavior (throttle, block memoization, auto-scroll) is unchanged

