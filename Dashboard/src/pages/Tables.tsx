import { useState, useMemo, useCallback, useId, useActionState, useEffect } from 'react'
import { Plus, Trash2, Users, Archive, Clock, Wifi, WifiOff, RefreshCw, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useTableWebSocket } from '../hooks/useTableWebSocket'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge } from '../components/ui/Badge'
import { HelpButton } from '../components/ui/HelpButton'
import { useTableStore, selectTables } from '../stores/tableStore'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { useOrderHistoryStore } from '../stores/orderHistoryStore'
import { useWaiterAssignmentStore, selectSectors } from '../stores/waiterAssignmentStore'
import { toast } from '../stores/toastStore'
import { validateTable } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateTable, canEditTable, canDelete } from '../utils/permissions'
import { helpContent } from '../utils/helpContent'
import { TABLE_STATUS_LABELS, TABLE_SECTORS, TABLE_DEFAULT_TIME } from '../utils/constants'
import { tableAPI } from '../services/api'
import { BulkTableModal } from '../components/tables/BulkTableModal'
import { WaiterAssignmentModal } from '../components/tables/WaiterAssignmentModal'
import { TableSessionModal } from '../components/tables/TableSessionModal'
import type { RestaurantTable, RestaurantTableFormData, TableStatus, OrderStatus } from '../types'
import type { FormState } from '../types/form'

const initialFormData: RestaurantTableFormData = {
  branch_id: '',
  number: 1,
  capacity: 4,
  sector: 'Interior',
  status: 'libre',
  order_time: TABLE_DEFAULT_TIME,
  close_time: TABLE_DEFAULT_TIME,
  is_active: true,
}

function getStatusOptions(t: (key: string) => string): { value: TableStatus; label: string }[] {
  return [
    { value: 'libre', label: t('pages.tables.statusLabels.libre') },
    { value: 'solicito_pedido', label: t('pages.tables.statusLabels.solicito_pedido') },
    { value: 'pedido_cumplido', label: t('pages.tables.statusLabels.pedido_cumplido') },
    { value: 'cuenta_solicitada', label: t('pages.tables.statusLabels.cuenta_solicitada') },
    { value: 'ocupada', label: t('pages.tables.statusLabels.ocupada') },
  ]
}

// Labels for order status (round lifecycle)
// Flow: pending → confirmed → submitted → in_kitchen → ready → served
function getOrderStatusLabels(t: (key: string) => string): Record<OrderStatus, string> {
  return {
    none: '',
    pending: t('pages.tables.orderStatusLabels.pending'),
    confirmed: t('pages.tables.orderStatusLabels.confirmed'),
    submitted: t('pages.tables.orderStatusLabels.submitted'),
    in_kitchen: t('pages.tables.orderStatusLabels.in_kitchen'),
    ready_with_kitchen: t('pages.tables.orderStatusLabels.ready_with_kitchen'),
    ready: t('pages.tables.orderStatusLabels.ready'),
    served: t('pages.tables.orderStatusLabels.served'),
  }
}

// Colors for order status badges
// Flow: pending → confirmed → submitted → in_kitchen → ready → served
function getOrderStatusStyles(orderStatus: OrderStatus) {
  switch (orderStatus) {
    case 'pending':
      return { bg: 'bg-yellow-400', text: 'text-black font-bold', border: 'border-yellow-500' }
    case 'confirmed':
      // Waiter verified, waiting for admin to send to kitchen - blue badge
      return { bg: 'bg-blue-400', text: 'text-black font-bold', border: 'border-blue-500' }
    case 'submitted':
    case 'in_kitchen':
      return { bg: 'bg-blue-400', text: 'text-black font-bold', border: 'border-blue-500' }
    case 'ready_with_kitchen':
      // Mixed state: some ready, some still in kitchen - orange badge with black text
      return { bg: 'bg-orange-400', text: 'text-black font-bold', border: 'border-orange-500' }
    case 'ready':
      return { bg: 'bg-green-400', text: 'text-black font-bold', border: 'border-green-500' }
    case 'served':
      return { bg: 'bg-gray-400', text: 'text-black font-bold', border: 'border-gray-500' }
    default:
      return { bg: '', text: '', border: '' }
  }
}

