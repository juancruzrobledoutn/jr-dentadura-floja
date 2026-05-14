import { memo } from 'react'
import { useTranslation } from 'react-i18next'

interface CartWarningProps {
  cartItemsCount: number
}

export const CartWarning = memo(function CartWarning({ cartItemsCount }: CartWarningProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
      <svg
        className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <div>
        <p className="text-yellow-400 font-medium text-sm">{t('closeTable.cartWarningTitle')}</p>
        <p className="text-yellow-400/70 text-xs mt-1">
          {t('closeTable.cartWarning', { count: cartItemsCount })}
        </p>
      </div>
    </div>
  )
})
