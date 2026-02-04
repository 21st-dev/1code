# Feature Specification: Customizable Dual Drawers with Icon Bars

**Feature Branch**: `004-customizable-sidebars`
**Created**: 2026-02-03
**Status**: Draft
**Input**: User description: "We need to add a right sidebar similar to the one implemented in the internal-v1-legacy branch. This right icon sidebar comes with its own side drawer which also display pages. The user should be able to pick which icons they want in the top action bar and which ones in the right icon bar. The two side drawers will also be independent, meaning both can be open at the same time, but inside the two drawers, only one of the pages corresponding to one of the icons can be open at any one time. Users should be able to drag icons from the top action bar or the right icon bar and place them where they want. this state should be stored for the user locally."

## Clarifications

### Session 2026-02-03

- Q: Architecture clarification → A: There is NO left sidebar. Top action bar and right icon bar BOTH open drawers that slide in from the right side. Two drawers can be open simultaneously (one from each icon group).
- Q: How should the two drawers position themselves relative to each other when both are open? → A: Drawers stack side-by-side with the top action bar drawer on the left and right icon bar drawer on the right.
- Q: What should be the width of each drawer? → A: Each drawer maintains the same width whether one or both are open (width does not change based on number of open drawers).
- Q: How do users close an open drawer? → A: Both icon toggle (click active icon again) and close button (X in drawer header).
- Q: How do users access icon configuration interface? → A: No separate configuration interface - users drag and drop icons directly anytime they want.
- Q: How should the system visually distinguish between the two icon groups? → A: Visual separation through position and styling - top action bar is horizontal at the top, right icon bar is vertical along the right edge.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dual Drawer System with Icon Bars (Priority: P1)

Users can access functionality through two independent icon bars (top action bar and right icon bar), each opening its own drawer from the right side. Both drawers can be visible simultaneously, allowing users to view content from both icon groups at once.

**Why this priority**: This is the foundation of the feature - the dual icon bar and dual drawer architecture. Without this structure, no other functionality can be implemented. It provides immediate value by allowing users to access multiple tools simultaneously.

**Independent Test**: Can be fully tested by opening the application, clicking an icon in the top action bar to open its drawer, then clicking an icon in the right icon bar to open its drawer, and verifying both drawers remain open simultaneously from the right side.

**Acceptance Scenarios**:

1. **Given** the application is open, **When** the user looks at the interface, **Then** they see both a top action bar and a right icon bar
2. **Given** the user clicks an icon in the top action bar, **When** the drawer opens, **Then** a drawer slides in from the right side displaying that icon's page
3. **Given** a drawer from the top action bar is open, **When** the user clicks an icon in the right icon bar, **Then** a second drawer slides in from the right side, and both drawers remain visible
4. **Given** two drawers are open (one from each icon group), **When** the user interacts with either drawer, **Then** both drawers remain functional and independent
5. **Given** a drawer is open from the top action bar, **When** the user clicks a different icon in the top action bar, **Then** the drawer content switches to display the newly selected icon's page
6. **Given** a drawer is open from the right icon bar, **When** the user clicks a different icon in the right icon bar, **Then** that drawer content switches to display the newly selected icon's page
7. **Given** a drawer is open, **When** the user clicks the currently active icon again, **Then** the drawer closes (toggle behavior)
8. **Given** a drawer is open, **When** the user clicks the close button (X) in the drawer header, **Then** the drawer closes

---

### User Story 2 - Drag-and-Drop Icon Reordering (Priority: P2)

Users can drag icons from one location to another (within the same bar or between bars) at any time to quickly reorganize their workspace, allowing them to customize which icons appear in the top action bar versus the right icon bar.

**Why this priority**: Once the dual drawer structure exists, users need an intuitive way to configure it to match their workflow. Drag-and-drop provides immediate, visual feedback and transforms the feature from a fixed layout to a personalized workspace.

**Independent Test**: Can be tested by dragging an icon from the top bar to the right bar, verifying it moves correctly, and confirming the change persists after closing and reopening the application.

**Acceptance Scenarios**:

1. **Given** the user hovers over an icon in either bar, **When** they click and hold the icon, **Then** the icon becomes draggable with visual feedback (e.g., cursor change, icon highlight)
2. **Given** the user is dragging an icon from the top action bar, **When** they drop it onto the right icon bar, **Then** the icon moves from the top bar to the right bar
3. **Given** the user is dragging an icon from the right icon bar, **When** they drop it onto the top action bar, **Then** the icon moves from the right bar to the top bar
4. **Given** the user is dragging an icon within the top action bar, **When** they drop it in a different position, **Then** the icon moves to that position in the top bar
5. **Given** the user is dragging an icon within the right icon bar, **When** they drop it in a different position, **Then** the icon moves to that position in the right bar
6. **Given** the user is dragging an icon, **When** they drop it in an invalid location (e.g., outside any bar area), **Then** the icon returns to its original position
7. **Given** the user has customized icon placement via drag-and-drop, **When** they restart the application, **Then** the icons remain in their configured positions

---

### Edge Cases

