/**
 * Theme toggle utility for light/dark mode switching.
 * Persists preference to localStorage and applies via data-theme attribute.
 */

export type Theme = 'light' | 'dark'

const THEME_KEY = 'pwaWaiter-theme'

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null
    return stored === 'light' || stored === 'dark' ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // localStorage unavailable
  }
  document.documentElement.dataset.theme = theme
}

export function toggleTheme(): Theme {
  const current = getTheme()
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/**
 * Initialize theme on app load.
 * Call this once from main.tsx before rendering.
 */
export function initTheme(): void {
  setTheme(getTheme())
}
