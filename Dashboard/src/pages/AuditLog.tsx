import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, Button, Select } from '../components/ui'
import { auditAPI, type AuditLogEntry } from '../services/api'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'

const ENTITY_TYPES = [
  'product',
  'category',
  'subcategory',
  'branch',
  'staff',
  'table',
  'round',
  'round_item',
  'check',
  'payment',
  'tip',
  'stock_item',
  'allergen',
  'promotion',
]

const ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'SOFT_DELETE',
  'PAYMENT',
  'SUBMIT',
  'CANCEL',
  'VOID',
  'REFUND',
  'STOCK_ADJUSTMENT',
  'ROLE_CHANGE',
]

const PAGE_SIZE = 50

export function AuditLogPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.auditLog.title'))

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const entityOptions = [
    { value: '', label: t('pages.auditLog.allEntities') },
    ...ENTITY_TYPES.map((et) => ({ value: et, label: et })),
  ]

  const actionOptions = [
    { value: '', label: t('pages.auditLog.allActions') },
    ...ACTIONS.map((a) => ({ value: a, label: a })),
  ]

  const fetchEntries = useCallback(
    async (resetOffset = false) => {
      setIsLoading(true)
      try {
        const currentOffset = resetOffset ? 0 : offset
        const data = await auditAPI.getAuditLog({
          entity_type: entityFilter || undefined,
          action: actionFilter || undefined,
          limit: PAGE_SIZE,
          offset: currentOffset,
        })

        if (resetOffset) {
          setEntries(data)
          setOffset(PAGE_SIZE)
        } else {
          setEntries((prev) => [...prev, ...data])
          setOffset((prev) => prev + PAGE_SIZE)
        }
        setHasMore(data.length === PAGE_SIZE)
      } catch (error) {
        handleError(error, 'AuditLogPage.fetchEntries')
        toast.error(t('pages.auditLog.errorLoading'))
      } finally {
        setIsLoading(false)
      }
    },
    [entityFilter, actionFilter, offset]
  )

  useEffect(() => {
    fetchEntries(true)
    // Only re-fetch when filters change, not offset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityFilter, actionFilter])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'text-[var(--success-text)]'
      case 'UPDATE':
        return 'text-[var(--info-text)]'
      case 'DELETE':
      case 'SOFT_DELETE':
      case 'VOID':
      case 'CANCEL':
        return 'text-[var(--error-text)]'
      case 'PAYMENT':
        return 'text-[var(--primary-500)]'
      case 'STOCK_ADJUSTMENT':
        return 'text-[var(--warning-text)]'
      default:
        return 'text-[var(--text-secondary)]'
    }
  }

  const renderJsonValues = (label: string, values: Record<string, unknown> | null) => {
    if (!values || Object.keys(values).length === 0) return null
    return (
      <div className="mt-2">
        <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">{label}</p>
        <pre className="text-xs bg-[var(--bg-tertiary)] p-2 rounded overflow-x-auto max-h-40 text-[var(--text-secondary)]">
          {JSON.stringify(values, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <PageContainer
      title={t('pages.auditLog.title')}
      description={t('pages.auditLog.description')}
      actions={
        <div className="flex items-center gap-3">
          <Select
            options={entityOptions}
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-48"
            aria-label={t('pages.auditLog.entityType')}
          />
          <Select
            options={actionOptions}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-44"
            aria-label={t('pages.auditLog.action')}
          />
          <Button
            variant="ghost"
            onClick={() => fetchEntries(true)}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            disabled={isLoading}
          >
            Actualizar
          </Button>
        </div>
      }
    >
      <Card className="p-4">
        {isLoading && entries.length === 0 ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-10 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] py-8">
            {t('pages.auditLog.noEntries')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-default)]">
                    <th className="pb-2 font-medium w-8" />
                    <th className="pb-2 font-medium">{t('pages.auditLog.date')}</th>
                    <th className="pb-2 font-medium">{t('pages.auditLog.user')}</th>
                    <th className="pb-2 font-medium">{t('pages.auditLog.action')}</th>
                    <th className="pb-2 font-medium">{t('pages.auditLog.entityType')}</th>
                    <th className="pb-2 font-medium text-right">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isExpanded = expandedId === entry.id
                    return (
                      <tr key={entry.id} className="group">
                        <td className="py-2" colSpan={isExpanded ? 6 : undefined}>
                          {isExpanded ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-4">
                                <button
                                  onClick={() => setExpandedId(null)}
                                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                  aria-label="Collapse details"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                                <span className="text-[var(--text-secondary)]">{formatDate(entry.created_at)}</span>
                                <span className="text-[var(--text-secondary)]">{entry.user_email || '-'}</span>
                                <span className={`font-medium ${getActionColor(entry.action)}`}>{entry.action}</span>
                                <span className="text-[var(--text-primary)]">{entry.entity_type}</span>
                                <span className="text-[var(--text-muted)]">#{entry.entity_id}</span>
                              </div>
                              {renderJsonValues(t('pages.auditLog.oldValues'), entry.old_values)}
                              {renderJsonValues(t('pages.auditLog.newValues'), entry.new_values)}
                            </div>
                          ) : (
                            <button
                              onClick={() => setExpandedId(entry.id)}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              aria-label="Expand details"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                        {!isExpanded && (
                          <>
                            <td className="py-2 text-[var(--text-secondary)]">{formatDate(entry.created_at)}</td>
                            <td className="py-2 text-[var(--text-secondary)]">{entry.user_email || '-'}</td>
                            <td className="py-2">
                              <span className={`font-medium ${getActionColor(entry.action)}`}>
                                {entry.action}
                              </span>
                            </td>
                            <td className="py-2 text-[var(--text-primary)]">{entry.entity_type}</td>
                            <td className="py-2 text-right text-[var(--text-muted)]">
                              {entry.entity_id != null ? `#${entry.entity_id}` : '-'}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  onClick={() => fetchEntries(false)}
                  disabled={isLoading}
                >
                  {isLoading ? '...' : t('pages.auditLog.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </PageContainer>
  )
}

export default AuditLogPage
