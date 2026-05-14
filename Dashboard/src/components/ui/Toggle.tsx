import { type InputHTMLAttributes, useId } from 'react'

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  ref?: React.Ref<HTMLInputElement>
}

// REACT 19 IMPROVEMENT: Modernized component without forwardRef
export function Toggle({ label, className = '', id, ref, ...props }: ToggleProps) {
    const generatedId = useId()
    const toggleId = id || generatedId

    return (
      <label
        htmlFor={toggleId}
        className={`inline-flex items-center gap-3 cursor-pointer ${className}`}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={toggleId}
            className="sr-only peer"
            {...props}
          />
          <div
            className={`
              w-11 h-6 rounded-full
              bg-[var(--border-emphasis)] peer-checked:bg-[var(--primary-500)]
              transition-colors duration-200
              peer-focus:ring-2 peer-focus:ring-[var(--primary-500)] peer-focus:ring-offset-2 peer-focus:ring-offset-[var(--bg-primary)]
            `}
          />
          <div
            className={`
              absolute top-0.5 left-0.5
              w-5 h-5 rounded-full bg-white shadow-sm
              transition-transform duration-200
              peer-checked:translate-x-5
            `}
          />
        </div>
        {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
      </label>
    )
}

Toggle.displayName = 'Toggle'
