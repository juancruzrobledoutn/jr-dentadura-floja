/**
 * DEF-HIGH-02 FIX: Toast notification for throttled actions
 * Shows a brief message when user clicks too fast
 */

import { useThrottleNotification } from '../hooks/useThrottleNotification'

export function ThrottleToast() {
  const { message, visible } = useThrottleNotification()

  if (!visible || !message) return null

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in"
      role="alert"
      aria-live="polite"
    >
      <div className="bg-dark-card/95 backdrop-blur-sm border border-dark-border text-dark-muted px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2">
        <svg
          className="w-4 h-4 text-yellow-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{message}</span>
      </div>
    </div>
  )
}
