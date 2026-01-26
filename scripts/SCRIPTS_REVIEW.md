# Scripts Review: `.mjs` Files

**Date:** January 26, 2026  
**Reviewed Files:**
- `scripts/generate-update-manifest.mjs`
- `scripts/generate-icon.mjs`
- `scripts/download-claude-binary.mjs`

## Summary

All three scripts are well-structured and functional, but there's significant code duplication that could be extracted into a shared `utils.mjs` module.

## Code Quality Assessment

### ✅ Strengths

1. **Clear Documentation**: All scripts have comprehensive JSDoc comments explaining purpose and usage
2. **Error Handling**: Proper error handling with meaningful messages
3. **Progress Feedback**: Good user feedback with console output
4. **Modular Functions**: Functions are well-separated and focused

### ⚠️ Issues & Improvements

#### 1. **Code Duplication**

**Hash Calculation:**
- `generate-update-manifest.mjs`: `calculateSha512()` (synchronous, base64)
- `download-claude-binary.mjs`: `calculateSha256()` (async, hex)

**Path Resolution:**
- All three scripts duplicate the `__dirname` resolution pattern:
  ```javascript
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  ```

**File Operations:**
- Multiple scripts read `package.json` with similar patterns
- File existence checks scattered across scripts

**Formatting:**
- `formatBytes()` in `generate-update-manifest.mjs` could be reused

#### 2. **Inconsistencies**

- **Hash Algorithms**: SHA512 vs SHA256 (different use cases, but similar implementation)
- **Async Patterns**: Mix of sync and async file operations
- **Error Messages**: Different formatting styles across scripts

#### 3. **Missing Utilities**

- No shared path resolution helper
- No shared package.json reader
- No shared file existence checker with better error messages
- No shared version extraction from package.json

## Recommendations

### 1. Create `scripts/utils.mjs`

Extract common functionality into a shared utilities module:

**Proposed exports:**
- `getScriptDir()` - Get `__dirname` for current script
- `readPackageJson()` - Read and parse package.json
- `getVersion()` - Get version from package.json or env
- `calculateHash(filePath, algorithm, encoding)` - Unified hash calculator
- `formatBytes(bytes)` - Human-readable byte formatting
- `fileExists(filePath)` - Check file existence with better errors
- `ensureDir(dirPath)` - Ensure directory exists

### 2. Refactor Existing Scripts

Update all three scripts to use the shared utilities:
- Reduce code duplication
- Improve consistency
- Make maintenance easier

### 3. Additional Improvements

**`generate-update-manifest.mjs`:**
- ✅ Good YAML serialization (simple but effective)
- ⚠️ Could use a YAML library for more complex cases
- ⚠️ Hardcoded file patterns could be configurable

**`generate-icon.mjs`:**
- ✅ Excellent use of Sharp library
- ✅ Good error handling for macOS-specific tools
- ⚠️ Hardcoded icon sizes - could be configurable
- ⚠️ Magic numbers (padding, corner radius) could be constants

**`download-claude-binary.mjs`:**
- ✅ Good progress reporting
- ✅ Proper hash verification
- ⚠️ `fetchJson()` handles redirects but could be more robust
- ⚠️ `getLatestVersion()` has a fallback but could be more explicit

## Proposed `utils.mjs` Structure

```javascript
// Path utilities
export function getScriptDir(importMetaUrl)
export function getRootDir()

// Package.json utilities
export function readPackageJson()
export function getVersion()

// File utilities
export function fileExists(filePath)
export function ensureDir(dirPath)
export function readFile(filePath, encoding = 'utf-8')
export function writeFile(filePath, content, encoding = 'utf-8')

// Hash utilities
export function calculateHash(filePath, algorithm = 'sha256', encoding = 'hex')
export function calculateSha256(filePath)
export function calculateSha512(filePath)

// Formatting utilities
export function formatBytes(bytes)

// HTTP utilities (for download-claude-binary.mjs)
export function fetchJson(url)
```

## Impact

**Before:**
- ~600 lines across 3 files
- Significant duplication
- Inconsistent patterns

**After (estimated):**
- ~400 lines across 3 files + ~150 lines in utils.mjs
- Reduced duplication by ~30%
- Consistent patterns
- Easier to maintain and test

## Priority

**High Priority:**
1. Create `utils.mjs` with path, package.json, and hash utilities
2. Refactor `generate-update-manifest.mjs` to use shared utilities
3. Refactor `download-claude-binary.mjs` to use shared utilities

**Medium Priority:**
4. Refactor `generate-icon.mjs` to use shared utilities
5. Extract HTTP utilities for reuse

**Low Priority:**
6. Add configuration files for magic numbers
7. Consider using a YAML library for complex cases
