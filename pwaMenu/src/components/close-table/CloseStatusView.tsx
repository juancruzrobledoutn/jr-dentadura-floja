import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import LoadingSpinner from '../ui/LoadingSpinner'
import { isTestMode } from '../../services/mercadoPago'
import { billingAPI } from '../../services/api'
import { apiLogger } from '../../utils/logger'

export type CloseStatus =
  | 'idle'
  | 'requesting'
  | 'bill_ready'
  | 'processing_payment'
  | 'waiting_waiter'
  | 'paid'

export type PaymentMethod = 'card' | 'cash' | 'mercadopago'

interface CloseStatusViewProps {
  status: CloseStatus
  totalConsumed: number
  checkId?: number  // Backend check ID for Mercado Pago payment
  onConfirmPayment: (method: PaymentMethod) => void
}

export function CloseStatusView({
  status,
  totalConsumed,
  checkId,
  onConfirmPayment,
}: CloseStatusViewProps) {
  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center p-4 safe-area-inset overflow-x-hidden w-full max-w-full">
      <div className="w-full max-w-sm">
        {status === 'requesting' && <RequestingState />}
        {status === 'bill_ready' && (
          <BillReadyState
            totalConsumed={totalConsumed}
            checkId={checkId}
            onConfirmPayment={onConfirmPayment}
          />
        )}
        {status === 'processing_payment' && <ProcessingPaymentState />}
        {status === 'waiting_waiter' && <WaitingWaiterState totalConsumed={totalConsumed} />}
      </div>
    </div>
  )
}