// Colores para cada estado de mesa
function getStatusStyles(status: TableStatus, isActive: boolean, t: (key: string) => string) {
  if (!isActive) {
    return {
      bg: 'bg-[var(--bg-tertiary)]',
      border: 'border-[var(--border-emphasis)]',
      text: 'text-[var(--text-muted)]',
      label: t('pages.tables.inactive'),
    }
  }

  switch (status) {
    case 'libre':
      return {
        bg: 'bg-green-900/30',
        border: 'border-[var(--success-border)]',
        text: 'text-[var(--success-text)]',
        label: t('pages.tables.statusLabels.libre'),
      }
    case 'ocupada':
      return {
        bg: 'bg-red-900/30',
        border: 'border-[var(--danger-border)]',
        text: 'text-[var(--danger-text)]',
        label: t('pages.tables.statusLabels.ocupada'),
      }
    case 'solicito_pedido':
      return {
        bg: 'bg-yellow-900/30',
        border: 'border-yellow-500',
        text: 'text-[var(--warning-text)]',
        label: t('pages.tables.statusLabels.solicito_pedido'),
      }
    case 'pedido_cumplido':
      return {
        bg: 'bg-orange-100',
        border: 'border-orange-500',
        text: 'text-orange-700',
        label: t('pages.tables.statusLabels.pedido_cumplido'),
      }
    case 'cuenta_solicitada':
      return {
        bg: 'bg-purple-900/30',
        border: 'border-purple-500',
        text: 'text-purple-400',
        label: t('pages.tables.statusLabels.cuenta_solicitada'),
      }
    default:
      return {
        bg: 'bg-[var(--bg-tertiary)]',
        border: 'border-[var(--border-emphasis)]',
        text: 'text-[var(--text-tertiary)]',
        label: TABLE_STATUS_LABELS[status] || status,
      }
  }
}

// Componente de tarjeta de mesa
interface TableCardProps {
  table: RestaurantTable
  onEdit: (table: RestaurantTable) => void
  onDelete: (table: RestaurantTable) => void
  onArchive: (table: RestaurantTable) => void
  onQR: (table: RestaurantTable) => void
  canEdit: boolean
  canDelete: boolean
}

function TableCard({ table, onEdit, onDelete, onArchive, onQR, canEdit, canDelete }: TableCardProps) {
  const { t } = useTranslation()
  const styles = getStatusStyles(table.status, table.is_active !== false, t)
  const orderStatus = table.orderStatus ?? 'none'
  const orderStatusStyles = getOrderStatusStyles(orderStatus)
  const ORDER_STATUS_LABELS = getOrderStatusLabels(t)
  const orderStatusLabel = ORDER_STATUS_LABELS[orderStatus]

  // Determine what label to show: order status takes priority over table status when occupied
  const showOrderStatusAsMain = orderStatus !== 'none' && orderStatusLabel
  const mainLabel = showOrderStatusAsMain ? orderStatusLabel : styles.label
  const mainLabelStyles = showOrderStatusAsMain
    ? `${orderStatusStyles.text}`
    : styles.text

  // Agregar animación pulse para estados urgentes
  // ready_with_kitchen gets special long blink (5s) to alert waiter
  // statusChanged triggers blink when order status changes
  // hasNewOrder takes priority - shows strong blink for new orders
  const pulseClass = orderStatus === 'ready_with_kitchen'
    ? 'animate-ready-kitchen-blink'
    : table.statusChanged
      ? 'animate-status-blink'
      : table.hasNewOrder
        ? 'animate-pulse-warning'
        : table.status === 'cuenta_solicitada'
          ? 'animate-pulse-urgent'
          : ''

  return (
    <div
      className={`
        relative p-2 rounded-md border-2 transition-all duration-200
        hover:scale-[1.03] hover:shadow-md cursor-pointer min-w-[100px]
        ${styles.bg} ${styles.border} ${pulseClass}
      `}
      onClick={() => onEdit(table)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit(table)
        }
      }}
      aria-label={`Mesa ${table.number}, ${mainLabel}, ${table.capacity} personas, sector ${table.sector}`}
    >
      {/* Numero de mesa */}
      <div className="text-center mb-1">
        <span className="text-lg font-bold text-[var(--text-primary)]">#{table.number}</span>
      </div>

      {/* Estado de mesa o pedido (order status takes priority) */}
      <div className={`text-center text-[10px] font-semibold mb-1 ${mainLabelStyles}`}>
        {mainLabel}
      </div>

      {/* Info mínima: capacidad */}
      <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--text-tertiary)]">
        <div className="flex items-center gap-0.5">
          <Users className="w-2.5 h-2.5" aria-hidden="true" />
          <span>{table.capacity}</span>
        </div>
        {table.status !== 'libre' && table.status !== 'ocupada' && (
          <div className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" aria-hidden="true" />
            <span>{table.order_time}</span>
          </div>
        )}
      </div>

      {/* Small indicator showing table base status when order is active */}
      {showOrderStatusAsMain && (
        <div className="mt-0.5 text-center text-[8px] text-[var(--text-muted)]">
          ({styles.label})
        </div>
      )}

      {/* Waiter name who confirmed the order - bottom left */}
      {table.confirmedByName && (
        <div className="absolute bottom-0.5 left-0.5 text-[8px] text-[var(--primary-500)] font-medium truncate max-w-[60px]" title={`Confirmado por: ${table.confirmedByName}`}>
          {table.confirmedByName}
        </div>
      )}

      {/* Botones de acción */}
      <div className="absolute top-0.5 right-0.5 flex gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onQR(table)
          }}
          className="p-0.5 rounded bg-[var(--bg-tertiary)]/80 hover:bg-blue-600 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={`Codigo QR mesa ${table.number}`}
          title="Ver QR"
        >
          <QrCode className="w-2.5 h-2.5" aria-hidden="true" />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(table)
            }}
            className="p-0.5 rounded bg-[var(--bg-tertiary)]/80 hover:bg-red-600 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={`Eliminar mesa ${table.number}`}
          >
            <Trash2 className="w-2.5 h-2.5" aria-hidden="true" />
          </button>
        )}
        {canEdit && table.status === 'cuenta_solicitada' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onArchive(table)
            }}
            className="p-0.5 rounded bg-[var(--bg-tertiary)]/80 hover:bg-green-600 text-[var(--success-text)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={`Liberar mesa ${table.number}`}
            title="Liberar mesa y archivar en historial"
          >
            <Archive className="w-2.5 h-2.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

