/**
 * Centralized logging system for Dashboard.
 *
 * Features:
 * - Structured logging with levels (debug, info, warn, error)
 * - Context-aware logging (component/module names)
 * - User-friendly error messages (no internal details exposed to users)
 * - Development/production mode awareness
 * - Batch logging capability for performance
 * - Integration-ready for external logging services
 */

// ============================================================================
// Types
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  context: string
  message: string
  data?: unknown
  error?: {
    name: string
    message: string
    stack?: string
  }
}

interface LoggerConfig {
  minLevel: LogLevel
  enableConsole: boolean
  enableBatch: boolean
  batchSize: number
  batchInterval: number // ms
}

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  enableConsole: true,
  enableBatch: !import.meta.env.DEV, // Batch in production
  batchSize: 10,
  batchInterval: 5000, // 5 seconds
}

// Generic user-friendly error messages (don't expose internal details)
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  network: 'Error de conexión. Verifica tu internet.',
  validation: 'Los datos ingresados no son válidos.',
  notfound: 'El recurso solicitado no existe.',
  unauthorized: 'No tienes permisos para esta acción.',
  timeout: 'La operación tardó demasiado. Intenta nuevamente.',
  server: 'Error en el servidor. Intenta más tarde.',
  default: 'Ocurrió un error. Intenta nuevamente.',
}

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private config: LoggerConfig
  private batch: LogEntry[] = []
  private batchTimer: ReturnType<typeof setInterval> | null = null

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    if (this.config.enableBatch) {
      this.startBatchTimer()
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel]
  }

  private formatEntry(
    level: LogLevel,
    context: string,
    message: string,
    data?: unknown,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data,
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    return entry
  }

  private writeToConsole(entry: LogEntry): void {
    if (!this.config.enableConsole) return

    const prefix = `[${entry.context}]`
    const args: unknown[] = [prefix, entry.message]

    if (entry.data !== undefined) {
      args.push(entry.data)
    }
    if (entry.error) {
      args.push(entry.error)
    }

    switch (entry.level) {
      case 'debug':
        console.debug(...args)
        break
      case 'info':
        console.log(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'error':
        console.error(...args)
        break
    }
  }

  private addToBatch(entry: LogEntry): void {
    this.batch.push(entry)

    if (this.batch.length >= this.config.batchSize) {
      this.flushBatch()
    }
  }

  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      this.flushBatch()
    }, this.config.batchInterval)
  }

  private async flushBatch(): Promise<void> {
    if (this.batch.length === 0) return

    const entries = [...this.batch]
    this.batch = []

    // Future: Send to logging service
    // await fetch('/api/logs', { method: 'POST', body: JSON.stringify(entries) })

    // For now, log batch info in development
    if (import.meta.env.DEV && entries.some((e) => e.level === 'error')) {
      console.groupCollapsed(`[Logger] Batch flushed (${entries.length} entries)`)
      entries.forEach((e) => console.log(e))
      console.groupEnd()
    }
  }

  // Public logging methods
  debug(context: string, message: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return

    const entry = this.formatEntry('debug', context, message, data)
    this.writeToConsole(entry)

    if (this.config.enableBatch) {
      this.addToBatch(entry)
    }
  }

  info(context: string, message: string, data?: unknown): void {
    if (!this.shouldLog('info')) return

    const entry = this.formatEntry('info', context, message, data)
    this.writeToConsole(entry)

    if (this.config.enableBatch) {
      this.addToBatch(entry)
    }
  }

  warn(context: string, message: string, data?: unknown): void {
    if (!this.shouldLog('warn')) return

    const entry = this.formatEntry('warn', context, message, data)
    this.writeToConsole(entry)

    if (this.config.enableBatch) {
      this.addToBatch(entry)
    }
  }

  error(context: string, message: string, error?: Error | unknown, data?: unknown): void {
    if (!this.shouldLog('error')) return

    const err = error instanceof Error ? error : undefined
    const entry = this.formatEntry('error', context, message, data, err)
    this.writeToConsole(entry)

    if (this.config.enableBatch) {
      this.addToBatch(entry)
    }
  }

  // Force flush (useful before page unload)
  flush(): void {
    this.flushBatch()
  }

  // Cleanup
  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
      this.batchTimer = null
    }
    this.flushBatch()
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const logger = new Logger()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logger.flush()
  })
}

// ============================================================================
// Error Classification
// ============================================================================

function classifyError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('failed to fetch')) {
      return 'network'
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return 'timeout'
    }
    if (msg.includes('validation') || msg.includes('invalid')) {
      return 'validation'
    }
    if (msg.includes('not found') || msg.includes('404')) {
      return 'notfound'
    }
    if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
      return 'unauthorized'
    }
    if (msg.includes('500') || msg.includes('server error')) {
      return 'server'
    }
  }
  return 'default'
}

// ============================================================================
// Convenience Functions (Backward Compatible)
// ============================================================================

/**
 * Error helper that logs internally but returns a safe user-friendly message.
 * Use this in catch blocks to handle errors consistently.
 */
export function handleError(error: unknown, context: string): string {
  const internalMessage = error instanceof Error ? error.message : 'Error desconocido'
  logger.error(context, internalMessage, error)

  const errorType = classifyError(error)
  return USER_FRIENDLY_MESSAGES[errorType]
}

/**
 * Warning logger for non-critical issues
 */
export function logWarning(message: string, context: string, data?: unknown): void {
  logger.warn(context, message, data)
}

/**
 * Info logger for general information
 */
export function logInfo(message: string, context: string, data?: unknown): void {
  logger.info(context, message, data)
}

/**
 * Error logger for critical issues
 */
export function logError(message: string, context: string, data?: unknown): void {
  logger.error(context, message, undefined, data)
}

/**
 * Debug logger for development
 */
export function logDebug(message: string, context: string, data?: unknown): void {
  logger.debug(context, message, data)
}
