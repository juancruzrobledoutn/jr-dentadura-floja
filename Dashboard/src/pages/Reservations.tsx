import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, Button, Select, Modal } from '../components/ui'
import {
  CalendarDays,
  Plus,
  Users,
  Phone,
  Mail,
  Clock,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  UserX,
  Armchair,
} from 'lucide-react'
import { useBranchStore, selectBranches, selectSelectedBranchId } from '../stores/branchStore'
import {
  useReservationStore,
  selectReservations,
  selectIsLoading,
} from '../stores/reservationStore'
import { handleError } from '../utils/logger'
import { toast } from '../stores/toastStore'
import type { Reservation, ReservationCreate, ReservationUpdate } from '../services/api'

// -------------------------------------------------------------------------
// Status config
// -------------------------------------------------------------------------

function getReservationStatusConfig(t: (key: string) => string): Record<string, { label: string; color: string; bg: string }> {
  return {
    PENDING: { label: t('pages.reservations.statusLabels.PENDING'), color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    CONFIRMED: { label: t('pages.reservations.statusLabels.CONFIRMED'), color: 'text-blue-400', bg: 'bg-blue-500/10' },
    SEATED: { label: t('pages.reservations.statusLabels.SEATED'), color: 'text-green-400', bg: 'bg-green-500/10' },
    COMPLETED: { label: t('pages.reservations.statusLabels.COMPLETED'), color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
    CANCELED: { label: t('pages.reservations.statusLabels.CANCELED'), color: 'text-red-400', bg: 'bg-red-500/10' },
    NO_SHOW: { label: t('pages.reservations.statusLabels.NO_SHOW'), color: 'text-orange-400', bg: 'bg-orange-500/10' },
  }
}

function getReservationStatusOptions(t: (key: string) => string) {
  return [
    { value: '', label: t('pages.reservations.allStatuses') },
    { value: 'PENDING', label: t('pages.reservations.statusLabels.PENDING') },
    { value: 'CONFIRMED', label: t('pages.reservations.statusLabels.CONFIRMED') },
    { value: 'SEATED', label: t('pages.reservations.statusLabels.SEATED') },
    { value: 'COMPLETED', label: t('pages.reservations.statusLabels.COMPLETED') },
    { value: 'CANCELED', label: t('pages.reservations.statusLabels.CANCELED') },
    { value: 'NO_SHOW', label: t('pages.reservations.statusLabels.NO_SHOW') },
  ]
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const STATUS_CONFIG = getReservationStatusConfig(t)
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '-'
  return timeStr.slice(0, 5)
}

// -------------------------------------------------------------------------
// Form defaults
// -------------------------------------------------------------------------

interface ReservationFormData {
  customer_name: string
  customer_phone: string
  customer_email: string
  party_size: number
  reservation_date: string
  reservation_time: string
  duration_minutes: number
  table_id: string
  notes: string
}

const EMPTY_FORM: ReservationFormData = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  party_size: 2,
  reservation_date: new Date().toISOString().split('T')[0],
  reservation_time: '20:00',
  duration_minutes: 90,
  table_id: '',
  notes: '',
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function ReservationsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.reservations.title'))

  const STATUS_CONFIG = getReservationStatusConfig(t)
  const STATUS_OPTIONS = getReservationStatusOptions(t)

  const branches = useBranchStore(selectBranches)
  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const reservations = useReservationStore(selectReservations)
  const isLoading = useReservationStore(selectIsLoading)
  const fetchReservations = useReservationStore((s) => s.fetchReservations)
  const createReservation = useReservationStore((s) => s.createReservation)
  const updateReservation = useReservationStore((s) => s.updateReservation)
  const updateStatus = useReservationStore((s) => s.updateStatus)
  const deleteReservation = useReservationStore((s) => s.deleteReservation)

  // Filters
  const [branchFilter, setBranchFilter] = useState<string>(selectedBranchId || '')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [formData, setFormData] = useState<ReservationFormData>(EMPTY_FORM)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null)

  const branchOptions = useMemo(
    () => [
      { value: '', label: t('pages.reservations.selectBranch') },
      ...branches.map((b) => ({ value: String(b.id), label: b.name })),
    ],
    [branches],
  )

  // Fetch on branch/date/status change
  useEffect(() => {
    if (!branchFilter) return
    const branchId = parseInt(branchFilter, 10)
    if (isNaN(branchId)) return
    fetchReservations(
      branchId,
      dateFilter || undefined,
      statusFilter || undefined,
    ).catch((err) => handleError(err, 'Reservations.fetch'))
  }, [branchFilter, dateFilter, statusFilter, fetchReservations])

  // Filtered reservations (client-side secondary filter)
  const filteredReservations = useMemo(() => {
    let result = [...reservations]
    // Sort by date+time ascending
    result.sort((a, b) => {
      const dateCompare = a.reservation_date.localeCompare(b.reservation_date)
      if (dateCompare !== 0) return dateCompare
      return a.reservation_time.localeCompare(b.reservation_time)
    })
    return result
  }, [reservations])

  // Modal handlers
  const openCreate = useCallback(() => {
    setEditingReservation(null)
    setFormData(EMPTY_FORM)
    setIsModalOpen(true)
  }, [])

  const openEdit = useCallback((reservation: Reservation) => {
    setEditingReservation(reservation)
    setFormData({
      customer_name: reservation.customer_name,
      customer_phone: reservation.customer_phone || '',
      customer_email: reservation.customer_email || '',
      party_size: reservation.party_size,
      reservation_date: reservation.reservation_date,
      reservation_time: reservation.reservation_time.slice(0, 5),
      duration_minutes: reservation.duration_minutes,
      table_id: reservation.table_id ? String(reservation.table_id) : '',
      notes: reservation.notes || '',
    })
    setIsModalOpen(true)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!formData.customer_name.trim()) {
      toast.error(t('pages.reservations.customerNameRequired'))
      return
    }
    if (formData.party_size < 1) {
      toast.error(t('pages.reservations.partySizeMin'))
      return
    }
    if (!branchFilter) {
      toast.error(t('common.selectBranchFirst'))
      return
    }

    try {
      if (editingReservation) {
        const updateData: ReservationUpdate = {
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone || null,
          customer_email: formData.customer_email || null,
          party_size: formData.party_size,
          reservation_date: formData.reservation_date,
          reservation_time: formData.reservation_time,
          duration_minutes: formData.duration_minutes,
          table_id: formData.table_id ? parseInt(formData.table_id, 10) : null,
          notes: formData.notes || null,
        }
        await updateReservation(editingReservation.id, updateData)
        toast.success(t('pages.reservations.reservationUpdated'))
      } else {
        const createData: ReservationCreate = {
          branch_id: parseInt(branchFilter, 10),
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone || null,
          customer_email: formData.customer_email || null,
          party_size: formData.party_size,
          reservation_date: formData.reservation_date,
          reservation_time: formData.reservation_time,
          duration_minutes: formData.duration_minutes,
          table_id: formData.table_id ? parseInt(formData.table_id, 10) : null,
          notes: formData.notes || null,
        }
        await createReservation(createData)
        toast.success(t('pages.reservations.reservationCreated'))
      }
      setIsModalOpen(false)
    } catch (error) {
      const message = handleError(error, 'Reservations.submit')
      toast.error(message)
    }
  }, [formData, editingReservation, branchFilter, createReservation, updateReservation])

  const handleStatusChange = useCallback(
    async (reservation: Reservation, newStatus: string) => {
      try {
        await updateStatus(reservation.id, newStatus)
        toast.success(`${t('pages.reservations.statusChanged')} ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
      } catch (error) {
        const message = handleError(error, 'Reservations.statusChange')
        toast.error(message)
      }
    },
    [updateStatus],
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteReservation(deleteTarget.id)
      toast.success(t('pages.reservations.reservationDeleted'))
      setDeleteTarget(null)
    } catch (error) {
      const message = handleError(error, 'Reservations.delete')
      toast.error(message)
    }
  }, [deleteTarget, deleteReservation])

  // Status action buttons based on current status
  const getStatusActions = useCallback(
    (reservation: Reservation) => {
      const actions: { label: string; status: string; icon: React.ReactNode; variant: 'primary' | 'secondary' | 'danger' }[] = []
      switch (reservation.status) {
        case 'PENDING':
          actions.push(
            { label: t('pages.reservations.statusActions.confirm'), status: 'CONFIRMED', icon: <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'primary' },
            { label: t('pages.reservations.statusActions.cancel'), status: 'CANCELED', icon: <XCircle className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'danger' },
            { label: t('pages.reservations.statusActions.noShow'), status: 'NO_SHOW', icon: <UserX className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'secondary' },
          )
          break
        case 'CONFIRMED':
          actions.push(
            { label: t('pages.reservations.statusActions.seat'), status: 'SEATED', icon: <Armchair className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'primary' },
            { label: t('pages.reservations.statusActions.cancel'), status: 'CANCELED', icon: <XCircle className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'danger' },
            { label: t('pages.reservations.statusActions.noShow'), status: 'NO_SHOW', icon: <UserX className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'secondary' },
          )
          break
        case 'SEATED':
          actions.push(
            { label: t('pages.reservations.statusActions.complete'), status: 'COMPLETED', icon: <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'primary' },
            { label: t('pages.reservations.statusActions.cancel'), status: 'CANCELED', icon: <XCircle className="w-3.5 h-3.5" aria-hidden="true" />, variant: 'danger' },
          )
          break
      }
      return actions
    },
    [],
  )

  return (
    <PageContainer
      title={t('pages.reservations.title')}
      description={t('pages.reservations.description')}
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div className="w-56">
          <Select
            id="reservations-branch-filter"
            label={t('forms.labels.branch')}
            options={branchOptions}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="reservations-date-filter"
            className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            Fecha
          </label>
          <input
            id="reservations-date-filter"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
          />
        </div>
        <div className="w-48">
          <Select
            id="reservations-status-filter"
            label={t('common.status')}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={openCreate}
          leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
          disabled={!branchFilter}
        >
          Nueva Reserva
        </Button>
      </div>

      {/* No branch selected */}
      {!branchFilter && (
        <Card className="p-8 text-center">
          <CalendarDays className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" aria-hidden="true" />
          <p className="text-[var(--text-muted)]">{t('pages.reservations.selectBranchToView')}</p>
        </Card>
      )}

      {/* Loading */}
      {branchFilter && isLoading && (
        <div className="flex items-center justify-center h-32" role="status">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="sr-only">{t('pages.reservations.loadingReservations')}</span>
        </div>
      )}

      {/* Reservations list */}
      {branchFilter && !isLoading && (
        <>
          {filteredReservations.length === 0 ? (
            <Card className="p-8 text-center">
              <CalendarDays className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" aria-hidden="true" />
              <p className="text-[var(--text-muted)]">{t('pages.reservations.noReservations')}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredReservations.map((reservation) => {
                const statusActions = getStatusActions(reservation)
                return (
                  <Card key={reservation.id} className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-base font-semibold text-[var(--text-primary)] truncate">
                            {reservation.customer_name}
                          </h4>
                          <StatusBadge status={reservation.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                            {formatDate(reservation.reservation_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            {formatTime(reservation.reservation_time)} ({reservation.duration_minutes} min)
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            {reservation.party_size} {reservation.party_size === 1 ? t('pages.reservations.person') : t('pages.reservations.persons')}
                          </span>
                          {reservation.customer_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                              {reservation.customer_phone}
                            </span>
                          )}
                          {reservation.customer_email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                              {reservation.customer_email}
                            </span>
                          )}
                          {reservation.table_id && (
                            <span className="text-[var(--text-tertiary)]">
                              Mesa #{reservation.table_id}
                            </span>
                          )}
                        </div>
                        {reservation.notes && (
                          <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                            {reservation.notes}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {statusActions.map((action) => (
                          <Button
                            key={action.status}
                            variant={action.variant}
                            size="sm"
                            onClick={() => handleStatusChange(reservation, action.status)}
                            leftIcon={action.icon}
                          >
                            {action.label}
                          </Button>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEdit(reservation)}
                          aria-label={t('pages.reservations.editReservation')}
                        >
                          <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(reservation)}
                          aria-label={t('pages.reservations.deleteReservation')}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReservation ? t('pages.reservations.editReservation') : t('pages.reservations.newReservation')}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              {editingReservation ? t('common.save') : t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="res-customer-name"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              {t('pages.reservations.customerName')} *
            </label>
            <input
              id="res-customer-name"
              type="text"
              value={formData.customer_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, customer_name: e.target.value }))}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              placeholder={t('pages.reservations.fullName')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="res-phone"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Telefono
              </label>
              <input
                id="res-phone"
                type="tel"
                value={formData.customer_phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, customer_phone: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                placeholder={t('forms.placeholders.phone')}
              />
            </div>
            <div>
              <label
                htmlFor="res-email"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Email
              </label>
              <input
                id="res-email"
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData((prev) => ({ ...prev, customer_email: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                placeholder={t('forms.placeholders.customerEmail')}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="res-date"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                {t('common.date')} *
              </label>
              <input
                id="res-date"
                type="date"
                value={formData.reservation_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, reservation_date: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              />
            </div>
            <div>
              <label
                htmlFor="res-time"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                {t('common.time')} *
              </label>
              <input
                id="res-time"
                type="time"
                value={formData.reservation_time}
                onChange={(e) => setFormData((prev) => ({ ...prev, reservation_time: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              />
            </div>
            <div>
              <label
                htmlFor="res-party-size"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                {t('pages.reservations.partySize')} *
              </label>
              <input
                id="res-party-size"
                type="number"
                min="1"
                max="50"
                value={formData.party_size}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    party_size: parseInt(e.target.value, 10) || 1,
                  }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="res-duration"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                {t('pages.reservations.duration')}
              </label>
              <input
                id="res-duration"
                type="number"
                min="15"
                max="480"
                step="15"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    duration_minutes: parseInt(e.target.value, 10) || 90,
                  }))
                }
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              />
            </div>
            <div>
              <label
                htmlFor="res-table"
                className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
              >
                {t('pages.reservations.tableOptional')}
              </label>
              <input
                id="res-table"
                type="number"
                min="1"
                value={formData.table_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, table_id: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
                placeholder={t('pages.reservations.tableIdPlaceholder')}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="res-notes"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Notas
            </label>
            <textarea
              id="res-notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              placeholder={t('pages.reservations.notesPlaceholder')}
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('pages.reservations.deleteReservation')}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-[var(--text-secondary)]">
          {t('pages.reservations.confirmDeleteMessage')}{' '}
          <strong className="text-[var(--text-primary)]">{deleteTarget?.customer_name}</strong>?
        </p>
      </Modal>
    </PageContainer>
  )
}

export default ReservationsPage
