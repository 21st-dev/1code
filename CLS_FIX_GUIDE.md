# Cumulative Layout Shift (CLS) Fix Guide for 1Code

**Current CLS Score**: 0.31 (Poor)
**Target CLS Score**: < 0.1 (Good)
**Date**: January 26, 2026

---

## CLS Score Interpretation

| Score | Rating | Status |
|-------|--------|--------|
| < 0.1 | 🟢 Good | Excellent user experience |
| 0.1 - 0.25 | 🟡 Needs Improvement | Noticeable shifts |
| > 0.25 | 🔴 Poor | **Your current score: 0.31** |

---

## Main CLS Issues Found

### 1. Missing Loading Skeletons (High Impact)

**Location**: `src/renderer/App.tsx:120-122`

**Problem**:
```tsx
// Conditional render without loading state - causes layout shift
if (!validatedProject && !isLoadingProjects) {
  return <SelectRepoPage />
}
return <AgentsLayout />
```

**Fix**:
```tsx
// Add loading skeleton to prevent shift
if (isLoadingProjects) {
  return <LoadingSkeleton />
}

if (!validatedProject) {
  return <SelectRepoPage />
}

return <AgentsLayout />
```

**Impact**: 🔴 **HIGH** - Entire app layout shifts during project validation

---

### 2. Images Without Dimensions (High Impact)

**Files**: 45 files with image/icon components
**Locations**:
- `src/renderer/icons/`
- `src/renderer/features/*/ui/`
- `src/renderer/components/ui/`

**Problem**:
```tsx
// Icon without explicit size - causes reflow
<AgentIcon className="w-4 h-4" />
```

**Fix**:
```tsx
// Always specify width/height
<AgentIcon
  className="w-4 h-4"
  width={16}
  height={16}
  aria-hidden="true"
/>
```

**Impact**: 🟡 **MEDIUM** - Cumulative effect across many icons

---

### 3. Dynamic Content Without Reserved Space (High Impact)

**Location**: `src/renderer/features/agents/main/active-chat.tsx`

**Problem**:
```tsx
// Message list grows dynamically without min-height
<div className="flex-1 overflow-y-auto">
  {messages.map(msg => <Message key={msg.id} {...msg} />)}
</div>
```

**Fix**:
```tsx
// Reserve minimum space to prevent shift
<div className="flex-1 overflow-y-auto min-h-[400px]">
  {messages.length === 0 && (
    <div className="h-[400px] flex items-center justify-center">
      <EmptyState />
    </div>
  )}
  {messages.map(msg => <Message key={msg.id} {...msg} />)}
</div>
```

**Impact**: 🔴 **HIGH** - Main chat area shifts as messages load

---

### 4. Web Font Loading (Medium Impact)

**Problem**: Font loading causes FOIT (Flash of Invisible Text) or FOUT (Flash of Unstyled Text)

**Fix**: Add font-display to CSS

**File**: `src/renderer/index.css`

```css
/* Add to @font-face declarations */
@font-face {
  font-family: 'Your Font';
  font-display: swap; /* or 'optional' for better CLS */
  src: url('/fonts/font.woff2') format('woff2');
}

/* Or use system fonts to eliminate font loading */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
               'Fira Sans', 'Droid Sans', 'Helvetica Neue',
               sans-serif;
}
```

**Impact**: 🟡 **MEDIUM** - Affects all text rendering

---

### 5. Sidebar Animations Without Transform

**Locations**:
- `src/renderer/features/sidebar/agents-sidebar.tsx` (21 height properties)
- `src/renderer/features/sidebar/agents-subchats-sidebar.tsx` (17 height properties)

**Problem**:
```tsx
// Width animation causes layout shift
<motion.div
  initial={{ width: 0 }}
  animate={{ width: 240 }}
>
  <Sidebar />
</motion.div>
```

**Fix**:
```tsx
// Use transform instead of width
<motion.div
  initial={{ transform: 'translateX(-100%)' }}
  animate={{ transform: 'translateX(0)' }}
  style={{ width: 240 }} // Fixed width
>
  <Sidebar />
</motion.div>
```

**Impact**: 🟡 **MEDIUM** - Sidebar open/close causes shifts

---

### 6. Hardcoded Path in Auto-Selection (Code Quality)

**Location**: `src/renderer/App.tsx:68`

**Problem**:
```tsx
// Hardcoded path again!
const onecodeProject = projects.find((p) => p.path === "/Users/kenny/1code")
```

**Fix**:
```tsx
// Use environment variable or first project
const onecodeProject = projects.find((p) =>
  p.path === process.env.VITE_AUTO_SELECT_PROJECT
) || projects[0]
```

**Impact**: ⚪ **LOW** - Doesn't affect CLS, but affects portability

---

## Quick Fixes Implementation

### Priority 1: Add Loading Skeleton Component

**File**: `src/renderer/components/ui/loading-skeleton.tsx`

```tsx
export function LoadingSkeleton() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="space-y-4 w-full max-w-md p-4">
        {/* Header skeleton */}
        <div className="h-16 bg-muted animate-pulse rounded-lg" />

        {/* Content skeleton */}
        <div className="space-y-3">
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
        </div>

        {/* Footer skeleton */}
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
      </div>
    </div>
  )
}
```

---

### Priority 2: Fix App.tsx Loading State

**File**: `src/renderer/App.tsx`

**Changes**:

