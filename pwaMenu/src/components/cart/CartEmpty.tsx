import { useTranslation } from 'react-i18next'

interface CartEmptyProps {
  onViewMenu: () => void
}

export default function CartEmpty({ onViewMenu }: CartEmptyProps) {
  const { t } = useTranslation()
  return (
    <div className="text-center py-12">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-dark-card flex items-center justify-center">
        <svg
          className="w-12 h-12 text-dark-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
      </div>
      <h3 className="text-white text-lg font-semibold mb-2">{t('cart.emptyCart')}</h3>
      <p className="text-dark-muted text-sm mb-6">
        {t('cart.emptyCartDescription')}
      </p>
      <button
        onClick={onViewMenu}
        className="bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-xl transition-colors inline-flex items-center gap-2"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
        {t('cart.viewMenu')}
      </button>
    </div>
  )
}
