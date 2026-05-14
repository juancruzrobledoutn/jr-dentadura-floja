/**
 * Response handlers for AI Chat using Strategy Pattern
 *
 * Each handler has:
 * - keywords: Array of trigger words (multilingual)
 * - getResponse: Function that returns content and products
 */

import { useMenuStore } from '../../stores/menuStore'
import type { Product } from '../../types'
import type { ProductFrontend, CategoryFrontend } from '../../types/backend'

type TFunction = (key: string, options?: Record<string, unknown>) => string

interface ResponseResult {
  content: string
  products?: Product[]
}

interface ResponseHandler {
  keywords: string[]
  getResponse: (t: TFunction, query: string, products: Product[], categories: CategoryFrontend[]) => ResponseResult | null
}

// Convert backend product to frontend format
function convertProduct(prod: ProductFrontend): Product {
  return {
    id: String(prod.id),
    name: prod.name,
    description: prod.description || '',
    price: prod.price,
    image: prod.image || undefined,
    category_id: String(prod.categoryId),
    subcategory_id: prod.subcategoryId ? String(prod.subcategoryId) : '',
    featured: prod.featured,
    popular: prod.popular,
    badge: prod.badge || undefined,
    allergen_ids: prod.allergenIds?.map(String),
    use_branch_prices: false,
  }
}

const handlers: ResponseHandler[] = [
  // Recommend / Popular
  {
    keywords: ['recomienda', 'popular', 'mejor', 'sugerir', 'recommend', 'best'],
    getResponse: (t, _query, products) => ({
      content: t('ai.responses.recommend'),
      products: products.filter(p => p.popular).slice(0, 3),
    }),
  },

  // Vegan / Vegetarian
  {
    keywords: ['vegano', 'vegetariano', 'vegan', 'vegetarian'],
    getResponse: (t, _query, products) => {
      const vegan = products.filter(
        p => p.badge === 'VEGAN' || p.name.toLowerCase().includes('veggie')
      )
      if (vegan.length > 0) {
        return { content: t('ai.responses.vegan'), products: vegan }
      }
      return { content: t('ai.responses.veganSingle') }
    },
  },

  // Cheap / Affordable
  {
    keywords: ['barato', 'economico', 'precio', 'cheap', 'affordable', 'price'],
    getResponse: (t, _query, products) => ({
      content: t('ai.responses.cheap'),
      products: [...products].sort((a, b) => a.price - b.price).slice(0, 3),
    }),
  },

  // Premium / Expensive
  {
    keywords: ['caro', 'premium', 'especial', 'expensive'],
    getResponse: (t, _query, products) => ({
      content: t('ai.responses.premium'),
      products: [...products].sort((a, b) => b.price - a.price).slice(0, 3),
    }),
  },

  // Drinks - find category by name containing 'bebida' or 'drink'
  {
    keywords: ['bebida', 'tomar', 'beber', 'drink', 'beverage'],
    getResponse: (t, _query, products, categories) => {
      const drinkCategory = categories.find(c =>
        c.name.toLowerCase().includes('bebida') ||
        c.name.toLowerCase().includes('drink')
      )
      const drinks = drinkCategory
        ? products.filter(p => p.category_id === String(drinkCategory.id))
        : []
      return {
        content: t('ai.responses.drinks'),
        products: drinks.slice(0, 4),
      }
    },
  },

  // Desserts - find category by name containing 'postre' or 'dessert'
  {
    keywords: ['postre', 'dulce', 'chocolate', 'dessert', 'sweet', 'sobremesa'],
    getResponse: (t, _query, products, categories) => {
      const dessertCategory = categories.find(c =>
        c.name.toLowerCase().includes('postre') ||
        c.name.toLowerCase().includes('dessert')
      )
      const desserts = dessertCategory
        ? products.filter(p => p.category_id === String(dessertCategory.id))
        : []
      return {
        content: t('ai.responses.desserts'),
        products: desserts.slice(0, 4),
      }
    },
  },

  // Food / Main dishes - find category by name
  {
    keywords: ['comida', 'plato', 'comer', 'food', 'dish', 'eat'],
    getResponse: (t, _query, products, categories) => {
      const foodCategory = categories.find(c =>
        c.name.toLowerCase().includes('plato') ||
        c.name.toLowerCase().includes('comida') ||
        c.name.toLowerCase().includes('food')
      )
      const food = foodCategory
        ? products.filter(p => p.category_id === String(foodCategory.id))
        : products.slice(0, 4)
      return {
        content: t('ai.responses.food'),
        products: food.slice(0, 4),
      }
    },
  },

  // Burger
  {
    keywords: ['burger', 'hamburguesa'],
    getResponse: (t, _query, products) => {
      const burger = products.find(p => p.name.toLowerCase().includes('burger'))
      if (burger) {
        return { content: t('ai.responses.burger'), products: [burger] }
      }
      return null
    },
  },

  // Pasta
  {
    keywords: ['pasta', 'carbonara'],
    getResponse: (t, _query, products) => {
      const pasta = products.find(
        p => p.name.toLowerCase().includes('pasta') || p.name.toLowerCase().includes('carbonara')
      )
      if (pasta) {
        return { content: t('ai.responses.pasta'), products: [pasta] }
      }
      return null
    },
  },

  // Salmon / Fish
  {
    keywords: ['salmon', 'pescado', 'fish', 'peixe'],
    getResponse: (t, _query, products) => {
      const salmon = products.find(p => p.name.toLowerCase().includes('salmon'))
      if (salmon) {
        return { content: t('ai.responses.salmon'), products: [salmon] }
      }
      return null
    },
  },

  // Menu overview
  {
    keywords: ['menu', 'carta', 'tienen', 'cardápio'],
    getResponse: (t, _query, products, categories) => ({
      content: t('ai.responses.menu', {
        categories: categories.length,
        categoryNames: categories.map(c => c.name).join(', '),
        products: products.length,
      }),
    }),
  },

  // Greeting
  {
    keywords: ['hola', 'buenas', 'hey', 'hello', 'hi', 'olá', 'oi'],
    getResponse: (t) => ({
      content: t('ai.responses.greeting'),
    }),
  },
]

/**
 * Generate AI response based on user query
 * Uses strategy pattern to match query against handlers
 * Uses data from menuStore (backend)
 */
export function generateMockResponse(query: string, t: TFunction): ResponseResult {
  const lowerQuery = query.toLowerCase()

  // Get data from menuStore
  const state = useMenuStore.getState()
  const backendProducts = state.products
  const categories = state.categories

  // Convert backend products to frontend format
  const products: Product[] = backendProducts.map(convertProduct)

  // Find first matching handler
  for (const handler of handlers) {
    const matches = handler.keywords.some(keyword => lowerQuery.includes(keyword))
    if (matches) {
      const result = handler.getResponse(t, query, products, categories)
      if (result) return result
    }
  }

  // Default response
  return {
    content: t('ai.responses.default'),
    products: products.slice(0, 3),
  }
}
