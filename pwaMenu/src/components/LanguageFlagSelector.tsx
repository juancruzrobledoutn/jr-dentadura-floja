import { useTranslation } from 'react-i18next'
import type { SupportedLanguage } from '../i18n'

interface LanguageFlagSelectorProps {
  className?: string
}

// Circular flag buttons for ES (Argentina), EN (USA) and PT (Brazil)
export default function LanguageFlagSelector({ className = '' }: LanguageFlagSelectorProps) {
  const { i18n, t } = useTranslation()

  const currentLanguage = i18n.language.split('-')[0] as SupportedLanguage

  const handleLanguageChange = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Argentina Flag - Spanish */}
      <button
        type="button"
        onClick={() => handleLanguageChange('es')}
        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 transition-all ${
          currentLanguage === 'es'
            ? 'border-white ring-2 ring-white/30'
            : 'border-transparent opacity-60 hover:opacity-100'
        }`}
        aria-label={t('language.es')}
        title={t('language.es')}
      >
        <ArgentinaFlag />
      </button>

      {/* USA Flag - English */}
      <button
        type="button"
        onClick={() => handleLanguageChange('en')}
        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 transition-all ${
          currentLanguage === 'en'
            ? 'border-white ring-2 ring-white/30'
            : 'border-transparent opacity-60 hover:opacity-100'
        }`}
        aria-label={t('language.en')}
        title={t('language.en')}
      >
        <USAFlag />
      </button>

      {/* Brazil Flag - Portuguese */}
      <button
        type="button"
        onClick={() => handleLanguageChange('pt')}
        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 transition-all ${
          currentLanguage === 'pt'
            ? 'border-white ring-2 ring-white/30'
            : 'border-transparent opacity-60 hover:opacity-100'
        }`}
        aria-label={t('language.pt')}
        title={t('language.pt')}
      >
        <BrazilFlag />
      </button>
    </div>
  )
}

// Argentina Flag SVG Component
function ArgentinaFlag() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
      {/* Light blue top stripe */}
      <rect fill="#74ACDF" width="32" height="10.67" />
      {/* White middle stripe */}
      <rect fill="#FFFFFF" y="10.67" width="32" height="10.67" />
      {/* Light blue bottom stripe */}
      <rect fill="#74ACDF" y="21.34" width="32" height="10.67" />
      {/* Sun of May (simplified) */}
      <circle fill="#F6B40E" cx="16" cy="16" r="4" />
      {/* Sun rays */}
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

// USA Flag SVG Component
function USAFlag() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
      {/* Red and white stripes */}
      <rect fill="#B22234" width="32" height="32" />
      <rect fill="#FFFFFF" y="2.46" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="7.38" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="12.31" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="17.23" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="22.15" width="32" height="2.46" />
      <rect fill="#FFFFFF" y="27.08" width="32" height="2.46" />
      {/* Blue canton */}
      <rect fill="#3C3B6E" width="12.8" height="17.23" />
      {/* Stars (simplified) */}
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

// Brazil Flag SVG Component
function BrazilFlag() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
      {/* Green background */}
      <rect fill="#009739" width="32" height="32" />
      {/* Yellow diamond */}
      <polygon fill="#FEDD00" points="16,3 29,16 16,29 3,16" />
      {/* Blue circle */}
      <circle fill="#002776" cx="16" cy="16" r="7" />
      {/* White band */}
      <path
        fill="#FFFFFF"
        d="M9.5,14.5 Q16,12 22.5,17.5 Q16,15 9.5,14.5"
      />
    </svg>
  )
}
