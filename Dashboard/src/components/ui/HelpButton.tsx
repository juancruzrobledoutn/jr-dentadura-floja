import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './Modal'
import { Button } from './Button'

interface HelpButtonProps {
  title: string
  content: React.ReactNode
  size?: 'sm' | 'md'
}

const sizeClasses = {
  sm: 'w-5 h-5 text-xs',
  md: 'w-8 h-8 text-lg',
}

export function HelpButton({ title, content, size = 'md' }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(true)
        }}
        className={`${sizeClasses[size]} bg-[var(--danger-border)] hover:bg-red-600 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-zinc-900`}
        aria-label={`Ayuda sobre ${title}`}
      >
        <span className="text-[var(--text-primary)] font-bold">?</span>
      </button>

      {createPortal(
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={`Ayuda: ${title}`}
          size="lg"
          footer={
            <Button onClick={() => setIsOpen(false)}>
              Entendido
            </Button>
          }
        >
          <div className="prose prose-invert prose-zinc max-w-none">
            {content}
          </div>
        </Modal>,
        document.body
      )}
    </>
  )
}
