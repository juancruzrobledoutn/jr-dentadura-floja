// MED-07 FIX: Add memo to prevent unnecessary re-renders when parent re-renders
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getSafeImageUrl } from '../utils/validation'
import type { Product } from '../types'

interface ProductListItemProps {
  product: Product
  onClick?: (product: Product) => void
  onAddToCart?: (product: Product) => void
}

// MED-07 FIX: Memoize component to avoid re-renders on parent state changes
export default memo(function ProductListItem({ product, onClick, onAddToCart }: ProductListItemProps) {
  const { t } = useTranslation()

  // Validate image URL
  const safeImageUrl = useMemo(
    () => getSafeImageUrl(product.image, 'product'),
    [product.image]
  )

  const handleClick = useCallback(() => {
    onClick?.(product)
  }, [onClick, product])

  const handleAddToCart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onAddToCart?.(product)
  }, [onAddToCart, product])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(product)
    }
  }, [onClick, product])

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${product.name}, $${product.price.toFixed(2)}`}
      className="w-full flex items-center gap-4 p-3 bg-dark-card border border-dark-border rounded-xl hover:border-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-dark-bg"
    >
      {/* Product Image */}
      <div className="flex-shrink-0 w-20 h-20 bg-dark-elevated rounded-lg overflow-hidden">
        <img
          src={safeImageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-xl font-bold text-white truncate">{product.name}</h3>
        <p className="text-sm text-dark-muted line-clamp-2 mt-1">{product.description}</p>
      </div>

      {/* Price and Add Button */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <span className="text-lg font-semibold text-white">${product.price.toFixed(2)}</span>
        <button
          onClick={handleAddToCart}
          className="px-3 py-1.5 bg-dark-elevated border border-dark-border rounded-lg text-dark-muted text-sm font-medium hover:bg-dark-border hover:text-white transition-colors"
          aria-label={t('product.add') + ' ' + product.name}
        >
          {t('product.add')}
        </button>
      </div>
    </div>
  )
})
