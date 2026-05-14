/**
 * Recipes Page - Technical Recipe Sheets (Fichas Técnicas)
 * Full CRUD for kitchen recipes that can be ingested to RAG chatbot.
 * Only accessible by KITCHEN, MANAGER, and ADMIN roles.
 */

import { useMemo, useCallback, useActionState, useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Pencil,
  Trash2,
  ChefHat,
  Clock,
  Users,
  Zap,
  X,
} from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormModal } from '../hooks/useFormModal'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { usePagination } from '../hooks/usePagination'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge as UIBadge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { Textarea } from '../components/ui/Textarea'
import {
  useRecipeStore,
  selectRecipes,
  selectRecipeLoading,
} from '../stores/recipeStore'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import { useCategoryStore, selectCategories } from '../stores/categoryStore'
import { useSubcategoryStore, selectSubcategories } from '../stores/subcategoryStore'
import {
  useIngredientStore,
  selectIngredients,
} from '../stores/ingredientStore'
import {
  useAllergenStore,
  selectAllergens,
} from '../stores/allergenStore'
import { useAuthStore, selectUserRoles, selectUserBranchIds } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { catalogsAPI, type CatalogCuisineType } from '../services/api'
import { validateRecipe } from '../utils/validation'
import { handleError } from '../utils/logger'
import {
  canCreateRecipe,
  canEditRecipe,
  canDeleteRecipe,
  isAdmin,
} from '../utils/permissions'
import type {
  Recipe,
  RecipeFormData,
  RecipeIngredient,
  RecipePreparationStep,
  TableColumn,
  RecipeDifficulty,
} from '../types'
import type { FormState } from '../types/form'

function getDifficultyOptions(t: (key: string) => string) {
  return [
    { value: 'EASY', label: t('pages.recipes.difficultyEasy') },
    { value: 'MEDIUM', label: t('pages.recipes.difficultyMedium') },
    { value: 'HARD', label: t('pages.recipes.difficultyHard') },
  ]
}

function getDifficultyLabels(t: (key: string) => string): Record<string, string> {
  return {
    EASY: t('pages.recipes.difficultyEasy'),
    MEDIUM: t('pages.recipes.difficultyMedium'),
    HARD: t('pages.recipes.difficultyHard'),
  }
}

const DIFFICULTY_COLORS: Record<string, 'success' | 'warning' | 'danger'> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'danger',
}

// Allergen icon fallback for legacy data (text icons → emoji)
const ALLERGEN_ICON_MAP: Record<string, string> = {
  // Legacy text icons from old seed data
  gluten: '🌾',
  shellfish: '🦐',
  egg: '🥚',
  fish: '🐟',
  peanut: '🥜',
  soy: '🫘',
  dairy: '🥛',
  treenut: '🌰',
  celery: '🥬',
  mustard: '🟡',
  sesame: '⚪',
  sulfites: '🧪',
  lupin: '🫛',
  mollusk: '🦪',
  latex: '🧤',
  avocado: '🥑',
  kiwi: '🥝',
  banana: '🍌',
  corn: '🌽',
  // Name-based fallbacks
  Gluten: '🌾',
  Crustaceos: '🦐',
  Huevo: '🥚',
  Pescado: '🐟',
  Cacahuete: '🥜',
  Soja: '🫘',
  Lacteos: '🥛',
  'Frutos de cascara': '🌰',
  Apio: '🥬',
  Mostaza: '🟡',
  Sesamo: '⚪',
  Sulfitos: '🧪',
  Altramuces: '🫛',
  Moluscos: '🦪',
  Latex: '🧤',
  Aguacate: '🥑',
  Kiwi: '🥝',
  Platano: '🍌',
  Maiz: '🌽',
}

// Helper to get allergen icon with fallback
function getAllergenIcon(allergen: { icon?: string | null; name: string }): string {
  // If icon is already an emoji (starts with non-ASCII), use it
  if (allergen.icon && /^[^\x00-\x7F]/.test(allergen.icon)) {
    return allergen.icon
  }
  // Try icon text mapping
  if (allergen.icon && ALLERGEN_ICON_MAP[allergen.icon]) {
    return ALLERGEN_ICON_MAP[allergen.icon]
  }
  // Try name mapping
  if (ALLERGEN_ICON_MAP[allergen.name]) {
    return ALLERGEN_ICON_MAP[allergen.name]
  }
  // Default fallback
  return '⚠️'
}

// Dietary tags from canonical model (ProductDietaryProfile)
function getDietaryTagOptions(t: (key: string) => string) {
  return [
    { value: 'Vegetariano', label: t('pages.recipes.dietaryVegetarian'), icon: '🥬' },
    { value: 'Vegano', label: t('pages.recipes.dietaryVegan'), icon: '🌱' },
    { value: 'Sin Gluten', label: t('pages.recipes.dietaryGlutenFree'), icon: '🌾' },
    { value: 'Sin Lácteos', label: t('pages.recipes.dietaryDairyFree'), icon: '🥛' },
    { value: 'Apto Celíaco', label: t('pages.recipes.dietaryCeliac'), icon: '✓' },
    { value: 'Keto', label: t('pages.recipes.dietaryKeto'), icon: '🥑' },
    { value: 'Bajo en Sodio', label: t('pages.recipes.dietaryLowSodium'), icon: '🧂' },
  ]
}

