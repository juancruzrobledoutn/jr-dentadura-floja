import { type TextareaHTMLAttributes, useId } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  ref?: React.Ref<HTMLTextAreaElement>
}

// REACT 19 IMPROVEMENT: Modernized component without forwardRef
export function Textarea({ label, error, helperText, className = '', id, ref, ...props }: TextareaProps) {
    const generatedId = useId()
    const textareaId = id || generatedId
    const errorId = `${textareaId}-error`
    const helperId = `${textareaId}-helper`

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={`
            w-full px-3 py-2
            bg-[var(--bg-primary)] border rounded-lg
            text-[var(--text-primary)] placeholder-[var(--text-muted)]
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-y min-h-[100px]
            ${error ? 'border-[var(--danger-border)] bg-[var(--danger-bg)]' : 'border-[var(--border-default)] hover:border-[var(--border-emphasis)]'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1 text-sm text-[var(--danger-text)]" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1 text-sm text-[var(--text-muted)]">
            {helperText}
          </p>
        )}
      </div>
    )
}

Textarea.displayName = 'Textarea'
