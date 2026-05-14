/**
 * Filter Badge component for pwaMenu (producto3.md improvement)
 *
 * Shows the number of active filters and opens the advanced filters modal.
 * Displays as a button next to the search bar.
 */

import { useMemo } from 'react'
import { useAllergenFilter } from '../hooks/useAllergenFilter'
import { useDietaryFilter } from '../hooks/useDietaryFilter'
import { useCookingMethodFilter } from '../hooks/useCookingMethodFilter'

interface FilterBadgeProps {
  onClick: () => void
  branchSlug?: string
}

export function FilterBadge({ onClick, branchSlug }: FilterBadgeProps) {
  // Get counts from filter hooks
  const { activeExclusionCount } = useAllergenFilter(branchSlug)
  const { activeFilterCount: dietaryCount } = useDietaryFilter()
  const { activeFilterCount: cookingCount } = useCookingMethodFilter()

  // Calculate total active filters
  const totalFilters = useMemo(() => {
    return activeExclusionCount + dietaryCount + cookingCount
  }, [activeExclusionCount, dietaryCount, cookingCount])

  const hasActiveFilters = totalFilters > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all ${hasActiveFilters
          ? 'bg-orange-500 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
        }`}
      aria-label={hasActiveFilters ? `${totalFilters} filtros activos` : 'Abrir filtros'}
    >
      {/* Filter icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
        />
      </svg>

      {/* Badge count */}
      {hasActiveFilters && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full">
          {totalFilters > 9 ? '9+' : totalFilters}
        </span>
      )}
    </button>
  )
}

export default FilterBadge
