import { create } from 'zustand'

// Connection state for the user's Obsidian vault. The handle and index live
// only for the session (File System Access handles don't survive reloads
// without IndexedDB persistence); the app works fully without a vault.
export const useVaultStore = create((set) => ({
  vaultHandle: null,
  vaultName: null,
  noteIndex: null, // { byName, byPath, count } from indexVault
  isIndexing: false,
  error: null,

  setIndexing: (isIndexing) => set({ isIndexing, error: null }),
  setVault: (vaultHandle, noteIndex) =>
    set({ vaultHandle, vaultName: vaultHandle?.name ?? null, noteIndex, isIndexing: false, error: null }),
  setError: (error) => set({ error, isIndexing: false }),
  disconnect: () => set({ vaultHandle: null, vaultName: null, noteIndex: null, isIndexing: false, error: null }),
}))
