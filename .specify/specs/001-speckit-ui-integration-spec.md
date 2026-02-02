# Feature Specification: Fix Plan Page and Workflow Modal Issues

**Feature Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-02
**Status**: Draft
**Input**: User description: "Our existing implementation is broken and needs refinement. Continue to use the same speckit artifacts for this. Here is the list of changes required:

- New feature flow in the plan page is broken. I should be able to see this button if I am on a named branch (not a feature branch: main, master, internal, staging, dev). Clicking this button should open the workflow in the empty state and let me go through it.

- Workflow modal has spacing issues. The two panes do not occupy the complete height available to them when they dont have content."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New Feature Flow Button Visibility (Priority: P1)

As a user working on a named feature branch, I want to see the "New Feature Flow" button on the plan page so that I can initiate a new feature workflow.

**Why this priority**: This is a core navigation element that enables users to start new feature specifications. Without it, users cannot access the feature specification workflow from the plan page.

**Independent Test**: Can be tested by checking button visibility on different branch types and verifying it only appears on named feature branches.

**Acceptance Scenarios**:

1. **Given** the user is on a named feature branch (e.g., `feature/user-auth`, `fix/login-bug`), **When** the user navigates to the plan page, **Then** the "New Feature Flow" button should be visible.

2. **Given** the user is on a protected branch (main, master, internal, staging, dev), **When** the user navigates to the plan page, **Then** the "New Feature Flow" button should NOT be visible.

3. **Given** the user is on any branch, **When** the user checks the branch type, **Then** the system should correctly classify the branch as "named" or "protected".

---

### User Story 2 - New Feature Flow Button Opens Empty State (Priority: P1)

As a user on a named branch, I want clicking the "New Feature Flow" button to open the workflow in its empty state so that I can start a new feature specification from scratch.

**Why this priority**: This is the primary action that the button should perform. Without this functionality, the button has no purpose.

**Independent Test**: Can be tested by clicking the button and verifying the workflow modal opens with empty state content.

**Acceptance Scenarios**:

1. **Given** the user is on a named feature branch and sees the "New Feature Flow" button, **When** the user clicks the button, **Then** the workflow modal should open.

2. **Given** the workflow modal is opened via the "New Feature Flow" button, **When** the modal is displayed, **Then** it should show the empty state of the workflow (no existing specification data).

---

### User Story 3 - Workflow Modal Height Utilization (Priority: P1)

As a user, I want the workflow modal to use the full available height for both panes so that the interface looks consistent and professional regardless of content volume.

**Why this priority**: Visual consistency and proper space utilization are essential for a professional user experience. Empty or sparse content should not result in awkward whitespace or misaligned panes.

**Independent Test**: Can be tested by opening the workflow modal with various content volumes and verifying both panes always occupy the complete available height.

**Acceptance Scenarios**:

1. **Given** the workflow modal is open with minimal content, **When** the user views the modal, **Then** both left and right panes should occupy the complete available height.

2. **Given** the workflow modal is open with extensive content, **When** the user views the modal, **Then** both panes should expand to use available height while maintaining scrollable content areas.

3. **Given** the workflow modal is open, **When** the user resizes the browser window, **Then** both panes should dynamically adjust to fill the new available height.

---

### User Story 4 - Consistent Modal Behavior Across States (Priority: P2)

As a user, I want the workflow modal to behave consistently whether opened from the plan page button or through other means so that I have a predictable experience.

**Why this priority**: Consistency reduces cognitive load and helps users understand the interface more easily.

**Independent Test**: Can be tested by comparing modal behavior when opened from different entry points.

**Acceptance Scenarios**:

1. **Given** the user opens the workflow modal from the plan page button, **When** the modal is displayed, **Then** it should have the same layout and styling as when opened from other entry points.

---

### Edge Cases

- What happens when the branch name cannot be determined?
- How does the system handle very long branch names?
- What happens when the modal is opened on a very small screen (mobile viewport)?
- How does the modal behave when browser window is minimized and restored?
- What happens if there are multiple instances of the workflow modal component on the page?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST determine the current git branch name when displaying the plan page.
- **FR-002**: System MUST classify branches as either "named feature branch" or "protected branch" based on the branch name.
- **FR-003**: Protected branches MUST include: main, master, internal, staging, dev.
- **FR-004**: System MUST show the "New Feature Flow" button only when on a named feature branch.
- **FR-005**: System MUST hide the "New Feature Flow" button when on a protected branch.
- **FR-006**: System MUST open the workflow modal in empty state when the "New Feature Flow" button is clicked.
- **FR-007**: Workflow modal left pane MUST occupy 100% of available container height.
- **FR-008**: Workflow modal right pane MUST occupy 100% of available container height.
- **FR-009**: Both panes MUST maintain consistent height regardless of content volume.
- **FR-010**: Both panes MUST dynamically adjust height when browser window is resized.

### Key Entities

- **Branch**: Represents a git branch with a name and type classification (named feature branch vs protected branch).
- **WorkflowModal**: Represents the modal dialog that displays the feature specification workflow, containing left and right panes.
- **PlanPage**: The main page component that displays the plan interface and conditionally shows the "New Feature Flow" button.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: "New Feature Flow" button is visible on all named feature branches (100% visibility when condition is met).
- **SC-002**: "New Feature Flow" button is hidden on all protected branches (100% hidden when condition is met).
- **SC-003**: Clicking the button opens the workflow modal in empty state (100% success rate on button click).
- **SC-004**: Both workflow modal panes utilize 100% of available height (measured as viewport utilization percentage).
- **SC-005**: No visual gaps or inconsistent spacing between panes when modal has minimal content (100% consistent layout).
