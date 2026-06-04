## 1. Specification
- [ ] 1.1 Add runtime-security-baseline OpenSpec delta.
- [ ] 1.2 Validate the change in strict mode.

## 2. Voice Key Baseline
- [ ] 2.1 Confirm voice transcription does not use renderer localStorage, env fallback, or legacy router key setters.
- [ ] 2.2 Keep voice provider requests in main-process service code.

## 3. Provider Gateway Baseline
- [ ] 3.1 Redact failed upstream direct response bodies before returning gateway errors.
- [ ] 3.2 Cover gateway direct-error redaction with tests.

## 4. Raw Log Baseline
- [ ] 4.1 Make Claude raw logging explicit opt-in.
- [ ] 4.2 Cover default-off and opt-in raw logging with tests.

## 5. MCP And Protocol Boundaries
- [ ] 5.1 Guard Claude MCP config mutations with normalized server names and registered project paths.
- [ ] 5.2 Canonicalize headless ACP protocol cwd before storing jobs.
- [ ] 5.3 Cover MCP mutation and protocol cwd boundaries with tests.

## 6. Verification
- [ ] 6.1 Run targeted security tests.
- [ ] 6.2 Run full tests, type check, native check, build, and whitespace check.
- [ ] 6.3 Run real Electron startup smoke and capture recording evidence.
