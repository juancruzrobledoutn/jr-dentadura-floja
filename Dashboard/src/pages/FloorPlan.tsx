import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Button, Select } from '../components/ui'
import { Save, RotateCcw, Grid, Eye } from 'lucide-react'
import { useBranchStore, selectBranches, selectSelectedBranchId } from '../stores/branchStore'
import { handleError } from '../utils/logger'
import { toast } from '../stores/toastStore'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface FloorPlanData {
  id: number
  branch_id: number
  name: string
  width: number
  height: number
  background_image: string | null
  is_default: boolean
  sector_id: number | null
  tables: FloorTable[]
}

interface FloorTable {
  id?: number
  table_id: number
  table_number?: number
  capacity?: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  shape: string
  label: string | null
  status?: string
  elapsed_minutes?: number | null
}

// -------------------------------------------------------------------------
// Status color mapping
// -------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  FREE: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400' },
  OPEN: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400' },
  PAYING: { bg: 'bg-purple-500/20', border: 'border-purple-500', text: 'text-purple-400' },
  OUT_OF_SERVICE: { bg: 'bg-zinc-500/20', border: 'border-zinc-500', text: 'text-zinc-400' },
}

// STATUS_LABELS moved to component to use t()

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function FloorPlanPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.floorPlan.title'))

  const STATUS_LABELS: Record<string, string> = {
    FREE: t('pages.floorPlan.statusFree'),
    OPEN: t('pages.floorPlan.statusOpen'),
    PAYING: t('pages.floorPlan.statusPaying'),
    OUT_OF_SERVICE: t('pages.floorPlan.statusOutOfService'),
  }

  const branches = useBranchStore(selectBranches)
  const selectedBranchId = useBranchStore(selectSelectedBranchId)

  const [plans, setPlans] = useState<FloorPlanData[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [liveTables, setLiveTables] = useState<FloorTable[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'live'>('live')

  // Drag state
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------------------------------
  // Data simulation (UI scaffold — replace with API calls)
  // -----------------------------------------------------------------------

  const currentPlan = useMemo(
    () => plans.find((p) => String(p.id) === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  )

  // Simulated plans from branch tables
  useEffect(() => {
    if (!selectedBranchId) {
      setPlans([])
      setSelectedPlanId('')
      return
    }

    // Scaffold: create a sample plan for the selected branch
    const samplePlan: FloorPlanData = {
      id: 1,
      branch_id: parseInt(selectedBranchId, 10),
      name: 'Planta Baja',
      width: 800,
      height: 600,
      background_image: null,
      is_default: true,
      sector_id: null,
      tables: [
        { table_id: 1, x: 50, y: 50, width: 60, height: 60, rotation: 0, shape: 'RECTANGLE', label: '1', table_number: 1, capacity: 4, status: 'FREE' },
        { table_id: 2, x: 150, y: 50, width: 60, height: 60, rotation: 0, shape: 'RECTANGLE', label: '2', table_number: 2, capacity: 2, status: 'OPEN', elapsed_minutes: 45 },
        { table_id: 3, x: 250, y: 50, width: 60, height: 60, rotation: 0, shape: 'CIRCLE', label: '3', table_number: 3, capacity: 6, status: 'FREE' },
        { table_id: 4, x: 50, y: 170, width: 60, height: 60, rotation: 0, shape: 'RECTANGLE', label: '4', table_number: 4, capacity: 4, status: 'PAYING', elapsed_minutes: 90 },
        { table_id: 5, x: 150, y: 170, width: 60, height: 60, rotation: 0, shape: 'SQUARE', label: '5', table_number: 5, capacity: 2, status: 'FREE' },
        { table_id: 6, x: 250, y: 170, width: 60, height: 60, rotation: 0, shape: 'RECTANGLE', label: '6', table_number: 6, capacity: 8, status: 'OPEN', elapsed_minutes: 15 },
      ],
    }
    setPlans([samplePlan])
    setSelectedPlanId('1')
    setLiveTables(samplePlan.tables)
  }, [selectedBranchId])

  // -----------------------------------------------------------------------
  // Drag handlers
  // -----------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tableId: number) => {
      if (viewMode !== 'edit') return
      e.preventDefault()

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const table = liveTables.find((t) => t.table_id === tableId)
      if (!table) return

      setDraggingId(tableId)
      setDragOffset({
        x: e.clientX - rect.left - table.x,
        y: e.clientY - rect.top - table.y,
      })
    },
    [viewMode, liveTables]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingId === null) return

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const newX = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, (currentPlan?.width ?? 800) - 60))
      const newY = Math.max(0, Math.min(e.clientY - rect.top - dragOffset.y, (currentPlan?.height ?? 600) - 60))

      setLiveTables((prev) =>
        prev.map((t) =>
          t.table_id === draggingId ? { ...t, x: newX, y: newY } : t
        )
      )
      setIsDirty(true)
    },
    [draggingId, dragOffset, currentPlan]
  )

  const handleMouseUp = useCallback(() => {
    setDraggingId(null)
  }, [])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleSave = useCallback(() => {
    // In production: PUT /api/admin/floor-plans/{id}/tables
    toast.success(t('pages.floorPlan.positionsSaved'))
    setIsDirty(false)
  }, [])

  const handleAutoGenerate = useCallback(() => {
    // In production: POST /api/admin/floor-plans/{id}/auto-generate
    if (!currentPlan) return

    const tables = liveTables
    const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)))
    const padding = 20
    const margin = 40
    const tableSize = 60

    const repositioned = tables.map((t, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      return {
        ...t,
        x: margin + col * (tableSize + padding),
        y: margin + row * (tableSize + padding),
      }
    })

    setLiveTables(repositioned)
    setIsDirty(true)
    toast.info(t('pages.floorPlan.layoutGenerated'))
  }, [currentPlan, liveTables])

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const formatElapsed = (minutes: number | null | undefined) => {
    if (minutes == null) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const planOptions = useMemo(
    () => plans.map((p) => ({ value: String(p.id), label: p.name })),
    [plans]
  )

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  if (!selectedBranchId) {
    return (
      <PageContainer title={t('pages.floorPlan.title')} description={t('pages.floorPlan.selectBranchDesc')}>
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
          {t('pages.floorPlan.selectBranchMessage')}
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={t('pages.floorPlan.title')} description={t('pages.floorPlan.description')}>
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {planOptions.length > 1 && (
          <Select
            label=""
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            options={planOptions}
          />
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant={viewMode === 'live' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setViewMode('live')}
            aria-label={t('pages.floorPlan.liveViewLabel')}
          >
            <Eye className="w-4 h-4 mr-1" aria-hidden="true" />
            {t('pages.floorPlan.liveView')}
          </Button>
          <Button
            variant={viewMode === 'edit' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setViewMode('edit')}
            aria-label={t('pages.floorPlan.editModeLabel')}
          >
            <Grid className="w-4 h-4 mr-1" aria-hidden="true" />
            {t('pages.floorPlan.editMode')}
          </Button>
        </div>

        {viewMode === 'edit' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAutoGenerate}
              aria-label={t('pages.floorPlan.autoLayoutLabel')}
            >
              <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />
              {t('pages.floorPlan.autoLayout')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty}
              aria-label={t('pages.floorPlan.saveLabel')}
            >
              <Save className="w-4 h-4 mr-1" aria-hidden="true" />
              {t('pages.floorPlan.save')}
            </Button>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const colors = STATUS_COLORS[key]
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${colors.bg} border ${colors.border}`} />
              <span className="text-[var(--text-muted)]">{label}</span>
            </div>
          )
        })}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative border border-[var(--border-default)] rounded-lg bg-[var(--bg-primary)] overflow-hidden select-none"
        style={{
          width: currentPlan?.width ?? 800,
          height: currentPlan?.height ?? 600,
          cursor: viewMode === 'edit' ? 'default' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        role="application"
        aria-label={t('pages.floorPlan.canvasLabel')}
      >
        {liveTables.map((table) => {
          const status = table.status ?? 'FREE'
          const colors = STATUS_COLORS[status] ?? STATUS_COLORS.FREE
          const isCircle = table.shape === 'CIRCLE'

          return (
            <div
              key={table.table_id}
              className={`absolute flex flex-col items-center justify-center border-2 transition-shadow ${colors.bg} ${colors.border} ${
                viewMode === 'edit' ? 'cursor-grab active:cursor-grabbing hover:shadow-lg' : ''
              } ${draggingId === table.table_id ? 'shadow-xl z-10 opacity-90' : ''}`}
              style={{
                left: table.x,
                top: table.y,
                width: table.width,
                height: table.height,
                borderRadius: isCircle ? '50%' : table.shape === 'SQUARE' ? '4px' : '8px',
                transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined,
              }}
              onMouseDown={(e) => handleMouseDown(e, table.table_id)}
              title={`Mesa ${table.label || table.table_number || table.table_id} - ${STATUS_LABELS[status] || status}${
                table.capacity ? ` (${table.capacity} pers.)` : ''
              }${table.elapsed_minutes ? ` - ${formatElapsed(table.elapsed_minutes)}` : ''}`}
            >
              <span className={`text-sm font-bold ${colors.text}`}>
                {table.label || table.table_number || table.table_id}
              </span>
              {table.capacity && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  {table.capacity}p
                </span>
              )}
              {table.elapsed_minutes != null && table.elapsed_minutes > 0 && (
                <span className="text-[9px] text-[var(--text-muted)]">
                  {formatElapsed(table.elapsed_minutes)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Info bar */}
      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-muted)]">
        <span>{t('pages.floorPlan.tables')}: {liveTables.length}</span>
        {currentPlan && (
          <span>
            {t('pages.floorPlan.plan')}: {currentPlan.width} x {currentPlan.height}px
          </span>
        )}
        {viewMode === 'edit' && isDirty && (
          <span className="text-orange-400 font-medium">{t('pages.floorPlan.unsavedChanges')}</span>
        )}
      </div>
    </PageContainer>
  )
}

export default FloorPlanPage
