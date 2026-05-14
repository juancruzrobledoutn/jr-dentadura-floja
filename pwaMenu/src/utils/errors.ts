/**
 * Unified error handling for the application.
 * All custom errors extend AppError for consistent error handling.
 */

// Error codes that can be used to identify specific error types
export const ERROR_CODES = {
  // General errors
  UNKNOWN: 'UNKNOWN',
  VALIDATION: 'VALIDATION',

  // Network/API errors
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  PARSE_ERROR: 'PARSE_ERROR',
  HTTP_ERROR: 'HTTP_ERROR',

  // Auth errors
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_SECURITY_ERROR: 'AUTH_SECURITY_ERROR',
  AUTH_INCOMPLETE: 'AUTH_INCOMPLETE',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

/**
 * Base application error class.
 * Provides consistent error handling with i18n support.
 */
export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly i18nKey: string
  public readonly isRetryable: boolean

  constructor(
    message: string,
    options: {
      code?: ErrorCode
      i18nKey?: string
      isRetryable?: boolean
    } = {}
  ) {
    super(message)
    this.name = 'AppError'
    this.code = options.code ?? ERROR_CODES.UNKNOWN
    this.i18nKey = options.i18nKey ?? 'errors.unknownError'
    this.isRetryable = options.isRetryable ?? false
  }

  /**
   * Create an AppError from an unknown error
   */
  static from(error: unknown): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (error instanceof Error) {
      return new AppError(error.message, {
        code: ERROR_CODES.UNKNOWN,
        i18nKey: 'errors.unknownError',
      })
    }

    return new AppError(String(error), {
      code: ERROR_CODES.UNKNOWN,
      i18nKey: 'errors.unknownError',
    })
  }
}

/**
 * API-specific error with HTTP status code.
 */
export class ApiError extends AppError {
  public readonly status: number

  constructor(
    message: string,
    status: number,
    code?: ErrorCode
  ) {
    const i18nKey = ApiError.getI18nKeyForCode(code)
    const isRetryable = ApiError.isCodeRetryable(code, status)

    super(message, { code: code ?? ERROR_CODES.HTTP_ERROR, i18nKey, isRetryable })
    this.name = 'ApiError'
    this.status = status
  }

  private static getI18nKeyForCode(code?: ErrorCode): string {
    switch (code) {
      case ERROR_CODES.TIMEOUT:
        return 'errors.timeout'
      case ERROR_CODES.NETWORK:
        return 'errors.networkError'
      case ERROR_CODES.EMPTY_RESPONSE:
        return 'errors.emptyResponse'
      case ERROR_CODES.PARSE_ERROR:
        return 'errors.parseError'
      case ERROR_CODES.HTTP_ERROR:
        return 'errors.httpError'
      default:
        return 'errors.unknownError'
    }
  }

  private static isCodeRetryable(code: ErrorCode | undefined, status: number): boolean {
    if (code === ERROR_CODES.TIMEOUT || code === ERROR_CODES.NETWORK) {
      return true
    }
    return status >= 500 && status < 600
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

/**
 * Authentication-specific error.
 */
export class AuthError extends AppError {
  constructor(message: string, i18nKey: string) {
    super(message, {
      code: ERROR_CODES.AUTH_INVALID_TOKEN,
      i18nKey,
      isRetryable: false,
    })
    this.name = 'AuthError'
  }
}

/**
 * Validation error for form/input validation.
 */
export class ValidationError extends AppError {
  public readonly field?: string

  constructor(message: string, field?: string) {
    super(message, {
      code: ERROR_CODES.VALIDATION,
      i18nKey: 'errors.validation',
      isRetryable: false,
    })
    this.name = 'ValidationError'
    this.field = field
  }
}
