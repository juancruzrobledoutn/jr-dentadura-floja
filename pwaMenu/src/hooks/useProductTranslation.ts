import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Product } from '../types'

/**
 * Hook to translate product names and descriptions
 * Falls back to original values if translation not found
 */
export function useProductTranslation() {
  const { t, i18n } = useTranslation()

  const translateProduct = useCallback(
    (product: Product): Product => {
      const nameKey = `products.${product.id}.name`
      const descKey = `products.${product.id}.description`
      const badgeKey = product.badge ? `badges.${product.badge.toLowerCase().replace(' ', '')}` : null

      // Get translated values, fallback to original if key not found
      const translatedName = t(nameKey, { defaultValue: product.name })
      const translatedDescription = t(descKey, { defaultValue: product.description })
      const translatedBadge = badgeKey ? t(badgeKey, { defaultValue: product.badge }) : product.badge

      return {
        ...product,
        name: translatedName,
        description: translatedDescription,
        badge: translatedBadge,
      }
    },
    [t]
  )

  const translateProducts = useCallback(
    (products: Product[]): Product[] => {
      return products.map(translateProduct)
    },
    [translateProduct]
  )

  return {
    translateProduct,
    translateProducts,
    currentLanguage: i18n.language,
  }
}
