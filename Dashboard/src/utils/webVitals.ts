/**
 * Web Vitals Monitoring Utility
 * 
 * Tracks Core Web Vitals (LCP, FID, CLS, TTF, INP) and reports them for performance analysis.
 * Following Vercel React Best Practices for performance monitoring.
 * 
 * @see https://web.dev/vitals/
 */

import { logger } from './logger'

export interface WebVitalsMetric {
    name: 'LCP' | 'CLS' | 'TTFB' | 'INP' | 'FCP'
    value: number
    rating: 'good' | 'needs-improvement' | 'poor'
    delta: number
    id: string
}

// Thresholds based on Core Web Vitals standards (web-vitals v4+)
// Note: FID was deprecated in favor of INP
const THRESHOLDS = {
    LCP: { good: 2500, poor: 4000 },      // Largest Contentful Paint (ms)
    CLS: { good: 0.1, poor: 0.25 },       // Cumulative Layout Shift (score)
    TTFB: { good: 800, poor: 1800 },      // Time to First Byte (ms)
    INP: { good: 200, poor: 500 },        // Interaction to Next Paint (ms)
    FCP: { good: 1800, poor: 3000 },      // First Contentful Paint (ms)
} as const

function getRating(name: keyof typeof THRESHOLDS, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = THRESHOLDS[name]
    if (value <= threshold.good) return 'good'
    if (value <= threshold.poor) return 'needs-improvement'
    return 'poor'
}

type ReportHandler = (metric: WebVitalsMetric) => void

/**
 * Initializes web vitals monitoring and reports metrics to the provided handler.
 * Uses dynamic import to avoid impacting initial bundle size.
 */
export async function reportWebVitals(onReport: ReportHandler): Promise<void> {
    if (typeof window === 'undefined') return

    try {
        // Dynamic import to avoid bundle bloat
        // Note: onFID was removed in web-vitals v4+ (FID deprecated in favor of INP)
        const { onLCP, onCLS, onTTFB, onINP, onFCP } = await import('web-vitals')

        const createReporter = (name: keyof typeof THRESHOLDS) => {
            return (metric: { name: string; value: number; delta: number; id: string }) => {
                const webVitalMetric: WebVitalsMetric = {
                    name: name,
                    value: metric.value,
                    rating: getRating(name, metric.value),
                    delta: metric.delta,
                    id: metric.id,
                }
                onReport(webVitalMetric)
            }
        }

        onLCP(createReporter('LCP'))
        onCLS(createReporter('CLS'))
        onTTFB(createReporter('TTFB'))
        onINP(createReporter('INP'))
        onFCP(createReporter('FCP'))
    } catch (error) {
        // web-vitals not available, silently fail
        logger.warn('WebVitals', 'Failed to initialize', error)
    }
}

/**
 * Console reporter for development debugging
 * Only logs 'poor' metrics in development to reduce noise
 * LCP is often poor in dev mode due to Vite's on-the-fly compilation
 */
export function consoleReporter(metric: WebVitalsMetric): void {
    // In development, only log poor metrics (good/needs-improvement are expected to be noisy)
    if (import.meta.env.DEV && metric.rating !== 'poor') {
        return
    }

    const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌'

    // Add dev mode context for LCP
    const devNote = import.meta.env.DEV && metric.name === 'LCP'
        ? ' (dev mode - production will be faster)'
        : ''

    logger.info('WebVitals', `${emoji} ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})${devNote}`)
}

/**
 * Analytics reporter - sends to your analytics endpoint
 */
export function analyticsReporter(endpoint: string): ReportHandler {
    return (metric: WebVitalsMetric) => {
        // Performance API to measure time since page load
        const body = JSON.stringify({
            metric: metric.name,
            value: metric.value,
            rating: metric.rating,
            delta: metric.delta,
            id: metric.id,
            url: window.location.href,
            timestamp: Date.now(),
        })

        // Use `navigator.sendBeacon()` if available, falling back to `fetch()`.
        // sendBeacon is better for analytics as it doesn't block page unload.
        if (navigator.sendBeacon) {
            navigator.sendBeacon(endpoint, body)
        } else {
            fetch(endpoint, {
                body,
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
            })
        }
    }
}

/**
 * Time to Interactive (TTI) measurement
 * Measures when the main thread is idle and can respond to user input
 */
export function measureTTI(): Promise<number> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
            resolve(0)
            return
        }

        // Use Long Tasks API to detect when main thread is blocked
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            // When no long tasks, the page is interactive
            if (entries.length === 0) {
                observer.disconnect()
                resolve(performance.now())
            }
        })

        try {
            observer.observe({ entryTypes: ['longtask'] })
        } catch {
            // longtask not supported, fallback to load event
            if (document.readyState === 'complete') {
                resolve(performance.now())
            } else {
                window.addEventListener('load', () => {
                    // Add small delay to account for post-load tasks
                    requestIdleCallback(() => resolve(performance.now()), { timeout: 5000 })
                })
            }
        }

        // Timeout after 10 seconds
        setTimeout(() => {
            observer.disconnect()
            resolve(performance.now())
        }, 10000)
    })
}

/**
 * Utility to mark and measure custom performance metrics
 */
export const performanceMarks = {
    mark(name: string): void {
        if (typeof performance !== 'undefined') {
            performance.mark(name)
        }
    },

    measure(name: string, startMark: string, endMark?: string): PerformanceEntry | null {
        if (typeof performance === 'undefined') return null
        try {
            performance.measure(name, startMark, endMark)
            const entries = performance.getEntriesByName(name, 'measure')
            return entries[entries.length - 1] || null
        } catch {
            return null
        }
    },

    clearMarks(name?: string): void {
        if (typeof performance !== 'undefined') {
            performance.clearMarks(name)
        }
    },

    clearMeasures(name?: string): void {
        if (typeof performance !== 'undefined') {
            performance.clearMeasures(name)
        }
    },
}
