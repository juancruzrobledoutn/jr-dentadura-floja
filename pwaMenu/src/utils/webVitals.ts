/**
 * Web Vitals Monitoring Utility for PWA Menu
 *
 * Tracks Core Web Vitals (LCP, CLS, TTFB, INP, FCP) optimized for mobile PWA.
 * Note: FID was deprecated in web-vitals v4+ in favor of INP
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

// Mobile-optimized thresholds (slightly more lenient for mobile networks)
// Note: FID removed in web-vitals v4+ (deprecated in favor of INP)
const THRESHOLDS = {
    LCP: { good: 2500, poor: 4000 },      // Largest Contentful Paint (ms)
    CLS: { good: 0.1, poor: 0.25 },       // Cumulative Layout Shift (score)
    TTFB: { good: 1000, poor: 2000 },     // Time to First Byte (ms) - higher for mobile
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
        logger.warn('[WebVitals] Failed to initialize', error)
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

    logger.info(`${emoji} [WebVitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})${devNote}`)
}

/**
 * PWA-specific metrics collection
 * Stores metrics in sessionStorage for analysis
 */
export function pwaMetricsCollector(metric: WebVitalsMetric): void {
    try {
        const storageKey = 'pwa-web-vitals'
        const existing = sessionStorage.getItem(storageKey)
        const metrics: Record<string, WebVitalsMetric> = existing ? JSON.parse(existing) : {}

        metrics[metric.name] = metric
        sessionStorage.setItem(storageKey, JSON.stringify(metrics))
    } catch {
        // Storage not available
    }
}

/**
 * Get collected PWA metrics
 */
export function getPWAMetrics(): Record<string, WebVitalsMetric> | null {
    try {
        const data = sessionStorage.getItem('pwa-web-vitals')
        return data ? JSON.parse(data) : null
    } catch {
        return null
    }
}

/**
 * Time to Interactive (TTI) measurement for PWA
 * Uses requestIdleCallback for accurate measurement
 */
export function measureTTI(): Promise<number> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve(0)
            return
        }

        // Use requestIdleCallback when available (better for mobile)
        const callback = () => {
            resolve(performance.now())
        }

        if ('requestIdleCallback' in window) {
            (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
                .requestIdleCallback(callback, { timeout: 5000 })
        } else {
            // Fallback for Safari
            setTimeout(callback, 0)
        }
    })
}

/**
 * Performance Observer for custom metrics
 */
export function observePerformance(entryTypes: string[], callback: (entries: PerformanceEntryList) => void): PerformanceObserver | null {
    if (typeof PerformanceObserver === 'undefined') return null

    try {
        const observer = new PerformanceObserver((list) => {
            callback(list.getEntries())
        })
        observer.observe({ entryTypes })
        return observer
    } catch {
        return null
    }
}

/**
 * Mark navigation milestones for PWA
 */
export const navigationMarks = {
    start(pageName: string): void {
        if (typeof performance !== 'undefined') {
            performance.mark(`nav-start-${pageName}`)
        }
    },

    end(pageName: string): number | null {
        if (typeof performance === 'undefined') return null

        const startMark = `nav-start-${pageName}`
        const endMark = `nav-end-${pageName}`

        performance.mark(endMark)
        try {
            performance.measure(`nav-${pageName}`, startMark, endMark)
            const entries = performance.getEntriesByName(`nav-${pageName}`, 'measure')
            const entry = entries[entries.length - 1]
            return entry ? entry.duration : null
        } catch {
            return null
        }
    },

    clear(): void {
        if (typeof performance !== 'undefined') {
            performance.clearMarks()
            performance.clearMeasures()
        }
    },
}
