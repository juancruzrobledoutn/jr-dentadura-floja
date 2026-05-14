/**
 * CSV Export Utility
 * Exports data to CSV format with Excel compatibility (BOM prefix)
 */

import { logWarning } from './logger'

export interface ColumnConfig<T> {
  key: keyof T
  header: string
  format?: (value: unknown) => string
}

/**
 * Escapes a cell value for CSV format
 * Handles quotes, commas, and newlines
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)

  // Check if escaping is needed (contains comma, quote, or newline)
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Exports data to CSV and triggers download
 * @param data Array of objects to export
 * @param filename Name for the downloaded file (without .csv extension)
 * @param columns Optional column configuration. If not provided, uses all object keys
 */
export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: ColumnConfig<T>[]
): void {
  if (data.length === 0) {
    logWarning('No data to export', 'exportToCsv')
    return
  }

  // If no columns provided, generate from first item's keys
  const columnConfigs: ColumnConfig<T>[] =
    columns ??
    (Object.keys(data[0]) as (keyof T)[]).map((key) => ({
      key,
      header: String(key),
    }))

  // Build header row
  const headerRow = columnConfigs.map((col) => escapeCsvCell(col.header)).join(',')

  // Build data rows
  const dataRows = data.map((item) =>
    columnConfigs
      .map((col) => {
        const rawValue = item[col.key]
        const formattedValue = col.format ? col.format(rawValue) : rawValue
        return escapeCsvCell(formattedValue)
      })
      .join(',')
  )

  // Combine with BOM for Excel compatibility
  const BOM = '\uFEFF'
  const csvContent = BOM + [headerRow, ...dataRows].join('\r\n')

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up blob URL
  URL.revokeObjectURL(url)
}

// ============================================================================
// Preset Column Configurations for Common Entities
// ============================================================================

/**
 * Format price from cents to display value
 */
const formatPrice = (cents: unknown): string => {
  const value = Number(cents)
  if (isNaN(value)) return ''
  return (value / 100).toFixed(2)
}

/**
 * Format boolean to Spanish
 */
const formatBoolean = (value: unknown): string => {
  return value ? 'Sí' : 'No'
}

/**
 * Format date to locale string
 */
const formatDate = (value: unknown): string => {
  if (!value) return ''
  const date = new Date(String(value))
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format array to comma-separated string
 */
const formatArray = (value: unknown): string => {
  if (!Array.isArray(value)) return ''
  return value.join('; ')
}

/**
 * Product export columns
 */
export const productColumns: ColumnConfig<{
  id: string
  name: string
  description: string
  price: number
  categoryId: string
  subcategoryId: string
  available: boolean
  allergens: string[]
}>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Nombre' },
  { key: 'description', header: 'Descripción' },
  { key: 'price', header: 'Precio', format: formatPrice },
  { key: 'categoryId', header: 'ID Categoría' },
  { key: 'subcategoryId', header: 'ID Subcategoría' },
  { key: 'available', header: 'Disponible', format: formatBoolean },
  { key: 'allergens', header: 'Alérgenos', format: formatArray },
]

/**
 * Staff export columns
 */
export const staffColumns: ColumnConfig<{
  id: string
  name: string
  email: string
  role: string
  branchId: string
  active: boolean
}>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Nombre' },
  { key: 'email', header: 'Email' },
  { key: 'role', header: 'Rol' },
  { key: 'branchId', header: 'ID Sucursal' },
  { key: 'active', header: 'Activo', format: formatBoolean },
]

/**
 * Order export columns
 */
export const orderColumns: ColumnConfig<{
  id: string
  tableId: string
  status: string
  total: number
  createdAt: string
  updatedAt: string
  items: unknown[]
}>[] = [
  { key: 'id', header: 'ID Pedido' },
  { key: 'tableId', header: 'ID Mesa' },
  { key: 'status', header: 'Estado' },
  { key: 'total', header: 'Total', format: formatPrice },
  { key: 'createdAt', header: 'Fecha Creación', format: formatDate },
  { key: 'updatedAt', header: 'Última Actualización', format: formatDate },
  { key: 'items', header: 'Cantidad Items', format: (v) => String(Array.isArray(v) ? v.length : 0) },
]

/**
 * Table export columns
 */
export const tableColumns: ColumnConfig<{
  id: string
  number: number
  capacity: number
  status: string
  branchId: string
}>[] = [
  { key: 'id', header: 'ID' },
  { key: 'number', header: 'Número' },
  { key: 'capacity', header: 'Capacidad' },
  { key: 'status', header: 'Estado' },
  { key: 'branchId', header: 'ID Sucursal' },
]

/**
 * Category export columns
 */
export const categoryColumns: ColumnConfig<{
  id: string
  name: string
  description: string
  order: number
  branchId: string
}>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Nombre' },
  { key: 'description', header: 'Descripción' },
  { key: 'order', header: 'Orden' },
  { key: 'branchId', header: 'ID Sucursal' },
]
