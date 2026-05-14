import type { ValidationErrors } from '../utils/validation'

/**
 * Generic FormState type for useActionState
 * Used by all forms that implement React 19 form actions
 */
export type FormState<T = Record<string, unknown>> = {
  errors?: ValidationErrors<T>
  message?: string
  isSuccess?: boolean
}
