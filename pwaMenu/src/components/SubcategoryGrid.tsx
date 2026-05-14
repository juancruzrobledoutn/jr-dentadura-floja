import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { getSafeImageUrl } from '../utils/validation'
import type { Subcategory } from '../types'

interface SubcategoryGridProps {
  subcategories: Subcategory[]
  onSubcategoryClick: (subcategory: Subcategory) => void
  onBack: () => void
  categoryName: string
}

function SubcategoryGrid({
  subcategories,
  onSubcategoryClick,
  onBack,
  categoryName,
}: SubcategoryGridProps) {
  const { t } = useTranslation()

  return (
    <section className="px-4 sm:px-6 md:px-8 lg:px-12 py-4">
      <div className="max-w-7xl mx-auto">
        {/* Header with back button */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-dark-elevated transition-colors"
            aria-label={t('common.back')}
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {t(categoryName)}
          </h2>
        </div>

        {/* Subcategory Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {subcategories.map((subcategory) => (
            <SubcategoryCard
              key={subcategory.id}
              subcategory={subcategory}
              onClick={() => onSubcategoryClick(subcategory)}
            />
          ))}
        </div>

        {subcategories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-dark-muted">{t('home.noSubcategories')}</p>
          </div>
        )}
      </div>
    </section>
  )
}

interface SubcategoryCardProps {
  subcategory: Subcategory
  onClick: () => void
}

const SubcategoryCard = memo(function SubcategoryCard({
  subcategory,
  onClick,
}: SubcategoryCardProps) {
  const { t } = useTranslation()

  return (
    <button
      onClick={onClick}
      className="group relative aspect-square rounded-2xl overflow-hidden bg-dark-card border border-dark-border hover:border-primary/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-dark-bg"
      aria-label={t(subcategory.name)}
    >
      {/* Image */}
      <img
        src={getSafeImageUrl(subcategory.image, 'product')}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        loading="lazy"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-3 sm:p-4">
        <h3 className="text-white font-semibold text-sm sm:text-base leading-tight line-clamp-2">
          {t(subcategory.name)}
        </h3>
      </div>

      {/* Hover indicator */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </div>
      </div>
    </button>
  )
})

export default SubcategoryGrid
