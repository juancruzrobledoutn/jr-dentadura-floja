import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './ui/Modal'
import { dinerAPI } from '../services/api'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Simple feedback modal: 5 stars + optional comment.
 * Shown after session transitions to PAYING/CLOSED.
 */
export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { t } = useTranslation()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (rating === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await dinerAPI.submitFeedback({
        rating,
        comment: comment.trim() || undefined,
      })
      setSubmitted(true)
    } catch {
      setError(t('feedback.error', 'No se pudo enviar. Intenta de nuevo.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} mobileAlign="center">
      <h2 className="text-lg font-bold text-white text-center mb-4">
        {t('feedback.title', 'Tu opinion nos importa')}
      </h2>
      {submitted ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">&#10003;</div>
          <p className="text-white font-semibold">
            {t('feedback.thanks', 'Gracias por tu opinion!')}
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2 rounded-lg bg-orange-500 text-white font-medium"
          >
            {t('feedback.close', 'Cerrar')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Star Rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                aria-label={`${star} ${t('feedback.stars', 'estrellas')}`}
              >
                <span className={star <= (hovered || rating) ? 'text-yellow-400' : 'text-gray-500'}>
                  &#9733;
                </span>
              </button>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400">
            {rating > 0
              ? t('feedback.ratingSelected', { count: rating, defaultValue: `${rating} estrellas` })
              : t('feedback.selectRating', 'Selecciona una calificacion')}
          </p>

          {/* Optional Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('feedback.commentPlaceholder', 'Comentario opcional...')}
            className="w-full px-3 py-2 rounded-lg bg-dark-elevated border border-dark-border text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            rows={3}
            maxLength={500}
          />

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
              rating === 0 || submitting
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {submitting
              ? t('feedback.sending', 'Enviando...')
              : t('feedback.submit', 'Enviar opinion')}
          </button>
        </div>
      )}
    </Modal>
  )
}
