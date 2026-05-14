import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ToastContainer, Modal } from '../ui'
import { useInitializeData } from '../../hooks/useInitializeData'
import { useWebSocketConnection } from '../../hooks/useWebSocketConnection'
import { useAdminWebSocket } from '../../hooks/useAdminWebSocket'
import { useTableWebSocket } from '../../hooks/useTableWebSocket'
import { useIdleTimeout } from '../../hooks/useIdleTimeout'
import { useAuthStore } from '../../stores/authStore'

export function Layout() {
  // Load data from backend API on mount
  useInitializeData()

  // AUDIT FIX: Connect WebSocket globally when authenticated
  useWebSocketConnection()

  // AUDIT FIX: Subscribe to admin CRUD events for real-time sync
  useAdminWebSocket()

  // FIX: Subscribe to table events (ROUND_SUBMITTED, CHECK_REQUESTED, etc.)
  // This enables real-time order updates from pwaMenu
  useTableWebSocket()

  // Idle timeout warning modal
  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const logout = useAuthStore((s) => s.logout)

  const handleIdleWarning = useCallback(() => {
    setShowIdleWarning(true)
  }, [])

  const handleIdleTimeout = useCallback(() => {
    setShowIdleWarning(false)
    logout()
  }, [logout])

  const handleDismissWarning = useCallback(() => {
    setShowIdleWarning(false)
  }, [])

  useIdleTimeout({
    onWarning: handleIdleWarning,
    onTimeout: handleIdleTimeout,
  })

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--primary-500)] focus:text-[var(--text-primary)] focus:rounded-lg focus:outline-none"
      >
        Saltar al contenido principal
      </a>
      <Sidebar />
      <main id="main-content" className="ml-64 min-h-screen" role="main">
        <Outlet />
      </main>
      <ToastContainer />

      {/* Idle timeout warning modal */}
      <Modal
        isOpen={showIdleWarning}
        onClose={handleDismissWarning}
        title="Sesion inactiva"
        size="sm"
        footer={
          <button
            type="button"
            onClick={handleDismissWarning}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Seguir trabajando
          </button>
        }
      >
        <p className="text-[var(--text-secondary)]">
          Tu sesion expirara en 5 minutos por inactividad. Hace clic en
          &quot;Seguir trabajando&quot; para mantener tu sesion activa.
        </p>
      </Modal>
    </div>
  )
}
