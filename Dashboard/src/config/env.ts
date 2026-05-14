/**
 * SPRINT 6: Environment configuration module
 *
 * Centralizes all environment variables with type safety and defaults.
 * Use this module instead of accessing import.meta.env directly.
 *
 * Usage:
 * ```typescript
 * import { env } from '@/config/env'
 *
 * fetch(`${env.API_URL}/products`)
 * ```
 */

import { logInfo } from '../utils/logger'

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue: string = ''): string {
  return import.meta.env[key] || defaultValue
}

/**
 * Get boolean environment variable
 */
function getBoolEnv(key: string, defaultValue: boolean = false): boolean {
  const value = import.meta.env[key]
  if (value === undefined || value === '') return defaultValue
  return value === 'true' || value === '1'
}

/**
 * Get number environment variable
 */
function getNumberEnv(key: string, defaultValue: number): number {
  const value = import.meta.env[key]
  if (value === undefined || value === '') return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Environment configuration object
 * All environment variables are accessed through this object
 */
export const env = {
  // =============================================================================
  // CORE
  // =============================================================================
  /** Current environment mode */
  MODE: import.meta.env.MODE as 'development' | 'production',

  /** Is development mode */
  IS_DEV: import.meta.env.DEV,

  /** Is production mode */
  IS_PROD: import.meta.env.PROD,

  /** Environment name (development | staging | production) */
  ENVIRONMENT: getEnv('VITE_ENVIRONMENT', 'development'),

  /** Enable debug logging */
  DEBUG_MODE: getBoolEnv('VITE_DEBUG_MODE', import.meta.env.DEV),

  // =============================================================================
  // API
  // =============================================================================
  /** Backend API base URL */
  API_URL: getEnv('VITE_API_URL', 'http://localhost:8000'),

  /** API request timeout in milliseconds */
  API_TIMEOUT: getNumberEnv('VITE_API_TIMEOUT', 30000),

  // =============================================================================
  // ANALYTICS
  // =============================================================================
  /** Google Analytics 4 Measurement ID */
  GA_MEASUREMENT_ID: getEnv('VITE_GA_MEASUREMENT_ID'),

  /** Mixpanel project token */
  MIXPANEL_TOKEN: getEnv('VITE_MIXPANEL_TOKEN'),

  /** Custom analytics endpoint */
  ANALYTICS_ENDPOINT: getEnv('VITE_ANALYTICS_ENDPOINT'),

  // =============================================================================
  // ERROR TRACKING
  // =============================================================================
  /** Sentry DSN for error tracking */
  SENTRY_DSN: getEnv('VITE_SENTRY_DSN'),

  /** Sentry environment name */
  SENTRY_ENVIRONMENT: getEnv('VITE_SENTRY_ENVIRONMENT', 'production'),

  /** LogRocket App ID */
  LOGROCKET_APP_ID: getEnv('VITE_LOGROCKET_APP_ID'),

  // =============================================================================
  // AUTHENTICATION
  // =============================================================================
  /** Google OAuth Client ID */
  GOOGLE_CLIENT_ID: getEnv('VITE_GOOGLE_CLIENT_ID'),

  /** Facebook App ID */
  FACEBOOK_APP_ID: getEnv('VITE_FACEBOOK_APP_ID'),

  /** JWT token expiration in seconds */
  TOKEN_EXPIRY: getNumberEnv('VITE_TOKEN_EXPIRY', 3600),

  // =============================================================================
  // FEATURE FLAGS
  // =============================================================================
  /** Enable analytics tracking */
  FEATURE_ANALYTICS: getBoolEnv('VITE_FEATURE_ANALYTICS', false),

  /** Enable error tracking */
  FEATURE_ERROR_TRACKING: getBoolEnv('VITE_FEATURE_ERROR_TRACKING', false),

  /** Enable push notifications */
  FEATURE_PUSH_NOTIFICATIONS: getBoolEnv('VITE_FEATURE_PUSH_NOTIFICATIONS', false),

  // =============================================================================
  // PWA
  // =============================================================================
  /** Service worker update check interval in milliseconds */
  SW_UPDATE_INTERVAL: getNumberEnv('VITE_SW_UPDATE_INTERVAL', 60000),

  // =============================================================================
  // LOCALIZATION
  // =============================================================================
  /** Default language */
  DEFAULT_LOCALE: getEnv('VITE_DEFAULT_LOCALE', 'es') as 'es' | 'en' | 'pt',

  /** Available languages */
  AVAILABLE_LOCALES: getEnv('VITE_AVAILABLE_LOCALES', 'es,en,pt').split(',') as ('es' | 'en' | 'pt')[],
} as const

/**
 * Validate required environment variables on app startup
 * Throws error if required variables are missing
 */
export function validateEnv(): void {
  const requiredVars: Array<keyof typeof env> = [
    // Add required variables here when backend is integrated
    // 'API_URL',
  ]

  const missing = requiredVars.filter(key => {
    const value = env[key]
    return value === undefined || value === '' || value === null
  })

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file and ensure all required variables are set.'
    )
  }
}

/**
 * Log environment configuration in development
 * Useful for debugging environment variable issues
 * AUDIT FIX S0.8 (M18): Use centralized logger instead of console.*
 * (logger has no group/groupEnd, so we send a single structured entry)
 */
export function logEnvConfig(): void {
  if (env.IS_DEV && env.DEBUG_MODE) {
    logInfo('Environment Configuration', 'env', {
      mode: env.MODE,
      environment: env.ENVIRONMENT,
      apiUrl: env.API_URL,
      debugMode: env.DEBUG_MODE,
      featureFlags: {
        analytics: env.FEATURE_ANALYTICS,
        errorTracking: env.FEATURE_ERROR_TRACKING,
        pushNotifications: env.FEATURE_PUSH_NOTIFICATIONS,
      },
    })
  }
}

// Type exports for convenience
export type Environment = typeof env
export type EnvironmentMode = typeof env.MODE
export type Locale = typeof env.DEFAULT_LOCALE