// Cooking methods from canonical model (Phase 3 - planteo.md)
function getCookingMethodOptions(t: (key: string) => string) {
  return [
    { value: 'horneado', label: t('pages.recipes.methodBaked'), icon: '🔥' },
    { value: 'frito', label: t('pages.recipes.methodFried'), icon: '🍳' },
    { value: 'grillado', label: t('pages.recipes.methodGrilled'), icon: '♨️' },
    { value: 'crudo', label: t('pages.recipes.methodRaw'), icon: '🥗' },
    { value: 'hervido', label: t('pages.recipes.methodBoiled'), icon: '🫕' },
    { value: 'vapor', label: t('pages.recipes.methodSteamed'), icon: '💨' },
    { value: 'salteado', label: t('pages.recipes.methodSauteed'), icon: '🥘' },
    { value: 'braseado', label: t('pages.recipes.methodBraised'), icon: '🍲' },
  ]
}

// Flavor profiles from canonical model (Phase 3 - planteo.md)
function getFlavorOptions(t: (key: string) => string) {
  return [
    { value: 'suave', label: t('pages.recipes.flavorMild'), icon: '😌' },
    { value: 'intenso', label: t('pages.recipes.flavorIntense'), icon: '💪' },
    { value: 'dulce', label: t('pages.recipes.flavorSweet'), icon: '🍯' },
    { value: 'salado', label: t('pages.recipes.flavorSalty'), icon: '🧂' },
    { value: 'acido', label: t('pages.recipes.flavorSour'), icon: '🍋' },
    { value: 'amargo', label: t('pages.recipes.flavorBitter'), icon: '☕' },
    { value: 'umami', label: t('pages.recipes.flavorUmami'), icon: '🍄' },
    { value: 'picante', label: t('pages.recipes.flavorSpicy'), icon: '🌶️' },
  ]
}

// Texture profiles from canonical model (Phase 3 - planteo.md)
function getTextureOptions(t: (key: string) => string) {
  return [
    { value: 'crocante', label: t('pages.recipes.textureCrunchy'), icon: '🥨' },
    { value: 'cremoso', label: t('pages.recipes.textureCreamy'), icon: '🍦' },
    { value: 'tierno', label: t('pages.recipes.textureTender'), icon: '🍖' },
    { value: 'firme', label: t('pages.recipes.textureFirm'), icon: '🥩' },
    { value: 'esponjoso', label: t('pages.recipes.textureFluffy'), icon: '🧁' },
    { value: 'gelatinoso', label: t('pages.recipes.textureGelatinous'), icon: '🍮' },
    { value: 'granulado', label: t('pages.recipes.textureGranular'), icon: '🍚' },
  ]
}

const initialFormData: RecipeFormData = {
  branch_id: '',
  category_id: '',
  subcategory_id: '',
  name: '',
  description: '',
  short_description: '',
  cuisine_type: '',
  difficulty: undefined,
  prep_time_minutes: undefined,
  cook_time_minutes: undefined,
  servings: 1,
  calories_per_serving: undefined,
  ingredients: [],
  preparation_steps: [],
  chef_notes: '',
  allergen_ids: [],  // M:N relationship - stores allergen IDs
  dietary_tags: [],
  storage_instructions: '',
  presentation_tips: '',
  // Sensory profile
  flavors: [],
  textures: [],
  // Cooking info
  cooking_methods: [],
  uses_oil: false,
  // Celiac safety
  is_celiac_safe: false,
  allergen_notes: '',
  // Modifications and warnings
  modifications: [],
  warnings: [],
  // Cost and yield
  cost_cents: undefined,
  suggested_price_cents: undefined,
  yield_quantity: '',
  yield_unit: '',
  portion_size: '',
  // RAG config
  risk_level: 'low',
  custom_rag_disclaimer: '',
  image: '',
  is_active: true,
}

