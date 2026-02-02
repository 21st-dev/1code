# Feature Specification: SpecKit UI Integration

**Feature Branch**: `001-speckit-ui-integration`
**Created**: 2026-02-01
**Status**: Draft
**Architecture**: ii-spec Native (file-based state, Git branch tracking)
**Input**: User description: "We need to modify the current app to integrate git@github.com:github/spec-kit.git into it. The goal is to provide a UI interface for the speckit workflow in the app. The button for this must be a icon button in the same group as the git and terminal button in the top action bar. This button should also open the right drawer as the others do, with a new component. This new component will be the Plan page. On this page, we can open the constitution, see previous speckit features (their specification, plan, research and tasks). We can run a new feature which goes through the whole recommended speckit usage flow and provide a more user friendly and efficient interface while doing so. I want to fork the existing speckit github to my account, and embed it here as a github submodule, this way, once integrated into the system, we can expand on its features later"

**Key Architectural Decisions** (from user clarifications):
- Use ii-spec submodule directly (relocated to `submodules/ii-spec/`)
- ii-spec owns all workflow state via files (specs/, .specify/)
- Current Git branch determines active feature
- Workflow resume by reading existing files
- Multiple concurrent workflows supported (switch via Git branches)
- Pass-through ii-spec errors to UI as-is
- No custom workflow state management needed

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access SpecKit Workflow (Priority: P1)

Users need quick access to the SpecKit planning interface from the main application workspace to initiate and manage feature specifications.

**Why this priority**: This is the entry point for all SpecKit functionality - without UI access, no other SpecKit features can be utilized. It establishes the fundamental interaction pattern.

**Independent Test**: Can be fully tested by clicking the SpecKit icon button in the top action bar and verifying the right drawer opens with the Plan page, delivering immediate visual access to the SpecKit workspace.

**Acceptance Scenarios**:

1. **Given** the user is in the main application workspace, **When** they click the SpecKit icon button in the top action bar, **Then** the right drawer opens displaying the Plan page
2. **Given** the right drawer is currently showing Git or Terminal content, **When** the user clicks the SpecKit icon button, **Then** the drawer content switches to the Plan page
3. **Given** the Plan page is open in the right drawer, **When** the user clicks the SpecKit icon button again, **Then** the drawer closes (toggles)

---

### User Story 2 - View Constitution (Priority: P2)

Users need to access and review the project constitution document to understand project principles and guidelines before creating new feature specifications.

**Why this priority**: The constitution provides critical context for feature planning, but users can begin working with SpecKit without it - it's a reference document rather than a blocking requirement.

**Independent Test**: Can be tested by opening the Plan page and clicking on the constitution view option, which displays the constitution document content inline or in a modal.

**Acceptance Scenarios**:

1. **Given** the Plan page is open, **When** the user clicks "View Constitution", **Then** the constitution document is displayed
2. **Given** no constitution exists in the project, **When** the user opens the Plan page, **Then** a message indicates "No constitution found" with an option to create one
3. **Given** the constitution is being displayed, **When** the user closes the view, **Then** they return to the main Plan page interface

---

### User Story 3 - Browse Previous Features (Priority: P2)

Users need to view a list of all previously created SpecKit features with their associated artifacts (specification, plan, research, tasks) to understand project history and maintain consistency.

**Why this priority**: Historical context is valuable for maintaining consistency and avoiding duplicate work, but it's not required to create the first feature - it becomes more critical as the project matures.

**Independent Test**: Can be tested by opening the Plan page, viewing the features list, and selecting a feature to view its associated artifacts in a readable format.

**Acceptance Scenarios**:

1. **Given** the Plan page is open and SpecKit features exist, **When** the user views the features list, **Then** all features are displayed with their number and short name
2. **Given** a feature is selected from the list, **When** the user clicks on it, **Then** tabs or sections appear showing Specification, Plan, Research, and Tasks
3. **Given** a feature artifact (spec/plan/research/tasks) is selected, **When** the content loads, **Then** the markdown content is rendered in a readable format
4. **Given** no previous features exist, **When** the Plan page loads, **Then** a message indicates "No features yet" with a prompt to create one

---

### User Story 4 - Create New Feature Workflow (Priority: P1)

Users need a guided, user-friendly interface to initiate and complete the full SpecKit workflow (constitution → specify → clarify → plan → tasks → implement) for new features without manually running command-line operations.

