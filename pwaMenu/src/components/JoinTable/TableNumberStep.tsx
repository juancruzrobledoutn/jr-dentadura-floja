/**
 * TableNumberStep - First step of the join table flow
 * Handles table number input
 */

import { useTranslation } from 'react-i18next'
import { VALIDATION_CONFIG } from '../../utils/validation'

interface TableNumberStepProps {
  tableNumber: string
  tableError: string | null
  isPending: boolean
  formAction: (payload: FormData) => void
  onTableChange: (value: string) => void
}

export default function TableNumberStep({
  tableNumber,
  tableError,
  isPending,
  formAction,
  onTableChange,
}: TableNumberStepProps) {
  const { t } = useTranslation()

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="action" value="submit_table" />
      <div>
        <label className="block text-white text-sm font-medium mb-2">
          {t('joinTable.tableNumber')}
        </label>
        <input
          type="text"
          name="tableNumber"
          value={tableNumber}
          onChange={(e) => onTableChange(e.target.value)}
          placeholder={t('joinTable.tableNumberPlaceholder')}
          maxLength={VALIDATION_CONFIG.tableNumber.maxLength}
          className={`w-full bg-dark-card border rounded-xl px-4 py-3 text-white placeholder-dark-muted text-lg focus:outline-none transition-colors ${
            tableError ? 'border-red-500 focus:border-red-500' : 'border-dark-border focus:border-primary'
          }`}
          autoFocus
          disabled={isPending}
          aria-invalid={!!tableError}
          aria-describedby={tableError ? 'table-error' : undefined}
        />
        {tableError && (
          <p id="table-error" className="text-red-500 text-xs mt-1" role="alert">
            {t(tableError, { max: VALIDATION_CONFIG.tableNumber.maxLength })}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!tableNumber.trim() || isPending}
        className="w-full bg-primary hover:bg-primary/90 disabled:bg-dark-elevated disabled:text-dark-muted text-white font-semibold py-3 px-4 rounded-xl transition-colors"
      >
        {isPending ? t('common.loading') : t('common.continue')}
      </button>
    </form>
  )
}