export default function RecipesPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.recipes.title'))

  const recipes = useRecipeStore(selectRecipes)
  const isLoading = useRecipeStore(selectRecipeLoading)
  const fetchRecipes = useRecipeStore((s) => s.fetchRecipes)
  const createRecipeAsync = useRecipeStore((s) => s.createRecipeAsync)
  const updateRecipeAsync = useRecipeStore((s) => s.updateRecipeAsync)
  const deleteRecipeAsync = useRecipeStore((s) => s.deleteRecipeAsync)
  const ingestRecipeAsync = useRecipeStore((s) => s.ingestRecipeAsync)

  const allBranches = useBranchStore(selectBranches)
  const allCategories = useCategoryStore(selectCategories)
  const fetchCategories = useCategoryStore((s) => s.fetchCategories)
  const allSubcategories = useSubcategoryStore(selectSubcategories)
  const fetchSubcategories = useSubcategoryStore((s) => s.fetchSubcategories)

  // Ingredient store for combo box
  const allIngredients = useIngredientStore(selectIngredients)
  const fetchIngredients = useIngredientStore((s) => s.fetchIngredients)

  // Allergen store for multi-select
  const allAllergens = useAllergenStore(selectAllergens)
  const fetchAllergens = useAllergenStore((s) => s.fetchAllergens)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const userBranchIds = useAuthStore(selectUserBranchIds)
  const userIsAdmin = isAdmin(userRoles)
  const canCreate = canCreateRecipe(userRoles)
  const canEdit = canEditRecipe(userRoles)
  const canDelete = canDeleteRecipe(userRoles)

  // Filter branches based on user permissions
  const availableBranches = useMemo(() => {
    if (userIsAdmin) return allBranches.filter((b) => b.is_active)
    return allBranches.filter(
      (b) => b.is_active && userBranchIds.includes(Number(b.id))
    )
  }, [allBranches, userIsAdmin, userBranchIds])

  // Translated option lists (memoized to avoid recreation on every render)
  const DIFFICULTY_OPTIONS = useMemo(() => getDifficultyOptions(t), [t])
  const DIFFICULTY_LABELS = useMemo(() => getDifficultyLabels(t), [t])
  const DIETARY_TAG_OPTIONS = useMemo(() => getDietaryTagOptions(t), [t])
  const COOKING_METHOD_OPTIONS = useMemo(() => getCookingMethodOptions(t), [t])
  const FLAVOR_OPTIONS = useMemo(() => getFlavorOptions(t), [t])
  const TEXTURE_OPTIONS = useMemo(() => getTextureOptions(t), [t])

  // Modal and dialog state
  const modal = useFormModal<RecipeFormData, Recipe>(initialFormData)
  const deleteDialog = useConfirmDialog<Recipe>()

  // Branch filter
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')

  // Cuisine types from backend catalog
  const [cuisineTypes, setCuisineTypes] = useState<CatalogCuisineType[]>([])

  // Fetch recipes, categories, ingredients, allergens, and cuisine types on mount
  useEffect(() => {
    const branchId = selectedBranchId ? parseInt(selectedBranchId, 10) : undefined
    fetchRecipes(branchId)
    fetchCategories()
    fetchSubcategories()
    fetchIngredients()
    fetchAllergens()
    // Fetch cuisine types from catalog
    catalogsAPI.listCuisineTypes().then(setCuisineTypes).catch((error) => handleError(error, 'RecipesPage.fetchCuisineTypes'))
  }, [fetchRecipes, fetchCategories, fetchSubcategories, fetchIngredients, fetchAllergens, selectedBranchId])

  // Filter subcategories based on selected category
  const filteredSubcategories = useMemo(() => {
    if (!modal.formData.category_id) return []
    return allSubcategories.filter(
      (sub) => sub.category_id === modal.formData.category_id && sub.is_active
    )
  }, [allSubcategories, modal.formData.category_id])

  // Get active categories
  const activeCategories = useMemo(() => {
    return allCategories.filter((c) => c.is_active)
  }, [allCategories])

  // Get active ingredients for combo box
  const activeIngredients = useMemo(() => {
    return allIngredients.filter((ing) => ing.is_active)
  }, [allIngredients])

  // Get active allergens for multi-select
  const activeAllergens = useMemo(() => {
    return allAllergens.filter((alg) => alg.is_active)
  }, [allAllergens])

  // PATTERN FIX: Extract toggle handlers to useCallback to avoid recreating in map()
  const toggleDietaryTag = useCallback((value: string) => {
    modal.setFormData((prev) => {
      const currentTags = prev.dietary_tags || []
      const newTags = currentTags.includes(value)
        ? currentTags.filter((t) => t !== value)
        : [...currentTags, value]
      return { ...prev, dietary_tags: newTags }
    })
  }, [modal])

  const toggleCookingMethod = useCallback((value: string) => {
    modal.setFormData((prev) => {
      const currentMethods = prev.cooking_methods || []
      const newMethods = currentMethods.includes(value)
        ? currentMethods.filter((m) => m !== value)
        : [...currentMethods, value]
      return { ...prev, cooking_methods: newMethods }
    })
  }, [modal])

  const toggleFlavor = useCallback((value: string) => {
    modal.setFormData((prev) => {
      const currentFlavors = prev.flavors || []
      const newFlavors = currentFlavors.includes(value)
        ? currentFlavors.filter((f) => f !== value)
        : [...currentFlavors, value]
      return { ...prev, flavors: newFlavors }
    })
  }, [modal])

  const toggleTexture = useCallback((value: string) => {
    modal.setFormData((prev) => {
      const currentTextures = prev.textures || []
      const newTextures = currentTextures.includes(value)
        ? currentTextures.filter((t) => t !== value)
        : [...currentTextures, value]
      return { ...prev, textures: newTextures }
    })
  }, [modal])

  // Filter and sort recipes
  const filteredRecipes = useMemo(() => {
    let filtered = recipes
    if (selectedBranchId) {
      filtered = filtered.filter((r) => r.branch_id === selectedBranchId)
    }
    // Filter by user's branches if not admin
    if (!userIsAdmin) {
      filtered = filtered.filter((r) =>
        userBranchIds.includes(Number(r.branch_id))
      )
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }, [recipes, selectedBranchId, userIsAdmin, userBranchIds])

  const {
    paginatedItems: paginatedRecipes,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(filteredRecipes)

  // Form submission
  const submitAction = useCallback(
    async (
      _prevState: FormState<RecipeFormData>,
      formData: FormData
    ): Promise<FormState<RecipeFormData>> => {
      const data: RecipeFormData = {
        branch_id: formData.get('branch_id') as string,
        category_id: formData.get('category_id') as string,
        subcategory_id: formData.get('subcategory_id') as string,
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        short_description: formData.get('short_description') as string,
        cuisine_type: formData.get('cuisine_type') as string,
        difficulty: (formData.get('difficulty') as RecipeDifficulty) || undefined,
        prep_time_minutes:
          parseInt(formData.get('prep_time_minutes') as string, 10) ||
          undefined,
        cook_time_minutes:
          parseInt(formData.get('cook_time_minutes') as string, 10) ||
          undefined,
        servings: parseInt(formData.get('servings') as string, 10) || 1,
        calories_per_serving:
          parseInt(formData.get('calories_per_serving') as string, 10) ||
          undefined,
        ingredients: modal.formData.ingredients,
        preparation_steps: modal.formData.preparation_steps,
        chef_notes: formData.get('chef_notes') as string,
        allergen_ids: modal.formData.allergen_ids,  // M:N relationship - use IDs directly
        dietary_tags: modal.formData.dietary_tags || [],  // From checkbox selection
        storage_instructions: formData.get('storage_instructions') as string,
        presentation_tips: formData.get('presentation_tips') as string,
        // Sensory profile
        flavors: modal.formData.flavors,
        textures: modal.formData.textures,
        // Cooking info
        cooking_methods: modal.formData.cooking_methods,
        uses_oil: formData.get('uses_oil') === 'on',
        // Celiac safety
        is_celiac_safe: formData.get('is_celiac_safe') === 'on',
        allergen_notes: formData.get('allergen_notes') as string,
        // Modifications and warnings
        modifications: modal.formData.modifications,
        warnings: modal.formData.warnings,
        // Cost and yield
        cost_cents:
          parseInt(formData.get('cost_cents') as string, 10) ||
          undefined,
        suggested_price_cents:
          parseInt(formData.get('suggested_price_cents') as string, 10) ||
          undefined,
        yield_quantity: formData.get('yield_quantity') as string,
        yield_unit: formData.get('yield_unit') as string,
        portion_size: formData.get('portion_size') as string,
        // RAG config
        risk_level: (formData.get('risk_level') as 'low' | 'medium' | 'high') || 'low',
        custom_rag_disclaimer: formData.get('custom_rag_disclaimer') as string,
        image: formData.get('image') as string,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateRecipe(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          await updateRecipeAsync(modal.selectedItem.id, data)
          toast.success(t('pages.recipes.recipeUpdated'))
        } else {
          await createRecipeAsync(data)
          toast.success(t('pages.recipes.recipeCreated'))
        }
        return { isSuccess: true, message: 'Guardado correctamente' }
      } catch (error) {
        const message = handleError(error, 'RecipesPage.submitAction')
        toast.error(`${t('pages.recipes.saveError')}: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, modal.formData, updateRecipeAsync, createRecipeAsync]
  )

  const [state, formAction, isPending] = useActionState<
    FormState<RecipeFormData>,
    FormData
  >(submitAction, { isSuccess: false })

  // Track previous isPending to detect when submission completes
  const wasPendingRef = useRef(false)

  // Close modal when submission completes successfully
  // This detects the transition: isPending true -> false with isSuccess true
  useEffect(() => {
    if (wasPendingRef.current && !isPending && state.isSuccess && modal.isOpen) {
      modal.close()
    }
    wasPendingRef.current = isPending
  }, [isPending, state.isSuccess, modal.isOpen, modal])

  // Modal handlers
  const openCreateModal = useCallback(() => {
    const defaultBranchId =
      availableBranches.length === 1 ? availableBranches[0].id : ''
    modal.openCreate({ ...initialFormData, branch_id: defaultBranchId })
  }, [modal, availableBranches])

  const openEditModal = useCallback(
    (recipe: Recipe) => {
      modal.openEdit(recipe, {
        branch_id: recipe.branch_id,
        category_id: recipe.category_id || '',
        subcategory_id: recipe.subcategory_id || '',
        name: recipe.name,
        description: recipe.description || '',
        short_description: recipe.short_description || '',
        cuisine_type: recipe.cuisine_type || '',
        difficulty: recipe.difficulty,
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        servings: recipe.servings || 1,
        calories_per_serving: recipe.calories_per_serving,
        ingredients: recipe.ingredients || [],
        preparation_steps: recipe.preparation_steps || [],
        chef_notes: recipe.chef_notes || '',
        allergen_ids: recipe.allergen_ids || [],  // M:N relationship - use IDs
        dietary_tags: recipe.dietary_tags || [],
        storage_instructions: recipe.storage_instructions || '',
        presentation_tips: recipe.presentation_tips || '',
        // Sensory profile
        flavors: recipe.flavors || [],
        textures: recipe.textures || [],
        // Cooking info
        cooking_methods: recipe.cooking_methods || [],
        uses_oil: recipe.uses_oil || false,
        // Celiac safety
        is_celiac_safe: recipe.is_celiac_safe || false,
        allergen_notes: recipe.allergen_notes || '',
        // Modifications and warnings
        modifications: recipe.modifications || [],
        warnings: recipe.warnings || [],
        // Cost and yield
        cost_cents: recipe.cost_cents,
        suggested_price_cents: recipe.suggested_price_cents,
        yield_quantity: recipe.yield_quantity || '',
        yield_unit: recipe.yield_unit || '',
        portion_size: recipe.portion_size || '',
        // RAG config
        risk_level: recipe.risk_level || 'low',
        custom_rag_disclaimer: recipe.custom_rag_disclaimer || '',
        image: recipe.image || '',
        is_active: recipe.is_active,
      })
    },
    [modal]
  )

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return

    try {
      await deleteRecipeAsync(deleteDialog.item.id)
      toast.success(t('pages.recipes.recipeDeleted'))
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'RecipesPage.handleDelete')
      toast.error(`${t('pages.recipes.deleteError')}: ${message}`)
    }
  }, [deleteDialog, deleteRecipeAsync])

  // Ingest handler
  const handleIngest = useCallback(
    async (recipe: Recipe) => {
      try {
        const updatedRecipe = await ingestRecipeAsync(recipe.id)
        if (updatedRecipe.is_ingested) {
          toast.success(t('pages.recipes.ingestSuccess'))
        } else {
          toast.error(t('pages.recipes.ingestError'))
        }
      } catch (error) {
        const message = handleError(error, 'RecipesPage.handleIngest')
        toast.error(`${t('pages.recipes.ingestError')}: ${message}`)
      }
    },
    [ingestRecipeAsync]
  )

  // Ingredient management
  const addIngredient = useCallback(() => {
    modal.setFormData((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { ingredient_id: undefined, name: '', quantity: '', unit: '', notes: '' },
      ],
    }))
  }, [modal])

  const updateIngredientField = useCallback(
    (index: number, field: keyof RecipeIngredient, value: string | number | undefined) => {
      modal.setFormData((prev) => ({
        ...prev,
        ingredients: prev.ingredients.map((ing, i) =>
          i === index ? { ...ing, [field]: value } : ing
        ),
      }))
    },
    [modal]
  )

  // Handle ingredient selection from combo box
  const handleIngredientSelect = useCallback(
    (index: number, ingredientId: string) => {
      const selectedIngredient = activeIngredients.find(
        (ing) => ing.id === ingredientId
      )
      modal.setFormData((prev) => ({
        ...prev,
        ingredients: prev.ingredients.map((ing, i) =>
          i === index
            ? {
              ...ing,
              ingredient_id: ingredientId ? parseInt(ingredientId, 10) : undefined,
              name: selectedIngredient?.name || '',
            }
            : ing
        ),
      }))
    },
    [modal, activeIngredients]
  )

  const removeIngredient = useCallback(
    (index: number) => {
      modal.setFormData((prev) => ({
        ...prev,
        ingredients: prev.ingredients.filter((_, i) => i !== index),
      }))
    },
    [modal]
  )

  // Allergen toggle handler - adds/removes allergen ID from the list (M:N relationship)
  const toggleAllergen = useCallback(
    (allergenId: number) => {
      modal.setFormData((prev) => {
        const currentAllergenIds = prev.allergen_ids || []
        const isSelected = currentAllergenIds.includes(allergenId)
        return {
          ...prev,
          allergen_ids: isSelected
            ? currentAllergenIds.filter((id) => id !== allergenId)
            : [...currentAllergenIds, allergenId],
        }
      })
    },
    [modal]
  )

  // Preparation step management
  const addStep = useCallback(() => {
    modal.setFormData((prev) => ({
      ...prev,
      preparation_steps: [
        ...prev.preparation_steps,
        {
          step: prev.preparation_steps.length + 1,
          instruction: '',
          time_minutes: undefined,
        },
      ],
    }))
  }, [modal])

  const updateStep = useCallback(
    (
      index: number,
      field: keyof RecipePreparationStep,
      value: string | number | undefined
    ) => {
      modal.setFormData((prev) => ({
        ...prev,
        preparation_steps: prev.preparation_steps.map((step, i) =>
          i === index ? { ...step, [field]: value } : step
        ),
      }))
    },
    [modal]
  )

  const removeStep = useCallback(
    (index: number) => {
      modal.setFormData((prev) => ({
        ...prev,
        preparation_steps: prev.preparation_steps
          .filter((_, i) => i !== index)
          .map((step, i) => ({ ...step, step: i + 1 })),
      }))
    },
    [modal]
  )

  // Get branch name helper
  const getBranchName = useCallback(
    (branchId: string) => {
      const branch = allBranches.find((b) => b.id === branchId)
      return branch?.name || t('pages.recipes.unknownBranch')
    },
    [allBranches]
  )

  const columns: TableColumn<Recipe>[] = useMemo(
    () => [
      {
        key: 'name',
        label: t('pages.recipes.title'),
        sortable: true,
        render: (recipe) => (
          <div className="flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-[var(--primary-500)]" />
            <div>
              <span className="font-medium">{recipe.name}</span>
              {recipe.category_name && (
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  ({recipe.category_name}
                  {recipe.subcategory_name && ` / ${recipe.subcategory_name}`})
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'branch_id',
        label: t('pages.recipes.branchCol'),
        render: (recipe) => getBranchName(recipe.branch_id),
      },
      {
        key: 'servings',
        label: t('pages.recipes.servingsCol'),
        render: (recipe) => (
          <div className="flex items-center gap-1 text-sm">
            <Users className="w-3 h-3" />
            {recipe.servings || '-'}
          </div>
        ),
      },
      {
        key: 'time',
        label: t('pages.recipes.timeCol'),
        render: (recipe) => {
          const total =
            (recipe.prep_time_minutes || 0) +
            (recipe.cook_time_minutes || 0)
          return total > 0 ? (
            <div className="flex items-center gap-1 text-sm">
              <Clock className="w-3 h-3" />
              {total} min
            </div>
          ) : (
            <span className="text-[var(--text-muted)]">-</span>
          )
        },
      },
      {
        key: 'difficulty',
        label: t('pages.recipes.difficultyCol'),
        render: (recipe) =>
          recipe.difficulty ? (
            <UIBadge variant={DIFFICULTY_COLORS[recipe.difficulty]}>
              {DIFFICULTY_LABELS[recipe.difficulty]}
            </UIBadge>
          ) : (
            <span className="text-[var(--text-muted)]">-</span>
          ),
      },
      {
        key: 'is_ingested',
        label: t('pages.recipes.ragCol'),
        render: (recipe) => (
          <UIBadge variant={recipe.is_ingested ? 'success' : 'default'}>
            {recipe.is_ingested ? 'Ingresado' : 'Pendiente'}
          </UIBadge>
        ),
      },
      {
        key: 'is_active',
        label: t('pages.recipes.statusCol'),
        render: (recipe) => (
          <UIBadge variant={recipe.is_active ? 'success' : 'danger'}>
            {recipe.is_active ? 'Activo' : 'Inactivo'}
          </UIBadge>
        ),
      },
      {
        key: 'actions',
        label: '',
        render: (recipe) => (
          <div className="flex items-center justify-end gap-2">
            {!recipe.is_ingested && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleIngest(recipe)}
                aria-label={`Ingestar ${recipe.name} al chatbot`}
                title="Ingestar al chatbot RAG"
              >
                <Zap className="w-4 h-4 text-[var(--warning-icon)]" />
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEditModal(recipe)}
                aria-label={`Editar ${recipe.name}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteDialog.open(recipe)}
                aria-label={`Eliminar ${recipe.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [
      getBranchName,
      canEdit,
      canDelete,
      openEditModal,
      deleteDialog,
      handleIngest,
    ]
  )

  return (
    <>
      <title>Recetas - Dashboard</title>
      <meta
        name="description"
        content="Gestión de fichas técnicas de recetas"
      />

      <PageContainer
        title={t('pages.recipes.title')}
        actions={
          <div className="flex items-center gap-4">
            <Select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-48"
              placeholder="Todas las sucursales"
              options={availableBranches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
            />
            {canCreate && (
              <Button onClick={openCreateModal}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva Receta
              </Button>
            )}
          </div>
        }
      >
        <Card>
          <Table
            columns={columns}
            data={paginatedRecipes}
            emptyMessage={t('pages.recipes.noRecipes')}
            isLoading={isLoading}
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
          isOpen={modal.isOpen}
          onClose={modal.close}
          title={modal.selectedItem ? t('pages.recipes.editRecipe') : t('pages.recipes.newRecipe')}
          size="xl"
          footer={
            <>
              <Button variant="ghost" onClick={modal.close}>
                Cancelar
              </Button>
              <Button type="submit" form="recipe-form" isLoading={isPending}>
                {modal.selectedItem ? t('pages.recipes.saveChanges') : t('pages.recipes.createRecipe')}
              </Button>
            </>
          }
        >
          <form
            id="recipe-form"
            action={formAction}
            className="space-y-6 max-h-[70vh] overflow-y-auto pr-2"
          >
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('pages.recipes.branchCol')}
                name="branch_id"
                value={modal.formData.branch_id}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    branch_id: e.target.value,
                  }))
                }
                error={state.errors?.branch_id}
                required
                placeholder="Seleccionar sucursal..."
                options={availableBranches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
              />

              <Input
                label={t('common.name')}
                name="name"
                placeholder="Ej: Milanesa Napolitana"
                value={modal.formData.name}
                onChange={(e) =>
                  modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                error={state.errors?.name}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('pages.categories.title')}
                name="category_id"
                value={modal.formData.category_id || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    category_id: e.target.value,
                    subcategory_id: '', // Reset subcategory when category changes
                  }))
                }
                placeholder="Seleccionar categoría..."
                options={activeCategories.map((cat) => ({
                  value: cat.id,
                  label: cat.name,
                }))}
              />

              <Select
                label={t('pages.subcategories.title')}
                name="subcategory_id"
                value={modal.formData.subcategory_id || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    subcategory_id: e.target.value,
                  }))
                }
                placeholder={modal.formData.category_id ? 'Seleccionar subcategoría...' : 'Primero seleccione categoría'}
                disabled={!modal.formData.category_id}
                options={filteredSubcategories.map((sub) => ({
                  value: sub.id,
                  label: sub.name,
                }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Select
                label={t('pages.recipes.cuisineType')}
                name="cuisine_type"
                value={modal.formData.cuisine_type || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    cuisine_type: e.target.value,
                  }))
                }
                options={cuisineTypes.map((ct) => ({
                  value: ct.name,
                  label: `${ct.icon || ''} ${ct.name}`.trim(),
                }))}
              />
            </div>

            <Textarea
              label={t('common.description')}
              name="description"
              placeholder="Breve descripción del plato..."
              value={modal.formData.description || ''}
              onChange={(e) =>
                modal.setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              rows={2}
            />

            {/* Time, Servings, and Difficulty */}
            <div className="grid grid-cols-4 gap-4">
              <Input
                label={t('pages.recipes.servings')}
                name="servings"
                type="number"
                min={1}
                value={modal.formData.servings || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    servings: parseInt(e.target.value, 10) || 1,
                  }))
                }
                error={state.errors?.servings}
              />

              <Input
                label={t('pages.recipes.prepTime')}
                name="prep_time_minutes"
                type="number"
                min={0}
                value={modal.formData.prep_time_minutes || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    prep_time_minutes:
                      parseInt(e.target.value, 10) || undefined,
                  }))
                }
              />

              <Input
                label={t('pages.recipes.cookTime')}
                name="cook_time_minutes"
                type="number"
                min={0}
                value={modal.formData.cook_time_minutes || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    cook_time_minutes:
                      parseInt(e.target.value, 10) || undefined,
                  }))
                }
              />

              <Select
                label={t('pages.recipes.difficulty')}
                name="difficulty"
                value={modal.formData.difficulty || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    difficulty:
                      (e.target.value as RecipeDifficulty) || undefined,
                  }))
                }
                placeholder={t('pages.recipes.select')}
                options={DIFFICULTY_OPTIONS}
              />
            </div>

            {/* Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  {t('pages.recipes.ingredients')}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addIngredient}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar
                </Button>
              </div>
              {state.errors?.ingredients && (
                <p className="text-sm text-[var(--danger-icon)] mb-2">
                  {state.errors.ingredients}
                </p>
              )}
              <div className="space-y-2">
                {modal.formData.ingredients.map((ing, idx) => {
                  // For manual ingredients (no ingredient_id), use special value
                  const isManualIngredient = !ing.ingredient_id && ing.name

                  // Build options: catalog ingredients + current manual entry if applicable
                  const selectOptions = [
                    // Add current manual name as special option if it's a manual ingredient
                    ...(isManualIngredient
                      ? [{ value: `manual:${ing.name}`, label: `${ing.name} (manual)` }]
                      : []),
                    // Catalog ingredients
                    ...activeIngredients.map((ingredient) => ({
                      value: String(ingredient.id),
                      label: ingredient.group_name
                        ? `${ingredient.name} (${ingredient.group_name})`
                        : ingredient.name,
                    })),
                  ]

                  // Determine current value for Select
                  const selectValue = ing.ingredient_id
                    ? String(ing.ingredient_id)
                    : (isManualIngredient ? `manual:${ing.name}` : '')

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-[var(--bg-tertiary)] rounded"
                    >
                      <Select
                        placeholder="Seleccionar ingrediente..."
                        value={selectValue}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val.startsWith('manual:')) {
                            // Keep manual name (user re-selected the manual option)
                            const manualName = val.replace('manual:', '')
                            modal.setFormData((prev) => ({
                              ...prev,
                              ingredients: prev.ingredients.map((item, i) =>
                                i === idx ? { ...item, ingredient_id: undefined, name: manualName } : item
                              ),
                            }))
                          } else {
                            handleIngredientSelect(idx, val)
                          }
                        }}
                        className="flex-1"
                        options={selectOptions}
                      />
                      <Input
                        placeholder="Cantidad"
                        value={ing.quantity}
                        onChange={(e) =>
                          updateIngredientField(idx, 'quantity', e.target.value)
                        }
                        className="w-24"
                      />
                      <Input
                        placeholder="Unidad"
                        value={ing.unit}
                        onChange={(e) =>
                          updateIngredientField(idx, 'unit', e.target.value)
                        }
                        className="w-24"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeIngredient(idx)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )
                })}
                {modal.formData.ingredients.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] text-center py-4">
                    No hay ingredientes agregados
                  </p>
                )}
              </div>
            </div>

            {/* Preparation Steps */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  Pasos de Preparación
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addStep}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar Paso
                </Button>
              </div>
              {state.errors?.preparation_steps && (
                <p className="text-sm text-[var(--danger-icon)] mb-2">
                  {state.errors.preparation_steps}
                </p>
              )}
              <div className="space-y-2">
                {modal.formData.preparation_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 bg-[var(--bg-tertiary)] rounded"
                  >
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-[var(--primary-500)]/20 text-[var(--primary-500)] rounded-full text-sm font-bold">
                      {step.step}
                    </span>
                    <Textarea
                      placeholder="Instrucción del paso..."
                      value={step.instruction}
                      onChange={(e) =>
                        updateStep(idx, 'instruction', e.target.value)
                      }
                      className="flex-1"
                      rows={2}
                    />
                    <Input
                      placeholder="Min"
                      type="number"
                      min={0}
                      value={step.time_minutes || ''}
                      onChange={(e) =>
                        updateStep(
                          idx,
                          'time_minutes',
                          parseInt(e.target.value, 10) || undefined
                        )
                      }
                      className="w-16"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStep(idx)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {modal.formData.preparation_steps.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] text-center py-4">
                    No hay pasos de preparación agregados
                  </p>
                )}
              </div>
            </div>

            {/* Chef Notes */}
            <Textarea
              label={t('pages.recipes.chefNotes')}
              name="chef_notes"
              placeholder="Consejos, trucos o información adicional..."
              value={modal.formData.chef_notes || ''}
              onChange={(e) =>
                modal.setFormData((prev) => ({
                  ...prev,
                  chef_notes: e.target.value,
                }))
              }
              rows={2}
            />

            {/* Allergens - Multi-select with checkboxes (M:N relationship via allergen_ids) */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Alérgenos
              </label>
              {/* Hidden input for form submission */}
              <input
                type="hidden"
                name="allergen_ids"
                value={modal.formData.allergen_ids?.join(',') || ''}
              />
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {activeAllergens.map((allergen) => {
                  const allergenId = parseInt(allergen.id, 10)
                  const isSelected = (modal.formData.allergen_ids || []).includes(allergenId)
                  return (
                    <button
                      key={allergen.id}
                      type="button"
                      onClick={() => toggleAllergen(allergenId)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isSelected
                        ? 'bg-[var(--primary-500)]/20 border-[var(--primary-500)] text-orange-300'
                        : 'bg-[var(--bg-tertiary)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-emphasis)] hover:text-[var(--text-secondary)]'
                        }`}
                    >
                      <span className="text-lg">{getAllergenIcon(allergen)}</span>
                      <span className="text-sm truncate">{allergen.name}</span>
                      {isSelected && (
                        <span className="ml-auto text-[var(--primary-400)]">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {activeAllergens.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">
                  No hay alérgenos disponibles
                </p>
              )}
              {(modal.formData.allergen_ids?.length || 0) > 0 && (
                <div className="text-xs text-[var(--text-muted)] mt-2">
                  <span>{t('pages.recipes.selectedAllergens')}</span>
                  {modal.formData.allergen_ids
                    ?.map((id) => {
                      const allergen = activeAllergens.find((a) => parseInt(a.id, 10) === id)
                      if (!allergen) return null
                      return (
                        <span key={id} className="inline-flex items-center mr-2">
                          <span className="mr-0.5">{getAllergenIcon(allergen)}</span>
                          {allergen.name}
                        </span>
                      )
                    })
                    .filter(Boolean)}
                </div>
              )}
            </div>

            {/* Dietary Tags - Checkboxes from canonical model */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                {t('pages.recipes.dietaryTags')}
              </label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAG_OPTIONS.map((option) => {
                  const isSelected = modal.formData.dietary_tags?.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleDietaryTag(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isSelected
                        ? 'bg-[var(--primary-500)] text-[var(--text-primary)]'
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        }`}
                    >
                      <span className="mr-1">{option.icon}</span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cooking Methods - Phase 3 planteo.md */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                {t('pages.recipes.cookingMethods')}
              </label>
              <div className="flex flex-wrap gap-2">
                {COOKING_METHOD_OPTIONS.map((option) => {
                  const isSelected = modal.formData.cooking_methods?.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleCookingMethod(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isSelected
                        ? 'bg-[var(--primary-500)] text-[var(--text-primary)]'
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        }`}
                    >
                      <span className="mr-1">{option.icon}</span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
              {/* Uses Oil checkbox */}
              <div className="mt-3">
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modal.formData.uses_oil || false}
                    onChange={(e) =>
                      modal.setFormData((prev) => ({
                        ...prev,
                        uses_oil: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-[var(--primary-500)] focus:ring-[var(--primary-500)] focus:ring-offset-neutral-800"
                  />
                  <span>🛢️ {t('pages.recipes.usesOil')}</span>
                </label>
              </div>
            </div>

            {/* Sensory Profile - Flavors - Phase 3 planteo.md */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                {t('pages.recipes.flavorProfile')}
              </label>
              <div className="flex flex-wrap gap-2">
                {FLAVOR_OPTIONS.map((option) => {
                  const isSelected = modal.formData.flavors?.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleFlavor(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isSelected
                        ? 'bg-amber-500 text-[var(--text-primary)]'
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        }`}
                    >
                      <span className="mr-1">{option.icon}</span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sensory Profile - Textures - Phase 3 planteo.md */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                {t('pages.recipes.textureProfile')}
              </label>
              <div className="flex flex-wrap gap-2">
                {TEXTURE_OPTIONS.map((option) => {
                  const isSelected = modal.formData.textures?.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleTexture(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isSelected
                        ? 'bg-teal-500 text-[var(--text-primary)]'
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        }`}
                    >
                      <span className="mr-1">{option.icon}</span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Storage and Plating */}
            <div className="grid grid-cols-2 gap-4">
              <Textarea
                label={t('pages.recipes.storageInstructions')}
                name="storage_instructions"
                placeholder="Cómo conservar el plato..."
                value={modal.formData.storage_instructions || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    storage_instructions: e.target.value,
                  }))
                }
                rows={2}
              />

              <Textarea
                label={t('pages.recipes.presentationTips')}
                name="presentation_tips"
                placeholder="Cómo presentar el plato..."
                value={modal.formData.presentation_tips || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    presentation_tips: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>

            {/* Cost and Media */}
            <div className="grid grid-cols-3 gap-4">
              <Input
                label={t('pages.recipes.costCents')}
                name="cost_cents"
                type="number"
                min={0}
                value={modal.formData.cost_cents || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    cost_cents:
                      parseInt(e.target.value, 10) || undefined,
                  }))
                }
              />

              <Input
                label={t('pages.recipes.caloriesPerServing')}
                name="calories_per_serving"
                type="number"
                min={0}
                value={modal.formData.calories_per_serving || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    calories_per_serving:
                      parseInt(e.target.value, 10) || undefined,
                  }))
                }
              />

              <Input
                label={t('pages.recipes.imageUrl')}
                name="image"
                placeholder="https://..."
                value={modal.formData.image || ''}
                onChange={(e) =>
                  modal.setFormData((prev) => ({
                    ...prev,
                    image: e.target.value,
                  }))
                }
              />
            </div>

            <Toggle
              label={t('pages.recipes.activeToggle')}
              name="is_active"
              checked={modal.formData.is_active}
              onChange={(e) =>
                modal.setFormData((prev) => ({
                  ...prev,
                  is_active: e.target.checked,
                }))
              }
            />
          </form>
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={deleteDialog.isOpen}
          onClose={deleteDialog.close}
          onConfirm={handleDelete}
          title={t('pages.recipes.deleteConfirmTitle')}
          message={t('pages.recipes.deleteConfirmMessage', { name: deleteDialog.item?.name })}
          confirmLabel={t('common.delete')}
        />
      </PageContainer>
    </>
  )
}