**Why this priority**: This is the core value proposition of the UI integration - enabling users to execute the SpecKit workflow efficiently through a graphical interface. It's essential for delivering immediate productivity gains.

**Independent Test**: Can be tested by clicking "New Feature" in the Plan page, entering a feature description, and being guided through each workflow step with visual feedback until tasks.md is generated. The Implement step shows all tasks with copy buttons.

**Acceptance Scenarios**:

1. **Given** the Plan page is open, **When** the user clicks "New Feature", **Then** a form appears prompting for a feature description
2. **Given** the user has entered a feature description, **When** they submit the form, **Then** the specify step initiates and shows progress indicators
3. **Given** the specify step completes with clarification questions, **When** questions are displayed, **Then** the user can answer them inline and proceed
4. **Given** clarifications are resolved, **When** the user proceeds, **Then** the plan step initiates automatically
5. **Given** the plan step completes, **When** the user reviews the plan, **Then** they can approve it and proceed to task generation
6. **Given** tasks.md is generated, **When** the workflow reaches the Implement step, **Then** all tasks are displayed with full descriptions and copy buttons
7. **Given** a task is displayed in the Implement step, **When** the user clicks the copy button, **Then** the task reference (ID) is copied to clipboard for use with `/speckit.implement [task-id]` in a new chat
8. **Given** all workflow steps complete successfully, **When** returning to the features list, **Then** the new feature appears with all generated artifacts
9. **Given** any workflow step fails, **When** an error occurs, **Then** a clear error message is displayed with suggested actions
10. **Given** tasks.md exists for a feature, **When** determining the current step, **Then** the workflow is considered at the "implement" step (complete)

---

### User Story 5 - SpecKit Submodule Integration (Priority: P3)

