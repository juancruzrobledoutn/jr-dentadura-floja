/**
 * AIChat - AI-powered chat assistant for menu recommendations
 *
 * Refactored from 376-line component:
 * - Extracted generateMockResponse to responseHandlers.ts using strategy pattern
 * - Improved code organization
 * - Uses React 19 useActionState for form handling
 * - Connected to real backend RAG endpoint with mock fallback
 */

import { useState, useRef, useEffect, useActionState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useEscapeKey } from '../../hooks'
import { getSafeImageUrl } from '../../utils/validation'
import { generateMockResponse } from './responseHandlers'
import { api } from '../../services/api'
import { apiLogger } from '../../utils/logger'
import type { Product } from '../../types'

interface AIChatProps {
  isOpen: boolean
  onClose: () => void
  onProductClick?: (product: Product) => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
}

// React 19: Form state type for useActionState
interface ChatFormState {
  messages: Message[]
  error: string | null
}

// Unique ID generator using closure
// LOW PRIORITY FIX: Reset counter periodically to keep IDs short
const createMessageIdGenerator = () => {
  let counter = 0
  let lastReset = Date.now()

  return () => {
    const now = Date.now()
    // Reset counter every minute to prevent unbounded growth
    if (now - lastReset > 60000) {
      counter = 0
      lastReset = now
    }
    return `msg-${now}-${++counter}`
  }
}

export default function AIChat({ isOpen, onClose, onProductClick }: AIChatProps) {
  const { t } = useTranslation()
  const [generateMessageId] = useState(createMessageIdGenerator)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // React 19: useActionState for chat form handling
  const [formState, formAction, isPending] = useActionState(
    async (prevState: ChatFormState, formData: FormData): Promise<ChatFormState> => {
      try {
        const messageValue = formData.get('message')
        const messageText = typeof messageValue === 'string' ? messageValue.trim() : ''

        if (!messageText) {
          return prevState
        }

        const userMessage: Message = {
          id: generateMessageId(),
          role: 'user',
          content: messageText
        }

        // Add user message immediately
        const messagesWithUser = [...prevState.messages, userMessage]

        // Try to use real backend, fallback to mock
        let responseContent: string
        let responseProducts: Product[] | undefined

        try {
          // Call real backend RAG endpoint
          const chatResponse = await api.chat(messageText)
          responseContent = chatResponse.answer

          // Log confidence for debugging
          if (chatResponse.confidence < 0.3) {
            apiLogger.debug('Low confidence response', { confidence: chatResponse.confidence })
          }

          // Products from RAG are not included in response yet
          // (would need to fetch from product IDs in sources)
          responseProducts = undefined
        } catch (apiError) {
          // Fallback to mock response if backend unavailable
          apiLogger.warn('RAG backend unavailable, using mock response', apiError)
          const mockResponse = generateMockResponse(messageText, t)
          responseContent = mockResponse.content
          responseProducts = mockResponse.products
        }

        const assistantMessage: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: responseContent,
          products: responseProducts
        }

        return {
          messages: [...messagesWithUser, assistantMessage],
          error: null
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'errors.unknownError'
        return { ...prevState, error: errorMessage }
      }
    },
    { messages: [{ id: 'welcome', role: 'assistant', content: t('ai.welcome') }], error: null }
  )

  // Use escape key hook for consistency
  useEscapeKey({
    enabled: isOpen,
    onEscape: onClose,
    disabled: isPending,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [formState.messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Fill input with suggestion text
  const handleSuggestion = useCallback((text: string) => {
    if (inputRef.current) {
      inputRef.current.value = text
      inputRef.current.focus()
    }
  }, [])

  // Reset form after submission completes
  const handleFormAction = useCallback((formData: FormData) => {
    formAction(formData)
    // Reset form after submission starts
    formRef.current?.reset()
  }, [formAction])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-dark-bg">
      <ChatHeader onClose={onClose} isPending={isPending} />

      <MessageList
        messages={formState.messages}
        isTyping={isPending}
        messagesEndRef={messagesEndRef}
        onProductClick={onProductClick}
      />

      {formState.messages.length === 1 && (
        <SuggestionChips onSuggestion={handleSuggestion} />
      )}

      <ChatInput
        formRef={formRef}
        inputRef={inputRef}
        isPending={isPending}
        formAction={handleFormAction}
      />
    </div>
  )
}

function ChatHeader({ onClose, isPending }: { onClose: () => void; isPending: boolean }) {
  const { t } = useTranslation()

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bg safe-area-top">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
          <svg className="w-5 h-5 text-dark-bg" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-white font-semibold">{t('ai.title')}</h1>
          <p className="text-dark-muted text-xs">{t('ai.subtitle')}</p>
        </div>
      </div>
      <button
        onClick={onClose}
        disabled={isPending}
        className="w-10 h-10 rounded-full hover:bg-dark-elevated flex items-center justify-center transition-colors disabled:opacity-50"
        aria-label={t('ai.closeChat')}
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>
  )
}

interface MessageListProps {
  messages: Message[]
  isTyping: boolean
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  onProductClick?: (product: Product) => void
}

function MessageList({ messages, isTyping, messagesEndRef, onProductClick }: MessageListProps) {
  const { t } = useTranslation()

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      role="log"
      aria-live="polite"
      aria-label={t('ai.messageHistory')}
    >
      {messages.map(message => (
        <MessageBubble key={message.id} message={message} onProductClick={onProductClick} />
      ))}

      {isTyping && <TypingIndicator />}

      <div ref={messagesEndRef} />
    </div>
  )
}

