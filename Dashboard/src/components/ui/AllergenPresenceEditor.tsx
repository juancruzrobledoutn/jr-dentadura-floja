/**
 * AllergenPresenceEditor - Phase 0 Canonical Product Model
 *
 * Allows selecting allergens with presence type:
 * - contains: Product definitively contains this allergen
 * - may_contain: Product may contain traces of this allergen
 * - free_from: Product is guaranteed free from this allergen
 */
import { useMemo, useCallback } from 'react'
import { X, AlertTriangle, Check, HelpCircle } from 'lucide-react'
import { useAllergenStore, selectAllergens } from '../../stores/allergenStore'
import type { AllergenPresenceInput, AllergenPresenceType } from '../../types'

interface AllergenPresenceEditorProps {
  label?: string
  value: AllergenPresenceInput[]
  onChange: (allergens: AllergenPresenceInput[]) => void
  error?: string
}

const PRESENCE_TYPES: {
  value: AllergenPresenceType
  label: string
  description: string
  color: string
  icon: typeof AlertTriangle
}[] = [
  {
    value: 'contains',
    label: 'Contiene',
    description: 'Definitivamente contiene este alergeno',
    color: 'bg-[var(--danger-border)]/20 text-[var(--danger-text)] border-[var(--danger-border)]/30',
    icon: AlertTriangle,
  },
  {
    value: 'may_contain',
    label: 'Puede contener',
    description: 'Posibles trazas de este alergeno',
    color: 'bg-[var(--warning-border)]/20 text-[var(--warning-text)] border-yellow-500/30',
    icon: HelpCircle,
  },
  {
    value: 'free_from',
    label: 'Libre de',
    description: 'Garantizado libre de este alergeno',
    color: 'bg-[var(--success-border)]/20 text-[var(--success-text)] border-[var(--success-border)]/30',
    icon: Check,
  },
]

export function AllergenPresenceEditor({
  label,
  value,
  onChange,
  error,
}: AllergenPresenceEditorProps) {
  const allergens = useAllergenStore(selectAllergens)

  const activeAllergens = useMemo(
    () => allergens.filter((a) => a.is_active !== false),
    [allergens]
  )

  // Allergens that are already selected
  const selectedAllergenIds = useMemo(
    () => new Set(value.map((p) => p.allergen_id)),
    [value]
  )

  // Allergens available to add
  const availableAllergens = useMemo(
    () => activeAllergens.filter((a) => !selectedAllergenIds.has(Number(a.id))),
    [activeAllergens, selectedAllergenIds]
  )

  const handleAdd = useCallback(
    (allergenId: string, presenceType: AllergenPresenceType = 'contains') => {
      const numericId = Number(allergenId)
      if (!selectedAllergenIds.has(numericId)) {
        onChange([...value, { allergen_id: numericId, presence_type: presenceType }])
      }
    },
    [value, onChange, selectedAllergenIds]
  )

  const handleRemove = useCallback(
    (allergenId: number) => {
      onChange(value.filter((p) => p.allergen_id !== allergenId))
    },
    [value, onChange]
  )

  const handlePresenceTypeChange = useCallback(
    (allergenId: number, presenceType: AllergenPresenceType) => {
      onChange(
        value.map((p) =>
          p.allergen_id === allergenId ? { ...p, presence_type: presenceType } : p
        )
      )
    },
    [value, onChange]
  )

  // Get allergen details by ID
  const getAllergen = useCallback(
    (id: number) => allergens.find((a) => Number(a.id) === id),
    [allergens]
  )

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      )}

      {/* Selected allergens with presence type */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((presence) => {
            const allergen = getAllergen(presence.allergen_id)
            if (!allergen) return null

            const typeConfig = PRESENCE_TYPES.find(
              (t) => t.value === presence.presence_type
            )

            return (
              <div
                key={presence.allergen_id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${typeConfig?.color || 'bg-[var(--bg-tertiary)] border-[var(--border-default)]'}`}
              >
                {/* Allergen info */}
                <span className="text-lg" aria-hidden="true">
                  {allergen.icon}
                </span>
                <span className="flex-1 text-sm font-medium">{allergen.name}</span>

                {/* Presence type selector */}
                <select
                  value={presence.presence_type}
                  onChange={(e) =>
                    handlePresenceTypeChange(
                      presence.allergen_id,
                      e.target.value as AllergenPresenceType
                    )
                  }
                  className="px-2 py-1 text-xs bg-[var(--bg-secondary)]/50 border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-500)]"
                  aria-label={`Tipo de presencia para ${allergen.name}`}
                >
                  {PRESENCE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(presence.allergen_id)}
                  className="p-1 hover:bg-[var(--bg-tertiary)]/50 rounded transition-colors"
                  aria-label={`Quitar ${allergen.name}`}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Dropdown to add allergens */}
      <div className="flex gap-2">
        <select
          className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] focus:border-transparent"
          value=""
          onChange={(e) => {
            if (e.target.value) {
              handleAdd(e.target.value)
            }
          }}
          aria-label={label || 'Agregar alergeno'}
        >
          <option value="">
            {availableAllergens.length > 0
              ? 'Agregar alergeno...'
              : 'No hay mas alergenos disponibles'}
          </option>
          {availableAllergens.map((allergen) => (
            <option key={allergen.id} value={allergen.id}>
              {allergen.icon} {allergen.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-[var(--danger-icon)]">{error}</p>}

      {value.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No hay alergenos configurados</p>
      )}

      {/* Legend */}
      <div className="pt-2 border-t border-[var(--border-default)]">
        <p className="text-xs text-[var(--text-muted)] mb-2">Tipos de presencia:</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {PRESENCE_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <span
                key={type.value}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${type.color}`}
                title={type.description}
              >
                <Icon className="w-3 h-3" />
                {type.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Helper to convert legacy allergen_ids to new AllergenPresenceInput format
 */
export function convertLegacyAllergenIds(
  allergenIds: string[] | number[] | undefined
): AllergenPresenceInput[] {
  if (!allergenIds || allergenIds.length === 0) return []
  return allergenIds.map((id) => ({
    allergen_id: typeof id === 'string' ? Number(id) : id,
    presence_type: 'contains' as AllergenPresenceType,
  }))
}

/**
 * Helper to extract legacy allergen_ids from new format (only "contains" type)
 */
export function extractLegacyAllergenIds(
  allergens: AllergenPresenceInput[] | undefined
): string[] {
  if (!allergens || allergens.length === 0) return []
  return allergens
    .filter((a) => a.presence_type === 'contains')
    .map((a) => String(a.allergen_id))
}