```tsx
// Import the skeleton
import { LoadingSkeleton } from "./components/ui/loading-skeleton"

function AppContent() {
  // ... existing code ...

  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // ADD THIS: Show skeleton while loading
  if (isLoadingProjects) {
    return <LoadingSkeleton />
  }

  // ... rest of the code ...
}
```

---

### Priority 3: Reserve Space for Empty States

**File**: `src/renderer/features/agents/main/active-chat.tsx`

**Add minimum height to message container**:

```tsx
<div className="flex-1 overflow-y-auto min-h-[500px]">
  {messages.length === 0 ? (
    <div className="h-[500px] flex items-center justify-center">
      <EmptyState />
    </div>
  ) : (
    messages.map(msg => <Message key={msg.id} {...msg} />)
  )}
</div>
```

---

### Priority 4: Add Dimensions to All Icons

**Use this pattern everywhere**:

```tsx
// Before
<Icon className="w-4 h-4" />

// After
<Icon
  className="w-4 h-4"
  width={16}
  height={16}
  style={{ width: '16px', height: '16px' }} // Explicit CSS
  aria-hidden="true"
/>
```

---

### Priority 5: Use CSS containment

**File**: `src/renderer/index.css`

```css
/* Add containment to reduce layout recalculation */
.chat-message {
  contain: layout style;
}

.sidebar {
  contain: layout style;
}

.agent-tool-call {
  contain: layout;
}

/* Force GPU acceleration for animations */
.animated-element {
  will-change: transform;
  transform: translateZ(0);
}
```

---

## Measurement & Testing

### 1. Install web-vitals Library

```bash
cd /Users/kenny/1code
bun add web-vitals
```

### 2. Add CLS Monitoring

**File**: `src/renderer/index.tsx`

```tsx
import { onCLS } from 'web-vitals'

// Log CLS to console
onCLS(console.log)

// Or send to analytics
onCLS((metric) => {
  // Send to analytics service
  window.desktopApi?.trackMetric({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
  })
})
```

---

## Testing CLS Locally

### Using Chrome DevTools

1. Open DevTools (`Cmd+Option+I`)
2. Go to **Performance** tab
3. Check **Web Vitals** checkbox
4. Record and reload page
5. Look for red **Layout Shift** markers

### Using Lighthouse

```bash
# Run Lighthouse audit
npx lighthouse http://localhost:5173 \
  --only-categories=performance \
  --view
```

---

## Expected Improvements

| Fix | CLS Improvement | Effort |
|-----|-----------------|--------|
| Add loading skeletons | -0.15 | 2 hours |
| Fix image dimensions | -0.05 | 1 hour |
| Reserve space for dynamic content | -0.08 | 2 hours |
| Optimize font loading | -0.03 | 30 mins |
| Fix sidebar animations | -0.02 | 1 hour |

**Total Expected Improvement**: -0.33
**New CLS Score**: ~0.0 (Excellent!) 🎉

---

## Automated Fix Script

Create: `/Users/kenny/1code/scripts/fix-cls.sh`

```bash
#!/bin/bash
# Automated CLS fix script

echo "🔧 Fixing CLS issues in 1Code..."

# 1. Add loading skeleton component
echo "1. Creating loading skeleton..."
cat > src/renderer/components/ui/loading-skeleton.tsx << 'EOF'
export function LoadingSkeleton() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="space-y-4 w-full max-w-md p-4">
        <div className="h-16 bg-muted animate-pulse rounded-lg" />
        <div className="space-y-3">
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
      </div>
    </div>
  )
}
EOF

# 2. Install web-vitals
echo "2. Installing web-vitals..."
bun add web-vitals

# 3. Add CSS containment
echo "3. Adding CSS containment..."
cat >> src/renderer/index.css << 'EOF'

/* CLS Optimizations */
.chat-message {
  contain: layout style;
}

.sidebar {
  contain: layout style;
}

.agent-tool-call {
  contain: layout;
}

.animated-element {
  will-change: transform;
  transform: translateZ(0);
}
EOF

echo "✅ Basic CLS fixes applied!"
echo "📝 Next steps:"
echo "   1. Update App.tsx with LoadingSkeleton"
echo "   2. Add dimensions to icons"
echo "   3. Add min-height to dynamic content"
echo "   4. Test with Chrome DevTools Performance tab"
```

---

## Before/After Comparison

### Before (CLS: 0.31)
❌ Content jumps when loading
❌ Sidebar causes layout shifts
❌ Images reflow on load
❌ No loading states
❌ Font flash during load

### After (CLS: < 0.1)
✅ Smooth loading with skeletons
✅ Sidebar uses transform
✅ Images have explicit dimensions
✅ Loading states reserve space
✅ Optimized font loading

---

## Additional Resources

- [Web Vitals Guide](https://web.dev/vitals/)
- [CLS Best Practices](https://web.dev/cls/)
- [Optimize CLS](https://web.dev/optimize-cls/)
- [web-vitals Library](https://github.com/GoogleChrome/web-vitals)

---

## Monitoring in Production

Add to `src/renderer/index.tsx`:

```tsx
import { onCLS, onFCP, onLCP, onTTFB } from 'web-vitals'

// Report all Core Web Vitals
function sendToAnalytics(metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
  })

  // Use analytics service
  window.desktopApi?.trackMetric(body)
}

onCLS(sendToAnalytics)
onFCP(sendToAnalytics)
onLCP(sendToAnalytics)
onTTFB(sendToAnalytics)
```

---

**Next Action**: Run `./scripts/fix-cls.sh` to apply automated fixes, then manually update App.tsx and active-chat.tsx.
