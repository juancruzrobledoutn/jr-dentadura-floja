import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

/**
 * Hook that syncs with OS color scheme preference.
 * Returns 'light' or 'dark' based on system preference.
 * Defaults to 'dark' if media query is not supported.
 */
export function useSystemTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check if matchMedia is supported
    if (typeof window === 'undefined' || !window.matchMedia) {
      return 'dark'
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    return mediaQuery.matches ? 'dark' : 'light'
  })

  useEffect(() => {
    // Guard for SSR and unsupported browsers
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'dark' : 'light')
    }

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange)

    // Cleanup listener on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return theme
}
