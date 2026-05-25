## ADDED Requirements

### Requirement: Bounded Monaco File Preview
The file viewer SHALL use Monaco only for readable code/source previews at or below the configured Monaco preview byte limit.

#### Scenario: Small code preview
- **WHEN** a readable code file is at or below the Monaco preview byte limit
- **THEN** the file viewer renders the Monaco preview path

#### Scenario: Larger readable file
- **WHEN** a readable code file is above the Monaco preview byte limit but below the backend file read limit
- **THEN** the file viewer renders the plain fallback path instead of Monaco

### Requirement: Virtualized Plain File Fallback
The plain fallback viewer SHALL avoid mounting every line for larger readable files.

#### Scenario: Large fallback render
- **WHEN** fallback mode displays a file with many lines
- **THEN** only the visible line range plus overscan is mounted
- **AND** line numbers and word wrap remain available

### Requirement: Opportunistic Monaco Preload
The file viewer SHALL be able to preload Monaco after file-viewer usage begins without adding Monaco to the initial app startup path.

#### Scenario: File viewer entry
- **WHEN** the user enters a file viewer route or opens a markdown source/code path
- **THEN** the app may request Monaco preload during idle time
- **AND** the preload must not force Monaco into the main renderer startup bundle
