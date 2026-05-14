/**
 * M001 FIX: Component to display service call history
 * Shows past and active service calls for the current session
 */

import { useTranslation } from 'react-i18next'
import { useServiceCallStore, selectServiceCalls } from '../stores/serviceCallStore'
import type { ServiceCallRecord, ServiceCallType } from '../stores/serviceCallStore'

interface ServiceCallHistoryProps {
  isOpen: boolean
  onClose: () => void
}

export function ServiceCallHistory({ isOpen, onClose }: ServiceCallHistoryProps) {
  const { t } = useTranslation()
  const calls = useServiceCallStore(selectServiceCalls)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-call-history-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Content */}
      <div className="relative bg-dark-card rounded-t-2xl w-full max-w-lg max-h-[70vh] overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 id="service-call-history-title" className="text-lg font-bold text-white">
            {t('serviceCall.history', 'Historial de Llamadas')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-elevated rounded-full transition-colors"
            aria-label={t('common.close', 'Cerrar')}
          >
            <CloseIcon className="w-5 h-5 text-dark-muted" />
          </button>
        </div>

        {/* Call list */}
        <div className="p-4 overflow-y-auto max-h-[calc(70vh-60px)]">
          {calls.length === 0 ? (
            <div className="text-center py-8">
              <BellIcon className="w-12 h-12 text-dark-muted mx-auto mb-3" />
              <p className="text-dark-muted">
                {t('serviceCall.noHistory', 'No has llamado al mozo todavía')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...calls].reverse().map((call) => (
                <ServiceCallItem key={call.id} call={call} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ServiceCallItemProps {
  call: ServiceCallRecord
}

function ServiceCallItem({ call }: ServiceCallItemProps) {
  const { t } = useTranslation()

  const getCallTypeLabel = (type: ServiceCallType) => {
    switch (type) {
      case 'WAITER_CALL':
        return t('serviceCall.typeWaiter', 'Llamar Mozo')
      case 'PAYMENT_HELP':
        return t('serviceCall.typePayment', 'Ayuda con Pago')
      default:
        return t('serviceCall.typeOther', 'Otra Consulta')
    }
  }

  const getStatusInfo = () => {
    switch (call.status) {
      case 'pending':
        return {
          label: t('serviceCall.statusPending', 'Esperando'),
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          icon: <ClockIcon className="w-4 h-4" />,
        }
      case 'acked':
        return {
          label: t('serviceCall.statusAcked', 'En camino'),
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/20',
          icon: <WaiterIcon className="w-4 h-4" />,
        }
      case 'closed':
        return {
          label: t('serviceCall.statusClosed', 'Atendido'),
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          icon: <CheckIcon className="w-4 h-4" />,
        }
    }
  }

  const statusInfo = getStatusInfo()
  const createdTime = new Date(call.createdAt).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="bg-dark-elevated rounded-xl p-4 flex items-center gap-4">
      {/* Type icon */}
      <div className={`w-10 h-10 rounded-full ${statusInfo.bgColor} flex items-center justify-center`}>
        <span className={statusInfo.color}>
          {call.type === 'PAYMENT_HELP' ? (
            <CashIcon className="w-5 h-5" />
          ) : (
            <BellIcon className="w-5 h-5" />
          )}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm">{getCallTypeLabel(call.type)}</p>
        <p className="text-dark-muted text-xs">{createdTime}</p>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusInfo.bgColor}`}>
        <span className={statusInfo.color}>{statusInfo.icon}</span>
        <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>
    </div>
  )
}

// Inline SVG icons
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function WaiterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function CashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  )
}

export default ServiceCallHistory
