/**
 * SPRINT 9: Form utility functions
 *
 * Shared helpers for form data extraction and manipulation.
 * Eliminates duplicate form handling code across pages.
 */

/**
 * Extract form data from FormData object into a typed object
 *
 * @param formData - FormData from form submission
 * @param fields - Array of field names to extract
 * @returns Object with extracted values
 *
 * @example
 * ```typescript
 * const data = extractFormFields(formData, ['name', 'email', 'phone'])
 * // Returns: { name: '...', email: '...', phone: '...' }
 * ```
 */
export function extractFormFields<T extends Record<string, unknown>>(
  formData: FormData,
  fields: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {}

  for (const field of fields) {
    const value = formData.get(field as string)
    if (value !== null) {
      result[field] = value as T[keyof T]
    }
  }

  return result
}

/**
 * Extract checkbox values from FormData
 * FormData.getAll returns string[] for checkboxes
 *
 * @param formData - FormData from form submission
 * @param fieldName - Name of the checkbox field
 * @returns Array of selected values
 *
 * @example
 * ```typescript
 * const allergenIds = extractCheckboxValues(formData, 'allergenIds')
 * // Returns: ['alg-1', 'alg-2', 'alg-3']
 * ```
 */
export function extractCheckboxValues(
  formData: FormData,
  fieldName: string
): string[] {
  return formData.getAll(fieldName) as string[]
}

/**
 * Extract numeric value from FormData with fallback
 *
 * @param formData - FormData from form submission
 * @param fieldName - Name of the numeric field
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed number or default
 *
 * @example
 * ```typescript
 * const price = extractNumericField(formData, 'price', 0)
 * // Returns: 1500 (or 0 if invalid)
 * ```
 */
export function extractNumericField(
  formData: FormData,
  fieldName: string,
  defaultValue: number = 0
): number {
  const value = formData.get(fieldName)
  if (value === null || value === '') return defaultValue

  const parsed = parseFloat(value as string)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Extract boolean value from FormData
 * Checkboxes only appear in FormData when checked
 *
 * @param formData - FormData from form submission
 * @param fieldName - Name of the checkbox field
 * @returns Boolean value
 *
 * @example
 * ```typescript
 * const isActive = extractBooleanField(formData, 'active')
 * // Returns: true if checked, false if not
 * ```
 */
export function extractBooleanField(
  formData: FormData,
  fieldName: string
): boolean {
  return formData.get(fieldName) === 'on' || formData.get(fieldName) === 'true'
}

/**
 * Create a FormData object from a plain object
 * Useful for programmatic form submission
 *
 * @param data - Object to convert to FormData
 * @returns FormData instance
 *
 * @example
 * ```typescript
 * const formData = createFormData({
 *   name: 'Category',
 *   active: true,
 *   items: ['item-1', 'item-2']
 * })
 * ```
 */
export function createFormData(data: Record<string, unknown>): FormData {
  const formData = new FormData()

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      // Handle arrays (checkboxes, multi-select)
      value.forEach(item => formData.append(key, item))
    } else if (value !== null && value !== undefined) {
      formData.append(key, String(value))
    }
  }

  return formData
}

/**
 * Reset form fields to initial values
 *
 * @param formElement - Form element to reset
 *
 * @example
 * ```typescript
 * resetForm(formRef.current)
 * ```
 */
export function resetForm(formElement: HTMLFormElement | null): void {
  if (formElement) {
    formElement.reset()
  }
}

/**
 * Get all form errors as a single string
 * Useful for displaying all validation errors
 *
 * @param errors - Validation errors object
 * @returns Formatted error string
 *
 * @example
 * ```typescript
 * const errorMessage = formatFormErrors({
 *   name: 'Name is required',
 *   email: 'Invalid email'
 * })
 * // Returns: "Name is required, Invalid email"
 * ```
 */
export function formatFormErrors<T>(
  errors: Partial<Record<keyof T, string>>
): string {
  return Object.values(errors).filter(Boolean).join(', ')
}

/**
 * Check if form has any errors
 *
 * @param errors - Validation errors object
 * @returns True if any errors exist
 *
 * @example
 * ```typescript
 * if (hasFormErrors(errors)) {
 *   logger.debug('Form', 'Form has errors')
 * }
 * ```
 */
export function hasFormErrors<T>(
  errors: Partial<Record<keyof T, string>>
): boolean {
  return Object.keys(errors).length > 0
}