function RequestingState() {
  const { t } = useTranslation()
  return (
    <div className="text-center animate-status-enter">
      {/* L001 FIX: Animated icon with pulse ring */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
        <div className="absolute inset-0 rounded-full bg-primary/20 flex items-center justify-center animate-icon-pop">
          <LoadingSpinner size="lg" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{t('closeTable.requestingBill')}</h1>
      <p className="text-dark-muted">{t('closeTable.sendingRequest')}</p>
    </div>
  )
}

function ProcessingPaymentState() {
  const { t } = useTranslation()
  return (
    <div className="text-center animate-status-enter">
      {/* L001 FIX: Animated icon with pulse ring */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-pulse-ring" />
        <div className="absolute inset-0 rounded-full bg-blue-500/20 flex items-center justify-center animate-icon-pop">
          <LoadingSpinner size="lg" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{t('closeTable.processingPayment')}</h1>
      <p className="text-dark-muted">{t('closeTable.redirectingToPayment')}</p>
    </div>
  )
}

function WaitingWaiterState({ totalConsumed }: { totalConsumed: number }) {
  const { t } = useTranslation()
  return (
    <div className="text-center animate-status-enter">
      {/* L001 FIX: Animated icon with pulse ring */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-yellow-500/20 animate-pulse-ring" />
        <div className="absolute inset-0 rounded-full bg-yellow-500/20 flex items-center justify-center animate-icon-pop">
          <svg
            className="w-10 h-10 text-yellow-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{t('closeTable.waitingWaiter', 'Esperando al mozo')}</h1>
      <p className="text-dark-muted mb-4">{t('closeTable.waiterNotified', 'El mozo ha sido notificado y vendrá a procesar tu pago')}</p>

      {/* Bill summary */}
      <div className="bg-dark-card rounded-xl p-4 space-y-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between">
          <span className="text-dark-muted text-sm">{t('closeTable.totalToPay', 'Total a pagar')}</span>
          <span className="text-primary font-bold text-xl">${totalConsumed.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-dark-muted text-sm mt-4 animate-fade-in" style={{ animationDelay: '0.4s' }}>
        {t('closeTable.waitingPaymentConfirmation', 'La pantalla se actualizará automáticamente cuando se confirme el pago')}
      </p>
    </div>
  )
}

interface BillReadyStateProps {
  totalConsumed: number
  paidAmount?: number // A002 FIX: Track already paid amount
  checkId?: number
  onConfirmPayment: (method: PaymentMethod) => void
}

function BillReadyState({
  totalConsumed,
  paidAmount = 0,
  checkId,
  onConfirmPayment,
}: BillReadyStateProps) {
  const { t } = useTranslation()
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('mercadopago')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A002 FIX: Allow custom payment amount for split payments
  const [customAmount, setCustomAmount] = useState<string>('')
  const [useCustomAmount, setUseCustomAmount] = useState(false)

  const remainingAmount = totalConsumed - paidAmount
  const suggestedTip = remainingAmount * 0.1

  // A002 FIX: Get the amount to pay (custom or remaining)
  const getPaymentAmount = useCallback(() => {
    if (useCustomAmount && customAmount) {
      const amount = parseFloat(customAmount)
      if (!isNaN(amount) && amount > 0 && amount <= remainingAmount) {
        return amount
      }
    }
    return remainingAmount
  }, [useCustomAmount, customAmount, remainingAmount])

  const handleMercadoPagoPayment = useCallback(async () => {
    if (!checkId) {
      setError(t('closeTable.paymentError'))
      return
    }

    const paymentAmount = getPaymentAmount()
    if (paymentAmount <= 0) {
      setError(t('closeTable.invalidAmount', 'Monto inválido'))
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      // A002 FIX: Pass amount_cents for partial payment
      const amountCents = Math.round(paymentAmount * 100)
      apiLogger.info('Creating MP preference via backend', { checkId, amountCents })
      const preference = await billingAPI.createMercadoPagoPreference({
        check_id: checkId,
        amount_cents: amountCents,
      })

      apiLogger.info('Redirecting to Mercado Pago checkout', {
        preferenceId: preference.preference_id,
        isTestMode: isTestMode(),
        amount: paymentAmount,
      })

      // Redirect to Mercado Pago checkout
      const checkoutUrl = isTestMode() ? preference.sandbox_init_point : preference.init_point
      window.location.href = checkoutUrl
    } catch (err) {
      apiLogger.error('Failed to create payment preference', err)
      setError(t('closeTable.paymentError'))
      setIsProcessing(false)
    }
  }, [checkId, t, getPaymentAmount])

  const handleConfirmPayment = useCallback(() => {
    if (selectedMethod === 'mercadopago') {
      handleMercadoPagoPayment()
    } else {
      // For cash, just confirm locally
      onConfirmPayment(selectedMethod)
    }
  }, [selectedMethod, handleMercadoPagoPayment, onConfirmPayment])

  // A002 FIX: Validate custom amount
  const isCustomAmountValid = useCallback(() => {
    if (!useCustomAmount) return true
    const amount = parseFloat(customAmount)
    return !isNaN(amount) && amount > 0 && amount <= remainingAmount
  }, [useCustomAmount, customAmount, remainingAmount])

  return (
    <div className="text-center animate-status-enter">
      {/* L001 FIX: Animated checkmark icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-green-500/20 animate-icon-pop" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-green-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" className="opacity-30" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75"
              className="animate-checkmark-draw"
            />
          </svg>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{t('closeTable.billReady')}</h1>
      <p className="text-dark-muted mb-6">{t('closeTable.selectPaymentMethod')}</p>

      {/* Bill summary */}
      <div className="bg-dark-card rounded-xl p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-dark-muted text-sm">{t('closeTable.subtotal')}</span>
          <span className="text-white">${totalConsumed.toFixed(2)}</span>
        </div>
        {/* M002 FIX: Show paid amount if any */}
        {paidAmount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-green-400 text-sm">{t('closeTable.alreadyPaid', 'Ya pagado')}</span>
            <span className="text-green-400">-${paidAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-dark-muted text-sm">{t('closeTable.suggestedTip')}</span>
          <span className="text-white">${suggestedTip.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-dark-border pt-3">
          <span className="text-white font-medium">
            {paidAmount > 0 ? t('closeTable.remaining', 'Restante') : t('closeTable.suggestedTotal')}
          </span>
          <span className="text-primary font-bold text-xl">
            ${(remainingAmount + suggestedTip).toFixed(2)}
          </span>
        </div>
      </div>

      {/* A002 FIX: Custom amount input for split payments */}
      {selectedMethod === 'mercadopago' && (
        <div className="bg-dark-card rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-dark-muted text-sm">{t('closeTable.payPartial', 'Pagar monto parcial')}</span>
            <button
              onClick={() => setUseCustomAmount(!useCustomAmount)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                useCustomAmount ? 'bg-primary' : 'bg-dark-border'
              }`}
              aria-label={t('closeTable.togglePartialPayment', 'Activar pago parcial')}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  useCustomAmount ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {useCustomAmount && (
            <div className="mt-3">
              <label className="text-dark-muted text-xs block mb-1 text-left">
                {t('closeTable.amountToPay', 'Monto a pagar')} (max: ${remainingAmount.toFixed(2)})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white">$</span>
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={remainingAmount.toFixed(2)}
                  min="1"
                  max={remainingAmount}
                  step="0.01"
                  className={`w-full bg-dark-elevated text-white pl-8 pr-4 py-3 rounded-lg border ${
                    customAmount && !isCustomAmountValid()
                      ? 'border-red-500'
                      : 'border-dark-border focus:border-primary'
                  } outline-none transition-colors`}
                />
              </div>
              {customAmount && !isCustomAmountValid() && (
                <p className="text-red-400 text-xs mt-1 text-left">
                  {t('closeTable.amountExceedsRemaining', 'El monto no puede exceder el restante')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment method */}
      <div className="bg-dark-card rounded-xl p-4 mb-6">
        <p className="text-dark-muted text-sm mb-3">{t('closeTable.paymentMethod')}</p>
        <PaymentMethodSelector
          selectedMethod={selectedMethod}
          onMethodChange={(method) => {
            setSelectedMethod(method)
            if (method !== 'mercadopago') {
              setUseCustomAmount(false)
            }
          }}
          disabled={isProcessing}
        />
      </div>

      {/* Test mode indicator */}
      {isTestMode() && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-3 mb-4">
          <p className="text-yellow-400 text-xs">
            {t('closeTable.testMode')}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleConfirmPayment}
        disabled={isProcessing || (useCustomAmount && !isCustomAmountValid())}
        className={`w-full font-semibold py-4 px-4 rounded-xl transition-colors flex items-center justify-center gap-3 ${
          selectedMethod === 'mercadopago'
            ? 'bg-[#00BCFF] hover:bg-[#00A8E8] disabled:bg-[#00BCFF]/50 text-white'
            : 'bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white'
        }`}
      >
        {isProcessing ? (
          <>
            <LoadingSpinner size="sm" />
            <span>{t('closeTable.processingPayment')}</span>
          </>
        ) : selectedMethod === 'mercadopago' ? (
          <>
            <MercadoPagoIcon className="w-7 h-7" />
            <span>
              {useCustomAmount && customAmount
                ? t('closeTable.payAmount', 'Pagar ${{amount}}', { amount: parseFloat(customAmount).toFixed(2) })
                : t('closeTable.payWithMercadoPago')}
            </span>
          </>
        ) : (
          <span>{t('closeTable.confirmPayment')}</span>
        )}
      </button>
    </div>
  )
}

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod
  onMethodChange: (method: PaymentMethod) => void
  disabled?: boolean
}

function PaymentMethodSelector({
  selectedMethod,
  onMethodChange,
  disabled,
}: PaymentMethodSelectorProps) {
  const { t } = useTranslation()

  const methods: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    {
      id: 'mercadopago',
      label: 'Mercado Pago',
      icon: <MercadoPagoIcon />,
    },
    {
      id: 'card',
      label: t('closeTable.card'),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
          />
        </svg>
      ),
    },
    {
      id: 'cash',
      label: t('closeTable.cash'),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
          />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {methods.map((method) => {
        const isSelected = selectedMethod === method.id
        const isMercadoPago = method.id === 'mercadopago'
        return (
          <button
            key={method.id}
            onClick={() => onMethodChange(method.id)}
            disabled={disabled}
            className={`bg-dark-elevated hover:bg-dark-border rounded-lg p-3 flex flex-col items-center gap-1 transition-colors border-2 ${
              isSelected ? 'border-primary' : 'border-transparent'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {/* Mercado Pago icon keeps its own colors */}
            {isMercadoPago ? (
              <MercadoPagoIcon className="w-6 h-6" />
            ) : (
              <span className={isSelected ? 'text-primary' : 'text-dark-muted'}>
                {method.icon}
              </span>
            )}
            <span
              className={`text-xs ${
                isSelected ? 'text-primary font-medium' : 'text-dark-muted'
              }`}
            >
              {method.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Mercado Pago official logo (handshake icon)
function MercadoPagoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Mercado Pago handshake logo */}
      <circle cx="24" cy="24" r="24" fill="#00BCFF" />
      <path
        d="M34.5 20.5c-1.2-1.2-3.1-1.2-4.2 0l-3.8 3.8-1.5-1.5c-1.2-1.2-3.1-1.2-4.2 0-1.2 1.2-1.2 3.1 0 4.2l3.6 3.6c.6.6 1.3.9 2.1.9.8 0 1.5-.3 2.1-.9l5.9-5.9c1.2-1.1 1.2-3 0-4.2z"
        fill="white"
      />
      <path
        d="M13.5 20.5c1.2-1.2 3.1-1.2 4.2 0l1.3 1.3-2.1 2.1-1.3-1.3c-.6-.6-.6-1.5 0-2.1z"
        fill="white"
      />
      <path
        d="M24 14c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10-4.5-10-10-10zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z"
        fill="white"
        fillOpacity="0.3"
      />
    </svg>
  )
}
