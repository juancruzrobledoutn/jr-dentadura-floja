import { useState, useMemo, useCallback, Suspense, lazy, useTransition, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTableStore, useSession } from '../stores/tableStore'
import { useProductTranslation } from '../hooks/useProductTranslation'
import { useAdvancedFilters } from '../hooks/useAdvancedFilters'
import { useOrderUpdates } from '../hooks/useOrderUpdates'
import { useCartSync } from '../hooks/useCartSync'
import type { Category, Subcategory, Product } from '../types'
import { useMenuStore, selectCategories, selectProducts, selectBranchSlug, selectAllergens } from '../stores/menuStore'
import type { CategoryFrontend, ProductFrontend } from '../types/backend'
import { menuStoreLogger } from '../utils/logger'

// Components - eager loaded (critical path)
import Header from '../components/Header'
import SearchBar from '../components/SearchBar'
import CategoryTabs from '../components/CategoryTabs'
import BottomNav from '../components/BottomNav'
import SectionErrorBoundary from '../components/ui/SectionErrorBoundary'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import SubcategoryGrid from '../components/SubcategoryGrid'
import DinerRegistrationWarning from '../components/ui/DinerRegistrationWarning'
// LCP FIX: PromoBanner is above-the-fold, must be eager-loaded for good LCP
import PromoBanner from '../components/PromoBanner'

// Components - lazy loaded (below fold / conditional)
const FeaturedCarousel = lazy(() => import('../components/FeaturedCarousel'))
const ProductCard = lazy(() => import('../components/ProductCard'))
const ProductListItem = lazy(() => import('../components/ProductListItem'))
const ProductDetailModal = lazy(() => import('../components/ProductDetailModal'))
const SharedCart = lazy(() => import('../components/SharedCart'))
const AIChat = lazy(() => import('../components/AIChat'))
const CallWaiterModal = lazy(() => import('../components/CallWaiterModal'))
const ServiceCallToast = lazy(() => import('../components/ServiceCallToast'))
const FilterBadge = lazy(() => import('../components/FilterBadge'))
const AdvancedFiltersModal = lazy(() => import('../components/AdvancedFiltersModal'))

// Pages - lazy loaded
const CloseTable = lazy(() => import('./CloseTable'))

// Conversion helpers: backend types to frontend types
function convertBackendCategory(cat: CategoryFrontend): Category {
  return {
    id: String(cat.id),
    name: cat.name,
    icon: cat.icon || undefined,
    image: cat.image || undefined,
    order: cat.order,
    branch_id: '',
  }
}

function convertBackendSubcategory(sub: { id: number; name: string; image: string | null; order: number }, categoryId: number): Subcategory {
  return {
    id: String(sub.id),
    name: sub.name,
    category_id: String(categoryId),
    image: sub.image || undefined,
    order: sub.order,
  }
}

function convertBackendProduct(prod: ProductFrontend): Product {
  return {
    id: String(prod.id),
    name: prod.name,
    description: prod.description || '',
    price: prod.price,
    image: prod.image || undefined,
    category_id: String(prod.categoryId),
    subcategory_id: prod.subcategoryId ? String(prod.subcategoryId) : '',
    featured: prod.featured,
    popular: prod.popular,
    badge: prod.badge || undefined,
    allergen_ids: prod.allergenIds?.map(String),
    is_available: prod.isAvailable,
    use_branch_prices: false,
  }
}

