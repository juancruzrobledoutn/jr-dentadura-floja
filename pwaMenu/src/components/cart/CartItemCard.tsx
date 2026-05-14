// MED-07 FIX: Add memo to prevent unnecessary re-renders when parent re-renders
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CartItem } from '../../types'

interface CartItemCardProps {
  item: CartItem
  canModify: boolean
  isDisabled: boolean
  onQuantityChange: (delta: number) => void
  onRemove: () => void
}

// MED-07 FIX: Memoize component to avoid re-renders on parent state changes
export default memo(function CartItemCard({
  item,
  canModify,
  isDisabled,
  onQuantityChange,
  onRemove,
}: CartItemCardProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-3 bg-dark-card rounded-xl p-3">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-white font-medium text-sm sm:text-base truncate">
          {item.name}
        </h3>
        <p className="text-primary font-semibold text-sm mt-0.5">
          ${item.price.toFixed(2)}
        </p>
        {item.notes && (
          <p className="text-dark-muted text-xs mt-1 truncate">{item.notes}</p>
        )}
      </div>

      {/* Quantity controls + delete */}
      {canModify ? (
        <div className="flex items-center gap-2">
          {/* Delete button */}
          <button
            onClick={onRemove}
            disabled={isDisabled}
            className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/40 transition-colors disabled:opacity-50"
            aria-label={`${t('common.delete')} ${item.name}`}
          >
            <svg
              className="w-4 h-4 text-red-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>

          {/* Quantity controls */}
          <button
            onClick={() => onQuantityChange(-1)}
            disabled={isDisabled}
            className="w-8 h-8 rounded-full bg-dark-elevated flex items-center justify-center hover:bg-dark-border transition-colors disabled:opacity-50"
            aria-label={`${t('product.decreaseQuantity')} ${item.name}`}
          >
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <span
            className="text-white font-medium w-6 text-center"
            aria-label={`${t('product.quantity')}: ${item.quantity}`}
          >
            {item.quantity}
          </span>
          <button
            onClick={() => onQuantityChange(1)}
            disabled={isDisabled}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
            aria-label={`${t('product.increaseQuantity')} ${item.name}`}
          >
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      ) : (
        <div className="bg-dark-elevated px-3 py-1.5 rounded-full">
          <span className="text-white text-sm font-medium">x{item.quantity}</span>
        </div>
      )}
    </div>
  )
})
