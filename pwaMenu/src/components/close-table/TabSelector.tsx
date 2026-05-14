import { memo } from 'react'
import { useTranslation } from 'react-i18next'

export type CloseTableTab = 'summary' | 'orders'

interface TabSelectorProps {
  activeTab: CloseTableTab
  ordersCount: number
  onTabChange: (tab: CloseTableTab) => void
}

export const TabSelector = memo(function TabSelector({
  activeTab,
  ordersCount,
  onTabChange,
}: TabSelectorProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-dark-card rounded-xl p-1 flex" role="tablist">
      <button
        role="tab"
        aria-selected={activeTab === 'summary'}
        onClick={() => onTabChange('summary')}
        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
          activeTab === 'summary'
            ? 'bg-primary text-white'
            : 'text-dark-muted hover:text-white'
        }`}
      >
        {t('closeTable.summary')}
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'orders'}
        onClick={() => onTabChange('orders')}
        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
          activeTab === 'orders'
            ? 'bg-primary text-white'
            : 'text-dark-muted hover:text-white'
        }`}
      >
        {t('closeTable.ordersCount', { count: ordersCount })}
      </button>
    </div>
  )
})
