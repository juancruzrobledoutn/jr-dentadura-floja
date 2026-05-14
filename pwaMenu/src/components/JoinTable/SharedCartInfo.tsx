/**
 * SharedCartInfo - Information card about shared cart feature
 */

import { useTranslation } from 'react-i18next'

export default function SharedCartInfo() {
  const { t } = useTranslation()

  return (
    <div className="mt-8 p-4 bg-dark-card rounded-xl border border-dark-border">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-white text-sm font-medium">{t('joinTable.sharedCart')}</h3>
          <p className="text-dark-muted text-xs mt-1">
            {t('joinTable.sharedCartDescription')}
          </p>
        </div>
      </div>
    </div>
  )
}
