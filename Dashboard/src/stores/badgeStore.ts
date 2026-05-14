import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProductBadge, BadgeFormData } from '../types'
import { STORAGE_KEYS, STORE_VERSIONS } from '../utils/constants'

interface BadgeState {
  badges: ProductBadge[]
  // Actions
  setBadges: (badges: ProductBadge[]) => void
  addBadge: (data: BadgeFormData) => ProductBadge
  updateBadge: (id: string, data: Partial<BadgeFormData>) => void
  deleteBadge: (id: string) => void
}

const generateId = () => crypto.randomUUID()

// Initial common badges
const initialBadges: ProductBadge[] = [
  {
    id: 'badge-1',
    name: 'Nuevo',
    color: '#22c55e',
    is_active: true,
  },
  {
    id: 'badge-2',
    name: 'Popular',
    color: '#f97316',
    is_active: true,
  },
  {
    id: 'badge-3',
    name: 'Chef\'s Choice',
    color: '#eab308',
    is_active: true,
  },
  {
    id: 'badge-4',
    name: 'Especial del Día',
    color: '#8b5cf6',
    is_active: true,
  },
]

export const useBadgeStore = create<BadgeState>()(
  persist(
    (set) => ({
      badges: initialBadges,

      setBadges: (badges) => set({ badges }),

      addBadge: (data) => {
        const newBadge: ProductBadge = {
          id: generateId(),
          ...data,
          is_active: data.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ badges: [...state.badges, newBadge] }))
        return newBadge
      },

      updateBadge: (id, data) =>
        set((state) => ({
          badges: state.badges.map((badge) =>
            badge.id === id
              ? { ...badge, ...data, updated_at: new Date().toISOString() }
              : badge
          ),
        })),

      deleteBadge: (id) =>
        set((state) => ({
          badges: state.badges.filter((badge) => badge.id !== id),
        })),
    }),
    {
      name: STORAGE_KEYS.BADGES,
      version: STORE_VERSIONS.BADGES,
      migrate: (persistedState, version) => {
        const persisted = persistedState as { badges: ProductBadge[] }

        // Ensure badges array exists
        if (!Array.isArray(persisted.badges)) {
          return { badges: initialBadges }
        }

        let badges = persisted.badges

        // Version 1: Non-destructive merge - only add missing initial badges
        if (version < 1) {
          const existingIds = new Set(badges.map(b => b.id))
          const missingBadges = initialBadges.filter(b => !existingIds.has(b.id))
          badges = [...badges, ...missingBadges]
        }

        return { badges }
      },
    }
  )
)

// Selectors
export const selectBadges = (state: BadgeState) => state.badges
