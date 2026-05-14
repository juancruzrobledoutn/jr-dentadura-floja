import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Phone, ArrowRight, Building2 } from 'lucide-react'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import { useCategoryStore, selectCategories } from '../stores/categoryStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useRestaurantStore, selectRestaurant } from '../stores/restaurantStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { HOME_CATEGORY_NAME } from '../utils/constants'
import { helpContent } from '../utils/helpContent'

interface BranchCardProps {
  branch: {
    id: string
    name: string
    address?: string
    phone?: string
    image?: string
    is_active?: boolean
  }
  categoryCount: number
  productCount: number
  onSelect: () => void
  isFirst?: boolean // LCP optimization: first image loads eagerly
}

const BranchCard = memo(function BranchCard({
  branch,
  categoryCount,
  productCount,
  onSelect,
  isFirst = false,
}: BranchCardProps) {
  const { t } = useTranslation()
  return (
    <Card
      className="group cursor-pointer hover:border-[var(--primary-500)]/50 transition-all"
      onClick={onSelect}
    >
      {/* Image - LCP optimization: first image loads eagerly with high priority */}
      <div className="relative h-40 -mx-6 -mt-6 mb-4 overflow-hidden rounded-t-xl">
        {branch.image ? (
          <img
            src={branch.image}
            alt={branch.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading={isFirst ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={isFirst ? 'high' : 'auto'}
          />
        ) : (
          <div className="w-full h-full bg-[var(--bg-tertiary)] flex items-center justify-center">
            <Building2 className="w-12 h-12 text-[var(--text-muted)]" aria-hidden="true" />
          </div>
        )}
        {branch.is_active === false && (
          <div className="absolute top-2 right-2">
            <Badge variant="danger">{t('common.inactive')}</Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-[var(--text-primary)]">{branch.name}</h3>

        {branch.address && (
          <div className="flex items-start gap-2 text-sm text-[var(--text-tertiary)]">
            <MapPin
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              aria-hidden="true"
            />
            <span>{branch.address}</span>
          </div>
        )}

        {branch.phone && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Phone className="w-4 h-4" aria-hidden="true" />
            <span>{branch.phone}</span>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-4 pt-2 border-t border-[var(--border-default)]">
          <div className="text-sm">
            <span className="text-[var(--text-primary)] font-medium">{categoryCount}</span>
            <span className="text-[var(--text-muted)] ml-1">{t('sidebar.categories').toLowerCase()}</span>
          </div>
          <div className="text-sm">
            <span className="text-[var(--text-primary)] font-medium">{productCount}</span>
            <span className="text-[var(--text-muted)] ml-1">{t('sidebar.products').toLowerCase()}</span>
          </div>
        </div>

        {/* Action */}
        <Button
          variant="ghost"
          className="w-full mt-2 group-hover:bg-[var(--primary-500)]/10 group-hover:text-[var(--primary-500)]"
          onClick={onSelect}
        >
          {t('pages.dashboard.viewBranch')}
          <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  )
})

export function DashboardPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.dashboard.title'))

  const navigate = useNavigate()
  const restaurant = useRestaurantStore(selectRestaurant)
  const branches = useBranchStore(selectBranches)
  const selectBranch = useBranchStore((s) => s.selectBranch)
  const categories = useCategoryStore(selectCategories)
  const products = useProductStore(selectProducts)

  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.order - b.order),
    [branches]
  )

  // Pre-calculate counts per branch
  const branchStats = useMemo(() => {
    const stats = new Map<string, { categories: number; products: number }>()

    branches.forEach((branch) => {
      const branchCategories = categories.filter(
        (c) => c.branch_id === branch.id && c.name !== HOME_CATEGORY_NAME
      )
      const categoryIds = new Set(branchCategories.map((c) => c.id))
      const branchProducts = products.filter((p) => categoryIds.has(p.category_id))

      stats.set(branch.id, {
        categories: branchCategories.length,
        products: branchProducts.length,
      })
    })

    return stats
  }, [branches, categories, products])

  const handleSelectBranch = (branchId: string) => {
    selectBranch(branchId)
    navigate('/categories')
  }

  return (
    <>
      {/* REACT 19 IMPROVEMENT: Document metadata */}
      <title>{restaurant ? `Dashboard - ${restaurant.name}` : 'Dashboard'}</title>
      <meta name="description" content="Panel de administración de sucursales y menú del restaurante" />

      <PageContainer
        title={`${t('pages.dashboard.welcome')}${restaurant ? `, ${restaurant.name}` : ''}`}
        description={t('pages.dashboard.selectBranch')}
        helpContent={helpContent.dashboard}
      >
        {/* Branch Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sortedBranches.map((branch, index) => {
            const stats = branchStats.get(branch.id) || {
              categories: 0,
              products: 0,
            }
            return (
              <BranchCard
                key={branch.id}
                branch={branch}
                categoryCount={stats.categories}
                productCount={stats.products}
                onSelect={() => handleSelectBranch(branch.id)}
                isFirst={index === 0}
              />
            )
          })}
        </div>

        {branches.length === 0 && (
          <Card className="text-center py-12">
            <Building2
              className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4"
              aria-hidden="true"
            />
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              {t('pages.dashboard.noBranches')}
            </h3>
            <p className="text-[var(--text-muted)] mb-4">
              {t('pages.dashboard.createFirstBranch')}
            </p>
            <Button onClick={() => navigate('/branches')}>{t('pages.dashboard.goToBranches')}</Button>
          </Card>
        )}
      </PageContainer>
    </>
  )
}

export default DashboardPage
