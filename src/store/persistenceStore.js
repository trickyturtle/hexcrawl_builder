import { create } from 'zustand'

export const usePersistenceStore = create((set) => ({
  dirHandle: null,
  lastSaved: null,
  isSaving: false,
  isLoading: false,
  error: null,

  setDirHandle: (dirHandle) => set({ dirHandle, error: null }),
  markSaved: () => set({ lastSaved: new Date(), isSaving: false, error: null }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isSaving: false, isLoading: false }),
  clearError: () => set({ error: null }),
}))
