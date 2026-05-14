import { useState, useMemo, useCallback, useRef, useEffect } from 'react'

// Default items per page - can be overridden via options
const DEFAULT_ITEMS_PER_PAGE = 10

interface UsePaginationOptions {
  itemsPerPage?: number
}

interface UsePaginationResult<T> {
  currentPage: number
  totalPages: number
  paginatedItems: T[]
  totalItems: number
  itemsPerPage: number
  setCurrentPage: (page: number) => void
  goToFirstPage: () => void
  goToLastPage: () => void
  goToNextPage: () => void
  goToPreviousPage: () => void
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationResult<T> {
  const { itemsPerPage = DEFAULT_ITEMS_PER_PAGE } = options
  const [currentPage, setCurrentPageInternal] = useState(1)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))

  // Use ref to track if we're resetting to prevent loops
  const isResettingRef = useRef(false)

  // MED-02 FIX: Auto-reset to page 1 when current page exceeds total pages (e.g., after filtering)
  // Use useEffect - safePage memoization handles the render correctly without needing sync layout
  useEffect(() => {
    if (currentPage > totalPages && !isResettingRef.current) {
      isResettingRef.current = true
      // Use functional update to avoid calling setState synchronously within effect
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentPageInternal(1)
      // Reset flag after state update using rAF with cleanup to prevent memory leaks
      const rafId = requestAnimationFrame(() => {
        isResettingRef.current = false
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [currentPage, totalPages])

  // Calculate safe page for current render
  const safePage = useMemo(() => {
    return Math.max(1, Math.min(currentPage, totalPages))
  }, [currentPage, totalPages])

  // Wrap setCurrentPage to clamp values within valid range
  const setCurrentPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, totalPages))
      setCurrentPageInternal(validPage)
    },
    [totalPages]
  )

  const paginatedItems = useMemo(() => {
    const startIndex = (safePage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return items.slice(startIndex, endIndex)
  }, [items, safePage, itemsPerPage])

  const goToFirstPage = useCallback(() => setCurrentPage(1), [setCurrentPage])
  const goToLastPage = useCallback(() => setCurrentPage(totalPages), [setCurrentPage, totalPages])
  const goToNextPage = useCallback(() => {
    setCurrentPageInternal((prev) => Math.min(prev + 1, totalPages))
  }, [totalPages])
  const goToPreviousPage = useCallback(() => {
    setCurrentPageInternal((prev) => Math.max(prev - 1, 1))
  }, [])

  return {
    currentPage: safePage,
    totalPages,
    paginatedItems,
    totalItems,
    itemsPerPage,
    setCurrentPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
  }
}
