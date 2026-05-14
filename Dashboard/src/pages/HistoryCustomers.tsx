import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { Users } from 'lucide-react'
import { helpContent } from '../utils/helpContent'

export function HistoryCustomersPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.historyCustomers.title'))

  return (
    <PageContainer
      title={t('pages.historyCustomers.title')}
      description={t('pages.historyCustomers.description')}
      helpContent={helpContent.historyCustomers}
    >
      <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
        <Users className="w-16 h-16 mb-4" />
        <h2 className="text-xl font-semibold text-[var(--text-secondary)] mb-2">
          {t('pages.historyCustomers.title')}
        </h2>
        <p className="text-center max-w-md">
          {t('pages.historyCustomers.comingSoon')}
        </p>
      </div>
    </PageContainer>
  )
}

export default HistoryCustomersPage
