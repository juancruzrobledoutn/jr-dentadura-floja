import { useState, useMemo, useCallback } from 'react'
import { X, Plus } from 'lucide-react'
import { useProductStore, selectProducts } from '../../stores/productStore'
import type { Product, PromotionItem } from '../../types'

interface ProductSelectProps {
  label?: string
  value: PromotionItem[]
  onChange: (items: PromotionItem[]) => void
  error?: string
}

export function ProductSelect({
  label,
  value,
  onChange,
  error,
}: ProductSelectProps) {
  const products = useProductStore(selectProducts)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantity, setQuantity] = useState(1)

  const activeProducts = useMemo(
    () => products.filter((p) => p.is_active !== false),
    [products]
  )

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  )

  const handleAdd = useCallback(() => {
    if (!selectedProductId) return

    const existingIndex = value.findIndex(
      (item) => item.product_id === selectedProductId
    )

    if (existingIndex >= 0) {
      // Update quantity if product already exists
      const newItems = [...value]
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + quantity,
      }
      onChange(newItems)
    } else {
      // Add new product
      onChange([...value, { product_id: selectedProductId, quantity }])
    }

    setSelectedProductId('')
    setQuantity(1)
  }, [selectedProductId, quantity, value, onChange])

  const handleRemove = useCallback(
    (productId: string) => {
      onChange(value.filter((item) => item.product_id !== productId))
    },
    [value, onChange]
  )

  const handleQuantityChange = useCallback(
    (productId: string, newQuantity: number) => {
      if (newQuantity < 1) return
      onChange(
        value.map((item) =>
          item.product_id === productId
            ? { ...item, quantity: newQuantity }
            : item
        )
      )
    },
    [value, onChange]
  )

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}

      {/* Add product row */}
      <div className="flex gap-2">
        <select
          className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          aria-label="Seleccionar producto"
        >
          <option value="">Seleccionar producto...</option>
          {activeProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} - ${product.price.toLocaleString('es-AR')}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-20 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
          aria-label="Cantidad"
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedProductId}
          className="px-3 py-2 bg-[var(--primary-500)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--primary-600)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Agregar producto"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Selected products list */}
      {value.length > 0 && (
        <div className="space-y-2 mt-3">
          {value.map((item) => {
            const product = productMap.get(item.product_id)
            if (!product) return null
            return (
              <ProductItem
                key={item.product_id}
                product={product}
                quantity={item.quantity}
                onQuantityChange={(qty) =>
                  handleQuantityChange(item.product_id, qty)
                }
                onRemove={() => handleRemove(item.product_id)}
              />
            )
          })}
        </div>
      )}

      {error && <p className="text-sm text-[var(--danger-icon)]">{error}</p>}

      {value.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No hay productos en el combo
        </p>
      )}
    </div>
  )
}

interface ProductItemProps {
  product: Product
  quantity: number
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}

function ProductItem({
  product,
  quantity,
  onQuantityChange,
  onRemove,
}: ProductItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)]/50 rounded-lg">
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="w-10 h-10 rounded object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)] text-xs">
          -
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{product.name}</p>
        <p className="text-xs text-[var(--text-muted)]">
          ${product.price.toLocaleString('es-AR')} c/u
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[var(--text-tertiary)] text-sm">x</span>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) =>
            onQuantityChange(Math.max(1, parseInt(e.target.value, 10) || 1))
          }
          className="w-16 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-emphasis)] rounded text-[var(--text-primary)] text-center text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
          aria-label={`Cantidad de ${product.name}`}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-[var(--danger-icon)] hover:bg-[var(--danger-border)]/10 rounded transition-colors"
        aria-label={`Quitar ${product.name}`}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
}
