# Why Did You Render (WDYR) - React Re-render Debugging

This document explains how to use the WDYR library to debug infinite re-render loops and unnecessary re-renders in the desktop app.

## Quick Start

To enable WDYR debugging:

1. Open `src/renderer/wdyr.ts`
2. Change `const WDYR_ENABLED = false` to `const WDYR_ENABLED = true`
3. Run `bun run dev`
4. Reproduce the issue - console will show re-render logs

## What is WDYR?

[Why Did You Render](https://github.com/welldone-software/why-did-you-render) is a library that patches React to notify you about avoidable re-renders. It helps identify:

- Components re-rendering with the same props (referential equality issues)
- Infinite re-render loops
- Unnecessary state updates

## How It Works

### Configuration Files

1. **`src/renderer/wdyr.ts`** - WDYR initialization with custom loop detection
2. **`electron.vite.config.ts`** - JSX import source configuration (only in dev)

### JSX Import Source

In `electron.vite.config.ts`, we configure WDYR as the JSX import source in dev mode:

```typescript
react({
  jsxImportSource: isDev
    ? "@welldone-software/why-did-you-render"
    : undefined,
})
```

This is **critical** - without it, WDYR only tracks components wrapped in `React.memo` or `PureComponent`. With the JSX import source, it tracks ALL components.

## Reading WDYR Output

When enabled, you'll see console logs like:

```
[WDYR] ComponentName render #3 { props: ['sortedSubChats'], state: false, hooks: false }
```

This tells you:
- **Component**: Which component re-rendered
- **Render count**: How many times in the time window (1 second)
- **props**: Which props changed (by name)
- **state**: Which state changed
- **hooks**: Which hooks changed

### Infinite Loop Detection

When a component renders 10+ times in 1 second, WDYR will:

1. Log an error: `[ERROR] INFINITE LOOP DETECTED: ComponentName rendered 10+ times in 1000ms`
2. Log the full diff info (props, state, hooks)
3. Trigger `debugger` - pausing execution so you can inspect the call stack

## Common Patterns & Fixes

### Pattern 1: `diffType: "deepEquals"`

```json
{
  "diffType": "deepEquals",
  "pathString": "sortedSubChats",
  "prevValue": [{ "id": "abc", "name": "Chat" }],
  "nextValue": [{ "id": "abc", "name": "Chat" }]
}
```

**Problem**: Arrays/objects are deeply equal but have different references. A new array is created on every render.

**Fix**: Wrap the array/object creation in `useMemo`:

```typescript
// BAD - creates new array every render
const items = data.map(x => transform(x))

// GOOD - memoized, same reference if data unchanged
const items = useMemo(() => data.map(x => transform(x)), [data])
```

### Pattern 2: Inline Object in Render

```typescript
// BAD - creates new object every render
const agentChat = condition ? { ...remoteChat, extra: value } : localChat

// GOOD - memoized
const agentChat = useMemo(() => {
  if (condition) {
    return { ...remoteChat, extra: value }
  }
  return localChat
}, [condition, remoteChat, localChat])
```

### Pattern 3: Callback Creating New References

```typescript
// BAD - new function every render
<Child onSelect={(item) => handleSelect(item)} />

// GOOD - stable reference
const handleItemSelect = useCallback((item) => handleSelect(item), [handleSelect])
<Child onSelect={handleItemSelect} />
```

### Pattern 4: useEffect with Object Dependency

```typescript
// BAD - object reference changes every render, effect runs infinitely
useEffect(() => {
  doSomething(config)
}, [config]) // config = { a, b } created inline

// GOOD - memoize the config or use primitive deps
const config = useMemo(() => ({ a, b }), [a, b])
useEffect(() => {
  doSomething(config)
}, [config])
```

## Real Example: The Bug We Fixed

### Symptoms
- App crashed with "Maximum update depth exceeded" when clicking on remote/sandbox chats
- `SearchHistoryPopover2` showed 10+ renders in 1 second

### WDYR Output
```
[WDYR] SearchHistoryPopover2 render #10 { props: ['sortedSubChats'], state: false, hooks: false }
[ERROR] INFINITE LOOP DETECTED: SearchHistoryPopover2 rendered 10+ times in 1000ms

diffType: "deepEquals"
pathString: "sortedSubChats"
prevValue: [{ id: "abc", name: "Github projects access" }]
nextValue: [{ id: "abc", name: "Github projects access" }]
```

### Root Cause
In `active-chat.tsx`, `agentChat` was created inline:

```typescript
const agentChat = chatSourceMode === "sandbox" ? {
  ...remoteAgentChat,
  // ... transforms
} : localAgentChat
```

This created a **new object reference** on every render because of the spread operator.

The `useEffect` that syncs sub-chats depended on `agentChat`:

```typescript
useEffect(() => {
  // ... calls setAllSubChats(newArray)
}, [agentChat, chatId])
```

**Chain reaction:**
1. Component renders → new `agentChat` reference
2. useEffect runs → calls `setAllSubChats()` with new array
3. Zustand store updates → subscribers re-render
4. Parent re-renders → back to step 1 → INFINITE LOOP

### Fix
Wrap `agentChat` in `useMemo`:

```typescript
const agentChat = useMemo(() => {
  if (chatSourceMode === "sandbox") {
    if (!remoteAgentChat) return null
    return { ...remoteAgentChat, /* transforms */ }
  }
  return localAgentChat
}, [chatSourceMode, remoteAgentChat, localAgentChat])
```

## Troubleshooting

### WDYR Not Logging Anything

1. Make sure `WDYR_ENABLED = true` in `wdyr.ts`
2. Make sure you restarted the dev server after changing config
3. Check that `jsxImportSource` is set in `electron.vite.config.ts`

### Too Many Logs

Adjust the threshold in `wdyr.ts`:

```typescript
const THRESHOLD = 10  // Increase to reduce noise
const TIME_WINDOW = 1000  // Time window in ms
```

### Crash Before Logs Appear

The crash might happen before WDYR initializes. Try:
1. Add `debugger` statement at the top of the suspected component
2. Use React DevTools Profiler to identify the looping component

## Files Reference

| File | Purpose |
|------|---------|
| `src/renderer/wdyr.ts` | WDYR config with loop detection |
| `electron.vite.config.ts` | JSX import source (dev only) |
| `src/renderer/main.tsx` | Imports wdyr.ts (must be first import) |
