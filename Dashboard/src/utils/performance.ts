/**
 * Performance monitoring utilities for development
 * Helps identify performance bottlenecks and optimization opportunities
 */

import { logInfo, logWarning } from './logger'

/**
 * Measures the execution time of a function
 * Only active in development mode
 */
export function measurePerformance<T>(
  name: string,
  fn: () => T,
  warnThreshold = 16 // Warn if execution takes more than 16ms (one frame)
): T {
  if (!import.meta.env.DEV) {
    return fn()
  }

  const start = performance.now()
  const result = fn()
  const duration = performance.now() - start

  if (duration > warnThreshold) {
    logWarning(
      `Slow operation: ${name} took ${duration.toFixed(2)}ms`,
      'Performance',
      { duration, threshold: warnThreshold }
    )
  } else {
    logInfo(
      `${name} completed in ${duration.toFixed(2)}ms`,
      'Performance',
      { duration }
    )
  }

  return result
}

/**
 * Measures the execution time of an async function
 * Only active in development mode
 */
export async function measureAsyncPerformance<T>(
  name: string,
  fn: () => Promise<T>,
  warnThreshold = 100 // Warn if execution takes more than 100ms
): Promise<T> {
  if (!import.meta.env.DEV) {
    return fn()
  }

  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start

  if (duration > warnThreshold) {
    logWarning(
      `Slow async operation: ${name} took ${duration.toFixed(2)}ms`,
      'Performance',
      { duration, threshold: warnThreshold }
    )
  } else {
    logInfo(
      `${name} completed in ${duration.toFixed(2)}ms`,
      'Performance',
      { duration }
    )
  }

  return result
}

/**
 * Logs render performance using React Profiler API
 * Use in development to identify expensive renders
 */
export function logRenderPerformance(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
): void {
  if (!import.meta.env.DEV) {
    return
  }

  // Warn if render is slow
  if (actualDuration > 16) {
    logWarning(
      `Slow ${phase}: ${id} took ${actualDuration.toFixed(2)}ms to render`,
      'RenderPerformance',
      {
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      }
    )
  }
}

/**
 * Marks a performance measure in the browser DevTools
 * Useful for analyzing performance in Chrome DevTools Performance tab
 */
export function markPerformance(name: string): void {
  if (!import.meta.env.DEV) {
    return
  }

  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name)
  }
}

/**
 * Measures performance between two marks
 * Creates a measure visible in Chrome DevTools Performance tab
 */
export function measureBetweenMarks(
  name: string,
  startMark: string,
  endMark: string
): void {
  if (!import.meta.env.DEV) {
    return
  }

  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      performance.measure(name, startMark, endMark)
      const measure = performance.getEntriesByName(name)[0]
      if (measure) {
        logInfo(
          `${name}: ${measure.duration.toFixed(2)}ms`,
          'Performance',
          { duration: measure.duration }
        )
      }
    } catch {
      // Marks might not exist, ignore
    }
  }
}

/**
 * Reports Web Vitals metrics (LCP, FID, CLS)
 * Only in production builds
 */
export function reportWebVitals(): void {
  if (import.meta.env.DEV) {
    return
  }

  // This function can be extended to send metrics to analytics
  // For now, it just logs to console in production
  if ('web-vital' in window) {
    logInfo('Web Vitals reporting enabled', 'Performance')
  }
}
