import { type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  isLoading?: boolean
  /** DASH-006: Optional children to show additional details like cascade preview */
  children?: ReactNode
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  isLoading = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={`
            p-2 rounded-full flex-shrink-0
            ${variant === 'danger' ? 'bg-[var(--danger-bg)]' : 'bg-[var(--warning-bg)]'}
          `}
        >
          <AlertTriangle
            className={`w-6 h-6 ${
              variant === 'danger' ? 'text-[var(--danger-icon)]' : 'text-[var(--warning-icon)]'
            }`}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1">
          <p className="text-[var(--text-secondary)]">{message}</p>
          {/* DASH-006: Render cascade preview or additional details */}
          {children}
        </div>
      </div>
    </Modal>
  )
}