- What happens when all icons are moved to one bar, leaving the other bar empty?
- What happens when a user drags an icon but releases it in the same position?
- How does the system handle icon placement if the stored configuration becomes corrupted or invalid?
- What happens if a user has an icon configuration saved, but a new version of the application adds or removes icons?
- What happens when both drawers are open on a small screen where there's insufficient space?
- How does the system handle icons when a user switches between multiple projects or workspaces?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a right icon bar (vertical, along right edge) in addition to the existing top action bar (horizontal, at top)
- **FR-002**: System MUST open drawers from the right side when icons are clicked in either the top action bar or right icon bar
- **FR-003**: System MUST allow two drawers to be open simultaneously (one from the top action bar group, one from the right icon bar group), positioned side-by-side with the top action bar drawer on the left and the right icon bar drawer on the right
- **FR-003a**: System MUST maintain consistent drawer width regardless of whether one or both drawers are open (drawer width does not change when the second drawer opens)
- **FR-004**: System MUST ensure only one page is displayed at a time within each drawer (per icon group)
- **FR-005**: System MUST allow users to close a drawer from the top action bar independently of the drawer from the right icon bar via two methods: clicking the active icon again (toggle) or clicking a close button in the drawer header
- **FR-006**: System MUST allow users to close a drawer from the right icon bar independently of the drawer from the top action bar via two methods: clicking the active icon again (toggle) or clicking a close button in the drawer header
- **FR-007**: System MUST allow users to configure which icons appear in the top action bar via drag-and-drop (no separate configuration interface)
- **FR-008**: System MUST allow users to configure which icons appear in the right icon bar via drag-and-drop (no separate configuration interface)
- **FR-009**: System MUST support drag-and-drop functionality for moving icons between the top action bar and right icon bar
- **FR-010**: System MUST support drag-and-drop functionality for reordering icons within the same bar
- **FR-011**: System MUST persist icon placement configuration locally for each user
- **FR-012**: System MUST restore the user's icon configuration when the application is reopened
- **FR-013**: System MUST provide visual feedback during drag operations (e.g., cursor change, drag preview)
- **FR-014**: System MUST handle invalid drag-and-drop operations by returning the icon to its original position
- **FR-015**: System MUST display default icon placement for new users who have not yet configured their layout
- **FR-016**: Each icon MUST have a corresponding page that displays in its respective drawer when the icon is clicked
- **FR-017**: System MUST close the current page in a drawer when a different icon from the same icon group is clicked

### Key Entities

- **Icon**: Represents a clickable element that can be placed in either the top action bar or right icon bar, associated with a specific page or functionality
  - Attributes: unique identifier, display label, visual representation (icon graphic), assigned location (top bar or right bar), position within that location, associated icon group

- **Icon Group**: Represents the grouping of icons (top action bar group vs right icon bar group)
  - Attributes: group identifier (top or right), list of icons in this group, associated drawer instance

- **Sidebar Configuration**: Represents the user's personalized layout preferences
  - Attributes: user identifier (or local storage key), list of icons assigned to top bar with their order, list of icons assigned to right bar with their order, timestamp of last modification

- **Drawer**: Represents a container that slides in from the right side to display pages associated with icons
  - Attributes: associated icon group (top or right), currently open state (open/closed), currently displayed page (if open), position/offset from right edge

- **Page**: Represents the content displayed when an icon is clicked
  - Attributes: associated icon identifier, page content/component reference, page title

## Dependencies and Assumptions *(mandatory)*

### Dependencies

- The application has a top action bar where icons currently reside or can be placed
- The application supports local storage or equivalent persistence mechanism for user preferences
- The internal-v1-legacy branch contains a reference implementation that demonstrates the desired right drawer behavior

### Assumptions

- Each icon in the application can function in either the top action bar or the right icon bar without requiring modification
- Users have sufficient screen resolution to accommodate dual drawers when both are open (minimum 1280px width assumed for optimal experience)
- Icon configuration is stored per-user on the local machine (not synchronized across devices)
- Default icon placement is defined in the application and serves as the initial state for new users
- Top action bar is positioned horizontally at the top of the interface; right icon bar is positioned vertically along the right edge of the interface
- Icons are distinct from their associated pages - the same page content can be accessed regardless of which bar contains the icon
- When both drawers are open, they position side-by-side with the top action bar drawer on the left and right icon bar drawer on the right
- Each drawer maintains consistent width regardless of whether one or both drawers are open
- Drawers slide in from the right edge of the application window

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open and interact with two drawers simultaneously (one from each icon group) without conflicts
- **SC-002**: Users can customize their icon layout and have it persist across application restarts with 100% accuracy
- **SC-003**: Users can complete icon reconfiguration (moving one icon to a different bar) in under 5 seconds using drag-and-drop
- **SC-004**: Both drawers slide in from the right side with smooth animation (under 300ms)
- **SC-005**: No more than one page is visible within each drawer at any given time (per icon group)
- **SC-006**: Icon placement changes are saved locally within 1 second of the user completing the drag-and-drop operation
- **SC-007**: Users can independently open or close each drawer without affecting the other drawer's state
