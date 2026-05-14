/**
 * SPRINT 6: Analytics utility module
 *
 * Provides a centralized interface for tracking user events and page views.
 * Ready for integration with analytics services like Google Analytics 4,
 * Mixpanel, Amplitude, or custom analytics solutions.
 *
 * Usage:
 * ```typescript
 * import { trackEvent, trackPageView } from '@/utils/analytics'
 *
 * // Track page navigation
 * trackPageView('/products')
 *
 * // Track user actions
 * trackEvent('product_created', {
 *   category: 'Bebidas',
 *   price: 1500
 * })
 * ```
 */

import { logInfo } from './logger'

/**
 * Event properties that can be attached to analytics events
 */
export interface EventProperties {
  [key: string]: string | number | boolean | null | undefined
}

/**
 * User properties for identifying users in analytics
 */
export interface UserProperties {
  userId?: string
  role?: string
  branchId?: string
  [key: string]: string | number | boolean | null | undefined
}

/**
 * Initialize analytics service
 * Call this once in main.tsx or App.tsx after user authentication
 *
 * @example
 * ```typescript
 * initAnalytics({
 *   userId: user.id,
 *   role: user.role,
 *   branchId: currentBranchId
 * })
 * ```
 */
export function initAnalytics(user?: UserProperties): void {
  if (import.meta.env.DEV) {
    logInfo('Analytics initialized', 'Analytics', { user })
  }

  // OPTIONAL: Initialize analytics service here
  // Example: Google Analytics 4
  // if (import.meta.env.PROD && import.meta.env.VITE_GA_MEASUREMENT_ID) {
  //   gtag('config', import.meta.env.VITE_GA_MEASUREMENT_ID, {
  //     user_id: user?.userId,
  //     user_properties: user
  //   })
  // }

  // Example: Mixpanel
  // if (import.meta.env.PROD && import.meta.env.VITE_MIXPANEL_TOKEN) {
  //   mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN)
  //   if (user?.userId) {
  //     mixpanel.identify(user.userId)
  //     mixpanel.people.set(user)
  //   }
  // }
}

/**
 * Track a page view
 *
 * @param path - Page path (e.g., '/products', '/branches')
 * @param properties - Optional additional properties
 *
 * @example
 * ```typescript
 * trackPageView('/products')
 * trackPageView('/branches/123', { branchName: 'Sucursal Centro' })
 * ```
 */
export function trackPageView(path: string, properties?: EventProperties): void {
  if (import.meta.env.DEV) {
    logInfo(`Page view: ${path}`, 'Analytics', properties)
  }

  // OPTIONAL: Send to analytics service
  // Example: Google Analytics 4
  // if (import.meta.env.PROD && window.gtag) {
  //   gtag('event', 'page_view', {
  //     page_path: path,
  //     ...properties
  //   })
  // }

  // Example: Mixpanel
  // if (import.meta.env.PROD && window.mixpanel) {
  //   mixpanel.track('Page View', {
  //     path,
  //     ...properties
  //   })
  // }
}

/**
 * Track a custom event
 *
 * @param eventName - Name of the event (e.g., 'product_created', 'order_completed')
 * @param properties - Event properties
 *
 * @example
 * ```typescript
 * trackEvent('product_created', {
 *   category: 'Bebidas',
 *   subcategory: 'Cervezas',
 *   price: 1500
 * })
 * ```
 */
export function trackEvent(eventName: string, properties?: EventProperties): void {
  if (import.meta.env.DEV) {
    logInfo(`Event: ${eventName}`, 'Analytics', properties)
  }

  // OPTIONAL: Send to analytics service
  // Example: Google Analytics 4
  // if (import.meta.env.PROD && window.gtag) {
  //   gtag('event', eventName, properties)
  // }

  // Example: Mixpanel
  // if (import.meta.env.PROD && window.mixpanel) {
  //   mixpanel.track(eventName, properties)
  // }

  // Example: Custom analytics endpoint
  // if (import.meta.env.PROD && import.meta.env.VITE_ANALYTICS_ENDPOINT) {
  //   fetch(import.meta.env.VITE_ANALYTICS_ENDPOINT, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       event: eventName,
  //       properties,
  //       timestamp: new Date().toISOString()
  //     })
  //   }).catch(console.error)
  // }
}

/**
 * Track an error event
 *
 * @param error - Error object or message
 * @param context - Additional context about where the error occurred
 *
 * @example
 * ```typescript
 * try {
 *   await saveProduct(product)
 * } catch (error) {
 *   trackError(error, { action: 'save_product', productId: product.id })
 * }
 * ```
 */
export function trackError(
  error: Error | string,
  context?: EventProperties
): void {
  const errorMessage = typeof error === 'string' ? error : error.message

  if (import.meta.env.DEV) {
    logInfo(`Error tracked: ${errorMessage}`, 'Analytics', context)
  }

  // OPTIONAL: Send to analytics service
  // Example: Google Analytics 4
  // if (import.meta.env.PROD && window.gtag) {
  //   gtag('event', 'exception', {
  //     description: errorMessage,
  //     fatal: false,
  //     ...context
  //   })
  // }

  // Example: Mixpanel
  // if (import.meta.env.PROD && window.mixpanel) {
  //   mixpanel.track('Error', {
  //     error: errorMessage,
  //     ...context
  //   })
  // }
}

/**
 * Track timing/performance metrics
 *
 * @param category - Metric category (e.g., 'API', 'Database', 'UI')
 * @param variable - Metric name (e.g., 'load_products', 'save_branch')
 * @param value - Time in milliseconds
 * @param label - Optional label for additional context
 *
 * @example
 * ```typescript
 * const start = performance.now()
 * await loadProducts()
 * const duration = performance.now() - start
 * trackTiming('API', 'load_products', duration)
 * ```
 */
export function trackTiming(
  category: string,
  variable: string,
  value: number,
  label?: string
): void {
  if (import.meta.env.DEV) {
    logInfo(`Timing: ${category}.${variable}`, 'Analytics', {
      value: `${value.toFixed(2)}ms`,
      label
    })
  }

  // OPTIONAL: Send to analytics service
  // Example: Google Analytics 4
  // if (import.meta.env.PROD && window.gtag) {
  //   gtag('event', 'timing_complete', {
  //     name: variable,
  //     value: Math.round(value),
  //     event_category: category,
  //     event_label: label
  //   })
  // }
}

/**
 * Update user properties
 * Call this when user information changes (e.g., role change, branch switch)
 *
 * @param properties - User properties to update
 *
 * @example
 * ```typescript
 * setUserProperties({
 *   role: 'admin',
 *   branchId: newBranchId
 * })
 * ```
 */
export function setUserProperties(properties: UserProperties): void {
  if (import.meta.env.DEV) {
    logInfo('User properties updated', 'Analytics', properties)
  }

  // OPTIONAL: Update user properties in analytics service
  // Example: Mixpanel
  // if (import.meta.env.PROD && window.mixpanel) {
  //   mixpanel.people.set(properties)
  // }

  // Example: Google Analytics 4
  // if (import.meta.env.PROD && window.gtag) {
  //   gtag('set', 'user_properties', properties)
  // }
}
