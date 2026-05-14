import { useMemo, useCallback } from 'react'
import { useBranchStore, selectBranches } from '../../stores/branchStore'

interface BranchCheckboxesProps {
  label?: string
  value: string[]
  onChange: (branchIds: string[]) => void
  error?: string
}

export function BranchCheckboxes({
  label,
  value,
  onChange,
  error,
}: BranchCheckboxesProps) {
  const branches = useBranchStore(selectBranches)

  const activeBranches = useMemo(
    () => branches.filter((b) => b.is_active !== false),
    [branches]
  )

  const allSelected = useMemo(
    () =>
      activeBranches.length > 0 &&
      activeBranches.every((b) => value.includes(b.id)),
    [activeBranches, value]
  )

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(activeBranches.map((b) => b.id))
    }
  }, [allSelected, activeBranches, onChange])

  const handleToggle = useCallback(
    (branchId: string) => {
      if (value.includes(branchId)) {
        onChange(value.filter((id) => id !== branchId))
      } else {
        onChange([...value, branchId])
      }
    },
    [value, onChange]
  )

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}

      <div className="space-y-2">
        {/* Select all checkbox */}
        <label className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)]/50 rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            className="w-4 h-4 rounded border-[var(--border-emphasis)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-[var(--primary-500)] focus:ring-offset-zinc-900"
            aria-label="Seleccionar todas las sucursales"
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Seleccionar todas las sucursales
          </span>
        </label>

        {/* Individual branch checkboxes */}
        <div className="ml-4 space-y-1">
          {activeBranches.map((branch) => (
            <label
              key={branch.id}
              className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)]/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={value.includes(branch.id)}
                onChange={() => handleToggle(branch.id)}
                className="w-4 h-4 rounded border-[var(--border-emphasis)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-[var(--primary-500)] focus:ring-offset-zinc-900"
                aria-label={`Seleccionar ${branch.name}`}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-[var(--text-secondary)]">{branch.name}</span>
                {branch.address && (
                  <span className="text-xs text-[var(--text-muted)] ml-2">
                    ({branch.address})
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger-icon)] mt-1">{error}</p>}

      {activeBranches.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No hay sucursales disponibles
        </p>
      )}
    </div>
  )
}
