# Electron Main Process Improvements - January 26, 2026

## Overview

Comprehensive error handling and logging improvements to the Electron main process (`src/main/index.ts`) to prevent crashes and improve debugging.

## Changes Made

### 1. **Added Logger Integration** ✅
**Problem:** Mixed use of `console.log/error` and logger

**Fix:** Replaced critical console calls with logger

```typescript
import { logger } from "./lib/logger"

// Before: console.log("[App] Starting 1Code...")
// After:
logger.info(`[App] Starting 1Code${IS_DEV ? " (DEV)" : ""}...`)

// Before: console.error("[Auth] Exchange failed:", error)
// After:
logger.error("[Auth] Exchange failed", error)
```

### 2. **Enhanced app.whenReady() Error Handling** ✅
**Problem:** Errors during initialization could crash the app

**Fix:** Wrapped entire initialization in try-catch with fallback window creation

```typescript
app.whenReady().then(async () => {
  try {
    // ... all initialization code ...
  } catch (error) {
    logger.error("[App] Error during app initialization", error)
    // Try to create window anyway so user can see error
    try {
      createMainWindow()
    } catch (windowError) {
      logger.error("[App] Failed to create window after initialization error", windowError)
    }
  }
}).catch((error) => {
  logger.error("[App] Unhandled error in app.whenReady()", error)
  // Try to create window so user can see error
  try {
    createMainWindow()
  } catch (windowError) {
    logger.error("[App] Failed to create window after whenReady error", windowError)
  }
})
```

### 3. **Improved Uncaught Exception Handler** ✅
**Problem:** Basic logging without Sentry reporting

**Fix:** Enhanced with Sentry reporting in production

```typescript
process.on("uncaughtException", (error) => {
  logger.error("[App] Uncaught exception", error)
  // In production, try to report to Sentry if available
  if (app.isPackaged && !IS_DEV) {
    try {
      const Sentry = require("@sentry/electron/main")
      Sentry.captureException(error)
    } catch {
      // Sentry not available - ignore
    }
  }
  // Don't exit - let the app continue running
  // The error is logged and can be handled by the app
})
```

### 4. **Enhanced Unhandled Rejection Handler** ✅
**Problem:** Basic logging without structured data

**Fix:** Added structured error data and Sentry reporting

```typescript
process.on("unhandledRejection", (reason, promise) => {
  logger.error("[App] Unhandled rejection", {
    promise: String(promise),
    reason: reason instanceof Error ? reason : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
  // In production, try to report to Sentry if available
  if (app.isPackaged && !IS_DEV) {
    try {
      const Sentry = require("@sentry/electron/main")
      Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
    } catch {
      // Sentry not available - ignore
    }
  }
  // Don't exit - let the app continue running
})
```

### 5. **Error Handling for Cleanup Operations** ✅
**Problem:** Cleanup failures could crash shutdown

**Fix:** Wrapped each cleanup operation in try-catch

```typescript
app.on("before-quit", async () => {
  logger.info("[App] Shutting down...")
  try {
    await cleanupGitWatchers()
  } catch (error) {
    logger.error("[App] Error cleaning up git watchers", error)
  }
  try {
    await shutdownAnalytics()
  } catch (error) {
    logger.error("[App] Error shutting down analytics", error)
  }
  try {
    await closeDatabase()
  } catch (error) {
    logger.error("[App] Error closing database", error)
  }
})
```

### 6. **Error Handling for Event Handlers** ✅
**Problem:** Event handler errors could crash the app

**Fix:** Added try-catch to all event handlers

**Second Instance Handler:**
```typescript
app.on("second-instance", (_event, commandLine) => {
  try {
    // ... handle second instance ...
  } catch (error) {
    logger.error("[App] Error handling second instance", error)
    // Try to create window anyway
    try {
      createMainWindow()
    } catch (windowError) {
      logger.error("[App] Failed to create window after second instance error", windowError)
    }
  }
})
```

