/**
 * WaiterAssignmentModal - Modal for bulk waiter-sector assignments
 * Allows assigning multiple waiters to multiple sectors for a given date.
 * Features:
 * - Date picker for assignment date
 * - Shift selector (optional)
 * - Drag-and-drop or checkbox selection of waiters per sector
 * - Copy from previous day functionality
 * - Clear all assignments option
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, Copy, Trash2, Loader2, Users, MapPin, Check, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import {
  useWaiterAssignmentStore,
  selectOverview,
  selectIsLoading,
  selectError,
} from '../../stores/waiterAssignmentStore'
import { toast } from '../../stores/toastStore'
import type { WaiterInfo, SectorWithWaiters } from '../../services/api'

interface WaiterAssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  branchId: number
  branchName: string
}

// Get today's date in YYYY-MM-DD format
const getTodayDate = () => new Date().toISOString().split('T')[0]

// Get yesterday's date in YYYY-MM-DD format
const getYesterdayDate = () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toISOString().split('T')[0]
}

// Shift options
const SHIFTS = [
  { value: null, label: 'Todo el dia' },
  { value: 'MORNING', label: 'Manana' },
  { value: 'AFTERNOON', label: 'Tarde' },
  { value: 'NIGHT', label: 'Noche' },
]

export function WaiterAssignmentModal({
  isOpen,
  onClose,
  branchId,
  branchName,
}: WaiterAssignmentModalProps) {
  // AUDIT FIX S0.5 (C15): Use selectors instead of destructuring the whole store
  // to prevent unnecessary re-renders when unrelated state changes.
  const overview = useWaiterAssignmentStore(selectOverview)
  const isLoading = useWaiterAssignmentStore(selectIsLoading)
  const error = useWaiterAssignmentStore(selectError)
  const fetchAssignments = useWaiterAssignmentStore((s) => s.fetchAssignments)
  const createBulkAssignments = useWaiterAssignmentStore((s) => s.createBulkAssignments)
  const clearAssignments = useWaiterAssignmentStore((s) => s.clearAssignments)
  const copyFromPreviousDay = useWaiterAssignmentStore((s) => s.copyFromPreviousDay)
  const clearError = useWaiterAssignmentStore((s) => s.clearError)

  const [selectedDate, setSelectedDate] = useState(getTodayDate())
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [pendingAssignments, setPendingAssignments] = useState<Map<number, Set<number>>>(new Map())
  const [hasChanges, setHasChanges] = useState(false)

  // Fetch assignments when modal opens or date/shift changes
  useEffect(() => {
    if (isOpen && branchId) {
      fetchAssignments(branchId, selectedDate, selectedShift)
      setPendingAssignments(new Map())
      setHasChanges(false)
    }
  }, [isOpen, branchId, selectedDate, selectedShift, fetchAssignments])

  // Initialize pending assignments from current state
  useEffect(() => {
    if (overview) {
      const initial = new Map<number, Set<number>>()
      overview.sectors.forEach((sector) => {
        initial.set(sector.sector_id, new Set(sector.waiters.map((w) => w.id)))
      })
      setPendingAssignments(initial)
    }
  }, [overview])

  // Get all available waiters (assigned + unassigned)
  const allWaiters = useMemo(() => {
    if (!overview) return []
    const waiters: WaiterInfo[] = [...overview.unassigned_waiters]
    overview.sectors.forEach((sector) => {
      sector.waiters.forEach((w) => {
        if (!waiters.find((existing) => existing.id === w.id)) {
          waiters.push(w)
        }
      })
    })
    return waiters.sort((a, b) => a.name.localeCompare(b.name))
  }, [overview])

  // Toggle waiter assignment to a sector (MULTI-SECTOR: allows same waiter in multiple sectors)
  const toggleWaiterInSector = useCallback((sectorId: number, waiterId: number) => {
    setPendingAssignments((prev) => {
      const updated = new Map(prev)
      const sectorWaiters = new Set(updated.get(sectorId) || [])

      if (sectorWaiters.has(waiterId)) {
        // Remove from this sector
        sectorWaiters.delete(waiterId)
      } else {
        // MULTI-SECTOR FIX: Simply add to this sector without removing from others
        sectorWaiters.add(waiterId)
      }

      updated.set(sectorId, sectorWaiters)
      setHasChanges(true)
      return updated
    })
  }, [])

  // Check if waiter is assigned to a sector
  const isWaiterInSector = useCallback(
    (sectorId: number, waiterId: number) => {
      return pendingAssignments.get(sectorId)?.has(waiterId) ?? false
    },
    [pendingAssignments]
  )

  // Get waiters assigned to a sector (for display)
  const getSectorWaiters = useCallback(
    (sectorId: number): WaiterInfo[] => {
      const waiterIds = pendingAssignments.get(sectorId)
      if (!waiterIds) return []
      return allWaiters.filter((w) => waiterIds.has(w.id))
    },
    [pendingAssignments, allWaiters]
  )

  // Get unassigned waiters
  const unassignedWaiters = useMemo(() => {
    const assignedIds = new Set<number>()
    pendingAssignments.forEach((waiterIds) => {
      waiterIds.forEach((id) => assignedIds.add(id))
    })
    return allWaiters.filter((w) => !assignedIds.has(w.id))
  }, [pendingAssignments, allWaiters])

  // Get available waiters for a specific sector (MULTI-SECTOR: all waiters are available)
  const getAvailableWaitersForSector = useCallback(
    (_sectorId: number): WaiterInfo[] => {
      // MULTI-SECTOR FIX: All waiters are available for all sectors
      // A waiter can be assigned to multiple sectors simultaneously
      return allWaiters
    },
    [allWaiters]
  )

  // Handle save
  const handleSave = async () => {
    if (!hasChanges) {
      onClose()
      return
    }

    try {
      // First clear existing assignments for this date/shift
      await clearAssignments(branchId, selectedDate, selectedShift)

      // Build assignments array
      const assignments: Array<{ sector_id: number; waiter_ids: number[] }> = []
      pendingAssignments.forEach((waiterIds, sectorId) => {
        if (waiterIds.size > 0) {
          assignments.push({
            sector_id: sectorId,
            waiter_ids: Array.from(waiterIds),
          })
        }
      })

      if (assignments.length > 0) {
        const result = await createBulkAssignments(
          branchId,
          selectedDate,
          selectedShift,
          assignments
        )
        toast.success(`Asignaciones guardadas: ${result.created_count} mozos asignados`)
      } else {
        toast.success('Todas las asignaciones han sido eliminadas')
      }

      onClose()
    } catch (err) {
      toast.error('Error al guardar asignaciones')
    }
  }

  // Handle copy from previous day
  const handleCopyFromYesterday = async () => {
    try {
      const result = await copyFromPreviousDay(
        branchId,
        getYesterdayDate(),
        selectedDate,
        selectedShift
      )
      if (result.created_count > 0) {
        toast.success(`Copiadas ${result.created_count} asignaciones del dia anterior`)
      } else {
        toast.info('No hay asignaciones del dia anterior para copiar')
      }
    } catch (err) {
      toast.error('Error al copiar asignaciones')
    }
  }

  // Handle clear all
  const handleClearAll = async () => {
    if (!window.confirm('Eliminar todas las asignaciones de este dia?')) return

    try {
      const count = await clearAssignments(branchId, selectedDate, selectedShift)
      toast.success(`Eliminadas ${count} asignaciones`)
      setPendingAssignments(new Map())
      setHasChanges(false)
    } catch (err) {
      toast.error('Error al eliminar asignaciones')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Asignacion de Mozos a Sectores"
      size="xl"
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Users className="w-4 h-4" />
            <span>{allWaiters.length} mozos disponibles</span>
            {unassignedWaiters.length > 0 && (
              <Badge variant="warning">{unassignedWaiters.length} sin asignar</Badge>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                'Guardar Asignaciones'
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Branch and date info */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-[var(--text-tertiary)]">
            Sucursal: <span className="text-[var(--text-primary)] font-medium">{branchName}</span>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
          </div>

          <select
            value={selectedShift ?? ''}
            onChange={(e) => setSelectedShift(e.target.value || null)}
            className="px-3 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] focus:border-[var(--primary-500)] focus:ring-0"
          >
            {SHIFTS.map((shift) => (
              <option key={shift.value ?? 'all'} value={shift.value ?? ''}>
                {shift.label}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyFromYesterday}
            disabled={isLoading}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <Copy className="w-4 h-4 mr-1" />
            Copiar de ayer
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={isLoading}
            className="text-[var(--danger-text)] hover:text-red-300"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Limpiar todo
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-[var(--danger-border)]/10 border border-[var(--danger-border)]/30 rounded-lg text-[var(--danger-text)] text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={clearError} className="p-1 hover:bg-[var(--danger-border)]/20 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !overview && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-500)]" />
          </div>
        )}

        {/* Sectors grid */}
        {overview && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Sectores
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              {overview.sectors.map((sector) => (
                <SectorCard
                  key={sector.sector_id}
                  sector={sector}
                  availableWaiters={getAvailableWaitersForSector(sector.sector_id)}
                  assignedWaiters={getSectorWaiters(sector.sector_id)}
                  isWaiterInSector={isWaiterInSector}
                  onToggleWaiter={(waiterId) => toggleWaiterInSector(sector.sector_id, waiterId)}
                />
              ))}
            </div>

            {/* Unassigned waiters section */}
            {unassignedWaiters.length > 0 && (
              <div className="border-t border-[var(--bg-tertiary)] pt-4">
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--warning-icon)]" />
                  Mozos sin asignar ({unassignedWaiters.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedWaiters.map((waiter) => (
                    <Badge key={waiter.id} variant="warning">
                      {waiter.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// Sector card component with waiter checkboxes
interface SectorCardProps {
  sector: SectorWithWaiters
  availableWaiters: WaiterInfo[]  // MULTI-SECTOR: All branch waiters are available
  assignedWaiters: WaiterInfo[]
  isWaiterInSector: (sectorId: number, waiterId: number) => boolean
  onToggleWaiter: (waiterId: number) => void
}

function SectorCard({
  sector,
  availableWaiters,
  assignedWaiters,
  isWaiterInSector,
  onToggleWaiter,
}: SectorCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--bg-tertiary)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium text-[var(--text-primary)]">{sector.sector_name}</h4>
          <span className="text-xs text-[var(--text-muted)]">Prefijo: {sector.sector_prefix}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={assignedWaiters.length > 0 ? 'success' : 'default'}>
            {assignedWaiters.length} mozos
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            {expanded ? 'Ocultar' : 'Editar'}
          </Button>
        </div>
      </div>

      {/* Assigned waiters preview */}
      {!expanded && assignedWaiters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {assignedWaiters.map((waiter) => (
            <span
              key={waiter.id}
              className="px-2 py-0.5 text-xs bg-[var(--bg-primary)] rounded text-[var(--text-tertiary)]"
            >
              {waiter.name}
            </span>
          ))}
        </div>
      )}

      {/* Expanded: show available waiters with checkboxes */}
      {expanded && (
        <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
          {availableWaiters.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic py-2">
              No hay mozos disponibles en esta sucursal
            </p>
          ) : (
            availableWaiters.map((waiter) => {
              const isAssigned = isWaiterInSector(sector.sector_id, waiter.id)
              return (
                <label
                  key={waiter.id}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                    isAssigned
                      ? 'bg-[var(--primary-500)]/10 border border-[var(--primary-500)]/30'
                      : 'hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isAssigned}
                    onChange={() => onToggleWaiter(waiter.id)}
                    className="w-4 h-4 rounded border-[var(--text-muted)] bg-[var(--bg-tertiary)] text-[var(--primary-500)] focus:ring-2 focus:ring-[var(--primary-500)] focus:ring-offset-0"
                  />
                  <span className="text-sm text-[var(--text-primary)]">{waiter.name}</span>
                  {isAssigned && <Check className="w-3 h-3 text-[var(--primary-500)] ml-auto" />}
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
