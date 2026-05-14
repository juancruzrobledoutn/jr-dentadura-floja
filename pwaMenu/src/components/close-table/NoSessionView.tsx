interface NoSessionViewProps {
  onBack: () => void
}

export function NoSessionView({ onBack }: NoSessionViewProps) {
  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center p-4 overflow-x-hidden w-full max-w-full">
      <div className="w-16 h-16 rounded-full bg-dark-card flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-dark-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <p className="text-dark-muted text-center mb-4">No hay sesion activa</p>
      <button
        onClick={onBack}
        className="bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
      >
        Volver al inicio
      </button>
    </div>
  )
}
