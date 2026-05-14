import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Category } from '../types'

interface CategoryTabsProps {
  categories: Category[]
  activeCategory?: string | null
  onCategoryClick?: (category: Category) => void
}

export default function CategoryTabs({ categories, activeCategory, onCategoryClick }: CategoryTabsProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const buttons = containerRef.current?.querySelectorAll('button')
    if (!buttons) return

    let nextIndex: number | null = null

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        nextIndex = index > 0 ? index - 1 : categories.length - 1
        break
      case 'ArrowRight':
        e.preventDefault()
        nextIndex = index < categories.length - 1 ? index + 1 : 0
        break
      case 'Home':
        e.preventDefault()
        nextIndex = 0
        break
      case 'End':
        e.preventDefault()
        nextIndex = categories.length - 1
        break
    }

    if (nextIndex !== null) {
      const button = buttons[nextIndex]
      if (button instanceof HTMLButtonElement) {
        button.focus()
      }
    }
  }, [categories.length])

  return (
    <div className="mb-6 px-4 sm:px-6 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <div
          ref={containerRef}
          role="tablist"
          aria-label={t('categories.menuCategories')}
          className="flex items-center justify-center sm:justify-start gap-4 sm:gap-6 md:gap-8 overflow-x-auto scrollbar-hide"
        >
          {categories.map((category, index) => (
            <button
              key={category.id}
              role="tab"
              aria-selected={activeCategory === category.id}
              tabIndex={activeCategory === category.id ? 0 : -1}
              onClick={() => onCategoryClick?.(category)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`text-sm sm:text-base md:text-lg font-medium transition-colors whitespace-nowrap py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-dark-bg rounded ${
                activeCategory === category.id
                  ? 'text-white border-b-2 border-white'
                  : 'text-dark-muted hover:text-white'
              }`}
            >
              {t(category.name)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
