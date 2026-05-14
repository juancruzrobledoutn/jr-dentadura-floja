import type { ReactNode } from 'react'

// ============================================
// UI Component Types
// ============================================

export interface TableColumn<T> {
  key: keyof T | string
  label: ReactNode
  render?: (item: T) => ReactNode
  sortable?: boolean
  width?: string
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}