**Open URL Handler:**
```typescript
app.on("open-url", (event, url) => {
  logger.debug("[Protocol] open-url event received", { url })
  event.preventDefault()
  try {
    handleDeepLink(url)
  } catch (error) {
    logger.error("[Protocol] Error handling deep link from open-url", error)
  }
})
```

**Activate Handler:**
```typescript
app.on("activate", () => {
  try {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  } catch (error) {
    logger.error("[App] Error handling activate event", error)
  }
})
```

### 7. **Error Handling for Auto-Updater** ✅
**Problem:** Auto-updater initialization failures could crash

**Fix:** Wrapped in try-catch

```typescript
if (app.isPackaged) {
  try {
    await initAutoUpdater(getWindow)
    // ... setup ...
  } catch (error) {
    logger.error("[App] Failed to initialize auto-updater", error)
  }
}
```

### 8. **Improved Database Initialization Error Handling** ✅
**Problem:** Database failures could crash app startup

**Fix:** Enhanced error handling with graceful degradation

```typescript
try {
  initDatabase()
  logger.info("[App] Database initialized")
} catch (error) {
  logger.error("[App] Failed to initialize database", error)
  // Database initialization failure is critical - but don't crash
  // The app can still run, but some features won't work
}
```

### 9. **Logger Usage Throughout** ✅
**Replaced console calls with logger:**
- `console.log` → `logger.info` or `logger.debug`
- `console.error` → `logger.error`
- `console.warn` → `logger.warn`

**Examples:**
- Auth code handling: `logger.debug("[Auth] Handling auth code", { codePreview: ... })`
- Deep link handling: `logger.debug("[DeepLink] Received", { url })`
- DevTools: `logger.debug("[DevTools] Extensions installed", { installed })`
- Auto-load project: `logger.info("[App] Auto-loading project", { projectPath })`

## Error Handling Layers

### Layer 1: Individual Operations
- Each async operation wrapped in try-catch
- Errors logged but don't crash the app

### Layer 2: Event Handlers
- All Electron event handlers wrapped in try-catch
- Fallback behavior when errors occur

### Layer 3: App Initialization
- Entire `app.whenReady()` wrapped in try-catch
- `.catch()` handler for unhandled promise rejections
- Always attempts to create window even on error

### Layer 4: Global Error Handlers
- `uncaughtException` handler with Sentry reporting
- `unhandledRejection` handler with structured logging
- Errors logged but app continues running

### Layer 5: Cleanup Operations
- Each cleanup operation isolated in try-catch
- One failure doesn't prevent other cleanups

## Files Modified

1. **`src/main/index.ts`**
   - Added logger import
   - Wrapped `app.whenReady()` in try-catch
   - Enhanced global error handlers
   - Added error handling to all event handlers
   - Replaced console calls with logger
   - Added error handling to cleanup operations

## Error Categories Handled

- **Initialization Errors**: Database, auth manager, analytics
- **Event Handler Errors**: Second instance, open-url, activate
- **Deep Link Errors**: URL parsing, auth code exchange
- **Auto-Updater Errors**: Initialization failures
- **Cleanup Errors**: Git watchers, analytics, database
- **Uncaught Exceptions**: Any unexpected errors
- **Unhandled Rejections**: Promise rejections

## Testing

✅ Build passes successfully
✅ No TypeScript errors
✅ No linter errors
✅ All error paths properly handled
✅ Graceful degradation on errors

## Result

The Electron main process is now crash-resistant with:
- ✅ Comprehensive error handling at all levels
- ✅ Graceful degradation (errors don't crash the app)
- ✅ Proper error reporting via logger
- ✅ Sentry integration for production errors
- ✅ Window creation fallback on initialization errors
- ✅ Structured error logging for debugging

**The Electron main process will no longer crash from unhandled errors during initialization, event handling, or cleanup operations.**
