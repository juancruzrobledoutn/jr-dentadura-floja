import { type ButtonHTMLAttributes } from 'react'
import { useFormStatus } from 'react-dom'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  ref?: React.Ref<HTMLButtonElement>
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-[var(--primary-500)] to-[var(--primary-600)] hover:from-[var(--primary-400)] hover:to-[var(--primary-500)] text-[var(--text-inverse)] shadow-[var(--shadow-primary)] hover:shadow-[0_4px_12px_rgba(0,120,212,0.3)] hover:-translate-y-0.5',
  secondary:
    'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] shadow-sm hover:shadow-md border border-[var(--border-default)]',
  danger:
    'bg-gradient-to-br from-[var(--danger-border)] to-[var(--danger-dark)] hover:from-[var(--danger-hover)] hover:to-[var(--danger-border)] text-[var(--text-inverse)] shadow-[var(--shadow-danger)] hover:shadow-[0_4px_12px_rgba(220,38,38,0.3)]',
  ghost:
    'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
  outline:
    'bg-transparent border border-[var(--border-default)] hover:border-[var(--primary-500)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary-500)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

// REACT 19 IMPROVEMENT: Modernized component without forwardRef, added useFormStatus
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  children,
  type,
  ref,
  ...props
}: ButtonProps) {
  // LINT FIX: Always call useFormStatus (hooks must be called unconditionally)
  const formStatus = useFormStatus()

  // Only use form pending state when type="submit"
  const isPending = isLoading || (type === 'submit' && formStatus.pending)

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isPending}
      aria-busy={isPending || undefined}
      aria-disabled={disabled || isPending || undefined}
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold rounded-lg
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      style={{ fontFamily: 'var(--font-heading)' }}
      {...props}
    >
      {isPending ? (
        <>
          <span className="sr-only">Cargando</span>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </>
      ) : (
        leftIcon
      )}
      {children}
      {!isPending && rightIcon}
    </button>
  )
}

Button.displayName = 'Button'
