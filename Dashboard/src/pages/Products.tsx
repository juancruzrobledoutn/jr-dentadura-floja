import { useState, useMemo, useCallback, useActionState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Filter, Star, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { ImageUpload } from '../components/ui/ImageUpload'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge } from '../components/ui/Badge'
import { AllergenPresenceEditor, convertLegacyAllergenIds } from '../components/ui/AllergenPresenceEditor'
import { Pagination } from '../components/ui/Pagination'
import { BranchPriceInput } from '../components/ui/BranchPriceInput'
import { HelpButton } from '../components/ui/HelpButton'
import { usePagination } from '../hooks/usePagination'
import { useCategoryStore, selectCategories } from '../stores/categoryStore'
import { useSubcategoryStore, selectSubcategories } from '../stores/subcategoryStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useAllergenStore, selectAllergens } from '../stores/allergenStore'
import { useBadgeStore, selectBadges } from '../stores/badgeStore'
import { useSealStore, selectSeals } from '../stores/sealStore'
import { useIngredientStore, selectIngredients } from '../stores/ingredientStore'
import { catalogsAPI } from '../services/api'
import { deleteProductWithCascade } from '../services/cascadeService'
import type { CookingMethod, FlavorProfile, TextureProfile } from '../types'
import {
  useBranchStore,
  selectSelectedBranchId,
  selectBranchById,
} from '../stores/branchStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validateProduct } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateProduct, canEditProduct, canDelete } from '../utils/permissions'
import { HOME_CATEGORY_NAME, formatPrice } from '../utils/constants'
import { helpContent } from '../utils/helpContent'
import type { Product, ProductFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'
import type { BranchPriceErrors } from '../utils/validation'

const initialFormData: ProductFormData = {
  name: '',
  description: '',
  price: 0,
  branch_prices: [],
  use_branch_prices: false,
  image: '',
  category_id: '',
  subcategory_id: '',
  featured: false,
  popular: false,
  badge: '',
  seal: '',
  allergen_ids: [],           // Legacy format (backward compatible)
  allergens: [],              // New format with presence types (Phase 0)
  is_active: true,
  stock: undefined,
  // Canonical model fields (producto3.md)
  ingredients: [],
  dietary_profile: {
    is_vegetarian: false,
    is_vegan: false,
    is_gluten_free: false,
    is_dairy_free: false,
    is_celiac_safe: false,
    is_keto: false,
    is_low_sodium: false,
  },
  cooking: {
    methods: [],
    uses_oil: false,
    prep_time_minutes: undefined,
    cook_time_minutes: undefined,
  },
  sensory: {
    flavors: [],
    textures: [],
  },
}

export function ProductsPage() {
  const { t } = useTranslation()
  // REACT 19: Document metadata
  useDocumentTitle(t('pages.products.title'))

  const navigate = useNavigate()

  const categories = useCategoryStore(selectCategories)
  const subcategories = useSubcategoryStore(selectSubcategories)
  const getByCategory = useSubcategoryStore((s) => s.getByCategory)
  const products = useProductStore(selectProducts)
  const addProduct = useProductStore((s) => s.addProduct)
  const updateProduct = useProductStore((s) => s.updateProduct)
  const allergens = useAllergenStore(selectAllergens)
  const badges = useBadgeStore(selectBadges)
  const seals = useSealStore(selectSeals)
  const allIngredients = useIngredientStore(selectIngredients)
  const fetchIngredients = useIngredientStore((s) => s.fetchIngredients)

  // Catalog state for cooking methods, flavors, textures
  const [cookingMethods, setCookingMethods] = useState<CookingMethod[]>([])
  const [flavorProfiles, setFlavorProfiles] = useState<FlavorProfile[]>([])
  const [textureProfiles, setTextureProfiles] = useState<TextureProfile[]>([])
  const [showAdvancedFields, setShowAdvancedFields] = useState(false)

  // Fetch catalogs and ingredients on mount
  useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        const [methods, flavors, textures] = await Promise.all([
          catalogsAPI.listCookingMethods(),
          catalogsAPI.listFlavorProfiles(),
          catalogsAPI.listTextureProfiles(),
        ])
        // Map null to undefined for type compatibility
        setCookingMethods(methods.map(m => ({ ...m, description: m.description ?? undefined, icon: m.icon ?? undefined })))
        setFlavorProfiles(flavors.map(f => ({ ...f, description: f.description ?? undefined, icon: f.icon ?? undefined })))
        setTextureProfiles(textures.map(t => ({ ...t, description: t.description ?? undefined, icon: t.icon ?? undefined })))
      } catch {
        // Silently fail - catalogs are optional
      }
    }
    fetchCatalogs()
    fetchIngredients()
  }, [fetchIngredients])

  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const selectedBranch = useBranchStore(selectBranchById(selectedBranchId))

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateProduct(userRoles)
  const canEdit = canEditProduct(userRoles)
  const canDeleteProduct = canDelete(userRoles)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<ProductFormData>(initialFormData)
  const [branchPriceErrors, setBranchPriceErrors] = useState<BranchPriceErrors>({})
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('')

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<ProductFormData>, formDataSubmit: FormData): Promise<FormState<ProductFormData>> => {
      // Extract simple fields from FormData
      const data: ProductFormData = {
        name: formDataSubmit.get('name') as string,
        description: formDataSubmit.get('description') as string,
        price: parseFloat(formDataSubmit.get('price') as string) || 0,
        image: formDataSubmit.get('image') as string,
        category_id: formDataSubmit.get('category_id') as string,
        subcategory_id: formDataSubmit.get('subcategory_id') as string,
        badge: formDataSubmit.get('badge') as string,
        seal: formDataSubmit.get('seal') as string,
        featured: formDataSubmit.get('featured') === 'on',
        popular: formDataSubmit.get('popular') === 'on',
        is_active: formDataSubmit.get('is_active') === 'on',
        stock: formDataSubmit.get('stock') ? parseInt(formDataSubmit.get('stock') as string, 10) : undefined,
        // Complex fields from component state (not FormData)
        allergen_ids: formData.allergen_ids,
        allergens: formData.allergens,  // New format with presence types (Phase 0)
        branch_prices: formData.branch_prices,
        use_branch_prices: formData.use_branch_prices,
        // Canonical model fields (producto3.md)
        ingredients: formData.ingredients,
        dietary_profile: formData.dietary_profile,
        cooking: formData.cooking,
        sensory: formData.sensory,
      }

      // DASH-008: Pass existing products for duplicate validation
      const validation = validateProduct(data, {
        existingProducts: products,
        editingProductId: selectedProduct?.id,
      })
      if (!validation.isValid) {
        setBranchPriceErrors(validation.branchPriceErrors)
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (selectedProduct) {
          updateProduct(selectedProduct.id, data)
          toast.success(t('toasts.updateSuccess', { entity: t('pages.products.title') }))
        } else {
          addProduct(data)
          toast.success(t('toasts.createSuccess', { entity: t('pages.products.title') }))
        }
        return { isSuccess: true }
      } catch (error) {
        const message = handleError(error, 'ProductsPage.submitAction')
        toast.error(`Error al guardar el producto: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [selectedProduct, updateProduct, addProduct, formData.allergen_ids, formData.allergens, formData.branch_prices, formData.use_branch_prices, products]
  )

  const [state, formAction, isPending] = useActionState<FormState<ProductFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // Close modal on success
  if (state.isSuccess && isModalOpen) {
    setIsModalOpen(false)
    setSelectedProduct(null)
    setFormData(initialFormData)
    setBranchPriceErrors({})
  }

  // Filtrar categorias por sucursal seleccionada
  const branchCategories = useMemo(() => {
    if (!selectedBranchId) return []
    return categories.filter(
      (c) => c.branch_id === selectedBranchId && c.name !== HOME_CATEGORY_NAME
    )
  }, [categories, selectedBranchId])

  // Obtener IDs de categorias de esta sucursal
  const branchCategoryIds = useMemo(
    () => new Set(branchCategories.map((c) => c.id)),
    [branchCategories]
  )

  // Filter categories (Home categories already filtered by name in branchCategories)
  const selectableCategories = useMemo(
    () => branchCategories,
    [branchCategories]
  )

  const categoryOptions = useMemo(
    () => selectableCategories.map((c) => ({ value: c.id, label: c.name })),
    [selectableCategories]
  )

  // Create allergen lookup map for performance
  const allergenMap = useMemo(
    () => new Map(allergens.map((a) => [a.id, a])),
    [allergens]
  )

  // Get subcategories for selected category in form
  const formSubcategoryOptions = useMemo(() => {
    if (!formData.category_id) return []
    return getByCategory(formData.category_id).map((s) => ({
      value: s.id,
      label: s.name,
    }))
  }, [formData.category_id, getByCategory])

  // Get subcategories for filter
  const filterSubcategoryOptions = useMemo(() => {
    if (!filterCategory) return []
    return getByCategory(filterCategory).map((s) => ({
      value: s.id,
      label: s.name,
    }))
  }, [filterCategory, getByCategory])

  const filteredProducts = useMemo(() => {
    // Filtrar por sucursal primero
    let result = products.filter((p) => branchCategoryIds.has(p.category_id))
    if (filterCategory) {
      result = result.filter((p) => p.category_id === filterCategory)
    }
    if (filterSubcategory) {
      result = result.filter((p) => p.subcategory_id === filterSubcategory)
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [products, branchCategoryIds, filterCategory, filterSubcategory])

  const {
    paginatedItems: paginatedProducts,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(filteredProducts)

  // Productos de la sucursal (para conteo en titulo)
  const branchProducts = useMemo(
    () => products.filter((p) => branchCategoryIds.has(p.category_id)),
    [products, branchCategoryIds]
  )

  const getCategoryName = useCallback((categoryId: string): string => {
    return categories.find((c) => c.id === categoryId)?.name || 'Sin categoria'
  }, [categories])

  const getSubcategoryName = useCallback((subcategoryId: string): string => {
    return subcategories.find((s) => s.id === subcategoryId)?.name || 'Sin subcategoria'
  }, [subcategories])

  const openCreateModal = useCallback(() => {
    if (!selectedBranchId) {
      toast.error(t('common.selectBranchFirst'))
      return
    }
    if (selectableCategories.length === 0) {
      toast.error(t('pages.categories.noCategories'))
      return
    }
    setSelectedProduct(null)
    const categoryId = filterCategory || selectableCategories[0]?.id || ''
    const subcats = getByCategory(categoryId)
    setFormData({
      ...initialFormData,
      category_id: categoryId,
      subcategory_id: filterSubcategory || subcats[0]?.id || '',
    })
    setBranchPriceErrors({})
    setIsModalOpen(true)
  }, [selectedBranchId, selectableCategories, filterCategory, filterSubcategory, getByCategory])

  const openEditModal = useCallback((product: Product) => {
    setSelectedProduct(product)
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price,
      branch_prices: product.branch_prices || [],
      use_branch_prices: product.use_branch_prices || false,
      image: product.image,
      category_id: product.category_id,
      subcategory_id: product.subcategory_id,
      featured: product.featured,
      popular: product.popular,
      badge: product.badge || '',
      seal: product.seal || '',
      allergen_ids: product.allergen_ids || [],
      // Use new allergens format if available, otherwise convert from legacy
      allergens: product.allergens || convertLegacyAllergenIds(product.allergen_ids),
      is_active: product.is_active ?? true,
      stock: product.stock,
      // Canonical model fields
      ingredients: product.ingredients || [],
      dietary_profile: product.dietary_profile || {
        is_vegetarian: false,
        is_vegan: false,
        is_gluten_free: false,
        is_dairy_free: false,
        is_celiac_safe: false,
        is_keto: false,
        is_low_sodium: false,
      },
      cooking: product.cooking || {
        methods: [],
        uses_oil: false,
        prep_time_minutes: undefined,
        cook_time_minutes: undefined,
      },
      sensory: product.sensory || {
        flavors: [],
        textures: [],
      },
    })
    setBranchPriceErrors({})
    setIsModalOpen(true)
  }, [])

  const openDeleteDialog = useCallback((product: Product) => {
    setSelectedProduct(product)
    setIsDeleteOpen(true)
  }, [])


  const handleDelete = useCallback(() => {
    if (!selectedProduct) return

    try {
      const result = deleteProductWithCascade(selectedProduct.id)

      if (!result.success) {
        toast.error(result.error || 'Error al eliminar el producto')
        setIsDeleteOpen(false)
        return
      }

      toast.success(t('toasts.deleteSuccess', { entity: t('pages.products.title') }))
      setIsDeleteOpen(false)
    } catch (error) {
      const message = handleError(error, 'ProductsPage.handleDelete')
      toast.error(`Error al eliminar el producto: ${message}`)
    }
  }, [selectedProduct])

  const handleCategoryChange = (categoryId: string) => {
    const subcats = getByCategory(categoryId)
    setFormData((prev) => ({
      ...prev,
      category_id: categoryId,
      subcategory_id: subcats[0]?.id || '',
    }))
  }

  const columns: TableColumn<Product>[] = useMemo(() => [
    {
      key: 'image',
      label: 'Imagen',
      width: 'w-20',
      render: (item: Product) =>
        item.image ? (
          <img
            src={item.image}
            alt={`Imagen de ${item.name}`}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)]"
            aria-label="Sin imagen"
          >
            -
          </div>
        ),
    },
    {
      key: 'name',
      label: 'Producto',
      render: (item) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{item.name}</span>
            {item.featured && <Star className="w-4 h-4 text-[var(--warning-icon)] fill-[var(--warning-icon)]" aria-label="Destacado" />}
            {item.popular && <TrendingUp className="w-4 h-4 text-[var(--success-icon)]" aria-label="Popular" />}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">
            {item.description}
          </p>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Precio',
      width: 'w-36',
      render: (item) => {
        const branchPrices = item.branch_prices ?? []
        // If not using branch prices or no branch prices set, show base price
        if (!item.use_branch_prices || branchPrices.length === 0) {
          return (
            <span className="font-medium text-[var(--primary-500)]">
              {formatPrice(item.price)}
            </span>
          )
        }

        // Get active branch prices
        const activePrices = branchPrices
          .filter((bp) => bp.is_active)
          .map((bp) => bp.price)

        if (activePrices.length === 0) {
          return <span className="text-[var(--text-muted)]">-</span>
        }

        const minPrice = Math.min(...activePrices)
        const maxPrice = Math.max(...activePrices)

        // If all prices are the same, show single price
        if (minPrice === maxPrice) {
          return (
            <span className="font-medium text-[var(--primary-500)]">
              {formatPrice(minPrice)}
            </span>
          )
        }

        // Show price range
        return (
          <div className="space-y-0.5">
            <span className="font-medium text-[var(--primary-500)]">
              {formatPrice(minPrice)} - {formatPrice(maxPrice)}
            </span>
            <div className="text-xs text-[var(--text-muted)]">
              {activePrices.length} sucursales
            </div>
          </div>
        )
      },
    },
    {
      key: 'category_id',
      label: 'Categoria',
      render: (item) => (
        <div className="space-y-1">
          <Badge variant="info">{getCategoryName(item.category_id)}</Badge>
          <div className="text-xs text-[var(--text-muted)]">
            {getSubcategoryName(item.subcategory_id)}
          </div>
        </div>
      ),
    },
    {
      key: 'allergen_ids',
      label: 'Alergenos',
      width: 'w-32',
      render: (item) => {
        const productAllergens = (item.allergen_ids || [])
          .map((id) => allergenMap.get(id))
          .filter(Boolean)
        if (productAllergens.length === 0) {
          return <span className="text-[var(--text-muted)]">-</span>
        }
        return (
          <div className="flex flex-wrap gap-1" title={productAllergens.map((a) => a?.name).join(', ')}>
            {productAllergens.slice(0, 3).map((allergen) => (
              <span
                key={allergen?.id}
                className="text-lg"
                aria-label={allergen?.name}
              >
                {allergen?.icon}
              </span>
            ))}
            {productAllergens.length > 3 && (
              <span className="text-xs text-[var(--text-muted)]">+{productAllergens.length - 3}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'badge',
      label: 'Badge',
      width: 'w-24',
      render: (item) =>
        item.badge ? (
          <Badge variant="warning">{item.badge}</Badge>
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        ),
    },
    {
      key: 'is_active',
      label: 'Estado',
      width: 'w-24',
      render: (item) =>
        item.is_active !== false ? (
          <Badge variant="success">
            <span className="sr-only">Estado:</span> Activo
          </Badge>
        ) : (
          <Badge variant="danger">
            <span className="sr-only">Estado:</span> Inactivo
          </Badge>
        ),
    },
    {
      key: 'actions',
      label: 'Acciones',
      width: 'w-28',
      render: (item) => (
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                openEditModal(item)
              }}
              aria-label={`Editar ${item.name}`}
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
          {canDeleteProduct && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                openDeleteDialog(item)
              }}
              className="text-[var(--danger-icon)] hover:text-[var(--danger-text)] hover:bg-[var(--danger-border)]/10"
              aria-label={`Eliminar ${item.name}`}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      ),
    },
  ], [allergenMap, openEditModal, openDeleteDialog, getCategoryName, getSubcategoryName, canEdit, canDeleteProduct])

  // Si no hay sucursal seleccionada, mostrar mensaje
  if (!selectedBranchId) {
    return (
      <PageContainer
        title={t('pages.products.title')}
        description={t('pages.products.selectBranch')}
        helpContent={helpContent.products}
      >
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)] mb-4">
            {t('pages.products.selectBranch')}
          </p>
          <Button onClick={() => navigate('/')}>{t('common.goToDashboard')}</Button>
        </Card>
      </PageContainer>
    )
  }

  return (
    <>
      {/* REACT 19 IMPROVEMENT: Document metadata */}
      <title>{selectedBranch ? `Productos - ${selectedBranch.name}` : 'Productos - Dashboard'}</title>
      <meta name="description" content={`${branchProducts.length} productos en ${selectedBranch?.name || 'la sucursal'}`} />

      <PageContainer
        title={`${t('pages.products.title')} - ${selectedBranch?.name || ''}`}
        description={`${branchProducts.length} ${t('pages.subcategories.productsCount')} - ${selectedBranch?.name || ''}`}
        helpContent={helpContent.products}
        actions={
          canCreate ? (
            <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
              {t('pages.products.newProduct')}
            </Button>
          ) : undefined
        }
      >
        {/* Filters */}
        <Card className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <Filter className="w-5 h-5 text-[var(--text-muted)]" aria-hidden="true" />
            <Select
              options={[
                { value: '', label: 'Todas las categorias' },
                ...categoryOptions,
              ]}
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value)
                setFilterSubcategory('')
              }}
              className="w-48"
              aria-label="Filtrar por categoria"
            />
            {filterCategory && (
              <Select
                options={[
                  { value: '', label: 'Todas las subcategorias' },
                  ...filterSubcategoryOptions,
                ]}
                value={filterSubcategory}
                onChange={(e) => setFilterSubcategory(e.target.value)}
                className="w-48"
                aria-label="Filtrar por subcategoria"
              />
            )}
            {(filterCategory || filterSubcategory) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterCategory('')
                  setFilterSubcategory('')
                }}
              >
                {t('pages.subcategories.clearFilter')}
              </Button>
            )}
            <div className="ml-auto text-sm text-[var(--text-muted)]">
              {filteredProducts.length} de {branchProducts.length} productos
            </div>
          </div>
        </Card>

        <Card padding="none">
          <Table
            data={paginatedProducts}
            columns={columns}
            emptyMessage={t('pages.products.noProducts')}
            ariaLabel="Lista de productos"
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </Card>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={selectedProduct ? t('pages.products.editProduct') : t('pages.products.newProduct')}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="product-form" isLoading={isPending}>
                {selectedProduct ? t('common.save') : t('common.create')}
              </Button>
            </>
          }
        >
          <form id="product-form" action={formAction} className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <HelpButton
                title="Formulario de Producto"
                size="sm"
                content={
                  <div className="space-y-3">
                    <p>
                      <strong>Completa los siguientes campos</strong> para crear o editar un producto:
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>
                        <strong>Categoria y Subcategoria:</strong> Ubicacion del producto en el menu.
                      </li>
                      <li>
                        <strong>Nombre:</strong> Nombre del producto (ej: Hamburguesa Clasica). Es obligatorio.
                      </li>
                      <li>
                        <strong>Descripcion:</strong> Detalle del producto que veran los clientes.
                      </li>
                      <li>
                        <strong>Precio:</strong> Precio base o precios diferenciados por sucursal.
                      </li>
                      <li>
                        <strong>Badge:</strong> Etiqueta especial como "NUEVO", "VEGANO", "PROMO".
                      </li>
                      <li>
                        <strong>Imagen:</strong> Foto del producto para el menu.
                      </li>
                      <li>
                        <strong>Alergenos:</strong> Selecciona los alergenos que contiene el producto.
                      </li>
                      <li>
                        <strong>Destacado/Popular:</strong> Marca productos especiales que apareceran resaltados.
                      </li>
                    </ul>
                    <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                      <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                      <p className="text-sm mt-1">
                        Una buena descripcion y foto aumentan las ventas. Incluye ingredientes principales y tamano de la porcion.
                      </p>
                    </div>
                  </div>
                }
              />
              <span className="text-sm text-[var(--text-tertiary)]">{t('common.formHelp')}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('pages.products.category')}
                name="category_id"
                options={categoryOptions}
                value={formData.category_id}
                onChange={(e) => handleCategoryChange(e.target.value)}
                placeholder="Selecciona una categoria"
                error={state.errors?.category_id}
              />

              <Select
                label={t('pages.products.subcategory')}
                name="subcategory_id"
                options={formSubcategoryOptions}
                value={formData.subcategory_id}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, subcategory_id: e.target.value }))
                }
                placeholder="Selecciona una subcategoria"
                error={state.errors?.subcategory_id}
                disabled={!formData.category_id}
              />
            </div>

            <Input
              label={t('common.name')}
              name="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Ej: Hamburguesa Clasica"
              error={state.errors?.name}
            />

            <Textarea
              label={t('common.description')}
              name="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Descripcion del producto..."
              error={state.errors?.description}
              rows={2}
            />

            <input type="hidden" name="price" value={formData.price} />
            <BranchPriceInput
              label={t('common.price')}
              defaultPrice={formData.price}
              branchPrices={formData.branch_prices}
              useBranchPrices={formData.use_branch_prices}
              onDefaultPriceChange={(price) =>
                setFormData((prev) => ({ ...prev, price }))
              }
              onBranchPricesChange={(branch_prices) =>
                setFormData((prev) => ({ ...prev, branch_prices }))
              }
              onUseBranchPricesChange={(use_branch_prices) =>
                setFormData((prev) => ({ ...prev, use_branch_prices }))
              }
              error={state.errors?.price || state.errors?.branch_prices}
              priceErrors={branchPriceErrors}
            />

            <input type="hidden" name="image" value={formData.image} />
            <ImageUpload
              label={t('common.image')}
              value={formData.image}
              onChange={(url) =>
                setFormData((prev) => ({ ...prev, image: url }))
              }
            />

            <AllergenPresenceEditor
              label={t('pages.products.allergens')}
              value={formData.allergens}
              onChange={(allergens) =>
                setFormData((prev) => ({ ...prev, allergens }))
              }
            />

            <Select
              label={t('pages.products.badge')}
              name="badge"
              placeholder="Sin insignia"
              value={formData.badge}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, badge: e.target.value }))
              }
              error={state.errors?.badge}
              options={badges
                .filter((b) => b.is_active)
                .map((badge) => ({
                  value: badge.name,
                  label: badge.name,
                }))}
            />

            <Select
              label={t('pages.products.seal')}
              name="seal"
              placeholder="Sin sello"
              value={formData.seal}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, seal: e.target.value }))
              }
              error={state.errors?.seal}
              options={seals
                .filter((s) => s.is_active)
                .map((seal) => ({
                  value: seal.name,
                  label: seal.icon ? `${seal.icon} ${seal.name}` : seal.name,
                }))}
            />

            {formData.stock !== undefined && (
              <Input
                label="Stock (opcional)"
                name="stock"
                type="number"
                value={formData.stock || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    stock: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  }))
                }
                min={0}
              />
            )}

            {/* Canonical Model Fields - Collapsible Section */}
            <div className="border border-[var(--border-default)] rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center justify-between bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                onClick={() => setShowAdvancedFields(!showAdvancedFields)}
              >
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  Campos Avanzados (Nutricional, Coccion, Sensorial)
                </span>
                {showAdvancedFields ? (
                  <ChevronUp className="w-5 h-5 text-[var(--text-tertiary)]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[var(--text-tertiary)]" />
                )}
              </button>

              {showAdvancedFields && (
                <div className="p-4 space-y-4 bg-[var(--bg-secondary)]">
                  {/* Dietary Profile */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">
                      Perfil Dietetico
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { key: 'is_vegetarian', label: 'Vegetariano' },
                        { key: 'is_vegan', label: 'Vegano' },
                        { key: 'is_gluten_free', label: 'Sin Gluten' },
                        { key: 'is_dairy_free', label: 'Sin Lacteos' },
                        { key: 'is_celiac_safe', label: 'Apto Celiacos' },
                        { key: 'is_keto', label: 'Keto' },
                        { key: 'is_low_sodium', label: 'Bajo en Sodio' },
                      ].map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.dietary_profile[key as keyof typeof formData.dietary_profile]}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                dietary_profile: {
                                  ...prev.dietary_profile,
                                  [key]: e.target.checked,
                                },
                              }))
                            }
                            className="rounded border-[var(--border-emphasis)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-[var(--primary-500)]"
                          />
                          <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Ingredients */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">
                      Ingredientes
                    </label>
                    <Select
                      placeholder="Agregar ingrediente..."
                      value=""
                      onChange={(e) => {
                        const ingredientId = parseInt(e.target.value, 10)
                        if (!isNaN(ingredientId) && !formData.ingredients.some((i) => i.ingredient_id === ingredientId)) {
                          setFormData((prev) => ({
                            ...prev,
                            ingredients: [
                              ...prev.ingredients,
                              { ingredient_id: ingredientId, is_main: false },
                            ],
                          }))
                        }
                      }}
                      options={allIngredients
                        .filter((ing) => ing.is_active && !formData.ingredients.some((i) => i.ingredient_id === parseInt(ing.id, 10)))
                        .map((ing) => ({
                          value: ing.id,
                          label: ing.group_name ? `${ing.name} (${ing.group_name})` : ing.name,
                        }))}
                    />
                    {formData.ingredients.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.ingredients.map((item) => {
                          const ingredient = allIngredients.find((i) => parseInt(i.id, 10) === item.ingredient_id)
                          return (
                            <span
                              key={item.ingredient_id}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${item.is_main
                                ? 'bg-[var(--primary-500)]/20 text-[var(--primary-400)] border border-[var(--primary-500)]'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                                }`}
                            >
                              {ingredient?.name || `ID ${item.ingredient_id}`}
                              <button
                                type="button"
                                className="ml-1 hover:text-[var(--danger-text)]"
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    ingredients: prev.ingredients.filter(
                                      (i) => i.ingredient_id !== item.ingredient_id
                                    ),
                                  }))
                                }
                              >
                                ×
                              </button>
                              <button
                                type="button"
                                className="ml-1 text-xs hover:text-[var(--primary-400)]"
                                title={item.is_main ? 'Quitar como principal' : 'Marcar como principal'}
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    ingredients: prev.ingredients.map((i) =>
                                      i.ingredient_id === item.ingredient_id
                                        ? { ...i, is_main: !i.is_main }
                                        : i
                                    ),
                                  }))
                                }
                              >
                                {item.is_main ? '★' : '☆'}
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Cooking Methods */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">
                      Metodos de Coccion
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {cookingMethods.map((method) => (
                        <label
                          key={method.id}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${formData.cooking.methods.includes(method.name)
                            ? 'bg-[var(--primary-500)]/20 border-[var(--primary-500)] text-[var(--primary-400)]'
                            : 'bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-emphasis)]'
                            }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={formData.cooking.methods.includes(method.name)}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                cooking: {
                                  ...prev.cooking,
                                  methods: e.target.checked
                                    ? [...prev.cooking.methods, method.name]
                                    : prev.cooking.methods.filter((m) => m !== method.name),
                                },
                              }))
                            }}
                          />
                          <span className="text-sm">{method.name}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <Toggle
                        label="Usa aceite"
                        checked={formData.cooking.uses_oil}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            cooking: { ...prev.cooking, uses_oil: e.target.checked },
                          }))
                        }
                      />
                      <Input
                        label="Prep. (min)"
                        type="number"
                        min={0}
                        value={formData.cooking.prep_time_minutes ?? ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            cooking: {
                              ...prev.cooking,
                              prep_time_minutes: e.target.value ? parseInt(e.target.value, 10) : undefined,
                            },
                          }))
                        }
                        className="w-24"
                      />
                      <Input
                        label="Coccion (min)"
                        type="number"
                        min={0}
                        value={formData.cooking.cook_time_minutes ?? ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            cooking: {
                              ...prev.cooking,
                              cook_time_minutes: e.target.value ? parseInt(e.target.value, 10) : undefined,
                            },
                          }))
                        }
                        className="w-24"
                      />
                    </div>
                  </div>

                  {/* Sensory Profile - Flavors */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">
                      Perfil de Sabor
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {flavorProfiles.map((flavor) => (
                        <label
                          key={flavor.id}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${formData.sensory.flavors.includes(flavor.name)
                            ? 'bg-[var(--primary-500)]/20 border-[var(--primary-500)] text-[var(--primary-400)]'
                            : 'bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-emphasis)]'
                            }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={formData.sensory.flavors.includes(flavor.name)}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                sensory: {
                                  ...prev.sensory,
                                  flavors: e.target.checked
                                    ? [...prev.sensory.flavors, flavor.name]
                                    : prev.sensory.flavors.filter((f) => f !== flavor.name),
                                },
                              }))
                            }}
                          />
                          <span className="text-sm">{flavor.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Sensory Profile - Textures */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-2">
                      Perfil de Textura
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {textureProfiles.map((texture) => (
                        <label
                          key={texture.id}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${formData.sensory.textures.includes(texture.name)
                            ? 'bg-[var(--primary-500)]/20 border-[var(--primary-500)] text-[var(--primary-400)]'
                            : 'bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-emphasis)]'
                            }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={formData.sensory.textures.includes(texture.name)}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                sensory: {
                                  ...prev.sensory,
                                  textures: e.target.checked
                                    ? [...prev.sensory.textures, texture.name]
                                    : prev.sensory.textures.filter((t) => t !== texture.name),
                                },
                              }))
                            }}
                          />
                          <span className="text-sm">{texture.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-6">
              <Toggle
                label={t('pages.products.featured')}
                name="featured"
                checked={formData.featured}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, featured: e.target.checked }))
                }
              />

              <Toggle
                label={t('pages.products.popular')}
                name="popular"
                checked={formData.popular}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, popular: e.target.checked }))
                }
              />

              <Toggle
                label={t('common.active')}
                name="is_active"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                }
              />
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={handleDelete}
          title={t('pages.products.deleteProduct')}
          message={`${t('modals.confirmDelete')} "${selectedProduct?.name}"?`}
          confirmLabel={t('common.delete')}
        />
      </PageContainer>
    </>
  )
}

export default ProductsPage
