import { type InputHTMLAttributes, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  ref?: React.Ref<HTMLInputElement>
}

// REACT 19 IMPROVEMENT: Modernized component without forwardRef
export function Input({ label, error, helperText, className = '', id, ref, ...props }: InputProps) {
    const generatedId = useId()
    const inputId = id || generatedId
    const errorId = `${inputId}-error`
    const helperId = `${inputId}-helper`

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--text-secondary)] mb-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={`
            w-full px-3 py-2
            bg-[var(--bg-primary)] border rounded-lg
            text-[var(--text-primary)] placeholder-[var(--text-muted)]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent
            focus:shadow-[0_0_0_3px_rgba(249,115,22,0.1)]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-[var(--danger-border)] bg-[var(--danger-bg)]' : 'border-[var(--border-default)] hover:border-[var(--border-emphasis)]'}
            ${className}
          `}
          style={{ fontFamily: 'var(--font-body)' }}
          {...props}
        />
        {error && (
          <p
            id={errorId}
            className="mt-1.5 text-xs font-medium text-[var(--danger-text)]"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-xs text-[var(--text-muted)]">
            {helperText}
          </p>
        )}
      </div>
    )
}

Input.displayName = 'Input'
