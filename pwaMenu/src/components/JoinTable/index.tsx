/**
 * JoinTable - Entry point for table joining flow
 *
 * Two-step flow:
 * - TableNumberStep: Enter table number
 * - NameStep: Enter diner name (optional)
 */

import { useState, useActionState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTableStore } from '../../stores/tableStore'
import { validateTableNumber, validateDinerName } from '../../utils/validation'
import LanguageSelector from '../LanguageSelector'
import TableNumberStep from './TableNumberStep'
import NameStep from './NameStep'
import SharedCartInfo from './SharedCartInfo'

interface JoinTableProps {
  defaultTableNumber?: string
}

interface FormState {
  step: 'table' | 'name'
  tableNumber: string
  dinerName: string
  tableError: string | null
  nameError: string | null
}

export default function JoinTable({ defaultTableNumber = '' }: JoinTableProps) {
  const { t } = useTranslation()
  const joinTable = useTableStore((state) => state.joinTable)

  const initialState: FormState = {
    step: defaultTableNumber ? 'name' : 'table',
    tableNumber: defaultTableNumber,
    dinerName: '',
    tableError: null,
    nameError: null,
  }

  const [formState, formAction, isPending] = useActionState(
    async (prevState: FormState, formData: FormData): Promise<FormState> => {
      const actionValue = formData.get('action')
      const action = typeof actionValue === 'string' ? actionValue : ''
      const tableNumberValue = formData.get('tableNumber')
      const tableNumber = typeof tableNumberValue === 'string' ? tableNumberValue : prevState.tableNumber
      const dinerNameValue = formData.get('dinerName')
      const dinerName = typeof dinerNameValue === 'string' ? dinerNameValue : ''

      if (action === 'submit_table') {
        const validation = validateTableNumber(tableNumber)
        if (!validation.isValid) {
          return { ...prevState, tableNumber, tableError: validation.error }
        }
        return { ...prevState, step: 'name', tableNumber: tableNumber.trim(), tableError: null }
      }

      if (action === 'join_table') {
        const validation = validateDinerName(dinerName)
        if (!validation.isValid) {
          return { ...prevState, dinerName, nameError: validation.error }
        }

        // ERROR HANDLING: Wrap joinTable in try-catch to handle potential errors
        try {
          // joinTable is now async - await it
          await joinTable(
            prevState.tableNumber.trim(),
            `Mesa ${prevState.tableNumber}`,
            dinerName.trim() || undefined,
            undefined
          )
          return { ...prevState, dinerName: dinerName.trim(), nameError: null }
        } catch (error) {
          // ERROR HANDLING: Display error if joinTable fails
          const errorMessage = error instanceof Error ? error.message : 'errors.joinTableFailed'
          return { ...prevState, dinerName, nameError: errorMessage }
        }
      }

      if (action === 'change_table') {
        return { ...prevState, step: 'table', tableError: null, nameError: null }
      }

      return prevState
    },
    initialState
  )

  // Controlled input state
  const [tableNumber, setTableNumber] = useState(() => formState.tableNumber)
  const [dinerName, setDinerName] = useState(() => formState.dinerName)

  // Derived table number for display - use formState as source of truth when on table step
  const displayTableNumber = formState.step === 'name' ? formState.tableNumber : tableNumber

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center px-4 sm:px-6 overflow-x-hidden w-full max-w-full">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            {t('app.title')}<span className="text-primary">/</span>
          </h1>
          <p className="text-dark-muted mt-2 text-sm sm:text-base">
            {t('app.subtitle')}
          </p>
        </div>

        {formState.step === 'table' ? (
          <TableNumberStep
            tableNumber={displayTableNumber}
            tableError={formState.tableError}
            isPending={isPending}
            formAction={formAction}
            onTableChange={setTableNumber}
          />
        ) : (
          <NameStep
            tableNumber={formState.tableNumber}
            dinerName={dinerName}
            nameError={formState.nameError}
            isPending={isPending}
            formAction={formAction}
            onNameChange={setDinerName}
          />
        )}

        <SharedCartInfo />
      </div>
    </div>
  )
}
