import { memo } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'new'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-default)]',
  success: 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]',
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-border)]',
  info: 'bg-[var(--info-bg)] text-[var(--info-text)] border border-[var(--info-border)]',
  new: 'bg-[var(--new-bg)] text-[var(--new-text)] border border-[var(--new-border)]',
}

/**
 * SPRINT 9: Memoized Badge component
 * Used extensively in tables and product listings
 */
export const Badge = memo(function Badge({
  children,
  variant = 'default',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-3 py-1
        text-xs font-semibold rounded-full
        uppercase tracking-wide
        transition-colors duration-150
        ${variantStyles[variant]}
        ${className}
      `}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {children}
    </span>
  )
})
