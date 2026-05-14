/**
 * OptInModal Component
 *
 * FASE 4: Customer Loyalty - Registration modal
 *
 * Modal for collecting customer information and consent for loyalty program.
 * Shows after Nth visit (configurable) or when user opts in manually.
 *
 * Features:
 * - Name and optional email collection
 * - Birthday for personalized greetings
 * - GDPR-compliant consent checkboxes
 * - AI personalization opt-in
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { customerAPI } from '../services/api'
import { logger } from '../utils/logger'
import type { CustomerRegisterRequest } from '../types/backend'

// SVG Icon components (inline to avoid dependencies)
const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const UserIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const MailIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
)

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
)

const GiftIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
)

interface OptInModalProps {
  /** Whether modal is open */
  isOpen: boolean
  /** Close modal handler */
  onClose: () => void
  /** Callback when registration succeeds */
  onSuccess?: () => void
  /** Pre-fill name if available */
  defaultName?: string
  /** Number of visits for personalized messaging */
  visitCount?: number
  /** QA-CRIT-05 FIX: Device ID for linking customer (required by backend) */
  deviceId: string
}

export function OptInModal({
  isOpen,
  onClose,
  onSuccess,
  defaultName = '',
  visitCount = 1,
  deviceId,
}: OptInModalProps) {
  // Form state
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState('')
  const [birthMonth, setBirthMonth] = useState<number | null>(null)
  const [birthDay, setBirthDay] = useState<number | null>(null)

  // Consent checkboxes
  const [dataConsent, setDataConsent] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [aiPersonalization, setAiPersonalization] = useState(true)

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Accessibility
  const modalRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Focus first input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null)
    }
  }, [isOpen])

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Por favor ingresa tu nombre')
      return
    }

    if (!dataConsent) {
      setError('Debes aceptar el tratamiento de datos para continuar')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // QA-CRIT-05 FIX: Include device_id for backend to link customer history
      const request: CustomerRegisterRequest = {
        name: name.trim(),
        email: email.trim() || undefined,
        birthday_month: birthMonth ?? undefined,
        birthday_day: birthDay ?? undefined,
        device_id: deviceId,
        data_consent: dataConsent,
        marketing_consent: marketingConsent,
        ai_personalization_enabled: aiPersonalization,
      }

      await customerAPI.register(request)
      onSuccess?.()
      onClose()
    } catch (err) {
      logger.error('Registration failed', err)
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setIsSubmitting(false)
    }
  }, [name, email, birthMonth, birthDay, deviceId, dataConsent, marketingConsent, aiPersonalization, onSuccess, onClose])

  if (!isOpen) return null

  // Generate month options
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  // Generate day options
  const days = Array.from({ length: 31 }, (_, i) => i + 1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="optin-title"
    >
      <div
        ref={modalRef}
        className="bg-stone-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-700">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500/20 p-2 rounded-lg">
              <GiftIcon className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 id="optin-title" className="text-lg font-semibold text-white">
                {visitCount > 1 ? '¡Bienvenido de vuelta!' : 'Únete a nuestro programa'}
              </h2>
              <p className="text-sm text-stone-400">
                Recibe ofertas y recomendaciones personalizadas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
            aria-label="Cerrar"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-stone-300 mb-1">
              <UserIcon className="w-4 h-4 inline mr-2" />
              Nombre *
            </label>
            <input
              ref={firstInputRef}
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white placeholder:text-stone-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
              maxLength={100}
              required
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-stone-300 mb-1">
              <MailIcon className="w-4 h-4 inline mr-2" />
              Email (opcional)
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white placeholder:text-stone-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
              maxLength={255}
            />
            <p className="text-xs text-stone-500 mt-1">
              Solo para notificaciones importantes
            </p>
          </div>

          {/* Birthday (optional) */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">
              <CalendarIcon className="w-4 h-4 inline mr-2" />
              Cumpleaños (opcional)
            </label>
            <div className="flex gap-2">
              <select
                value={birthMonth ?? ''}
                onChange={(e) => setBirthMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
              >
                <option value="">Mes</option>
                {months.map((month, i) => (
                  <option key={i} value={i + 1}>{month}</option>
                ))}
              </select>
              <select
                value={birthDay ?? ''}
                onChange={(e) => setBirthDay(e.target.value ? parseInt(e.target.value) : null)}
                className="w-24 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
              >
                <option value="">Día</option>
                {days.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Recibirás una sorpresa especial 🎂
            </p>
          </div>

          {/* Consent checkboxes */}
          <div className="space-y-3 pt-2 border-t border-stone-800">
            {/* Data consent (required) */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={dataConsent}
                onChange={(e) => setDataConsent(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-stone-600 bg-stone-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-stone-900"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-stone-200 group-hover:text-white">
                    Acepto el tratamiento de datos *
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Tus datos se usan solo para mejorar tu experiencia
                </p>
              </div>
            </label>

            {/* Marketing consent (optional) */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-stone-600 bg-stone-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-stone-900"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <MailIcon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-stone-200 group-hover:text-white">
                    Recibir ofertas y promociones
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Podrás darte de baja en cualquier momento
                </p>
              </div>
            </label>

            {/* AI personalization (optional, default on) */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={aiPersonalization}
                onChange={(e) => setAiPersonalization(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-stone-600 bg-stone-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-stone-900"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-stone-200 group-hover:text-white">
                    Recomendaciones con IA
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Sugerencias basadas en tus gustos
                </p>
              </div>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting || !dataConsent}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-stone-700 disabled:text-stone-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <GiftIcon className="w-5 h-5" />
                Unirme al programa
              </>
            )}
          </button>

          {/* Privacy note */}
          <p className="text-xs text-center text-stone-500">
            Puedes eliminar tus datos en cualquier momento
          </p>
        </form>
      </div>
    </div>
  )
}

export default OptInModal
