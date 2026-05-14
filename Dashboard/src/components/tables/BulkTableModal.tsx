/**
 * BulkTableModal - Modal for creating multiple tables at once
 * Dynamic rows: each row has sector, table count, and capacity
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useSectorStore } from '../../stores/sectorStore'
import { useTableStore } from '../../stores/tableStore'
import { AddSectorDialog } from './AddSectorDialog'
import type { TableBulkItem } from '../../services/api'

interface BulkTableModalProps {
  isOpen: boolean
  onClose: () => void
  branchId: number
  branchName: string
  onSuccess: () => void
}

// Row configuration for each table group
interface TableRow {
  id: string
  sectorId: number | null
  tableCount: number
  capacity: number
}

// Generate unique ID for rows
const generateRowId = () => crypto.randomUUID()

export function BulkTableModal({
  isOpen,
  onClose,
  branchId,
  branchName,
  onSuccess,
}: BulkTableModalProps) {
  const sectors = useSectorStore((s) => s.sectors)
  const fetchSectors = useSectorStore((s) => s.fetchSectors)
  const sectorsLoading = useSectorStore((s) => s.isLoading)
  const createTablesBatch = useTableStore((s) => s.createTablesBatch)
  const tablesLoading = useTableStore((s) => s.isLoading)

  const [rows, setRows] = useState<TableRow[]>([])
  const [showAddSector, setShowAddSector] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch sectors when modal opens
  useEffect(() => {
    if (isOpen && branchId) {
      fetchSectors(branchId)
      // Initialize with one empty row
      setRows([{ id: generateRowId(), sectorId: null, tableCount: 1, capacity: 4 }])
      setError(null)
    }
  }, [isOpen, branchId, fetchSectors])

  // Add new row
  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { id: generateRowId(), sectorId: null, tableCount: 1, capacity: 4 },
    ])
  }, [])

  // Remove row
  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId))
  }, [])

  // Update row field
  const updateRow = useCallback(
    (rowId: string, field: keyof TableRow, value: number | null) => {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
      )
    },
    []
  )

  // Calculate preview and totals
  const preview = useMemo(() => {
    const validRows = rows.filter(
      (r) => r.sectorId !== null && r.tableCount > 0 && r.capacity > 0
    )

    const grouped = new Map<number, { sector: typeof sectors[0]; items: TableRow[] }>()

    validRows.forEach((row) => {
      const sector = sectors.find((s) => s.numericId === row.sectorId)
      if (!sector) return

      if (!grouped.has(row.sectorId!)) {
        grouped.set(row.sectorId!, { sector, items: [] })
      }
      grouped.get(row.sectorId!)!.items.push(row)
    })

    const totalTables = validRows.reduce((sum, r) => sum + r.tableCount, 0)

    return { grouped, totalTables, validRows }
  }, [rows, sectors])

  // Handle submit
  const handleSubmit = async () => {
    if (preview.totalTables === 0) {
      setError('Debe configurar al menos una fila con sector, cantidad y capacidad')
      return
    }

    if (preview.totalTables > 200) {
      setError('No se pueden crear mas de 200 mesas a la vez')
      return
    }

    // Check all rows have sectors selected
    const invalidRows = rows.filter(
      (r) => r.sectorId === null && (r.tableCount > 0 || r.capacity > 0)
    )
    if (invalidRows.length > 0) {
      setError('Todas las filas deben tener un sector seleccionado')
      return
    }

    setError(null)

    // Build bulk create request
    const tables: TableBulkItem[] = preview.validRows.map((row) => ({
      sector_id: row.sectorId!,
      capacity: row.capacity,
      count: row.tableCount,
    }))

    try {
      await createTablesBatch({
        branch_id: branchId,
        tables,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear mesas')
    }
  }

  // Handle new sector created
  const handleSectorCreated = () => {
    setShowAddSector(false)
    fetchSectors(branchId)
  }

  const isLoading = sectorsLoading || tablesLoading

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Creacion Masiva de Mesas"
        size="xl"
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-sm text-[var(--text-tertiary)]">
              Total: <span className="font-semibold text-[var(--text-primary)]">{preview.totalTables}</span> mesas
            </span>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || preview.totalTables === 0}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creando...
                  </>
                ) : (
                  `Crear ${preview.totalTables} Mesas`
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Branch info */}
          <div className="text-sm text-[var(--text-tertiary)]">
            Sucursal: <span className="text-[var(--text-primary)] font-medium">{branchName}</span>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-[var(--danger-border)]/10 border border-[var(--danger-border)]/30 rounded-lg text-[var(--danger-text)] text-sm">
              {error}
            </div>
          )}

          {/* Header with add sector button */}
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Configuracion de Mesas</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddSector(true)}
              className="text-[var(--primary-500)] hover:text-[var(--primary-400)]"
            >
              <Plus className="w-4 h-4 mr-1" />
              Nuevo Sector
            </Button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-3 text-xs text-[var(--text-muted)] font-medium px-1">
            <div className="col-span-5">Sector</div>
            <div className="col-span-3">Cantidad Mesas</div>
            <div className="col-span-3">Comensales</div>
            <div className="col-span-1"></div>
          </div>

          {/* Dynamic rows */}
          {sectorsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-500)]" />
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {/* LOW-01 FIX: Removed unused index parameter */}
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-3 items-center p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--bg-tertiary)]"
                >
                  {/* Sector select */}
                  <div className="col-span-5">
                    <select
                      value={row.sectorId ?? ''}
                      onChange={(e) =>
                        updateRow(row.id, 'sectorId', e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full px-3 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] focus:border-[var(--primary-500)] focus:ring-0"
                    >
                      <option value="">Seleccionar sector...</option>
                      {sectors.map((sector) => (
                        <option key={sector.numericId} value={sector.numericId}>
                          {sector.name} ({sector.prefix})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Table count */}
                  <div className="col-span-3">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={row.tableCount}
                      onChange={(e) =>
                        updateRow(row.id, 'tableCount', Math.max(1, Number(e.target.value)))
                      }
                      className="w-full px-3 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] focus:border-[var(--primary-500)] focus:ring-0"
                    />
                  </div>

                  {/* Capacity */}
                  <div className="col-span-3">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={row.capacity}
                      onChange={(e) =>
                        updateRow(row.id, 'capacity', Math.max(1, Number(e.target.value)))
                      }
                      className="w-full px-3 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] focus:border-[var(--primary-500)] focus:ring-0"
                    />
                  </div>

                  {/* Remove button */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="p-1.5 rounded hover:bg-[var(--danger-border)]/20 text-[var(--text-muted)] hover:text-[var(--danger-text)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Eliminar fila"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add row button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={addRow}
            className="w-full border border-dashed border-[var(--bg-tertiary)] hover:border-[var(--primary-500)] text-[var(--text-tertiary)] hover:text-[var(--primary-500)]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar otra configuracion
          </Button>

          {/* Preview */}
          {preview.totalTables > 0 && (
            <div className="border-t border-[var(--bg-tertiary)] pt-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Vista Previa</h3>
              <div className="space-y-2 text-sm">
                {Array.from(preview.grouped.entries()).map(([sectorId, { sector, items }]) => {
                  // Calculate running total for this sector to show correct ranges
                  let runningTotal = 0
                  return (
                    <div key={sectorId} className="space-y-1">
                      <div className="font-medium text-[var(--text-primary)]">
                        {sector.name} ({sector.prefix})
                      </div>
                      {items.map((item, idx) => {
                        const startNum = runningTotal + 1
                        const endNum = runningTotal + item.tableCount
                        runningTotal = endNum
                        return (
                          <div key={idx} className="flex justify-between text-[var(--text-tertiary)] pl-4">
                            <span>
                              {item.tableCount} mesa{item.tableCount > 1 ? 's' : ''} para {item.capacity} comensales
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {sector.prefix}-{String(startNum).padStart(2, '0')}
                              {item.tableCount > 1 && ` a ${sector.prefix}-${String(endNum).padStart(2, '0')}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Add sector dialog */}
      <AddSectorDialog
        isOpen={showAddSector}
        onClose={() => setShowAddSector(false)}
        branchId={branchId}
        onSuccess={handleSectorCreated}
      />
    </>
  )
}
