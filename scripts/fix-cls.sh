#!/bin/bash
# Automated CLS fix script for 1Code
# Usage: ./scripts/fix-cls.sh

set -e

echo "🔧 Fixing CLS issues in 1Code..."
echo

# 1. Create loading skeleton component
echo "1. Creating loading skeleton component..."
mkdir -p src/renderer/components/ui
cat > src/renderer/components/ui/loading-skeleton.tsx << 'EOF'
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
EOF
echo "✓ Loading skeleton created"
echo

# 2. Install web-vitals
echo "2. Installing web-vitals library..."
bun add web-vitals
echo "✓ web-vitals installed"
echo

# 3. Add CSS containment and optimizations
echo "3. Adding CSS containment optimizations..."
cat >> src/renderer/index.css << 'EOF'

/* ============================================
   CLS Optimizations - Added by fix-cls.sh
   ============================================ */

/* Reduce layout recalculation */
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

/* Prevent font loading shifts */
body {
  font-display: swap;
}

/* Reserve space for images */
img:not([width]):not([height]) {
  aspect-ratio: 16 / 9;
}
EOF
echo "✓ CSS optimizations added"
echo

# 4. Create CLS monitoring utility
echo "4. Creating CLS monitoring utility..."
mkdir -p src/renderer/lib/monitoring
cat > src/renderer/lib/monitoring/web-vitals.ts << 'EOF'
import { onCLS, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * Report Core Web Vitals to analytics
 */
function sendToAnalytics(metric: Metric) {
  const body = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
  }

  console.log(`[Web Vitals] ${metric.name}:`, metric.value, `(${metric.rating})`)

  // Send to desktop analytics
  if (window.desktopApi?.trackMetric) {
    window.desktopApi.trackMetric(body)
  }
}

/**
 * Initialize Core Web Vitals monitoring
 */
export function initWebVitals() {
  onCLS(sendToAnalytics)
  onFCP(sendToAnalytics)
  onLCP(sendToAnalytics)
  onTTFB(sendToAnalytics)

  console.log('[Web Vitals] Monitoring initialized')
}
EOF
echo "✓ CLS monitoring utility created"
echo

echo "✅ Automated fixes applied successfully!"
echo
echo "📝 Manual steps required:"
echo
echo "1. Update src/renderer/App.tsx:"
echo "   - Import: import { LoadingSkeleton } from './components/ui/loading-skeleton'"
echo "   - Add: if (isLoadingProjects) { return <LoadingSkeleton /> }"
echo
echo "2. Update src/renderer/index.tsx:"
echo "   - Import: import { initWebVitals } from './lib/monitoring/web-vitals'"
echo "   - Call: initWebVitals()"
echo
echo "3. Add dimensions to icons throughout the codebase:"
echo "   - Add width={16} height={16} to all <Icon /> components"
echo
echo "4. Add min-height to dynamic content areas:"
echo "   - src/renderer/features/agents/main/active-chat.tsx"
echo "   - Add className=\"min-h-[500px]\" to message containers"
echo
echo "5. Test with Chrome DevTools:"
echo "   - Open DevTools > Performance"
echo "   - Check 'Web Vitals'"
echo "   - Record and reload"
echo "   - Look for Layout Shift markers"
echo
echo "🎯 Target: Reduce CLS from 0.31 to < 0.1"