// React 19: Suspense fallback component
function SectionLoader({ name }: { name: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center py-8">
      <LoadingSpinner size="md" />
      <span className="sr-only">{t('home.loading', { name })}</span>
    </div>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const { translateProducts } = useProductTranslation()

  // Listen for WebSocket events to update order status in real-time
  useOrderUpdates()

  // Listen for WebSocket events to sync cart across devices (shared cart feature)
  useCartSync()

  const [activeCategory, setActiveCategory] = useState('0') // Default to 'Home'
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [showCloseTable, setShowCloseTable] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const [showCallWaiter, setShowCallWaiter] = useState(false)
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const addToCart = useTableStore((state) => state.addToCart)
  const session = useSession()

  // Menu store data
  const fetchMenu = useMenuStore((state) => state.fetchMenu)
  const fetchAllergens = useMenuStore((state) => state.fetchAllergens)
  const backendCategories = useMenuStore(selectCategories)
  const backendProducts = useMenuStore(selectProducts)
  const branchAllergens = useMenuStore(selectAllergens)
  const branchSlug = useMenuStore(selectBranchSlug)

  // Advanced filters (producto3.md improvement)
  const advancedFilters = useAdvancedFilters()

  // REACT 19 IMPROVEMENT: useTransition for non-blocking category/filter changes
  // isPending could be used to show loading indicator during category/subcategory transitions
  const [, startTransition] = useTransition()

  // Load menu and allergens from backend on mount
  useEffect(() => {
    const slug = import.meta.env.VITE_BRANCH_SLUG || 'demo-branch'
    if (!branchSlug || branchSlug !== slug) {
      fetchMenu(slug).catch((err) => {
        menuStoreLogger.error('Failed to load menu from backend:', err)
      })
      // Also fetch allergens for filtering (producto3.md improvement)
      fetchAllergens(slug).catch((err) => {
        menuStoreLogger.error('Failed to load allergens from backend:', err)
      })
    }
  }, [fetchMenu, fetchAllergens, branchSlug])

  // Convert backend categories to frontend format
  const categories = useMemo(() => {
    return backendCategories.map(convertBackendCategory)
  }, [backendCategories])

  // Convert backend products to frontend format
  const allProducts = useMemo(() => {
    return backendProducts.map(convertBackendProduct)
  }, [backendProducts])

  // Get all subcategories from backend categories
  const allSubcategories = useMemo(() => {
    const subs: Subcategory[] = []
    for (const cat of backendCategories) {
      for (const sub of cat.subcategories) {
        subs.push(convertBackendSubcategory(sub, cat.id))
      }
    }
    return subs
  }, [backendCategories])

  // Get featured products - translated based on current language
  const featuredProducts = useMemo(
    () => {
      const featured = allProducts.filter(p => p.featured)
      return translateProducts(featured)
    },
    [translateProducts, allProducts]
  )

  // Get subcategories for selected category
  const subcategories = useMemo(() => {
    if (activeCategory === '0') return []
    return allSubcategories.filter(s => s.category_id === activeCategory)
  }, [activeCategory, allSubcategories])

  // Get products by selected subcategory - translated
  const subcategoryProducts = useMemo(() => {
    if (!activeSubcategory) return []
    const filtered = allProducts.filter(p => p.subcategory_id === activeSubcategory)
    return translateProducts(filtered)
  }, [activeSubcategory, translateProducts, allProducts])

  // Get current category name
  const currentCategory = useMemo(() => {
    return categories.find(c => c.id === activeCategory)
  }, [activeCategory, categories])

  // Get current subcategory
  const currentSubcategory = useMemo(
    () => {
      if (!activeSubcategory) return null
      return allSubcategories.find(s => s.id === activeSubcategory)
    },
    [activeSubcategory, allSubcategories]
  )

  // Navigation state
  const isShowingSubcategories = activeCategory !== '0' && !activeSubcategory && !searchQuery
  const isShowingProducts = activeSubcategory !== null && !searchQuery

  // Apply advanced filters to backend products (producto3.md improvement)
  const filteredByAdvancedFilters = useMemo(() => {
    if (!advancedFilters.hasAnyActiveFilter) {
      return backendProducts
    }
    return backendProducts.filter((p) => {
      // Convert to ProductFilterData format for the filter hook
      return advancedFilters.shouldShowProduct({
        id: p.id,
        name: p.name,
        allergens: p.allergens ?? null,
        dietary: p.dietary ?? null,
        cooking: p.cooking ?? null,
      })
    })
  }, [backendProducts, advancedFilters])

  // Filter products by search - translated
  const filteredProducts = useMemo(() => {
    // First convert filtered backend products to frontend format
    const baseProducts = filteredByAdvancedFilters.map(convertBackendProduct)

    if (!searchQuery) {
      // Return recommended products when there's no search (but still filtered)
      const recommended = baseProducts.filter(p => p.popular)
      const translated = translateProducts(recommended.length > 0 ? recommended : baseProducts.slice(0, 8))
      return translated
    }

    // Translate all products first, then filter by search query
    const translatedProducts = translateProducts(baseProducts)
    const query = searchQuery.toLowerCase()
    return translatedProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
    )
  }, [searchQuery, translateProducts, filteredByAdvancedFilters])

  const handleCategoryClick = useCallback((category: Category) => {
    // REACT 19 IMPROVEMENT: Use transition for non-blocking category change
    startTransition(() => {
      setActiveCategory(category.id)
      setActiveSubcategory(null) // Reset subcategory when changing category
    })
  }, [])

  const handleSubcategoryClick = useCallback((subcategory: Subcategory) => {
    // REACT 19 IMPROVEMENT: Use transition for non-blocking subcategory change
    startTransition(() => {
      setActiveSubcategory(subcategory.id)
    })
  }, [])

  const handleBackFromSubcategory = useCallback(() => {
    setActiveCategory('0')
    setActiveSubcategory(null)
  }, [])

  const handleBackFromProducts = useCallback(() => {
    setActiveSubcategory(null)
  }, [])

  const handleProductClick = useCallback((product: Product) => {
    setSelectedProduct(product)
  }, [])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const handleCartClick = useCallback(() => {
    setIsCartOpen(true)
  }, [])

  const handlePromoClick = useCallback(() => {
    // Scroll to featured section when promo clicked
    // Using id instead of translated aria-label for reliable selection
    const featuredSection = document.getElementById('featured-products')
    featuredSection?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleAddToCart = useCallback((product: Product) => {
    addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
    })
  }, [addToCart])

  const handleCloseTable = useCallback(() => {
    setShowCloseTable(true)
  }, [])

  const handleAIChat = useCallback(() => {
    setShowAIChat(true)
  }, [])

  const handleCallWaiter = useCallback(() => {
    setShowCallWaiter(true)
  }, [])

  const handleAIChatProductClick = useCallback((product: Product) => {
    setShowAIChat(false)
    setSelectedProduct(product)
  }, [])

  // If closing table, show that screen
  if (showCloseTable) {
    return (
      <Suspense fallback={<SectionLoader name="bill" />}>
        <CloseTable onBack={() => setShowCloseTable(false)} />
      </Suspense>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-dark-bg overflow-x-hidden w-full max-w-full">
      {/* A001 FIX: Service call toast for feedback when waiter acknowledges */}
      <Suspense fallback={null}>
        <ServiceCallToast />
      </Suspense>

      {/* React 19: Document metadata in component */}
      <title>
        {session ? t('home.pageTitle', { table: session.table_number }) : t('home.pageTitleDefault')}
      </title>
      <meta
        name="description"
        content={
          session
            ? t('home.pageDescription', { table: session.table_number })
            : t('home.pageDescriptionDefault')
        }
      />

      {/* Header */}
      <Header onCartClick={handleCartClick} />

      {/* PWAM-004: Warning when diner registration failed */}
      <DinerRegistrationWarning />

      {/* Paying status banner - ordering is closed */}
      {session?.status === 'paying' && (
        <div className="bg-purple-900/50 border border-purple-500/30 text-purple-200 text-center py-2 px-4 text-sm">
          {t('cart.payingBanner', 'Cuenta solicitada — no se pueden agregar más pedidos')}
        </div>
      )}

      {/* Shared Cart Modal - lazy loaded */}
      {isCartOpen && (
        <Suspense fallback={null}>
          <SharedCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
        </Suspense>
      )}

      {/* Product Detail Modal - lazy loaded */}
      {selectedProduct && (
        <Suspense fallback={null}>
          <ProductDetailModal
            product={selectedProduct}
            isOpen={selectedProduct !== null}
            onClose={() => setSelectedProduct(null)}
          />
        </Suspense>
      )}

      {/* AI Chat Modal - lazy loaded */}
      {showAIChat && (
        <Suspense fallback={null}>
          <AIChat
            isOpen={showAIChat}
            onClose={() => setShowAIChat(false)}
            onProductClick={handleAIChatProductClick}
          />
        </Suspense>
      )}

      {/* Call Waiter Modal - lazy loaded */}
      {showCallWaiter && session && (
        <Suspense fallback={null}>
          <CallWaiterModal
            isOpen={showCallWaiter}
            onClose={() => setShowCallWaiter(false)}
            tableNumber={session.table_number}
          />
        </Suspense>
      )}

      {/* Main content */}
      <main className="flex-1 pb-20 sm:pb-24">
        {/* Search Bar with Filter Badge */}
        <SectionErrorBoundary sectionName="Búsqueda">
          <div className="flex items-center gap-2 px-4 sm:px-6 md:px-8 lg:px-12">
            <div className="flex-1">
              <SearchBar onSearch={handleSearch} />
            </div>
            <Suspense fallback={null}>
              <FilterBadge
                onClick={() => setShowFiltersModal(true)}
                branchSlug={branchSlug || undefined}
              />
            </Suspense>
          </div>
        </SectionErrorBoundary>

        {/* Promo Banner - only on Home (not showing subcategories or products) */}
        {/* LCP FIX: No Suspense wrapper - PromoBanner is eager-loaded for better LCP */}
        {!searchQuery && !isShowingSubcategories && !isShowingProducts && (
          <SectionErrorBoundary sectionName="Promoción">
            <PromoBanner
              title="Happy Hour!"
              discount="50% OFF"
              buttonText={t('home.viewPromos')}
              backgroundImage="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop"
              onButtonClick={handlePromoClick}
            />
          </SectionErrorBoundary>
        )}

        {/* Category Tabs - only on Home */}
        {!isShowingSubcategories && !isShowingProducts && (
          <SectionErrorBoundary sectionName="Categorías">
            <CategoryTabs
              categories={categories}
              activeCategory={activeCategory}
              onCategoryClick={handleCategoryClick}
            />
          </SectionErrorBoundary>
        )}

        {/* Featured Carousel - only on Home */}
        {!searchQuery && !isShowingSubcategories && !isShowingProducts && (
          <SectionErrorBoundary sectionName="Destacados">
            <Suspense fallback={<SectionLoader name="destacados" />}>
              <FeaturedCarousel
                products={featuredProducts}
                onProductClick={handleProductClick}
              />
            </Suspense>
          </SectionErrorBoundary>
        )}

        {/* Subcategory Grid - when category is selected */}
        {isShowingSubcategories && (
          <SectionErrorBoundary sectionName="Subcategorías">
            <SubcategoryGrid
              subcategories={subcategories}
              onSubcategoryClick={handleSubcategoryClick}
              onBack={handleBackFromSubcategory}
              categoryName={currentCategory?.name || ''}
            />
          </SectionErrorBoundary>
        )}

        {/* Products List - when subcategory is selected */}
        {isShowingProducts && (
          <section className="px-4 sm:px-6 md:px-8 lg:px-12 py-4">
            <div className="max-w-7xl mx-auto">
              {/* Header with back button */}
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleBackFromProducts}
                  className="p-2 -ml-2 rounded-full hover:bg-dark-elevated transition-colors"
                  aria-label={t('common.back')}
                >
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 19.5L8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {currentSubcategory?.name ? t(currentSubcategory.name) : t('home.products')}
                </h2>
              </div>

              <SectionErrorBoundary sectionName="Productos">
                <Suspense fallback={<SectionLoader name="productos" />}>
                  {subcategoryProducts.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {subcategoryProducts.map((product) => (
                        <ProductListItem
                          key={product.id}
                          product={product}
                          onClick={handleProductClick}
                          onAddToCart={handleAddToCart}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 sm:py-12">
                      <p className="text-dark-muted text-sm sm:text-base">{t('home.noProductsInCategory')}</p>
                    </div>
                  )}
                </Suspense>
              </SectionErrorBoundary>
            </div>
          </section>
        )}

        {/* Search Results Section - only when there's a search */}
        {searchQuery && (
          <section className="px-4 sm:px-6 md:px-8 lg:px-12">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-3 sm:mb-4">
                {t('home.searchResults', { query: searchQuery })}
              </h2>

              <SectionErrorBoundary sectionName="Products">
                <Suspense fallback={<SectionLoader name="results" />}>
                  {filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                      {filteredProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onClick={handleProductClick}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 sm:py-12">
                      <p className="text-dark-muted text-sm sm:text-base">{t('home.noProducts')}</p>
                    </div>
                  )}
                </Suspense>
              </SectionErrorBoundary>
            </div>
          </section>
        )}
      </main>

      {/* Bottom Navigation */}
      <SectionErrorBoundary sectionName="Navegación">
        <BottomNav
          onCloseTable={handleCloseTable}
          onAIChat={handleAIChat}
          onCallWaiter={handleCallWaiter}
        />
      </SectionErrorBoundary>

      {/* Advanced Filters Modal (producto3.md improvement) */}
      {showFiltersModal && (
        <Suspense fallback={null}>
          <AdvancedFiltersModal
            isOpen={showFiltersModal}
            onClose={() => setShowFiltersModal(false)}
            branchSlug={branchSlug || undefined}
            allergens={branchAllergens}
          />
        </Suspense>
      )}
    </div>
  )
}
