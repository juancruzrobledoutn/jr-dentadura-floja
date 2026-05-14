/**
 * Advanced Filters Modal for pwaMenu (producto3.md improvement)
 *
 * Allows users to configure:
 * - Allergen exclusions with cross-reaction support
 * - Dietary preferences (vegan, vegetarian, gluten-free, etc.)
 * - Cooking method filters
 *
 * Persists to sessionStorage via the filter hooks.
 */

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { useAllergenFilter } from '../hooks/useAllergenFilter'
import {
  useDietaryFilter,
  DIETARY_LABELS,
  DIETARY_ICONS,
  type DietaryOption,
} from '../hooks/useDietaryFilter'
import {
  useCookingMethodFilter,
  COOKING_METHOD_LABELS,
  COOKING_METHOD_ICONS,
  type CookingMethod,
} from '../hooks/useCookingMethodFilter'
import type { AllergenStrictness, CrossReactionSensitivity } from '../hooks/useAllergenFilter'

interface AdvancedFiltersModalProps {
  isOpen: boolean
  onClose: () => void
  branchSlug?: string
  /** List of allergens available for filtering */
  allergens: Array<{ id: number; name: string; icon: string | null }>
}

export function AdvancedFiltersModal({
  isOpen,
  onClose,
  branchSlug,
  allergens,
}: AdvancedFiltersModalProps) {
  // LOW-01 FIX: Prefixed unused variable (reserved for future i18n support)
  const { t: _t } = useTranslation()

  // Allergen filter hook
  const {
    excludedAllergenIds,
    strictness,
    crossReactionsEnabled,
    crossReactionSensitivity,
    crossReactionWarnings,
    toggleAllergen,
    setStrictness,
    setCrossReactionSensitivity,
    toggleCrossReactions,
    clearExclusions,
    isAllergenExcluded,
    activeExclusionCount,
    hasCrossReactions,
  } = useAllergenFilter(branchSlug)

  // Dietary filter hook
  const {
    selectedOptions: selectedDietary,
    toggleOption: toggleDietary,
    clearSelections: clearDietary,
    activeFilterCount: dietaryCount,
  } = useDietaryFilter()

  // Cooking method filter hook
  const {
    filterState: cookingFilterState,
    toggleExcludedMethod: toggleMethod,
    clearFilters: clearMethods,
    activeFilterCount: cookingCount,
  } = useCookingMethodFilter()

  const excludedMethods = cookingFilterState.excludedMethods

  // Clear all filters
  const handleClearAll = useCallback(() => {
    clearExclusions()
    clearDietary()
    clearMethods()
  }, [clearExclusions, clearDietary, clearMethods])

  // Calculate total active filters
  const totalActiveFilters = useMemo(() => {
    return activeExclusionCount + dietaryCount + cookingCount
  }, [activeExclusionCount, dietaryCount, cookingCount])

  // Strictness options
  const strictnessOptions: Array<{ value: AllergenStrictness; label: string; description: string }> = [
    { value: 'strict', label: 'Estricto', description: 'Oculta productos que CONTIENEN el alergeno' },
    { value: 'very_strict', label: 'Muy estricto', description: 'Oculta tambien productos que pueden CONTENER TRAZAS' },
  ]

  // Cross-reaction sensitivity options
  const sensitivityOptions: Array<{ value: CrossReactionSensitivity; label: string; description: string }> = [
    { value: 'high_only', label: 'Solo alta', description: 'Considera solo reacciones de alta probabilidad' },
    { value: 'high_medium', label: 'Alta y media', description: 'Considera reacciones de alta y media probabilidad' },
    { value: 'all', label: 'Todas', description: 'Considera todas las reacciones cruzadas' },
  ]

  // Dietary options (use snake_case to match hook types)
  const dietaryOptions: DietaryOption[] = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'celiac_safe', 'keto', 'low_sodium']

  // Cooking method options
  const cookingOptions: CookingMethod[] = ['frito', 'horneado', 'grillado', 'vapor', 'crudo', 'hervido', 'salteado', 'braseado']

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      mobileAlign="bottom"
      className="w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto bg-zinc-900 rounded-t-2xl sm:rounded-2xl"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Filtros avanzados</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Active filters badge */}
        {totalActiveFilters > 0 && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <span className="text-sm text-orange-300">
              {totalActiveFilters} {totalActiveFilters === 1 ? 'filtro activo' : 'filtros activos'}
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-sm text-orange-400 hover:text-orange-300 underline"
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* Allergens Section */}
        <section className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Alergenos a evitar</h3>
          <div className="flex flex-wrap gap-2">
            {allergens.map((allergen) => {
              const isExcluded = isAllergenExcluded(allergen.id)
              return (
                <button
                  key={allergen.id}
                  type="button"
                  onClick={() => toggleAllergen(allergen.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${isExcluded
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                >
                  {allergen.icon && <span>{allergen.icon}</span>}
                  <span>{allergen.name}</span>
                  {isExcluded && <span className="ml-1">✓</span>}
                </button>
              )
            })}
          </div>

          {/* Strictness selector */}
          {excludedAllergenIds.length > 0 && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-zinc-500">Nivel de estrictez</label>
              <div className="flex gap-2">
                {strictnessOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStrictness(option.value)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${strictness === option.value
                        ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Cross-reactions toggle */}
              <div className="mt-3 p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-zinc-300">Reacciones cruzadas</span>
                    <p className="text-xs text-zinc-500">Ej: Latex puede reaccionar con platano, aguacate...</p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCrossReactions}
                    className={`relative w-11 h-6 rounded-full transition-colors ${crossReactionsEnabled ? 'bg-orange-500' : 'bg-zinc-600'
                      }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${crossReactionsEnabled ? 'translate-x-5' : ''
                        }`}
                    />
                  </button>
                </div>

                {/* Cross-reaction sensitivity */}
                {crossReactionsEnabled && (
                  <div className="mt-3 pt-3 border-t border-zinc-700">
                    <label className="block text-xs text-zinc-500 mb-2">Sensibilidad</label>
                    <div className="flex gap-1">
                      {sensitivityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setCrossReactionSensitivity(option.value)}
                          className={`flex-1 px-2 py-1 rounded text-xs transition-colors ${crossReactionSensitivity === option.value
                              ? 'bg-orange-500/20 text-orange-300'
                              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                            }`}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cross-reaction warnings */}
                {hasCrossReactions && crossReactionWarnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-700">
                    <span className="text-xs text-zinc-500">Reacciones detectadas:</span>
                    <ul className="mt-1 space-y-1">
                      {crossReactionWarnings.slice(0, 3).map((warning, idx) => (
                        <li key={idx} className="text-xs text-yellow-400">
                          {warning.allergenName} → {warning.crossReactsWith}{' '}
                          <span className="text-zinc-500">({warning.probability})</span>
                        </li>
                      ))}
                      {crossReactionWarnings.length > 3 && (
                        <li className="text-xs text-zinc-500">
                          +{crossReactionWarnings.length - 3} mas...
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Dietary Section */}
        <section className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Preferencias dieteticas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {dietaryOptions.map((option) => {
              const isSelected = selectedDietary.includes(option)
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleDietary(option)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${isSelected
                      ? 'bg-green-500/20 border-green-500 text-green-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                >
                  <span>{DIETARY_ICONS[option]}</span>
                  <span className="truncate">{DIETARY_LABELS[option]}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Cooking Methods Section */}
        <section className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Metodos de coccion a evitar</h3>
          <div className="flex flex-wrap gap-2">
            {cookingOptions.map((method) => {
              const isExcluded = excludedMethods.includes(method)
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => toggleMethod(method)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${isExcluded
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                >
                  <span>{COOKING_METHOD_ICONS[method]}</span>
                  <span>{COOKING_METHOD_LABELS[method]}</span>
                  {isExcluded && <span className="ml-1">✗</span>}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Los productos con estos metodos de coccion seran ocultados
          </p>
        </section>

        {/* Apply button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors"
        >
          Aplicar filtros
        </button>
      </div>
    </Modal>
  )
}

export default AdvancedFiltersModal
