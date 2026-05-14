import { type SelectHTMLAttributes, useId } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
  ref?: React.Ref<HTMLSelectElement>
}

// REACT 19 IMPROVEMENT: Modernized component without forwardRef
export function Select({ label, error, options, placeholder, className = '', id, ref, ...props }: SelectProps) {
    const generatedId = useId()
    const selectId = id || generatedId
    const errorId = `${selectId}-error`

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`
            w-full px-3 py-2
            bg-[var(--bg-primary)] border rounded-lg
            text-[var(--text-primary)]
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-[var(--danger-border)] bg-[var(--danger-bg)]' : 'border-[var(--border-default)] hover:border-[var(--border-emphasis)]'}
            ${className}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" className="text-[var(--text-muted)]">
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} className="mt-1 text-sm text-[var(--danger-text)]" role="alert">
            {error}
          </p>
        )}
      </div>
    )
}

Select.displayName = 'Select'
