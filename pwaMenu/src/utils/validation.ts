// Validation configuration
export const VALIDATION_CONFIG = {
  tableNumber: {
    maxLength: 10,
    pattern: /^[a-zA-Z0-9-]+$/,
  },
  dinerName: {
    minLength: 2,
    maxLength: 50,
    // Allows letters (including accents), spaces and numbers (e.g., "Guest 1")
    pattern: /^[a-zA-ZÀ-ÿ0-9\s]+$/,
  },
  email: {
    maxLength: 254, // RFC 5321
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  imageUrl: {
    allowedProtocols: ['http:', 'https:'],
    // Unsplash for product images, Google/Gravatar for user avatars
    allowedHosts: [
      'images.unsplash.com',
      'plus.unsplash.com',
      'lh3.googleusercontent.com',  // Google profile pictures
      'www.gravatar.com',           // Gravatar avatars
    ],
  },
  quantity: {
    min: 1,
    max: 99,
  },
  price: {
    min: 0,
    max: 999999.99,
    decimals: 2,
  },
} as const

// Validation result type - uses i18n keys for error messages
export interface ValidationResult {
  isValid: boolean
  error: string | null
  errorParams?: Record<string, string | number>
}

/**
 * Validate a table number
 * Returns i18n keys for error messages
 */
export function validateTableNumber(value: string): ValidationResult {
  const trimmed = value.trim()

  if (!trimmed) {
    return { isValid: false, error: 'validation.tableRequired' }
  }

  if (trimmed.length > VALIDATION_CONFIG.tableNumber.maxLength) {
    return {
      isValid: false,
      error: 'validation.tableMaxLength',
      errorParams: { max: VALIDATION_CONFIG.tableNumber.maxLength }
    }
  }

  if (!VALIDATION_CONFIG.tableNumber.pattern.test(trimmed)) {
    return { isValid: false, error: 'validation.tableInvalidChars' }
  }

  return { isValid: true, error: null }
}

/**
 * Validate a diner name
 * Returns i18n keys for error messages
 */
export function validateDinerName(value: string): ValidationResult {
  const trimmed = value.trim()

  // Name is optional
  if (!trimmed) {
    return { isValid: true, error: null }
  }

  if (trimmed.length < VALIDATION_CONFIG.dinerName.minLength) {
    return {
      isValid: false,
      error: 'validation.nameMinLength',
      errorParams: { min: VALIDATION_CONFIG.dinerName.minLength }
    }
  }

  if (trimmed.length > VALIDATION_CONFIG.dinerName.maxLength) {
    return {
      isValid: false,
      error: 'validation.nameMaxLength',
      errorParams: { max: VALIDATION_CONFIG.dinerName.maxLength }
    }
  }

  if (!VALIDATION_CONFIG.dinerName.pattern.test(trimmed)) {
    return { isValid: false, error: 'validation.nameInvalidChars' }
  }

  return { isValid: true, error: null }
}

// Dangerous characters for CSS url() - prevents CSS injection
const DANGEROUS_CSS_CHARS = /[()'"\\\n\r<>`]/

/**
 * Validate an image URL to prevent XSS and CSS injection
 * Returns i18n keys for error messages
 */
export function validateImageUrl(url: string): ValidationResult {
  if (!url) {
    return { isValid: false, error: 'validation.urlRequired' }
  }

  // Allow relative URLs starting with /
  if (url.startsWith('/') && !url.startsWith('//')) {
    if (DANGEROUS_CSS_CHARS.test(url)) {
      return { isValid: false, error: 'validation.urlInvalidChars' }
    }
    return { isValid: true, error: null }
  }

  try {
    const parsed = new URL(url)

    if (!VALIDATION_CONFIG.imageUrl.allowedProtocols.includes(parsed.protocol as 'http:' | 'https:')) {
      return { isValid: false, error: 'validation.urlInvalidProtocol' }
    }

    // Check for dangerous CSS characters
    if (DANGEROUS_CSS_CHARS.test(url)) {
      return { isValid: false, error: 'validation.urlInvalidChars' }
    }

    // Only allow known hosts
    const isAllowedHost = VALIDATION_CONFIG.imageUrl.allowedHosts.some(
      host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )

    if (!isAllowedHost) {
      return { isValid: false, error: 'validation.urlInvalidHost' }
    }

    return { isValid: true, error: null }
  } catch {
    return { isValid: false, error: 'validation.urlInvalid' }
  }
}

/**
 * Escape dangerous characters for use in CSS url()
 * Must match DANGEROUS_CSS_CHARS
 */
export function escapeCssUrl(url: string): string {
  return url
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/`/g, '\\`')
}

/**
 * Sanitize text to prevent XSS (escapes HTML characters)
 * IMPORTANT: & must be escaped FIRST to not affect other entities
 *
 * NOTE: React automatically escapes values in JSX, so this is primarily
 * useful for defense-in-depth or non-React contexts (e.g., error logging).
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')  // Must be first
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
}

// Default fallback images - local assets for offline support
export const FALLBACK_IMAGES = {
  product: '/fallback-product.svg',
  avatar: '/default-avatar.svg',
} as const

/**
 * Returns a safe image URL, using fallback if validation fails
 * @param url - The URL to validate
 * @param type - 'product' or 'avatar' to determine fallback
 */
export function getSafeImageUrl(
  url: string | undefined | null,
  type: 'product' | 'avatar' = 'product'
): string {
  if (!url || !url.trim()) {
    return FALLBACK_IMAGES[type]
  }

  const validation = validateImageUrl(url)
  return validation.isValid ? url : FALLBACK_IMAGES[type]
}

/**
 * Validate a basic email
 * Returns i18n keys for error messages
 */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim()

  if (!trimmed) {
    return { isValid: false, error: 'validation.emailRequired' }
  }

  if (trimmed.length > VALIDATION_CONFIG.email.maxLength) {
    return {
      isValid: false,
      error: 'validation.emailMaxLength',
      errorParams: { max: VALIDATION_CONFIG.email.maxLength }
    }
  }

  if (!VALIDATION_CONFIG.email.pattern.test(trimmed)) {
    return { isValid: false, error: 'validation.emailInvalid' }
  }

  return { isValid: true, error: null }
}

/**
 * Validate a quantity value
 * Returns i18n keys for error messages
 */
export function validateQuantity(value: number): ValidationResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { isValid: false, error: 'validation.quantityInvalid' }
  }

  if (!Number.isInteger(value)) {
    return { isValid: false, error: 'validation.quantityMustBeInteger' }
  }

  if (value < VALIDATION_CONFIG.quantity.min) {
    return {
      isValid: false,
      error: 'validation.quantityMin',
      errorParams: { min: VALIDATION_CONFIG.quantity.min }
    }
  }

  if (value > VALIDATION_CONFIG.quantity.max) {
    return {
      isValid: false,
      error: 'validation.quantityMax',
      errorParams: { max: VALIDATION_CONFIG.quantity.max }
    }
  }

  return { isValid: true, error: null }
}

/**
 * Validate a price value
 * Returns i18n keys for error messages
 */
export function validatePrice(value: number): ValidationResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { isValid: false, error: 'validation.priceInvalid' }
  }

  if (value < VALIDATION_CONFIG.price.min) {
    return {
      isValid: false,
      error: 'validation.priceMin',
      errorParams: { min: VALIDATION_CONFIG.price.min }
    }
  }

  if (value > VALIDATION_CONFIG.price.max) {
    return {
      isValid: false,
      error: 'validation.priceMax',
      errorParams: { max: VALIDATION_CONFIG.price.max }
    }
  }

  // Check decimal places
  const decimalPart = value.toString().split('.')[1]
  if (decimalPart && decimalPart.length > VALIDATION_CONFIG.price.decimals) {
    return {
      isValid: false,
      error: 'validation.priceDecimals',
      errorParams: { decimals: VALIDATION_CONFIG.price.decimals }
    }
  }

  return { isValid: true, error: null }
}
