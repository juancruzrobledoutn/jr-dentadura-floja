import { useState, useEffect, useId, useRef, useCallback, ChangeEvent, useTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useDebounce } from '../hooks/useDebounce'

interface SearchBarProps {
  onSearch?: (query: string) => void
  placeholder?: string
  debounceMs?: number
}

export default function SearchBar({
  onSearch,
  placeholder,
  debounceMs = 300
}: SearchBarProps) {
  const { t } = useTranslation()
  const actualPlaceholder = placeholder || t('search.placeholder')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, debounceMs)
  const inputId = useId()

  // REACT 19 IMPROVEMENT: useTransition for non-blocking search updates
  const [isPending, startTransition] = useTransition()

  // Use ref to avoid stale closure when onSearch reference changes
  const onSearchRef = useRef(onSearch)

  // Sync ref with prop only when it changes
  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  // REACT 19 IMPROVEMENT: Call onSearch in transition for non-blocking updates
  useEffect(() => {
    startTransition(() => {
      onSearchRef.current?.(debouncedQuery)
    })
  }, [debouncedQuery])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }, [])

  const handleClear = useCallback(() => {
    setQuery('')
    // Immediate clear for better UX - use ref to avoid stale closure
    onSearchRef.current?.('')
  }, [])

  return (
    <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-4">
      <div className="max-w-7xl mx-auto">
        <div
          className="flex items-center gap-3 bg-dark-input rounded-xl px-4 py-3 sm:py-3.5 md:max-w-xl lg:max-w-2xl relative"
          role="search"
        >
          {/* Search icon */}
          <label htmlFor={inputId} className="sr-only">{t('search.placeholder')}</label>
          <svg
            className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 transition-opacity ${
              isPending ? 'text-primary opacity-60 animate-pulse' : 'text-dark-muted'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          {/* Input */}
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={handleChange}
            placeholder={actualPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            className="flex-1 bg-transparent text-white placeholder-dark-muted outline-none text-base sm:text-lg"
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="text-dark-muted hover:text-white transition-colors p-1"
              aria-label={t('common.close')}
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
