/**
 * Store for managing product customization options (modifiers like "sin cebolla", "extra queso").
 * Allows ADMIN/MANAGER to create reusable options and link them to products.
 */

import { create } from 'zustand'
import {
  customizationAPI,
  type CustomizationOption,
  type CustomizationOptionCreate,
  type CustomizationOptionUpdate,
} from '../services/api'
import { handleError } from '../utils/logger'

interface CustomizationState {
  // Data
  options: CustomizationOption[]

  // Loading states
  isLoading: boolean
  isSaving: boolean
  error: string | null

  // Actions
  fetchOptions: () => Promise<void>
  createOption: (data: CustomizationOptionCreate) => Promise<CustomizationOption>
  updateOption: (id: number, data: CustomizationOptionUpdate) => Promise<CustomizationOption>
  deleteOption: (id: number) => Promise<void>
  setProductLinks: (optionId: number, productIds: number[]) => Promise<CustomizationOption>
}

export const useCustomizationStore = create<CustomizationState>()((set) => ({
  options: [],
  isLoading: false,
  isSaving: false,
  error: null,

  fetchOptions: async () => {
    set({ isLoading: true, error: null })
    try {
      const options = await customizationAPI.list()
      set({ options, isLoading: false })
    } catch (error) {
      const message = handleError(error, 'CustomizationStore.fetchOptions')
      set({ error: message, isLoading: false })
    }
  },

  createOption: async (data: CustomizationOptionCreate) => {
    set({ isSaving: true, error: null })
    try {
      const created = await customizationAPI.create(data)
      set((state) => ({
        options: [...state.options, created],
        isSaving: false,
      }))
      return created
    } catch (error) {
      const message = handleError(error, 'CustomizationStore.createOption')
      set({ error: message, isSaving: false })
      throw error
    }
  },

  updateOption: async (id: number, data: CustomizationOptionUpdate) => {
    set({ isSaving: true, error: null })
    try {
      const updated = await customizationAPI.update(id, data)
      set((state) => ({
        options: state.options.map((opt) => (opt.id === id ? updated : opt)),
        isSaving: false,
      }))
      return updated
    } catch (error) {
      const message = handleError(error, 'CustomizationStore.updateOption')
      set({ error: message, isSaving: false })
      throw error
    }
  },

  deleteOption: async (id: number) => {
    set({ isSaving: true, error: null })
    try {
      await customizationAPI.delete(id)
      set((state) => ({
        options: state.options.filter((opt) => opt.id !== id),
        isSaving: false,
      }))
    } catch (error) {
      const message = handleError(error, 'CustomizationStore.deleteOption')
      set({ error: message, isSaving: false })
      throw error
    }
  },

  setProductLinks: async (optionId: number, productIds: number[]) => {
    set({ isSaving: true, error: null })
    try {
      const updated = await customizationAPI.setProductLinks(optionId, productIds)
      set((state) => ({
        options: state.options.map((opt) => (opt.id === optionId ? updated : opt)),
        isSaving: false,
      }))
      return updated
    } catch (error) {
      const message = handleError(error, 'CustomizationStore.setProductLinks')
      set({ error: message, isSaving: false })
      throw error
    }
  },
}))

// Selectors
export const selectCustomizationOptions = (state: CustomizationState) => state.options
export const selectIsLoading = (state: CustomizationState) => state.isLoading
export const selectIsSaving = (state: CustomizationState) => state.isSaving
export const selectError = (state: CustomizationState) => state.error
