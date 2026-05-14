import { useEffect } from 'react'

/**
 * REACT 19: Document metadata management
 * Updates the document title based on the current page
 *
 * @param title - Page title to display
 * @param includeAppName - Whether to append the app name (default: true)
 */
export function useDocumentTitle(title: string, includeAppName = true): void {
  useEffect(() => {
    const fullTitle = includeAppName ? `${title} - Buen Sabor Dashboard` : title
    document.title = fullTitle
  }, [title, includeAppName])
}
