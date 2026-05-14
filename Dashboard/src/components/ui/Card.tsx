import { memo } from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

/**
 * SPRINT 8: Memoized Card component to prevent unnecessary re-renders
 */
export const Card = memo(function Card({ children, className = '', padding = 'md', onClick }: CardProps) {
  return (
    <div
      className={`
        bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl
        shadow-[var(--shadow-md)]
        hover:shadow-[var(--shadow-lg)]
        transition-shadow duration-200
        ${paddingStyles[padding]}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  )
})

interface CardHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

/**
 * SPRINT 8: Memoized CardHeader component
 */
export const CardHeader = memo(function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4 pb-4 border-b border-[var(--border-subtle)]">
      <div>
        <h3
          className="text-xl font-semibold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
})
