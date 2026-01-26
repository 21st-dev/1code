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
