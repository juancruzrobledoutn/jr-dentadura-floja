import { memo, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getSafeImageUrl } from '../utils/validation'
import type { Product } from '../types'

interface ProductCardProps {
  product: Product
  onClick?: (product: Product) => void
}

export default memo(function ProductCard({ product, onClick }: ProductCardProps) {
  const { t } = useTranslation()
  const isUnavailable = product.is_available === false

  // Validate image URL
  const safeImageUrl = useMemo(
    () => getSafeImageUrl(product.image, 'product'),
    [product.image]
  )

  const handleClick = useCallback(() => {
    onClick?.(product)
  }, [onClick, product])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(product)
    }
  }, [onClick, product])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-dark-bg rounded-xl sm:rounded-2xl ${isUnavailable ? 'opacity-50 grayscale' : ''}`}
      aria-label={`${product.name} - ${product.description}${isUnavailable ? ` - ${t('product.soldOut')}` : ''}`}
    >
      {/* Image - with lazy loading and dimensions to avoid CLS */}
      <div className="relative aspect-square rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-3 bg-dark-elevated">
        <img
          src={safeImageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          width={400}
          height={400}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Sold out badge */}
        {isUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bg-red-600/90 text-white text-xs sm:text-sm px-3 py-1.5 rounded-full font-bold uppercase tracking-wide">
              {t('product.soldOut')}
            </span>
          </div>
        )}

        {/* Badge */}
        {product.badge && !isUnavailable && (
          <span className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-badge-gold text-black text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-semibold">
            {product.badge}
          </span>
        )}
      </div>

      {/* Info */}
      <h3 className="text-white font-semibold text-sm sm:text-base mb-0.5 sm:mb-1 line-clamp-1">
        {product.name}
      </h3>
      <p className="text-dark-muted text-xs sm:text-sm line-clamp-2">
        {product.description}
      </p>
    </div>
  )
})
