import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n' // Initialize i18n before app
import './index.css'
import App from './App'
import { initDeviceFingerprint } from './utils/deviceId'
import { initTheme } from './utils/theme'
import { logger } from './utils/logger'

// Initialize theme before rendering to avoid flash
initTheme()

// FASE 1: Initialize device fingerprint for cross-session recognition
// This runs async in the background and caches the result in localStorage
initDeviceFingerprint().catch((err) => logger.warn('Device fingerprint init failed', err))

// Initialize Web Vitals monitoring for PWA
// Collects metrics in sessionStorage for analysis
import('./utils/webVitals').then(({ reportWebVitals, consoleReporter, pwaMetricsCollector }) => {
  reportWebVitals((metric) => {
    // Development: log to console
    if (import.meta.env.DEV) {
      consoleReporter(metric)
    }
    // Always collect for analysis
    pwaMetricsCollector(metric)
  })
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found. Make sure there is an element with id="root" in your HTML.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
