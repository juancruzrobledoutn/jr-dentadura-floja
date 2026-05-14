import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { menuAPI } from '../services/api'
import type { AllergenWithCrossReactionsAPI, CrossReactionAPI } from '../types/backend'

const STORAGE_KEY = 'pwamenu_allergen_filter'
const PRESENCE_STORAGE_KEY = 'pwamenu_allergen_presence_filter'
const CROSS_REACTIONS_CACHE_KEY = 'pwamenu_cross_reactions_cache'

/**
 * Allergen presence type for advanced filtering.
 * Matches ProductAllergen.presence_type in the backend.
 */
export type AllergenPresenceType = 'contains' | 'may_contain' | 'free_from'

/**
 * Filter strictness level for allergen filtering.
 * - 'strict': Exclude products that CONTAIN the allergen
 * - 'very_strict': Exclude products that CONTAIN or MAY_CONTAIN the allergen (traces)
 */
export type AllergenStrictness = 'strict' | 'very_strict'

/**
 * Allergen data structure with presence type (from backend canonical model)
 */
export interface AllergenWithPresence {
  id: number
  name: string
  icon?: string | null
  presence_type: AllergenPresenceType
}

/**
 * Product allergens grouped by presence type (from backend view)
 */
export interface ProductAllergens {
  contains: Array<{ id: number; name: string; icon?: string | null }>
  may_contain: Array<{ id: number; name: string; icon?: string | null }>
  free_from: Array<{ id: number; name: string; icon?: string | null }>
}

/**
 * Cross-reaction probability levels
 * - 'all': Consider all cross-reactions regardless of probability
 * - 'high_medium': Consider only high and medium probability cross-reactions
 * - 'high_only': Consider only high probability cross-reactions
 */
export type CrossReactionSensitivity = 'all' | 'high_medium' | 'high_only'

/**
 * Cache entry for cross-reactions data
 */
interface CrossReactionsCacheEntry {
  allergens: AllergenWithCrossReactionsAPI[]
  timestamp: number
}

// Cache TTL: 5 minutes
const CROSS_REACTIONS_CACHE_TTL = 5 * 60 * 1000

/**
 * Get cached cross-reactions from sessionStorage
 */
