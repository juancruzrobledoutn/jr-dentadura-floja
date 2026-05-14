import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { getTheme, toggleTheme, type Theme } from '../utils/theme'
import type { SupportedLanguage } from '../i18n'

interface HamburgerMenuProps {
  isOpen: boolean
  onClose: () => void
}

export default function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
  const { t, i18n } = useTranslation()
  const [theme, setThemeState] = useState<Theme>(getTheme)

  const handleToggleTheme = () => {
    const next = toggleTheme()
    setThemeState(next)
  }

  // Escape key handler
  useEscapeKey({
    enabled: isOpen,
    onEscape: onClose
  })

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const currentLanguage = i18n.language.split('-')[0] as SupportedLanguage

  const handleLanguageChange = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang)
    onClose()
  }

  const languages = [
    {
      code: 'es' as SupportedLanguage,
      name: 'Español',
      flag: <ArgentinaFlag />
    },
    {
      code: 'en' as SupportedLanguage,
      name: 'English',
      flag: <USAFlag />
    },
    {
      code: 'pt' as SupportedLanguage,
      name: 'Português',
      flag: <BrazilFlag />
    }
  ]

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 w-64 sm:w-80 bg-dark-card shadow-2xl z-40 transform transition-transform duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 id="menu-title" className="text-lg font-semibold text-white">
            {t('menu.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-elevated rounded-full transition-colors"
            aria-label={t('common.close')}
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Language Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-dark-muted mb-3">
              {t('menu.selectLanguage')}
            </h3>
            <div className="space-y-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${currentLanguage === lang.code
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'bg-dark-elevated text-white hover:bg-dark-elevated/80'
                    }`}
                  aria-pressed={currentLanguage === lang.code}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border-2 border-white/20">
                    {lang.flag}
                  </div>
                  <span className="font-medium">{lang.name}</span>
                  {currentLanguage === lang.code && (
                    <svg
                      className="w-5 h-5 ml-auto"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-dark-muted mb-3">
              {t('menu.appearance')}
            </h3>
            <button
              onClick={handleToggleTheme}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-dark-elevated text-white hover:bg-dark-elevated/80 transition-all"
              aria-label={theme === 'dark' ? t('menu.switchToLight') : t('menu.switchToDark')}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
              <span className="font-medium">
                {theme === 'dark' ? t('menu.lightMode') : t('menu.darkMode')}
              </span>
            </button>
          </div>

          {/* Additional Info */}
          <div className="pt-4 border-t border-dark-border">
            <p className="text-xs text-dark-muted text-center">
              {t('menu.languageHelp')}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// Flag components (same as LanguageFlagSelector but optimized)

function ArgentinaFlag() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
      <rect fill="#74ACDF" width="32" height="10.67" />
      <rect fill="#FFFFFF" y="10.67" width="32" height="10.67" />
      <rect fill="#74ACDF" y="21.34" width="32" height="10.67" />
      <circle fill="#F6B40E" cx="16" cy="16" r="4" />
      <g fill="#F6B40E">
        <rect x="15.25" y="9" width="1.5" height="3" />
        <rect x="15.25" y="20" width="1.5" height="3" />
        <rect x="9" y="15.25" width="3" height="1.5" />
        <rect x="20" y="15.25" width="3" height="1.5" />
        <rect x="10.5" y="10.5" width="1.5" height="2.5" transform="rotate(45 11.25 11.75)" />
        <rect x="20" y="10.5" width="1.5" height="2.5" transform="rotate(-45 20.75 11.75)" />
        <rect x="10.5" y="19" width="1.5" height="2.5" transform="rotate(-45 11.25 20.25)" />
        <rect x="20" y="19" width="1.5" height="2.5" transform="rotate(45 20.75 20.25)" />
      </g>
    </svg>
  )
}

function USAFlag() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
      <rect fill="#B22234" width="32" height="32" />
      <rect fill="#FFFFFF" y="2.46" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="7.38" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="12.31" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="17.23" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="22.15" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="27.08" width="32" height="2.46" />
      <rect fill="#3C3B6E" width="12.8" height="17.23" />
      <g fill="#FFFFFF">
        <circle cx="2.1" cy="1.6" r="0.8" />
        <circle cx="4.3" cy="1.6" r="0.8" />
        <circle cx="6.4" cy="1.6" r="0.8" />
        <circle cx="8.5" cy="1.6" r="0.8" />
        <circle cx="10.7" cy="1.6" r="0.8" />
        <circle cx="3.2" cy="3.4" r="0.8" />
        <circle cx="5.3" cy="3.4" r="0.8" />
        <circle cx="7.5" cy="3.4" r="0.8" />
        <circle cx="9.6" cy="3.4" r="0.8" />
        <circle cx="2.1" cy="5.1" r="0.8" />
        <circle cx="4.3" cy="5.1" r="0.8" />
        <circle cx="6.4" cy="5.1" r="0.8" />
        <circle cx="8.5" cy="5.1" r="0.8" />
        <circle cx="10.7" cy="5.1" r="0.8" />
        <circle cx="3.2" cy="6.9" r="0.8" />
        <circle cx="5.3" cy="6.9" r="0.8" />
        <circle cx="7.5" cy="6.9" r="0.8" />
        <circle cx="9.6" cy="6.9" r="0.8" />
        <circle cx="2.1" cy="8.6" r="0.8" />
        <circle cx="4.3" cy="8.6" r="0.8" />
        <circle cx="6.4" cy="8.6" r="0.8" />
        <circle cx="8.5" cy="8.6" r="0.8" />
        <circle cx="10.7" cy="8.6" r="0.8" />
        <circle cx="3.2" cy="10.4" r="0.8" />
        <circle cx="5.3" cy="10.4" r="0.8" />
        <circle cx="7.5" cy="10.4" r="0.8" />
        <circle cx="9.6" cy="10.4" r="0.8" />
        <circle cx="2.1" cy="12.1" r="0.8" />
        <circle cx="4.3" cy="12.1" r="0.8" />
        <circle cx="6.4" cy="12.1" r="0.8" />
        <circle cx="8.5" cy="12.1" r="0.8" />
        <circle cx="10.7" cy="12.1" r="0.8" />
        <circle cx="3.2" cy="13.9" r="0.8" />
        <circle cx="5.3" cy="13.9" r="0.8" />
        <circle cx="7.5" cy="13.9" r="0.8" />
        <circle cx="9.6" cy="13.9" r="0.8" />
        <circle cx="2.1" cy="15.6" r="0.8" />
        <circle cx="4.3" cy="15.6" r="0.8" />
        <circle cx="6.4" cy="15.6" r="0.8" />
        <circle cx="8.5" cy="15.6" r="0.8" />
        <circle cx="10.7" cy="15.6" r="0.8" />
      </g>
    </svg>
  )
}

function BrazilFlag() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
      <rect fill="#009739" width="32" height="32" />
      <polygon fill="#FEDD00" points="16,3 29,16 16,29 3,16" />
      <circle fill="#002776" cx="16" cy="16" r="7" />
      <path
        fill="#FFFFFF"
        d="M9.5,14.5 Q16,12 22.5,17.5 Q16,15 9.5,14.5"
      />
    </svg>
  )
}