// Leyenda de estados
function StatusLegend() {
  const { t } = useTranslation()
  const statuses: { status: TableStatus; label: string }[] = [
    { status: 'libre', label: t('pages.tables.statusLabels.libre') },
    { status: 'ocupada', label: t('pages.tables.statusLabels.ocupada') },
    { status: 'solicito_pedido', label: t('pages.tables.statusLabels.solicito_pedido') },
    { status: 'pedido_cumplido', label: t('pages.tables.statusLabels.pedido_cumplido') },
    { status: 'cuenta_solicitada', label: t('pages.tables.statusLabels.cuenta_solicitada') },
  ]

  return (
    <div className="flex flex-wrap gap-4 mb-4 p-3 bg-[var(--bg-tertiary)]/50 rounded-lg">
      <span className="text-sm text-[var(--text-tertiary)] font-medium">{t('pages.tables.legend')}</span>
      {statuses.map(({ status, label }) => {
        const styles = getStatusStyles(status, true, t)
        return (
          <div key={status} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded border-2 ${styles.bg} ${styles.border}`} />
            <span className={`text-sm ${styles.text}`}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export function TablesPage() {
  // REACT 19: Document metadata
  const { t } = useTranslation()
  useDocumentTitle(t('pages.tables.title'))

  // WebSocket for real-time updates
  const { isConnected: isWsConnected, isReconnecting, reconnect } = useTableWebSocket()

  const tables = useTableStore(selectTables)
  const addTable = useTableStore((s) => s.addTable)
  const updateTable = useTableStore((s) => s.updateTable)
  const deleteTable = useTableStore((s) => s.deleteTable)
  const getNextTableNumber = useTableStore((s) => s.getNextTableNumber)
  const fetchTables = useTableStore((s) => s.fetchTables)

  const branches = useBranchStore(selectBranches)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateTable(userRoles)
  const canEdit = canEditTable(userRoles)
  const canDeleteTable = canDelete(userRoles)

  const createOrderHistory = useOrderHistoryStore((s) => s.createOrderHistory)
  const closeOrderHistory = useOrderHistoryStore((s) => s.closeOrderHistory)
  const getActiveOrderHistory = useOrderHistoryStore((s) => s.getActiveOrderHistory)

  // Waiter assignments store - to show assigned waiters per sector
  const assignedSectors = useWaiterAssignmentStore(selectSectors)
  const fetchAssignments = useWaiterAssignmentStore((s) => s.fetchAssignments)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  const [formData, setFormData] = useState<RestaurantTableFormData>(initialFormData)
  const [filterBranchId, setFilterBranchId] = useState<string>(() => branches[0]?.id || '')
  const [filterStatus, setFilterStatus] = useState<string>('')

  // QR Code modal state
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrTableCode, setQrTableCode] = useState<string>('')
  const [qrLoading, setQrLoading] = useState(false)

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<RestaurantTableFormData>, formDataSubmit: FormData): Promise<FormState<RestaurantTableFormData>> => {
      // Extract simple fields from FormData
      const data: RestaurantTableFormData = {
        branch_id: formDataSubmit.get('branch_id') as string,
        number: parseInt(formDataSubmit.get('number') as string, 10) || 1,
        capacity: parseInt(formDataSubmit.get('capacity') as string, 10) || 1,
        sector: formDataSubmit.get('sector') as string,
        status: formDataSubmit.get('status') as TableStatus,
        order_time: formDataSubmit.get('order_time') as string,
        close_time: formDataSubmit.get('close_time') as string,
        is_active: formDataSubmit.get('is_active') === 'on',
      }

      const validation = validateTable(data, {
        existingTables: tables,
        editingTableId: selectedTable?.id,
      })
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (selectedTable) {
          updateTable(selectedTable.id, data)
          toast.success(t('pages.tables.tableUpdated'))
        } else {
          addTable(data)
          toast.success(t('pages.tables.tableCreated'))
        }
        return { isSuccess: true }
      } catch (error) {
        const message = handleError(error, 'TablesPage.submitAction')
        toast.error(`${t('pages.tables.errorSaving')}: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [selectedTable, updateTable, addTable, tables]
  )

  const [state, formAction, isPending] = useActionState<FormState<RestaurantTableFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // Close modal on success - MUST be in useEffect to avoid infinite loop
  useEffect(() => {
    if (state.isSuccess && isModalOpen) {
      setIsModalOpen(false)
      setSelectedTable(null)
      setFormData(initialFormData)
    }
  }, [state.isSuccess, isModalOpen])

  // LINT FIX: Compute effective branch ID as derived state instead of using useEffect
  // If the selected branch doesn't exist, fall back to the first branch
  const effectiveBranchId = useMemo(() => {
    if (branches.length === 0) return ''
    if (branches.some((b) => b.id === filterBranchId)) return filterBranchId
    return branches[0].id
  }, [branches, filterBranchId])

  // Load tables when branch changes
  useEffect(() => {
    const branchIdNum = parseInt(effectiveBranchId, 10)
    if (!isNaN(branchIdNum) && branchIdNum > 0) {
      fetchTables(branchIdNum)
    }
  }, [effectiveBranchId, fetchTables])

  // Load waiter assignments when branch changes
  useEffect(() => {
    const branchIdNum = parseInt(effectiveBranchId, 10)
    if (!isNaN(branchIdNum) && branchIdNum > 0) {
      const today = new Date().toISOString().split('T')[0]
      fetchAssignments(branchIdNum, today, null)
    }
  }, [effectiveBranchId, fetchAssignments])

  // Create a map from sector name to assigned waiters
  const waitersBySectorName = useMemo(() => {
    const map = new Map<string, Array<{ id: number; name: string }>>()
    assignedSectors.forEach((sector) => {
      map.set(sector.sector_name, sector.waiters)
    })
    return map
  }, [assignedSectors])

  // Unique IDs for form fields
  const filterBranchSelectId = useId()
  const filterStatusSelectId = useId()

  // Filter tables by branch and status
  const filteredTables = useMemo(() => {
    let result = tables.filter((t) => t.branch_id === effectiveBranchId)
    if (filterStatus) {
      result = result.filter((t) => t.status === filterStatus)
    }
    return result
  }, [tables, effectiveBranchId, filterStatus])

  // Group tables by sector, then sort by status and number within each sector
  const tablesBySector = useMemo(() => {
    const statusOrder: Record<TableStatus, number> = {
      cuenta_solicitada: 1,  // Más urgente primero
      solicito_pedido: 2,
      pedido_cumplido: 3,
      ocupada: 4,
      libre: 5,              // Menos urgente al final
    }

    // Group by sector
    const grouped: Record<string, RestaurantTable[]> = {}
    filteredTables.forEach((table) => {
      const sector = table.sector || 'Sin sector'
      if (!grouped[sector]) {
        grouped[sector] = []
      }
      grouped[sector].push(table)
    })

    // Sort tables within each sector by status and number
    Object.keys(grouped).forEach((sector) => {
      grouped[sector].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status]
        if (statusDiff !== 0) return statusDiff
        return a.number - b.number
      })
    })

    // Convert to array of [sector, tables] sorted by sector name
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredTables])

  // Flat list for counting (backwards compatible)
  const sortedTables = useMemo(() => {
    return tablesBySector.flatMap(([, tables]) => tables)
  }, [tablesBySector])

  const getBranchName = useCallback(
    (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId)
      return branch?.name || t('forms.labels.branch')
    },
    [branches]
  )

  const openCreateModal = useCallback(() => {
    const defaultBranchId = effectiveBranchId || (branches.length > 0 ? branches[0].id : '')
    const nextNumber = defaultBranchId ? getNextTableNumber(defaultBranchId) : 1
    setSelectedTable(null)
    setFormData({
      ...initialFormData,
      branch_id: defaultBranchId,
      number: nextNumber,
    })
    setIsModalOpen(true)
  }, [branches, getNextTableNumber, effectiveBranchId])

  const openEditModal = useCallback((table: RestaurantTable) => {
    setSelectedTable(table)
    setFormData({
      branch_id: table.branch_id,
      number: table.number,
      capacity: table.capacity,
      sector: table.sector,
      status: table.status,
      order_time: table.order_time ?? TABLE_DEFAULT_TIME,
      close_time: table.close_time ?? TABLE_DEFAULT_TIME,
      is_active: table.is_active ?? true,
    })
    setIsModalOpen(true)
  }, [])

  // Open session modal to view current order
  const openSessionModal = useCallback((table: RestaurantTable) => {
    setSelectedTable(table)
    setIsSessionModalOpen(true)
  }, [])

  const openDeleteDialog = useCallback((table: RestaurantTable) => {
    setSelectedTable(table)
    setIsDeleteOpen(true)
  }, [])

  const handleBranchChange = useCallback(
    (branchId: string) => {
      const nextNumber = getNextTableNumber(branchId)
      setFormData((prev) => ({
        ...prev,
        branch_id: branchId,
        number: selectedTable ? prev.number : nextNumber,
      }))
    },
    [getNextTableNumber, selectedTable]
  )

  const getCurrentTime = useCallback(() => {
    const now = new Date()
    return now.toTimeString().slice(0, 5)
  }, [])

  const handleStatusChange = useCallback((newStatus: TableStatus) => {
    setFormData((prev) => {
      if (newStatus === 'libre' || newStatus === 'ocupada') {
        return {
          ...prev,
          status: newStatus,
          order_time: TABLE_DEFAULT_TIME,
          close_time: TABLE_DEFAULT_TIME,
        }
      }

      if (newStatus === 'solicito_pedido') {
        const orderTime = (prev.status === 'libre' || prev.status === 'ocupada')
          ? getCurrentTime()
          : prev.order_time
        return {
          ...prev,
          status: newStatus,
          order_time: orderTime === TABLE_DEFAULT_TIME ? getCurrentTime() : orderTime,
          close_time: TABLE_DEFAULT_TIME,
        }
      }

      if (newStatus === 'pedido_cumplido') {
        const orderTime = prev.order_time === TABLE_DEFAULT_TIME ? getCurrentTime() : prev.order_time
        return {
          ...prev,
          status: newStatus,
          order_time: orderTime,
          close_time: TABLE_DEFAULT_TIME,
        }
      }

      if (newStatus === 'cuenta_solicitada') {
        const orderTime = prev.order_time === TABLE_DEFAULT_TIME ? getCurrentTime() : prev.order_time
        const closeTime = prev.close_time === TABLE_DEFAULT_TIME ? getCurrentTime() : prev.close_time
        return {
          ...prev,
          status: newStatus,
          order_time: orderTime,
          close_time: closeTime,
        }
      }

      return { ...prev, status: newStatus }
    })
  }, [getCurrentTime])


  const handleDelete = useCallback(() => {
    if (!selectedTable) return

    try {
      const tableExists = tables.some((t) => t.id === selectedTable.id)
      if (!tableExists) {
        toast.error(t('pages.tables.tableNotFound'))
        setIsDeleteOpen(false)
        return
      }

      deleteTable(selectedTable.id)
      toast.success(t('pages.tables.tableDeleted'))
      setIsDeleteOpen(false)
    } catch (error) {
      const message = handleError(error, 'TablesPage.handleDelete')
      toast.error(`${t('pages.tables.errorDeleting')}: ${message}`)
    }
  }, [selectedTable, tables, deleteTable])

  const handleArchive = useCallback((table: RestaurantTable) => {
    try {
      const closeTime = getCurrentTime()
      const activeHistory = getActiveOrderHistory(table.id)

      if (activeHistory) {
        closeOrderHistory(activeHistory.id, closeTime)
      } else {
        const newHistory = createOrderHistory({
          branch_id: table.branch_id,
          table_id: table.id,
          table_number: table.number,
        })
        closeOrderHistory(newHistory.id, closeTime)
      }

      updateTable(table.id, {
        status: 'libre',
        order_time: TABLE_DEFAULT_TIME,
        close_time: TABLE_DEFAULT_TIME,
      })

      toast.success(t('pages.tables.tableArchived', { number: table.number }))
    } catch (error) {
      const message = handleError(error, 'TablesPage.handleArchive')
      toast.error(`${t('pages.tables.errorArchiving')}: ${message}`)
    }
  }, [createOrderHistory, closeOrderHistory, getActiveOrderHistory, getCurrentTime, updateTable])

  // QR Code handler
  const handleShowQR = useCallback(async (table: RestaurantTable) => {
    setQrLoading(true)
    setQrTableCode(String(table.number))
    setQrModalOpen(true)
    try {
      const backendId = parseInt(table.id, 10)
      if (isNaN(backendId)) {
        // Fallback for local-only tables without backend ID
        setQrUrl(null)
        return
      }
      const result = await tableAPI.getQRUrl(backendId)
      setQrUrl(result.url)
      setQrTableCode(result.table_code)
    } catch (error) {
      handleError(error, 'TablesPage.handleShowQR')
      setQrUrl(null)
    } finally {
      setQrLoading(false)
    }
  }, [])

  const branchOptions = useMemo(
    () =>
      branches.map((b) => ({
        value: b.id,
        label: b.name,
      })),
    [branches]
  )

  const sectorOptions = useMemo(
    () =>
      TABLE_SECTORS.map((sector) => ({
        value: sector,
        label: sector,
      })),
    []
  )

  const statusOptions = getStatusOptions(t)

  const filterStatusOptions = useMemo(
    () => [
      { value: '', label: t('pages.orders.allStatuses') },
      ...statusOptions,
    ],
    [t, statusOptions]
  )

  // Contadores por estado
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      total: sortedTables.length,
      libre: 0,
      ocupada: 0,
      solicito_pedido: 0,
      pedido_cumplido: 0,
      cuenta_solicitada: 0,
    }
    sortedTables.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++
      }
    })
    return counts
  }, [sortedTables])

  return (
    <PageContainer
      title={t('pages.tables.title')}
      description={t('pages.tables.descriptionBranches')}
      helpContent={helpContent.tables}
      actions={
        <div className="flex items-center gap-4">
          {/* Connection status indicator */}
          <div className="flex items-center gap-2">
            {isWsConnected ? (
              <>
                <Wifi className="w-4 h-4 text-[var(--success-icon)]" />
                <span className="text-sm text-[var(--success-icon)]">{t('pages.kitchen.live')}</span>
              </>
            ) : (
              <button
                onClick={reconnect}
                disabled={isReconnecting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--warning-bg)] border border-[var(--warning-border)] hover:bg-[var(--warning-bg-hover)] transition-colors"
                title="Haz clic para reconectar"
              >
                {isReconnecting ? (
                  <RefreshCw className="w-4 h-4 text-[var(--warning-icon)] animate-spin" />
                ) : (
                  <WifiOff className="w-4 h-4 text-[var(--warning-icon)]" />
                )}
                <span className="text-sm font-medium text-[var(--warning-text)]">
                  {isReconnecting ? t('pages.kitchen.reconnecting') : t('pages.tables.noConnection')}
                </span>
              </button>
            )}
          </div>
          {canCreate && (
            <>
              <Button
                variant="secondary"
                onClick={() => setIsAssignmentModalOpen(true)}
                leftIcon={<Users className="w-4 h-4" />}
                disabled={!effectiveBranchId}
              >
                Asignar Mozos
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsBulkModalOpen(true)}
                leftIcon={<Plus className="w-4 h-4" />}
                disabled={branches.length === 0}
              >
                Creacion Masiva
              </Button>
              <Button
                onClick={openCreateModal}
                leftIcon={<Plus className="w-4 h-4" />}
                disabled={branches.length === 0}
              >
                Nueva Mesa
              </Button>
            </>
          )}
        </div>
      }
    >
      {/* Filters - Single row layout */}
      <div className="mb-4 flex items-center gap-3">
        <Select
          id={filterBranchSelectId}
          options={branchOptions}
          value={effectiveBranchId}
          onChange={(e) => setFilterBranchId(e.target.value)}
          className="w-52"
          aria-label="Filtrar mesas por sucursal"
        />
        <Select
          id={filterStatusSelectId}
          options={filterStatusOptions}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-44"
          aria-label="Filtrar mesas por estado"
        />
        {/* Contador de mesas */}
        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="default">{statusCounts.total} {t('pages.tables.tables')}</Badge>
          {statusCounts.libre > 0 && (
            <Badge variant="success">{statusCounts.libre} {t('pages.tables.free')}</Badge>
          )}
          {statusCounts.ocupada > 0 && (
            <Badge variant="danger">{statusCounts.ocupada} {t('pages.tables.occupied')}</Badge>
          )}
        </div>
      </div>

      {/* Leyenda de colores */}
      <StatusLegend />

      {branches.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)]">
            {t('pages.tables.noBranchesForTables')}
          </p>
        </Card>
      ) : sortedTables.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)] mb-4">
            {t('pages.tables.noTablesInBranch')} {canCreate ? t('pages.tables.createOneToStart') : ''}
          </p>
          {canCreate && (
            <Button onClick={openCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
              Nueva Mesa
            </Button>
          )}
        </Card>
      ) : (
        /* Cuadrícula de mesas agrupadas por sector */
        <div className="max-h-[600px] overflow-y-auto pr-2 space-y-6">
          {tablesBySector.map(([sector, sectorTables]) => {
            const sectorWaiters = waitersBySectorName.get(sector) || []
            return (
              <div key={sector}>
                {/* Encabezado del sector */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{sector}</h3>
                  <Badge variant="default">{sectorTables.length} {t('pages.tables.tables')}</Badge>
                  {/* Mozos asignados al sector */}
                  {sectorWaiters.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[var(--primary-400)]" />
                      <div className="flex gap-1">
                        {sectorWaiters.map((waiter) => (
                          <Badge
                            key={waiter.id}
                            variant="warning"
                            className="text-xs"
                          >
                            {waiter.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {sectorWaiters.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)] italic">{t('pages.tables.noWaitersAssigned')}</span>
                  )}
                  <div className="flex-1 h-px bg-[var(--bg-tertiary)]" />
                </div>
                {/* Mesas del sector */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                  {sectorTables.map((table) => (
                    <TableCard
                      key={table.id}
                      table={table}
                      onEdit={openSessionModal}
                      onDelete={openDeleteDialog}
                      onArchive={handleArchive}
                      onQR={handleShowQR}
                      canEdit={canEdit}
                      canDelete={canDeleteTable}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedTable ? t('pages.tables.editTable') : t('pages.tables.newTable')}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="table-form" isLoading={isPending}>
              {selectedTable ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="table-form" action={formAction} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpButton
              title={t('pages.tables.editTable')}
              size="sm"
              content={
                <div className="space-y-3">
                  <p>
                    <strong>Completa los siguientes campos</strong> para crear o editar una mesa:
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>
                      <strong>Sucursal:</strong> Selecciona a que sucursal pertenece la mesa. Es obligatorio.
                    </li>
                    <li>
                      <strong>Numero de mesa:</strong> Identificador unico de la mesa dentro de la sucursal.
                    </li>
                    <li>
                      <strong>Capacidad:</strong> Cantidad maxima de comensales (1-50).
                    </li>
                    <li>
                      <strong>Sector:</strong> Ubicacion dentro del local (Interior, Terraza, VIP, etc.).
                    </li>
                    <li>
                      <strong>Estado:</strong> Estado actual de la mesa para el seguimiento de pedidos.
                    </li>
                    <li>
                      <strong>Hora Pedido:</strong> Hora del primer pedido de la mesa (formato HH:mm).
                    </li>
                    <li>
                      <strong>Hora Cierre:</strong> Hora estimada de cierre de la mesa (formato HH:mm).
                    </li>
                    <li>
                      <strong>Mesa activa:</strong> Activa o desactiva la disponibilidad de la mesa.
                    </li>
                  </ul>
                  <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                    <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                    <p className="text-sm mt-1">
                      Organiza las mesas por sectores para facilitar el seguimiento de pedidos y la asignacion de mozos.
                    </p>
                  </div>
                </div>
              }
            />
            <span className="text-sm text-[var(--text-tertiary)]">{t('common.formHelp')}</span>
          </div>

          {/* Branch Select */}
          <Select
            label={t('forms.labels.branch')}
            name="branch_id"
            options={branchOptions}
            placeholder="Seleccionar sucursal"
            value={formData.branch_id}
            onChange={(e) => handleBranchChange(e.target.value)}
            error={state.errors?.branch_id}
          />

          {/* Table Number */}
          <Input
            label={t('pages.tables.tableNumber')}
            name="number"
            type="number"
            min={1}
            value={formData.number}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                number: parseInt(e.target.value, 10) || 1,
              }))
            }
            error={state.errors?.number}
          />

          {/* Capacity */}
          <Input
            label={t('pages.tables.capacityLabel')}
            name="capacity"
            type="number"
            min={1}
            max={50}
            value={formData.capacity}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                capacity: parseInt(e.target.value, 10) || 1,
              }))
            }
            error={state.errors?.capacity}
          />

          {/* Sector */}
          <Select
            label={t('forms.labels.sector')}
            name="sector"
            options={sectorOptions}
            value={formData.sector}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, sector: e.target.value }))
            }
            error={state.errors?.sector}
          />

          {/* Status */}
          <Select
            label="Estado"
            name="status"
            options={statusOptions}
            value={formData.status}
            onChange={(e) => handleStatusChange(e.target.value as TableStatus)}
            error={state.errors?.status}
          />

          {/* Time fields */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('pages.tables.orderTime')}
              name="order_time"
              type="time"
              value={formData.order_time}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, order_time: e.target.value }))
              }
              disabled={formData.status === 'libre' || formData.status === 'ocupada'}
              error={state.errors?.order_time}
            />
            <Input
              label={t('pages.tables.closeTime')}
              name="close_time"
              type="time"
              value={formData.close_time}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, close_time: e.target.value }))
              }
              disabled={formData.status !== 'cuenta_solicitada'}
              error={state.errors?.close_time}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            {formData.status === 'solicito_pedido' || formData.status === 'pedido_cumplido'
              ? t('pages.tables.timeHints.orderRequired')
              : formData.status === 'cuenta_solicitada'
                ? t('pages.tables.timeHints.bothRequired')
                : t('pages.tables.timeHints.bothZero')}
          </p>

          {/* Active Toggle */}
          <Toggle
            label={t('pages.tables.activeTable')}
            name="is_active"
            checked={formData.is_active}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
            }
          />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('pages.tables.deleteTable')}
        message={`¿Estas seguro de eliminar la mesa #${selectedTable?.number} de ${selectedTable ? getBranchName(selectedTable.branch_id) : ''}?`}
        confirmLabel={t('common.delete')}
      />

      {/* Bulk Table Creation Modal */}
      <BulkTableModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        branchId={parseInt(effectiveBranchId, 10) || 0}
        branchName={branches.find((b) => b.id === effectiveBranchId)?.name || ''}
        onSuccess={() => {
          setIsBulkModalOpen(false)
          // Refetch tables to get the newly created ones
          const branchIdNum = parseInt(effectiveBranchId, 10)
          if (!isNaN(branchIdNum)) {
            fetchTables(branchIdNum)
          }
          toast.success(t('pages.tables.tablesCreated'))
        }}
      />

      {/* Waiter Sector Assignment Modal */}
      <WaiterAssignmentModal
        isOpen={isAssignmentModalOpen}
        onClose={() => setIsAssignmentModalOpen(false)}
        branchId={parseInt(effectiveBranchId, 10) || 0}
        branchName={branches.find((b) => b.id === effectiveBranchId)?.name || ''}
      />

      {/* Table Session Detail Modal */}
      <TableSessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        table={selectedTable}
      />

      {/* QR Code Modal */}
      <Modal
        isOpen={qrModalOpen}
        onClose={() => { setQrModalOpen(false); setQrUrl(null) }}
        title={`QR - Mesa ${qrTableCode}`}
        size="sm"
      >
        <div className="flex flex-col items-center gap-4 py-4">
          {qrLoading ? (
            <div className="w-48 h-48 flex items-center justify-center" role="status">
              <div className="w-8 h-8 border-2 border-[var(--primary-500)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : qrUrl ? (
            <>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                alt={`QR code for table ${qrTableCode}`}
                className="w-48 h-48 rounded-lg border border-[var(--border-default)] bg-white p-2"
              />
              <p className="text-xs text-[var(--text-tertiary)] text-center break-all max-w-[250px]">
                {qrUrl}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(qrUrl)
                  toast.success('URL copiada al portapapeles')
                }}
              >
                Copiar URL
              </Button>
            </>
          ) : (
            <p className="text-[var(--text-muted)] text-center">
              No se pudo generar el QR. La mesa debe existir en el backend.
            </p>
          )}
        </div>
      </Modal>
    </PageContainer>
  )
}

export default TablesPage
