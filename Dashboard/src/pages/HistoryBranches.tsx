import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { GitBranch } from 'lucide-react'
import { helpContent } from '../utils/helpContent'

export function HistoryBranchesPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.historyBranches.title'))

  return (
    <PageContainer
      title={t('pages.historyBranches.title')}
      description={t('pages.historyBranches.description')}
      helpContent={helpContent.historyBranches}
    >
      <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
        <GitBranch className="w-16 h-16 mb-4" />
        <h2 className="text-xl font-semibold text-[var(--text-secondary)] mb-2">
          {t('pages.historyBranches.title')}
        </h2>
        <p className="text-center max-w-md">
          {t('pages.historyBranches.comingSoon')}
        </p>
      </div>
    </PageContainer>
  )
}

export default HistoryBranchesPage
