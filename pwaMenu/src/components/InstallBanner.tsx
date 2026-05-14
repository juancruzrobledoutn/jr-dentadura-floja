/**
 * Install Banner Component
 *
 * A beautiful, animated banner that prompts users to install the PWA.
 * Features:
 * - Glassmorphism design matching app theme
 * - Smooth animations
 * - Dismiss with "don't show for a week" behavior
 * - iOS specific instructions
 * - Accessibility compliant
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

// Detect iOS (Safari doesn't support beforeinstallprompt)
function isIOS(): boolean {
    return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
}

// Detect if Safari
function isSafari(): boolean {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function InstallBanner() {
    const { t } = useTranslation()
    const { canInstall, isInstalled, isDismissed, isInstalling, promptInstall, dismissPrompt } =
        useInstallPrompt()

    const [showIOSInstructions, setShowIOSInstructions] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const [isExiting, setIsExiting] = useState(false)

    // Determine if we should show the banner
    const isIOSSafari = isIOS() && isSafari()
    const shouldShow = !isInstalled && !isDismissed && (canInstall || isIOSSafari)

    // Animate in after a short delay
    useEffect(() => {
        if (shouldShow) {
            const timer = setTimeout(() => setIsVisible(true), 1000)
            return () => clearTimeout(timer)
        } else {
            setIsVisible(false)
        }
    }, [shouldShow])

    // Handle dismiss with animation
    const handleDismiss = () => {
        setIsExiting(true)
        setTimeout(() => {
            dismissPrompt()
            setIsExiting(false)
            setIsVisible(false)
        }, 300)
    }

    // Handle install click
    const handleInstall = async () => {
        if (isIOSSafari) {
            setShowIOSInstructions(true)
        } else {
            await promptInstall()
        }
    }

    if (!isVisible) return null

    return (
        <>
            {/* Main Install Banner */}
            <div
                role="dialog"
                aria-labelledby="install-banner-title"
                aria-describedby="install-banner-desc"
                className={`
          fixed bottom-20 left-4 right-4 z-40
          bg-dark-card/95 backdrop-blur-lg
          border border-dark-border/50
          rounded-2xl shadow-2xl
          transform transition-all duration-300 ease-out
          ${isExiting ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}
          safe-area-bottom
        `}
            >
                <div className="p-4">
                    {/* Header with icon and close button */}
                    <div className="flex items-start gap-3">
                        {/* App Icon */}
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center flex-shrink-0 shadow-lg">
                            <span className="text-2xl">🍽️</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <h3 id="install-banner-title" className="font-bold text-white text-lg">
                                {t('pwa.install.title', 'Instalá Sabor')}
                            </h3>
                            <p
                                id="install-banner-desc"
                                className="text-dark-muted text-sm mt-0.5 line-clamp-2"
                            >
                                {t('pwa.install.description', 'Agregá el menú a tu pantalla de inicio para acceso rápido')}
                            </p>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={handleDismiss}
                            className="p-2 -mr-2 -mt-1 text-dark-muted hover:text-white transition-colors"
                            aria-label={t('pwa.install.dismiss', 'Cerrar')}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Features */}
                    <div className="flex gap-4 mt-3 text-xs text-dark-muted">
                        <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {t('pwa.install.feature1', 'Menú offline')}
                        </span>
                        <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {t('pwa.install.feature2', 'Más rápido')}
                        </span>
                        <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {t('pwa.install.feature3', 'Sin navegador')}
                        </span>
                    </div>

                    {/* Install Button */}
                    <button
                        onClick={handleInstall}
                        disabled={isInstalling}
                        className={`
              w-full mt-4 py-3 px-4
              bg-gradient-to-r from-primary to-orange-500
              hover:from-primary-dark hover:to-orange-600
              text-white font-semibold
              rounded-xl shadow-lg shadow-primary/20
              flex items-center justify-center gap-2
              transition-all duration-200
              disabled:opacity-70 disabled:cursor-not-allowed
              active:scale-[0.98]
            `}
                    >
                        {isInstalling ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {t('pwa.install.installing', 'Instalando...')}
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                {t('pwa.install.button', 'Instalar App')}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* iOS Instructions Modal */}
            {showIOSInstructions && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowIOSInstructions(false)}
                >
                    <div
                        className="w-full max-w-lg bg-dark-card border-t border-dark-border rounded-t-3xl p-6 pb-8 safe-area-bottom animate-slide-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-12 h-1 bg-dark-border rounded-full mx-auto mb-6" />

                        <h3 className="text-xl font-bold text-white text-center mb-2">
                            {t('pwa.ios.title', 'Instalá Sabor en tu iPhone')}
                        </h3>
                        <p className="text-dark-muted text-center text-sm mb-6">
                            {t('pwa.ios.subtitle', 'Seguí estos pasos para agregar la app a tu pantalla de inicio')}
                        </p>

                        <div className="space-y-4">
                            {/* Step 1 */}
                            <div className="flex items-center gap-4 bg-dark-elevated rounded-xl p-4">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-primary font-bold">1</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-white font-medium">
                                        {t('pwa.ios.step1', 'Tocá el botón Compartir')}
                                    </p>
                                    <p className="text-dark-muted text-sm mt-0.5">
                                        {t('pwa.ios.step1Desc', 'El ícono de cuadrado con flecha arriba')}
                                    </p>
                                </div>
                                <svg className="w-8 h-8 text-dark-muted" fill="currentColor" viewBox="0 0 50 50">
                                    <path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7-1.4 1.4zM24 7h2v21h-2z" />
                                    <path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z" />
                                </svg>
                            </div>

                            {/* Step 2 */}
                            <div className="flex items-center gap-4 bg-dark-elevated rounded-xl p-4">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-primary font-bold">2</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-white font-medium">
                                        {t('pwa.ios.step2', 'Seleccioná "Agregar a inicio"')}
                                    </p>
                                    <p className="text-dark-muted text-sm mt-0.5">
                                        {t('pwa.ios.step2Desc', 'Deslizá hacia abajo si no lo ves')}
                                    </p>
                                </div>
                                <svg className="w-8 h-8 text-dark-muted" fill="currentColor" viewBox="0 0 50 50">
                                    <path d="M25 42c-9.4 0-17-7.6-17-17S15.6 8 25 8s17 7.6 17 17-7.6 17-17 17zm0-32c-8.3 0-15 6.7-15 15s6.7 15 15 15 15-6.7 15-15-6.7-15-15-15z" />
                                    <path d="M24 17h2v16h-2z" />
                                    <path d="M17 24h16v2H17z" />
                                </svg>
                            </div>

                            {/* Step 3 */}
                            <div className="flex items-center gap-4 bg-dark-elevated rounded-xl p-4">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-primary font-bold">3</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-white font-medium">
                                        {t('pwa.ios.step3', 'Tocá "Agregar"')}
                                    </p>
                                    <p className="text-dark-muted text-sm mt-0.5">
                                        {t('pwa.ios.step3Desc', '¡Listo! La app estará en tu pantalla')}
                                    </p>
                                </div>
                                <span className="text-2xl">✅</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowIOSInstructions(false)}
                            className="w-full mt-6 py-3 bg-dark-elevated text-white font-medium rounded-xl hover:bg-dark-border transition-colors"
                        >
                            {t('pwa.ios.gotIt', 'Entendido')}
                        </button>
                    </div>
                </div>
            )}

            {/* Styles for animation */}
            <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
        </>
    )
}
