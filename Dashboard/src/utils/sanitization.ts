/**
 * URL and input sanitization utilities
 * Provides security functions to validate and sanitize user input
 */

/**
 * Sanitizes an image URL to prevent XSS and malicious URLs
 * Only allows http/https protocols and validates URL structure
 *
 * @param url - The URL to sanitize
 * @param fallback - Fallback URL if validation fails (default: placeholder image)
 * @returns Sanitized URL or fallback
 *
 * @example
 * sanitizeImageUrl('https://example.com/image.jpg') // ✓ Valid
 * sanitizeImageUrl('javascript:alert(1)') // ✗ Returns fallback
 * sanitizeImageUrl('ftp://example.com/file') // ✗ Returns fallback
 */
export function sanitizeImageUrl(url: string, fallback: string = '/placeholder.jpg'): string {
  // Empty or whitespace-only URLs
  if (!url || !url.trim()) {
    return fallback
  }

  try {
    const parsed = new URL(url.trim())

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return fallback
    }

    // Validate hostname exists
    if (!parsed.hostname) {
      return fallback
    }

    // Return the sanitized URL
    return parsed.href
  } catch {
    // URL parsing failed - invalid URL
    return fallback
  }
}

/**
 * Sanitizes a string to prevent XSS by escaping HTML special characters
 * Use this for user-generated content that will be displayed as text
 *
 * @param input - The string to sanitize
 * @returns Sanitized string with HTML entities escaped
 *
 * @example
 * sanitizeHtml('<script>alert(1)</script>')
 * // Returns: '&lt;script&gt;alert(1)&lt;/script&gt;'
 */
export function sanitizeHtml(input: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }

  return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char)
}

/**
 * Validates if a string is a safe filename (no path traversal)
 * Prevents directory traversal attacks like '../../../etc/passwd'
 *
 * @param filename - The filename to validate
 * @returns true if filename is safe
 *
 * @example
 * isSafeFilename('image.jpg') // ✓ true
 * isSafeFilename('../../../etc/passwd') // ✗ false
 * isSafeFilename('file/path.jpg') // ✗ false
 */
export function isSafeFilename(filename: string): boolean {
  // Disallow path separators and parent directory references
  const dangerousPatterns = [
    '..',      // Parent directory
    '/',       // Unix path separator
    '\\',      // Windows path separator
    '\0',      // Null byte
  ]

  return !dangerousPatterns.some((pattern) => filename.includes(pattern))
}

/**
 * Strips dangerous characters from user input
 * Use for general text input where you want to be extra safe
 *
 * @param input - The string to clean
 * @returns Cleaned string with only alphanumeric, spaces, and safe punctuation
 *
 * @example
 * stripDangerousChars('Hello <script>') // 'Hello script'
 * stripDangerousChars('Price: $50.99') // 'Price: $50.99'
 */
export function stripDangerousChars(input: string): string {
  // Allow: letters, numbers, spaces, and common safe punctuation
  return input.replace(/[^a-zA-Z0-9\s\-_.,!?@#$%&()]/g, '')
}
