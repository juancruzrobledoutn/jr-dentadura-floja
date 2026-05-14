import { memo } from 'react'
import type { TableColumn } from '../../types'

interface TableProps<T> {
  data: T[]
  columns: TableColumn<T>[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
  isLoading?: boolean
  ariaLabel?: string
}

/**
 * SPRINT 10: Memoized Table component
 * Prevents re-renders when parent updates but table props unchanged
 * Used extensively across all CRUD pages
 */
function TableComponent<T extends { id: string }>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No hay datos disponibles',
  isLoading = false,
  ariaLabel,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Cargando datos">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary-500)]" aria-hidden="true" />
        <span className="sr-only">Cargando...</span>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-muted)]" role="status">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" aria-label={ariaLabel || 'Tabla de datos'}>
        <thead>
          <tr className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
            {columns.map((column) => (
              <th
                key={String(column.key)}
                scope="col"
                className={`
                  px-4 py-3 text-left text-xs font-bold text-[var(--text-secondary)]
                  uppercase tracking-wider
                  ${column.width || ''}
                `}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick?.(item)}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onRowClick(item)
                }
              }}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              aria-label={onRowClick ? `Ver detalles del elemento` : undefined}
              className={`
                border-b border-[var(--border-subtle)]
                transition-colors duration-150
                ${onRowClick ? 'cursor-pointer hover:bg-[var(--bg-hover)] focus:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:ring-inset' : ''}
              `}
            >
              {columns.map((column) => (
                <td
                  key={`${item.id}-${String(column.key)}`}
                  className="px-4 py-3 text-sm text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {column.render
                    ? column.render(item)
                    : String(item[column.key as keyof T] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Export memoized version with generic support
export const Table = memo(TableComponent) as typeof TableComponent
