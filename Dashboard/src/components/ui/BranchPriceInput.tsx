import { useMemo, useCallback } from 'react'
import { useBranchStore, selectBranches } from '../../stores/branchStore'
import { Input } from './Input'
import { Button } from './Button'
import type { BranchPrice } from '../../types'
import type { BranchPriceErrors } from '../../utils/validation'

interface BranchPriceInputProps {
  label?: string
  defaultPrice: number
  branchPrices: BranchPrice[]
  useBranchPrices: boolean
  onDefaultPriceChange: (price: number) => void
  onBranchPricesChange: (prices: BranchPrice[]) => void
  onUseBranchPricesChange: (value: boolean) => void
  error?: string
  priceErrors?: BranchPriceErrors
}

export function BranchPriceInput({
  label,
  defaultPrice,
  branchPrices,
  useBranchPrices,
  onDefaultPriceChange,
  onBranchPricesChange,
  onUseBranchPricesChange,
  error,
  priceErrors = {},
}: BranchPriceInputProps) {
  const branches = useBranchStore(selectBranches)

  const activeBranches = useMemo(
    () => branches.filter((b) => b.is_active !== false),
    [branches]
  )

  // Build map for quick lookup
  const branchPriceMap = useMemo(
    () => new Map(branchPrices.map((bp) => [bp.branch_id, bp])),
    [branchPrices]
  )

  // Get price for a branch (fallback to default price)
  const getBranchPrice = useCallback(
    (branchId: string): BranchPrice => {
      return (
        branchPriceMap.get(branchId) || {
          branch_id: branchId,
          price: defaultPrice,
          is_active: true,
        }
      )
    },
    [branchPriceMap, defaultPrice]
  )

  // Handle toggle change
  const handleToggleChange = useCallback(() => {
    const newValue = !useBranchPrices
    onUseBranchPricesChange(newValue)

    if (newValue && branchPrices.length === 0) {
      // Initialize with all branches using default price
      const initialPrices = activeBranches.map((b) => ({
        branch_id: b.id,
        price: defaultPrice,
        is_active: true,
      }))
      onBranchPricesChange(initialPrices)
    }
  }, [
    useBranchPrices,
    branchPrices.length,
    activeBranches,
    defaultPrice,
    onUseBranchPricesChange,
    onBranchPricesChange,
  ])

  // Handle branch active change (checkbox)
  const handleBranchActiveChange = useCallback(
    (branchId: string, isActive: boolean) => {
      const existing = branchPriceMap.get(branchId)
      if (existing) {
        const updated = branchPrices.map((bp) =>
          bp.branch_id === branchId ? { ...bp, is_active: isActive } : bp
        )
        onBranchPricesChange(updated)
      } else {
        // Add new branch price
        onBranchPricesChange([
          ...branchPrices,
          { branch_id: branchId, price: defaultPrice, is_active: isActive },
        ])
      }
    },
    [branchPrices, branchPriceMap, defaultPrice, onBranchPricesChange]
  )

  // Handle branch price change
  const handleBranchPriceChange = useCallback(
    (branchId: string, price: number) => {
      const existing = branchPriceMap.get(branchId)
      if (existing) {
        const updated = branchPrices.map((bp) =>
          bp.branch_id === branchId ? { ...bp, price } : bp
        )
        onBranchPricesChange(updated)
      } else {
        // Add new branch price
        onBranchPricesChange([
          ...branchPrices,
          { branch_id: branchId, price, is_active: true },
        ])
      }
    },
    [branchPrices, branchPriceMap, onBranchPricesChange]
  )

  // Apply default price to all branches
  const applyDefaultToAll = useCallback(() => {
    const updated = activeBranches.map((b) => {
      const existing = branchPriceMap.get(b.id)
      return {
        branch_id: b.id,
        price: defaultPrice,
        is_active: existing?.is_active ?? true,
      }
    })
    onBranchPricesChange(updated)
  }, [activeBranches, branchPriceMap, defaultPrice, onBranchPricesChange])

  return (
    <div className="space-y-4">
      {/* Default price input */}
      <Input
        label={label || 'Precio'}
        type="number"
        value={defaultPrice}
        onChange={(e) => {
          const value = e.target.value.trim()
          const parsed = value === '' ? 0 : Number(value)
          onDefaultPriceChange(isNaN(parsed) ? 0 : Math.max(0, parsed))
        }}
        min={0}
        step={0.01}
        error={!useBranchPrices ? error : undefined}
      />

      {/* Toggle for per-branch pricing */}
      <label className="inline-flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            checked={useBranchPrices}
            onChange={handleToggleChange}
            className="sr-only peer"
          />
          <div
            className="
              w-11 h-6 rounded-full
              bg-[var(--bg-tertiary)] peer-checked:bg-[var(--primary-500)]
              transition-colors duration-200
              peer-focus:ring-2 peer-focus:ring-[var(--primary-500)] peer-focus:ring-offset-2 peer-focus:ring-offset-zinc-900
            "
          />
          <div
            className="
              absolute top-0.5 left-0.5
              w-5 h-5 rounded-full bg-white
              transition-transform duration-200
              peer-checked:translate-x-5
            "
          />
        </div>
        <span className="text-sm text-[var(--text-secondary)]">
          Precios diferentes por sucursal
        </span>
      </label>

      {/* Branch prices list (only when toggle is ON) */}
      {useBranchPrices && (
        <div className="space-y-3 pl-2 border-l-2 border-[var(--border-default)]">
          {/* Apply default to all button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={applyDefaultToAll}
            className="text-[var(--primary-500)] hover:text-[var(--primary-400)]"
          >
            Aplicar precio base a todas
          </Button>

          {/* Branch list */}
          <div className="space-y-2">
            {activeBranches.map((branch) => {
              const bp = getBranchPrice(branch.id)
              const hasError = priceErrors[branch.id]

              return (
                <div
                  key={branch.id}
                  className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)]/50 rounded-lg"
                >
                  {/* Checkbox for is_active */}
                  <input
                    type="checkbox"
                    checked={bp.is_active}
                    onChange={(e) =>
                      handleBranchActiveChange(branch.id, e.target.checked)
                    }
                    className="w-4 h-4 rounded border-[var(--border-emphasis)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-[var(--primary-500)] focus:ring-offset-zinc-900"
                    aria-label={`Vender en ${branch.name}`}
                  />

                  {/* Branch name */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm ${bp.is_active ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}
                    >
                      {branch.name}
                    </span>
                    {branch.address && (
                      <span className="text-xs text-[var(--text-muted)] ml-2 hidden sm:inline">
                        ({branch.address})
                      </span>
                    )}
                  </div>

                  {/* Price input */}
                  <div className="w-28">
                    <input
                      type="number"
                      value={bp.price}
                      onChange={(e) => {
                        const value = e.target.value.trim()
                        const parsed = value === '' ? 0 : Number(value)
                        handleBranchPriceChange(
                          branch.id,
                          isNaN(parsed) ? 0 : Math.max(0, parsed)
                        )
                      }}
                      disabled={!bp.is_active}
                      min={0}
                      step={0.01}
                      className={`
                        w-full px-3 py-1.5 text-sm rounded-lg
                        bg-[var(--bg-tertiary)] border transition-colors
                        ${hasError ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'}
                        ${bp.is_active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] opacity-50'}
                        focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]
                        disabled:cursor-not-allowed
                      `}
                      aria-label={`Precio en ${branch.name}`}
                    />
                    {hasError && (
                      <p className="text-xs text-[var(--danger-icon)] mt-1">{hasError}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* General error for branch prices */}
          {error && useBranchPrices && (
            <p className="text-sm text-[var(--danger-icon)]">{error}</p>
          )}

          {/* Help text */}
          <p className="text-xs text-[var(--text-muted)]">
            Desmarca una sucursal si el producto no se vende ahi.
          </p>
        </div>
      )}

      {activeBranches.length === 0 && useBranchPrices && (
        <p className="text-sm text-[var(--text-muted)]">No hay sucursales disponibles</p>
      )}
    </div>
  )
}
