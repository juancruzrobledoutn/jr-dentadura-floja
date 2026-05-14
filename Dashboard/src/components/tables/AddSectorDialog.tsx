/**
 * AddSectorDialog - Dialog for creating a custom sector
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useSectorStore } from '../../stores/sectorStore'

interface AddSectorDialogProps {
  isOpen: boolean
  onClose: () => void
  branchId: number
  onSuccess: () => void
}

/**
 * Generate a suggested prefix from sector name
 * Takes first letters of words, max 4 chars, uppercase
 */
function suggestPrefix(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) {
    // Single word: take first 3-4 chars
    return name.slice(0, 3).toUpperCase()
  }
  // Multiple words: take first letter of each word
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase()
}

export function AddSectorDialog({
  isOpen,
  onClose,
  branchId,
  onSuccess,
}: AddSectorDialogProps) {
  const createSector = useSectorStore((s) => s.createSector)
  const isLoading = useSectorStore((s) => s.isLoading)

  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  const handleClose = () => {
    setName('')
    setPrefix('')
    setError(null)
    onClose()
  }

  // Update prefix suggestion when name changes
  const handleNameChange = (value: string) => {
    setName(value)
    if (!prefix || prefix === suggestPrefix(name)) {
      setPrefix(suggestPrefix(value))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate
    if (!name.trim()) {
      setError('El nombre es requerido')
      return
    }

    const cleanPrefix = prefix.toUpperCase().trim()
    if (!cleanPrefix || !/^[A-Z]{2,4}$/.test(cleanPrefix)) {
      setError('El prefijo debe tener 2-4 letras')
      return
    }

    try {
      await createSector({
        branch_id: branchId,
        name: name.trim(),
        prefix: cleanPrefix,
      })
      handleClose()
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear sector')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Agregar Sector Personalizado"
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !name.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Creando...
              </>
            ) : (
              'Crear Sector'
            )}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error message */}
        {error && (
          <div className="p-3 bg-[var(--danger-border)]/10 border border-[var(--danger-border)]/30 rounded-lg text-[var(--danger-text)] text-sm">
            {error}
          </div>
        )}

        {/* Name field */}
        <div>
          <label htmlFor="sector-name" className="block text-sm font-medium text-[var(--text-tertiary)] mb-1">
            Nombre del Sector
          </label>
          <input
            id="sector-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ej: Patio Interno"
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary-500)] focus:ring-1 focus:ring-[var(--primary-500)]"
            autoFocus
          />
        </div>

        {/* Prefix field */}
        <div>
          <label htmlFor="sector-prefix" className="block text-sm font-medium text-[var(--text-tertiary)] mb-1">
            Prefijo para Codigos de Mesa
          </label>
          <input
            id="sector-prefix"
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="Ej: PAT"
            maxLength={4}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary-500)] focus:ring-1 focus:ring-[var(--primary-500)] uppercase"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Las mesas se nombraran como {prefix || 'XXX'}-01, {prefix || 'XXX'}-02, etc.
          </p>
        </div>
      </form>
    </Modal>
  )
}
