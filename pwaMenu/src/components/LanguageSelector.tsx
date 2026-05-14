import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from '../i18n'

// SVG flags for better cross-platform compatibility - defined outside component
function FlagIcon({ lang }: { lang: SupportedLanguage }) {
  if (lang === 'es') {
    // Argentina flag
    return (
      <svg className="w-5 h-4 rounded-sm" viewBox="0 0 20 14" fill="none">
        <rect width="20" height="14" fill="#74ACDF" />
        <rect y="4.67" width="20" height="4.67" fill="white" />
        <circle cx="10" cy="7" r="2" fill="#F6B40E" />
      </svg>
    )
  }
  if (lang === 'en') {
    // USA flag (simplified)
    return (
      <svg className="w-5 h-4 rounded-sm" viewBox="0 0 20 14" fill="none">
        <rect width="20" height="14" fill="#B22234" />
        <rect y="1.08" width="20" height="1.08" fill="white" />
        <rect y="3.23" width="20" height="1.08" fill="white" />
        <rect y="5.38" width="20" height="1.08" fill="white" />
        <rect y="7.54" width="20" height="1.08" fill="white" />
        <rect y="9.69" width="20" height="1.08" fill="white" />
        <rect y="11.85" width="20" height="1.08" fill="white" />
        <rect width="8" height="7.54" fill="#3C3B6E" />
      </svg>
    )
  }
  // Brazil flag (simplified)
  return (
    <svg className="w-5 h-4 rounded-sm" viewBox="0 0 20 14" fill="none">
      <rect width="20" height="14" fill="#009739" />
      <polygon points="10,2 18,7 10,12 2,7" fill="#FEDD00" />
      <circle cx="10" cy="7" r="2.5" fill="#002776" />
    </svg>
  )
}

interface LanguageSelectorProps {
  className?: string
}

export default function LanguageSelector({ className = '' }: LanguageSelectorProps) {
  const { i18n, t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentLanguage = i18n.language.split('-')[0] as SupportedLanguage

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleLanguageChange = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-card border border-dark-border hover:border-dark-muted transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('language.selectLanguage')}
      >
        <span aria-hidden="true">
          <FlagIcon lang={currentLanguage} />
        </span>
        <span className="text-white text-sm font-medium hidden sm:inline">
          {LANGUAGE_NAMES[currentLanguage]}
        </span>
        <svg
          className={`w-4 h-4 text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-40 bg-dark-card border border-dark-border rounded-xl shadow-lg overflow-hidden z-50"
          role="listbox"
          aria-label={t('language.availableLanguages')}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => handleLanguageChange(lang)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-elevated transition-colors ${
                lang === currentLanguage ? 'bg-dark-elevated' : ''
              }`}
              role="option"
              aria-selected={lang === currentLanguage}
            >
              <span aria-hidden="true">
                <FlagIcon lang={lang} />
              </span>
              <span className="text-white text-sm font-medium">
                {LANGUAGE_NAMES[lang]}
              </span>
              {lang === currentLanguage && (
                <svg
                  className="w-4 h-4 text-primary ml-auto"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
