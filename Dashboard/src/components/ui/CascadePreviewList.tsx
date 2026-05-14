import { Folder, FileText, Package, Grid, Tag, History } from 'lucide-react'
import type { CascadePreview, CascadePreviewItem } from '../../services/cascadeService'

interface CascadePreviewListProps {
  preview: CascadePreview
  /** Maximum items to show per category before collapsing */
  maxItems?: number
}

const ICONS: Record<CascadePreviewItem['type'], React.ElementType> = {
  category: Folder,
  subcategory: FileText,
  product: Package,
  table: Grid,
  promotion: Tag,
  orderHistory: History,
}

const LABELS: Record<CascadePreviewItem['type'], { singular: string; plural: string }> = {
  category: { singular: 'categoria', plural: 'categorias' },
  subcategory: { singular: 'subcategoria', plural: 'subcategorias' },
  product: { singular: 'producto', plural: 'productos' },
  table: { singular: 'mesa', plural: 'mesas' },
  promotion: { singular: 'promocion', plural: 'promociones' },
  orderHistory: { singular: 'registro', plural: 'registros de historial' },
}

/**
 * DASH-006: Component to display items affected by cascade delete
 */
export function CascadePreviewList({ preview, maxItems = 5 }: CascadePreviewListProps) {
  if (preview.totalItems === 0) {
    return null
  }

  const renderSection = (items: CascadePreviewItem[], type: CascadePreviewItem['type']) => {
    if (items.length === 0) return null

    const Icon = ICONS[type]
    const labels = LABELS[type]
    const displayItems = items.slice(0, maxItems)
    const remaining = items.length - maxItems

    return (
      <div key={type} className="mt-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] mb-1">
          <Icon className="w-4 h-4" />
          <span>
            {items.length} {items.length === 1 ? labels.singular : labels.plural}:
          </span>
        </div>
        <ul className="ml-6 space-y-0.5">
          {displayItems.map((item) => (
            <li key={item.id} className="text-sm text-[var(--text-muted)] truncate">
              {item.name}
            </li>
          ))}
          {remaining > 0 && (
            <li className="text-sm text-[var(--text-muted)] italic">
              y {remaining} mas...
            </li>
          )}
        </ul>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
      <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
        Se eliminaran los siguientes elementos:
      </p>

      {renderSection(preview.categories, 'category')}
      {renderSection(preview.subcategories, 'subcategory')}
      {renderSection(preview.products, 'product')}
      {renderSection(preview.tables, 'table')}
      {renderSection(preview.promotions, 'promotion')}

      {preview.orderHistoryCount > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <History className="w-4 h-4" />
            <span>
              {preview.orderHistoryCount} {preview.orderHistoryCount === 1 ? 'registro' : 'registros'} de historial
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 p-2 bg-[var(--danger-border)]/10 rounded text-sm text-[var(--danger-text)]">
        Total: {preview.totalItems} {preview.totalItems === 1 ? 'elemento' : 'elementos'} seran eliminados permanentemente.
      </div>
    </div>
  )
}