function getCachedCrossReactions(branchSlug: string): AllergenWithCrossReactionsAPI[] | null {
  try {
    const cached = sessionStorage.getItem(`${CROSS_REACTIONS_CACHE_KEY}_${branchSlug}`)
    if (cached) {
      const entry: CrossReactionsCacheEntry = JSON.parse(cached)
      if (Date.now() - entry.timestamp < CROSS_REACTIONS_CACHE_TTL) {
        return entry.allergens
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Cache cross-reactions to sessionStorage
 */
function setCachedCrossReactions(branchSlug: string, allergens: AllergenWithCrossReactionsAPI[]): void {
  try {
    const entry: CrossReactionsCacheEntry = {
      allergens,
      timestamp: Date.now(),
    }
    sessionStorage.setItem(`${CROSS_REACTIONS_CACHE_KEY}_${branchSlug}`, JSON.stringify(entry))
  } catch {
    // Ignore storage errors
  }
}

/**
 * PWAM-012: Hook to persist allergen filter preferences in sessionStorage
 * Stores allergen IDs that the user wants to AVOID (exclude from view)
 *
 * Enhanced for canonical model (Phase 0):
 * - Supports presence types (contains, may_contain, free_from)
 * - Supports strictness levels (strict: only contains, very_strict: contains + traces)
 *
 * Enhanced for cross-reactions (producto3.md improvement):
 * - Supports latex-fruit syndrome and similar cross-reactions
 * - Configurable sensitivity levels (all, high_medium, high_only)
 *
 * @param branchSlug - Optional branch slug to fetch cross-reaction data. If not provided,
 *                     cross-reaction filtering is disabled.
 */
export function useAllergenFilter(branchSlug?: string) {
  // Initialize excluded allergens from sessionStorage
  const [excludedAllergenIds, setExcludedState] = useState<number[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  })

  // Initialize strictness level from sessionStorage
  const [strictness, setStrictnessState] = useState<AllergenStrictness>(() => {
    try {
      const stored = sessionStorage.getItem(PRESENCE_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.strictness === 'strict' || parsed.strictness === 'very_strict') {
          return parsed.strictness
        }
      }
    } catch {
      // Ignore parse errors
    }
    return 'strict' // Default to strict (only hide products that CONTAIN allergen)
  })

  // Cross-reaction state
  const [crossReactionSensitivity, setCrossReactionSensitivityState] = useState<CrossReactionSensitivity>(() => {
    try {
      const stored = sessionStorage.getItem(PRESENCE_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (['all', 'high_medium', 'high_only'].includes(parsed.crossReactionSensitivity)) {
          return parsed.crossReactionSensitivity
        }
      }
    } catch {
      // Ignore parse errors
    }
    return 'high_medium' // Default: consider high and medium probability
  })

  const [crossReactionsEnabled, setCrossReactionsEnabled] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem(PRESENCE_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (typeof parsed.crossReactionsEnabled === 'boolean') {
          return parsed.crossReactionsEnabled
        }
      }
    } catch {
      // Ignore parse errors
    }
    return false // Disabled by default - opt-in feature
  })

  // Cross-reactions data
  const [allergensWithCrossReactions, setAllergensWithCrossReactions] = useState<AllergenWithCrossReactionsAPI[]>([])
  const [crossReactionsLoading, setCrossReactionsLoading] = useState(false)
  const fetchedSlugRef = useRef<string | null>(null)

  // Fetch cross-reactions data when branch slug changes
  // MENU-HOOK-CRIT-01 FIX: Add isMounted ref to prevent state updates after unmount
  useEffect(() => {
    let isMounted = true

    if (!branchSlug || fetchedSlugRef.current === branchSlug) return

    // Check cache first
    const cached = getCachedCrossReactions(branchSlug)
    if (cached) {
      setAllergensWithCrossReactions(cached)
      fetchedSlugRef.current = branchSlug
      return
    }

    // Fetch from API
    setCrossReactionsLoading(true)
    menuAPI.getAllergensWithCrossReactions(branchSlug)
      .then((data) => {
        // MENU-HOOK-CRIT-01 FIX: Check mount status before setting state
        if (!isMounted) return
        setAllergensWithCrossReactions(data)
        setCachedCrossReactions(branchSlug, data)
        fetchedSlugRef.current = branchSlug
      })
      .catch(() => {
        // Silently fail - cross-reactions are optional
        // MENU-HOOK-CRIT-01 FIX: Check mount status before setting state
        if (!isMounted) return
        setAllergensWithCrossReactions([])
      })
      .finally(() => {
        // MENU-HOOK-CRIT-01 FIX: Check mount status before setting state
        if (!isMounted) return
        setCrossReactionsLoading(false)
      })

    // MENU-HOOK-CRIT-01 FIX: Cleanup function to mark as unmounted
    return () => {
      isMounted = false
    }
  }, [branchSlug])

  // Persist allergen IDs to sessionStorage when filter changes
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(excludedAllergenIds))
    } catch {
      // Ignore storage errors (e.g., private browsing)
    }
  }, [excludedAllergenIds])

  // Persist strictness and cross-reaction settings to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(
        PRESENCE_STORAGE_KEY,
        JSON.stringify({
          strictness,
          crossReactionSensitivity,
          crossReactionsEnabled,
        })
      )
    } catch {
      // Ignore storage errors
    }
  }, [strictness, crossReactionSensitivity, crossReactionsEnabled])

  // Set strictness level
  const setStrictness = useCallback((level: AllergenStrictness) => {
    setStrictnessState(level)
  }, [])

  // Set cross-reaction sensitivity
  const setCrossReactionSensitivity = useCallback((level: CrossReactionSensitivity) => {
    setCrossReactionSensitivityState(level)
  }, [])

  // Toggle cross-reactions enabled
  const toggleCrossReactions = useCallback(() => {
    setCrossReactionsEnabled((prev) => !prev)
  }, [])

  // Enable/disable cross-reactions
  const setCrossReactionsEnabledValue = useCallback((enabled: boolean) => {
    setCrossReactionsEnabled(enabled)
  }, [])

  // Toggle an allergen (add if not excluded, remove if already excluded)
  const toggleAllergen = useCallback((allergenId: number) => {
    setExcludedState((prev) => {
      if (prev.includes(allergenId)) {
        return prev.filter((id) => id !== allergenId)
      }
      return [...prev, allergenId]
    })
  }, [])

  // Exclude a specific allergen
  const excludeAllergen = useCallback((allergenId: number) => {
    setExcludedState((prev) => {
      if (prev.includes(allergenId)) {
        return prev
      }
      return [...prev, allergenId]
    })
  }, [])

  // Include a specific allergen (remove from exclusion)
  const includeAllergen = useCallback((allergenId: number) => {
    setExcludedState((prev) => prev.filter((id) => id !== allergenId))
  }, [])

  // Clear all exclusions
  const clearExclusions = useCallback(() => {
    setExcludedState([])
  }, [])

  // Set multiple exclusions at once
  const setExcludedAllergens = useCallback((allergenIds: number[]) => {
    setExcludedState(allergenIds)
  }, [])

  /**
   * Get cross-reacted allergen IDs based on excluded allergens
   * Example: If user excludes "Látex", returns IDs for Plátano, Aguacate, Kiwi, etc.
   */
  const crossReactedAllergenIds = useMemo(() => {
    if (!crossReactionsEnabled || excludedAllergenIds.length === 0) return []

    const crossReactedIds = new Set<number>()

    for (const excludedId of excludedAllergenIds) {
      const allergen = allergensWithCrossReactions.find((a) => a.id === excludedId)
      if (!allergen?.cross_reactions) continue

      for (const cr of allergen.cross_reactions) {
        // Filter by sensitivity level
        const shouldInclude =
          crossReactionSensitivity === 'all' ||
          (crossReactionSensitivity === 'high_medium' && (cr.probability === 'high' || cr.probability === 'medium')) ||
          (crossReactionSensitivity === 'high_only' && cr.probability === 'high')

        if (shouldInclude) {
          crossReactedIds.add(cr.cross_reacts_with_id)
        }
      }
    }

    return Array.from(crossReactedIds)
  }, [excludedAllergenIds, allergensWithCrossReactions, crossReactionsEnabled, crossReactionSensitivity])

  /**
   * Combined set of allergen IDs to filter (excluded + cross-reacted)
   */
  const allFilteredAllergenIds = useMemo(() => {
    const combined = new Set([...excludedAllergenIds, ...crossReactedAllergenIds])
    return Array.from(combined)
  }, [excludedAllergenIds, crossReactedAllergenIds])

  // Check if a product should be hidden based on its allergens (legacy - simple array)
  const shouldHideProduct = useCallback(
    (productAllergenIds: number[]) => {
      if (allFilteredAllergenIds.length === 0) return false
      return productAllergenIds.some((id) => allFilteredAllergenIds.includes(id))
    },
    [allFilteredAllergenIds]
  )

  /**
   * Check if a product should be hidden based on its allergens with presence types.
   * Uses the canonical model ProductAllergens structure.
   * Now includes cross-reaction filtering.
   *
   * @param allergens - Product allergens grouped by presence type
   * @returns true if product should be hidden based on filter settings
   */
  const shouldHideProductAdvanced = useCallback(
    (allergens: ProductAllergens | null | undefined) => {
      if (allFilteredAllergenIds.length === 0) return false
      if (!allergens) return false

      // Check "contains" allergens - always check these
      const containsExcluded = allergens.contains.some((a) =>
        allFilteredAllergenIds.includes(a.id)
      )
      if (containsExcluded) return true

      // If very_strict mode, also check "may_contain" (traces)
      if (strictness === 'very_strict') {
        const mayContainExcluded = allergens.may_contain.some((a) =>
          allFilteredAllergenIds.includes(a.id)
        )
        if (mayContainExcluded) return true
      }

      return false
    },
    [allFilteredAllergenIds, strictness]
  )

  /**
   * Get cross-reactions for a specific allergen
   * Useful for displaying warnings to users
   */
  const getCrossReactionsForAllergen = useCallback(
    (allergenId: number): CrossReactionAPI[] => {
      const allergen = allergensWithCrossReactions.find((a) => a.id === allergenId)
      return allergen?.cross_reactions || []
    },
    [allergensWithCrossReactions]
  )

  /**
   * Get human-readable cross-reaction warnings for display
   * Returns array of warnings like "Alergia a Látex puede reaccionar con Plátano (alta probabilidad)"
   */
  const crossReactionWarnings = useMemo(() => {
    if (!crossReactionsEnabled) return []

    const warnings: Array<{ allergenName: string; crossReactsWith: string; probability: string; notes: string | null }> = []

    for (const excludedId of excludedAllergenIds) {
      const allergen = allergensWithCrossReactions.find((a) => a.id === excludedId)
      if (!allergen?.cross_reactions) continue

      for (const cr of allergen.cross_reactions) {
        const shouldInclude =
          crossReactionSensitivity === 'all' ||
          (crossReactionSensitivity === 'high_medium' && (cr.probability === 'high' || cr.probability === 'medium')) ||
          (crossReactionSensitivity === 'high_only' && cr.probability === 'high')

        if (shouldInclude) {
          warnings.push({
            allergenName: allergen.name,
            crossReactsWith: cr.cross_reacts_with_name,
            probability: cr.probability,
            notes: cr.notes,
          })
        }
      }
    }

    return warnings
  }, [excludedAllergenIds, allergensWithCrossReactions, crossReactionsEnabled, crossReactionSensitivity])

  // Check if a specific allergen is excluded
  const isAllergenExcluded = useCallback(
    (allergenId: number) => excludedAllergenIds.includes(allergenId),
    [excludedAllergenIds]
  )

  // Check if a specific allergen is cross-reacted (derived from excluded allergens)
  const isAllergenCrossReacted = useCallback(
    (allergenId: number) => crossReactedAllergenIds.includes(allergenId),
    [crossReactedAllergenIds]
  )

  // Number of active exclusions (direct + cross-reacted)
  const activeExclusionCount = useMemo(
    () => allFilteredAllergenIds.length,
    [allFilteredAllergenIds]
  )

  // Number of direct exclusions only
  const directExclusionCount = useMemo(
    () => excludedAllergenIds.length,
    [excludedAllergenIds]
  )

  return {
    // State
    excludedAllergenIds,
    strictness,
    crossReactionsEnabled,
    crossReactionSensitivity,
    crossReactionsLoading,
    // Derived cross-reaction data
    crossReactedAllergenIds,
    allFilteredAllergenIds,
    crossReactionWarnings,
    allergensWithCrossReactions,
    // Actions
    toggleAllergen,
    excludeAllergen,
    includeAllergen,
    clearExclusions,
    setExcludedAllergens,
    setStrictness,
    setCrossReactionSensitivity,
    toggleCrossReactions,
    setCrossReactionsEnabled: setCrossReactionsEnabledValue,
    // Filtering
    shouldHideProduct, // Legacy - for backward compatibility (now includes cross-reactions)
    shouldHideProductAdvanced, // New - uses presence types + cross-reactions
    isAllergenExcluded,
    isAllergenCrossReacted,
    getCrossReactionsForAllergen,
    // Computed
    activeExclusionCount, // Total filtered (direct + cross-reacted)
    directExclusionCount, // Only direct exclusions
    hasActiveFilter: activeExclusionCount > 0,
    isVeryStrict: strictness === 'very_strict',
    hasCrossReactions: crossReactedAllergenIds.length > 0,
  }
}
