import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// SPRINT 6: Environment configuration
import { validateEnv, logEnvConfig } from './config/env'

// PWA: Register service worker
import { registerSW } from 'virtual:pwa-register'
import { logger } from './utils/logger'

// i18n initialization (must run before React render)
import './i18n'

// Theme initialization (must run before render to avoid FOUC)
import { initTheme } from './utils/theme'
initTheme()

// Validate environment variables on startup
validateEnv()

// Log environment config in development
logEnvConfig()

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // Auto-update without prompting user
    updateSW(true)
  },
  onOfflineReady() {
    logger.info('PWA', 'App ready to work offline')
  },
})

// Initialize Web Vitals monitoring (development only)
if (import.meta.env.DEV) {
  import('./utils/webVitals').then(({ reportWebVitals, consoleReporter }) => {
    reportWebVitals(consoleReporter)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