Developers need the SpecKit codebase embedded as a Git submodule (forked to the user's account) to enable future feature expansion and customization.

**Why this priority**: While important for long-term maintainability and extensibility, the submodule integration is a development infrastructure concern that doesn't block user-facing functionality - users can benefit from SpecKit features even if the underlying code is bundled differently initially.

**Independent Test**: Can be tested by verifying the presence of a `.gitmodules` file, confirming the submodule points to the forked repository, and successfully running `git submodule update --init` to clone the SpecKit code.

**Acceptance Scenarios**:

1. **Given** the repository contains a `.gitmodules` file, **When** inspecting it, **Then** it references the forked SpecKit repository URL
2. **Given** a fresh clone of the main repository, **When** running `git submodule update --init`, **Then** the SpecKit submodule is successfully cloned
3. **Given** the SpecKit submodule is initialized, **When** the application starts, **Then** it can access SpecKit functionality from the submodule path

---

### Edge Cases

- What happens when the user tries to create a new feature while another feature workflow is in progress?
- How does the system handle a corrupted or incomplete SpecKit artifact file (spec.md, plan.md, etc.)?
- What happens if the SpecKit submodule fails to initialize or is not present?
- How does the UI respond when Git operations (branch creation, checkout) fail during the specify workflow?
- What happens if the user closes the drawer or navigates away during an active workflow step?
- How does the system handle very large feature lists (performance considerations)?
- What happens when trying to view a feature that has partial artifacts (e.g., spec exists but plan doesn't)?
- What happens if SpecKit is not initialized in the project (no `.specify/` directory)?
- How does the system handle partial SpecKit initialization (e.g., `.specify/` exists but templates are missing)?
- What happens if the `specify init` command fails during one-click initialization?
- What happens when the user navigates back to a previous step (e.g., Specify) after downstream artifacts (plan.md, tasks.md) already exist?
- What happens if the user tries to skip the Clarify step and proceed directly to Plan?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add a SpecKit icon button to the top action bar in the same visual group as the Git and Terminal buttons
- **FR-002**: System MUST open the right drawer when the SpecKit icon button is clicked, displaying the Plan page component
- **FR-003**: System MUST toggle the drawer closed when the SpecKit icon button is clicked while the Plan page is already open
- **FR-004**: System MUST switch drawer content to the Plan page when the SpecKit button is clicked while other content (Git/Terminal) is displayed
- **FR-005**: System MUST display the project constitution document when requested from the Plan page
- **FR-006**: System MUST show a "No constitution found" message with a creation option when no constitution exists
- **FR-007**: System MUST display a list of all previous SpecKit features with their feature number and short name
- **FR-008**: System MUST show "No features yet" when no previous features exist in the specs directory
- **FR-009**: System MUST allow users to select a feature from the list and view its associated artifacts (specification, plan, research, tasks)
- **FR-010**: System MUST render markdown content for all SpecKit artifacts in a readable format
- **FR-011**: System MUST provide a "New Feature" action that initiates the SpecKit workflow
- **FR-012**: System MUST present a form for entering a feature description when creating a new feature
- **FR-013**: System MUST execute the specify step of the workflow and display progress indicators
- **FR-014**: System MUST display clarification questions inline when the specify step generates them
- **FR-015**: System MUST allow users to answer clarification questions within the UI and proceed to the next step
- **FR-016**: System MUST automatically initiate the plan step after clarifications are resolved
- **FR-017**: System MUST display the generated plan and provide an approval mechanism
- **FR-018**: System MUST generate tasks after plan approval
- **FR-019**: System MUST update the features list to include newly created features with all artifacts
- **FR-020**: System MUST display clear error messages with suggested actions when any workflow step fails
- **FR-021**: System MUST integrate SpecKit as a Git submodule pointing to a forked repository under the user's account
- **FR-022**: System MUST be able to access and execute SpecKit functionality from the submodule location
- **FR-023**: System MUST handle the case where the SpecKit submodule is not initialized gracefully with appropriate error messaging
- **FR-024**: System MUST detect if SpecKit is not initialized in the project and display an initialization prompt instead of constitution/features sections
- **FR-025**: System MUST provide a one-click initialization action that runs `specify init . --ai claude` when SpecKit is not initialized
- **FR-026**: System MUST automatically refresh the Plan page UI after successful SpecKit initialization to display constitution and features sections
- **FR-027**: System MUST relocate the ii-spec submodule from project root (`spec-kit/`) to organized location (`submodules/ii-spec/`)
- **FR-028**: System MUST detect current workflow state by reading Git branch and checking file existence (spec.md, plan.md, tasks.md)
- **FR-029**: System MUST support multiple concurrent feature workflows by allowing users to switch Git branches
- **FR-030**: System MUST resume workflows from detected step when reopening a feature (based on existing files)
- **FR-031**: System MUST display ii-spec command errors as-is without translation or wrapping
- **FR-032**: System MUST display a non-blocking stale warning banner when user navigates to a previous step (e.g., Specify, Clarify) after downstream artifacts already exist (e.g., plan.md, tasks.md)
- **FR-033**: System MUST show a warning when user attempts to skip the Clarify step and proceed directly to Plan, but allow the user to continue if they choose
- **FR-034**: System MUST display all tasks with full descriptions in the Implement step, showing task ID, description, and file paths
- **FR-035**: System MUST provide a copy button for each task in the Implement step that copies the task reference to clipboard
- **FR-036**: System MUST allow users to freely navigate between any completed workflow steps in the stepper to view or modify artifacts

### Key Entities

- **SpecKit Feature**: Represents a feature specification managed by SpecKit, identified by a feature number and short name, containing associated artifacts (spec.md, plan.md, research.md, tasks.md)
- **Constitution**: A single project-wide document defining project principles and guidelines for feature development
- **Workflow Step**: A stage in the SpecKit process (specify, clarify, plan, tasks) with a status (pending, in-progress, completed, failed)
- **Artifact**: A generated document (markdown file) representing a specific output from a workflow step
- **Clarification Question**: A question generated during the specify step requiring user input to resolve ambiguity

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can access the SpecKit Plan page in under 2 seconds by clicking the icon button in the top action bar
- **SC-002**: Users can view any previous feature's artifacts (spec, plan, research, tasks) within 3 seconds of selection
- **SC-003**: Users can complete a new feature workflow from description to generated tasks in under 10 minutes for a typical feature (assuming minimal clarifications)
- **SC-004**: 90% of users successfully create their first feature specification without external documentation or support
- **SC-005**: The system displays progress feedback within 1 second for each workflow step transition
- **SC-006**: Error recovery guidance reduces workflow abandonment by 70% when errors occur
- **SC-007**: The UI handles projects with up to 100 features without performance degradation (list loads in under 2 seconds)
