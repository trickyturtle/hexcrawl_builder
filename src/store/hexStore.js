import { create } from 'zustand'

// Hex fog states
export const FOG = { UNKNOWN: 'unknown', EXPLORED: 'explored', KNOWN: 'known' }

export const useHexStore = create((set, get) => ({
  hexes: {},
  routes: [],

  setHexes: (hexes) => set({ hexes }),
  hydrate: (hexes) => set({ hexes }),
  hydrateRoutes: (routes) => set({ routes }),

  setRoutes: (routes) => set({ routes }),
  addRoutes: (newRoutes) => set((s) => ({ routes: [...s.routes, ...newRoutes] })),

  // Merge new hexes into the store without overwriting existing ones
  mergeHexes: (newHexesArray) =>
    set((s) => {
      const next = { ...s.hexes }
      for (const h of newHexesArray) {
        if (!next[h.id]) next[h.id] = h
      }
      return { hexes: next }
    }),

  updateHex: (id, patch) =>
    set((s) => ({ hexes: { ...s.hexes, [id]: { ...s.hexes[id], ...patch } } })),

  revealHex: (id, state = FOG.KNOWN) => get().updateHex(id, { fog: state }),

  logEvent: (id, event) =>
    set((s) => {
      const hex = s.hexes[id]
      if (!hex) return s
      return {
        hexes: {
          ...s.hexes,
          [id]: { ...hex, eventLog: [...(hex.eventLog ?? []), event] },
        },
      }
    }),
}))
