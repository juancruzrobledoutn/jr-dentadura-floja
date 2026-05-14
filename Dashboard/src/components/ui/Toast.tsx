import { memo, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import type { Toast as ToastType } from '../../types'

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const styleMap = {
  success: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]',
  error: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]',
  warning: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-text)]',
  info: 'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info-text)]',
}

interface ToastItemProps {
  toast: ToastType
  onRemove: (id: string) => void
}

const ToastItem = memo(function ToastItem({ toast, onRemove }: ToastItemProps) {
  const Icon = iconMap[toast.type]

  const handleRemove = useCallback(() => {
    onRemove(toast.id)
  }, [onRemove, toast.id])

  return (
    <div
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      className={`
        flex items-center gap-3 px-4 py-3
        border rounded-lg shadow-lg
        animate-in slide-in-from-right duration-300
        ${styleMap[toast.type]}
      `}
    >
      <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        onClick={handleRemove}
        className="p-1 hover:bg-white/10 rounded transition-colors"
        aria-label="Cerrar notificación"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
})

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      role="region"
      aria-label="Notificaciones"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
