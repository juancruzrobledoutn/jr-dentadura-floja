import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsMounted } from './useIsMounted'

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export interface AsyncState<T> {
  status: AsyncStatus
  data: T | null
  error: string | null
}

export interface UseAsyncOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
  /** AbortSignal to cancel the async operation */
  signal?: AbortSignal
}

export interface UseAsyncReturn<T> extends AsyncState<T> {
  isIdle: boolean
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  execute: (asyncFn: () => Promise<T>, options?: UseAsyncOptions<T>) => Promise<T | undefined>
  /** Cancel the current async operation if running */
  cancel: () => void
  reset: () => void
  setData: (data: T) => void
}

/**
 * Hook for handling async operations with loading/success/error states.
 * Includes protection against memory leaks in unmounted components.
 *
 * @returns State and functions to execute async operations
 *
 * @example
 * const { isLoading, isError, error, execute, reset } = useAsync<OrderResult>()
 *
 * const handleSubmit = () => {
 *   execute(
 *     () => submitOrder(),
 *     {
 *       onSuccess: (data) => {
 *         logger.debug('Order ID:', data.id)
 *         setTimeout(onClose, 2000)
 *       },
 *       onError: (err) => logger.error('Async error', err)
 *     }
 *   )
 * }
 */
export function useAsync<T = unknown>(): UseAsyncReturn<T> {
  const { t } = useTranslation()
  const [state, setState] = useState<AsyncState<T>>({
    status: 'idle',
    data: null,
    error: null,
  })

  // IMPROVEMENT: Internal AbortController for cancellation
  const abortControllerRef = useRef<AbortController | null>(null)

  const isMounted = useIsMounted()

  // IMPROVEMENT: Cleanup on unmount - abort any running operations
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const execute = useCallback(
    async (
      asyncFn: () => Promise<T>,
      options?: UseAsyncOptions<T>
    ): Promise<T | undefined> => {
      // IMPROVEMENT: Cancel previous operation if still running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new AbortController for this operation
      abortControllerRef.current = new AbortController()
      const signal = options?.signal || abortControllerRef.current.signal

      setState({ status: 'loading', data: null, error: null })

      try {
        const result = await asyncFn()

        // IMPROVEMENT: Check if operation was aborted
        if (signal.aborted) {
          return undefined
        }

        if (!isMounted()) return undefined

        setState({ status: 'success', data: result, error: null })
        options?.onSuccess?.(result)

        // Clear abortController after successful completion
        abortControllerRef.current = null

        return result
      } catch (err) {
        // IMPROVEMENT: Ignore AbortError
        if (err instanceof Error && err.name === 'AbortError') {
          return undefined
        }

        if (signal.aborted || !isMounted()) {
          return undefined
        }

        const message = err instanceof Error ? err.message : t('errors.unknownError')
        setState({ status: 'error', data: null, error: message })
        options?.onError?.(message)

        // Clear abortController after error
        abortControllerRef.current = null

        return undefined
      }
    },
    [isMounted, t]
  )

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setState({ status: 'idle', data: null, error: null })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ status: 'idle', data: null, error: null })
  }, [])

  const setData = useCallback((data: T) => {
    setState({ status: 'success', data, error: null })
  }, [])

  return {
    ...state,
    isIdle: state.status === 'idle',
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
    execute,
    cancel,
    reset,
    setData,
  }
}
