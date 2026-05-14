import { useState } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { Button } from './Button'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  label?: string
  error?: string
  disabled?: boolean
}

// Allowed protocols for image URLs (security: prevent javascript: and data: XSS)
const ALLOWED_PROTOCOLS = ['https:', 'http:']

// Validate and sanitize image URL
function sanitizeImageUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)

    // Only allow http/https protocols (blocks javascript:, data:, etc.)
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return null
    }

    // Return the sanitized URL
    return parsed.href
  } catch {
    // Invalid URL
    return null
  }
}

export function ImageUpload({
  value,
  onChange,
  label,
  error,
  disabled = false,
}: ImageUploadProps) {
  const [inputUrl, setInputUrl] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [imageError, setImageError] = useState(false)

  const handleUrlSubmit = () => {
    const sanitized = sanitizeImageUrl(inputUrl)
    if (sanitized) {
      onChange(sanitized)
      setInputUrl('')
      setShowInput(false)
      setUrlError('')
      setImageError(false)
    } else {
      setUrlError('URL invalida. Usa una URL http:// o https://')
    }
  }

  const handleRemove = () => {
    onChange('')
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
          {label}
        </label>
      )}

      {value ? (
        <div className="relative group">
          {imageError ? (
            <div className="w-full h-40 flex items-center justify-center bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-default)]">
              <div className="text-center text-[var(--text-muted)]">
                <ImageIcon className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm">Error al cargar imagen</p>
              </div>
            </div>
          ) : (
            <img
              src={value}
              alt={label ? `Vista previa de ${label}` : 'Vista previa de imagen'}
              className="w-full h-40 object-cover rounded-lg border border-[var(--border-default)]"
              onError={() => setImageError(true)}
            />
          )}
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                handleRemove()
                setImageError(false)
              }}
              className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Eliminar imagen"
            >
              <X className="w-4 h-4 text-[var(--text-primary)]" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : showInput ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value)
                setUrlError('')
              }}
              placeholder="https://example.com/image.jpg"
              className={`flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border rounded-lg text-[var(--text-primary)] placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)] disabled:opacity-50 disabled:cursor-not-allowed ${
                urlError ? 'border-[var(--danger-border)]' : 'border-[var(--border-default)]'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUrlSubmit()
                }
              }}
              aria-describedby={urlError ? 'url-error' : undefined}
              disabled={disabled}
            />
            <Button type="button" onClick={handleUrlSubmit} disabled={disabled}>
              Agregar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowInput(false)
                setUrlError('')
                setInputUrl('')
              }}
            >
              Cancelar
            </Button>
          </div>
          {urlError && (
            <p id="url-error" className="text-sm text-[var(--danger-icon)]">
              {urlError}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          disabled={disabled}
          aria-label="Agregar imagen usando URL"
          className={`
            w-full h-40 flex flex-col items-center justify-center gap-2
            border-2 border-dashed rounded-lg
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              error
                ? 'border-[var(--danger-border)] bg-[var(--danger-border)]/5'
                : 'border-[var(--border-default)] bg-[var(--bg-tertiary)]/50 hover:border-[var(--border-emphasis)] hover:bg-[var(--bg-tertiary)] disabled:hover:border-[var(--border-default)] disabled:hover:bg-[var(--bg-tertiary)]/50'
            }
          `}
        >
          <div className="p-3 bg-[var(--bg-tertiary)] rounded-full">
            <Upload className="w-6 h-6 text-[var(--text-tertiary)]" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Agregar imagen
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">URL de imagen</p>
          </div>
        </button>
      )}

      {error && <p className="mt-1 text-sm text-[var(--danger-icon)]">{error}</p>}

      {value && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <ImageIcon className="w-3 h-3" aria-hidden="true" />
          <span className="truncate">{value}</span>
        </div>
      )}
    </div>
  )
}
