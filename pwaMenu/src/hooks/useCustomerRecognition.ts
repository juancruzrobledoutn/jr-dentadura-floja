/**
 * useCustomerRecognition Hook
 *
 * FASE 4: Customer Loyalty - Device recognition
 *
 * This hook checks if the current device is linked to a registered customer.
 * Used on app startup to show personalized greeting and suggestions.
 *
 * Flow:
 * 1. On mount, calls /customer/recognize to check device
 * 2. If recognized, loads customer profile and favorites
 * 3. If not recognized, returns null (anonymous mode)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { customerAPI } from '../services/api'
import { getTableToken } from '../services/api'
import { logger } from '../utils/logger'
import type {
  CustomerOutput,
  CustomerRecognizeResponse,
  CustomerSuggestionsOutput,
  FavoriteProductOutput,
} from '../types/backend'

export interface UseCustomerRecognitionResult {
  /** Whether recognition check is in progress */
  isLoading: boolean
  /** Whether device is linked to a customer */
  isRecognized: boolean
  /** Customer data if recognized */
  customer: CustomerOutput | null
  /** Personalized suggestions */
  suggestions: CustomerSuggestionsOutput | null
  /** Favorite products */
  favorites: FavoriteProductOutput[]
  /** Error message if recognition failed */
  error: string | null
  /** Refresh customer data */
  refresh: () => Promise<void>
  /** Clear customer state (logout) */
  clearCustomer: () => void
}

// Prevent duplicate recognition calls across renders
let recognitionPromise: Promise<CustomerRecognizeResponse> | null = null

export function useCustomerRecognition(): UseCustomerRecognitionResult {
  const [isLoading, setIsLoading] = useState(false)
  const [isRecognized, setIsRecognized] = useState(false)
  const [customer, setCustomer] = useState<CustomerOutput | null>(null)
  const [suggestions, setSuggestions] = useState<CustomerSuggestionsOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isMountedRef = useRef(true)
  const hasCheckedRef = useRef(false)

  /**
   * Check if device is linked to a customer
   */
  const checkRecognition = useCallback(async () => {
    const tableToken = getTableToken()
    if (!tableToken || hasCheckedRef.current) return

    setIsLoading(true)
    setError(null)

    try {
      // Dedupe concurrent calls
      if (!recognitionPromise) {
        recognitionPromise = customerAPI.recognize()
      }

      const response = await recognitionPromise
      recognitionPromise = null
      hasCheckedRef.current = true

      if (!isMountedRef.current) return

      if (response.recognized && response.customer_id) {
        setIsRecognized(true)
        // Load full customer profile
        const fullCustomer = await customerAPI.getMe()
        setCustomer(fullCustomer)

        // Load suggestions in background
        loadSuggestions()
      } else {
        setIsRecognized(false)
        setCustomer(null)
      }
    } catch (err) {
      recognitionPromise = null
      if (!isMountedRef.current) return

      // 404 means not recognized (normal case)
      if (err instanceof Error && err.message.includes('404')) {
        setIsRecognized(false)
        setCustomer(null)
      } else {
        logger.warn('Customer recognition failed', err)
        setError(err instanceof Error ? err.message : 'Recognition failed')
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  /**
   * Load personalized suggestions
   */
  const loadSuggestions = useCallback(async () => {
    try {
      const response = await customerAPI.getSuggestions()
      if (isMountedRef.current) {
        setSuggestions(response)
      }
    } catch (err) {
      // Silently fail - suggestions are optional
      logger.warn('Failed to load suggestions', err)
    }
  }, [])

  /**
   * Refresh customer data and suggestions
   */
  const refresh = useCallback(async () => {
    if (!isRecognized) return

    setIsLoading(true)
    try {
      const [customerResponse, suggestionsResponse] = await Promise.all([
        customerAPI.getMe(),
        customerAPI.getSuggestions(),
      ])

      if (isMountedRef.current) {
        setCustomer(customerResponse)
        setSuggestions(suggestionsResponse)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Refresh failed')
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [isRecognized])

  /**
   * Clear customer state (logout/forget)
   */
  const clearCustomer = useCallback(() => {
    setIsRecognized(false)
    setCustomer(null)
    setSuggestions(null)
    hasCheckedRef.current = false
  }, [])

  // Check recognition on mount
  useEffect(() => {
    isMountedRef.current = true
    checkRecognition()

    return () => {
      isMountedRef.current = false
    }
  }, [checkRecognition])

  // Compute favorites from suggestions
  const favorites = suggestions?.favorites ?? []

  return {
    isLoading,
    isRecognized,
    customer,
    suggestions,
    favorites,
    error,
    refresh,
    clearCustomer,
  }
}

/**
 * Reset recognition state (for testing/cleanup)
 */
export function resetCustomerRecognition(): void {
  recognitionPromise = null
}