function MessageBubble({
  message,
  onProductClick
}: {
  message: Message
  onProductClick?: (product: Product) => void
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser ? 'bg-white text-dark-bg' : 'bg-dark-card text-white'
        }`}
      >
        <p className="text-sm leading-relaxed">{message.content}</p>

        {message.products && message.products.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.products.map(product => (
              <ProductCard key={product.id} product={product} onClick={onProductClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProductCard({
  product,
  onClick
}: {
  product: Product
  onClick?: (product: Product) => void
}) {
  return (
    <button
      onClick={() => onClick?.(product)}
      className="w-full flex items-center gap-3 bg-dark-elevated rounded-xl p-2 hover:bg-dark-border transition-colors text-left"
    >
      <img
        src={getSafeImageUrl(product.image, 'product')}
        alt={product.name}
        className="w-12 h-12 rounded-lg object-cover"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{product.name}</p>
        <p className="text-dark-muted text-xs truncate">{product.description}</p>
      </div>
      <span className="text-white text-sm font-semibold">${product.price.toFixed(2)}</span>
    </button>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-dark-card rounded-2xl px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-dark-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-dark-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-dark-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function SuggestionChips({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const { t } = useTranslation()
  const suggestions = [
    { key: 'recommend', label: t('ai.suggestions.recommend') },
    { key: 'vegetarian', label: t('ai.suggestions.vegetarian') },
    { key: 'desserts', label: t('ai.suggestions.desserts') },
    { key: 'drinks', label: t('ai.suggestions.drinks') }
  ]

  return (
    <div className="px-4 pb-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map(suggestion => (
          <button
            key={suggestion.key}
            onClick={() => onSuggestion(suggestion.label)}
            className="px-3 py-1.5 text-xs border border-dark-border rounded-full text-dark-muted hover:text-white hover:border-white transition-colors"
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface ChatInputProps {
  formRef: React.RefObject<HTMLFormElement | null>
  inputRef: React.RefObject<HTMLInputElement | null>
  isPending: boolean
  formAction: (payload: FormData) => void
}

function ChatInput({ formRef, inputRef, isPending, formAction }: ChatInputProps) {
  const { t } = useTranslation()
  // Track if input has value for submit button state
  const [hasValue, setHasValue] = useState(false)

  return (
    <form
      ref={formRef}
      action={formAction}
      className="px-4 pb-4 pt-2 border-t border-dark-border bg-dark-bg safe-area-bottom"
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          name="message"
          onChange={e => setHasValue(e.target.value.trim().length > 0)}
          placeholder={t('ai.placeholder')}
          className="flex-1 bg-dark-card border border-dark-border rounded-full px-4 py-3 text-white text-sm placeholder:text-dark-muted focus:outline-none focus:border-white transition-colors"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={!hasValue || isPending}
          className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:hover:bg-white"
          aria-label={t('ai.sendMessage')}
        >
          <svg className="w-5 h-5 text-dark-bg" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </form>
  )
}
