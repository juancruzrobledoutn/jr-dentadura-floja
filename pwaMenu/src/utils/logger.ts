/**
 * Centralized logger utility
 *
 * Only logs in development mode to prevent console pollution in production.
 * All console.log/warn/error calls should use this utility.
 */

const isDev = import.meta.env.DEV

interface LogOptions {
  /** Force logging even in production (use sparingly) */
  force?: boolean
  /** Additional context data */
  context?: Record<string, unknown>
}

/**
 * Logger with environment-aware output
 */
export const logger = {
  /**
   * Debug level - only in development
   */
  debug(message: string, data?: unknown, options?: LogOptions): void {
    if (isDev || options?.force) {
      console.log(`[DEBUG] ${message}`, data !== undefined ? data : '', options?.context || '')
    }
  },

  /**
   * Info level - only in development
   */
  info(message: string, data?: unknown, options?: LogOptions): void {
    if (isDev || options?.force) {
      console.info(`[INFO] ${message}`, data !== undefined ? data : '', options?.context || '')
    }
  },

  /**
   * Warning level - only in development by default
   */
  warn(message: string, data?: unknown, options?: LogOptions): void {
    if (isDev || options?.force) {
      console.warn(`[WARN] ${message}`, data !== undefined ? data : '', options?.context || '')
    }
  },

  /**
   * Error level - always logs (errors should be visible)
   * In production, could be sent to error tracking service
   */
  error(message: string, error?: unknown, options?: LogOptions): void {
    // Errors always log for debugging critical issues
    console.error(`[ERROR] ${message}`, error !== undefined ? error : '', options?.context || '')

    // In production, you might want to send to an error tracking service
    // if (!isDev) { sendToErrorTracking(message, error) }
  },

  /**
   * Log with custom prefix (for component/module identification)
   */
  module(moduleName: string) {
    return {
      debug: (message: string, data?: unknown) =>
        logger.debug(`[${moduleName}] ${message}`, data),
      info: (message: string, data?: unknown) =>
        logger.info(`[${moduleName}] ${message}`, data),
      warn: (message: string, data?: unknown) =>
        logger.warn(`[${moduleName}] ${message}`, data),
      error: (message: string, error?: unknown) =>
        logger.error(`[${moduleName}] ${message}`, error),
    }
  },
}

// Pre-configured loggers for common modules
export const tableStoreLogger = logger.module('TableStore')
export const apiLogger = logger.module('API')
export const i18nLogger = logger.module('i18n')
export const errorBoundaryLogger = logger.module('ErrorBoundary')
export const joinTableLogger = logger.module('JoinTable')
export const wsLogger = logger.module('WS')
export const orderUpdatesLogger = logger.module('OrderUpdates')
export const menuStoreLogger = logger.module('MenuStore')
export const asyncLogger = logger.module('Async')
export const callWaiterLogger = logger.module('CallWaiter')
export const serviceCallLogger = logger.module('ServiceCall')
export const notificationLogger = logger.module('Notification')
export const cartSyncLogger = logger.module('CartSync')

export default logger
