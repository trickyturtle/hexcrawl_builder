import { create } from 'zustand'

export const useUiStore = create((set) => ({
  selectedHexId: null,
  selectedEntityId: null,
  // null = not editing, 'new' = creating, <uuid> = editing existing
  editingEntityId: null,
  entityFormInitial: null,   // pre-seeded fields for new entity (e.g. sources from a module)
  editingModuleId: null,     // null | 'new' | <uuid>
  fogEnabled: false,
  overlays: {
    terrain: true,
    factions: false,
    nations: false,
    religion: false,
    danger: false,
    magic: false,
    fog: false,
    moduleFootprints: false,
    tradeRoutes: false,
  },
  sidebarView: 'Map',
  libraryImportOpen: false,

  selectHex: (id) => set({ selectedHexId: id, selectedEntityId: null, editingEntityId: null, editingModuleId: null }),
  selectEntity: (id) => set({ selectedEntityId: id, editingEntityId: null, editingModuleId: null }),
  clearSelection: () => set({ selectedHexId: null, selectedEntityId: null, editingEntityId: null, editingModuleId: null }),

  startEditingEntity: (id, initial = null) =>
    set({ editingEntityId: id ?? 'new', entityFormInitial: initial, editingModuleId: null }),
  stopEditing: () => set({ editingEntityId: null, entityFormInitial: null }),

  startEditingModule: (id) => set({ editingModuleId: id ?? 'new', editingEntityId: null }),
  stopEditingModule: () => set({ editingModuleId: null }),

  toggleOverlay: (key) =>
    set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
  setSidebarView: (view) => set({ sidebarView: view, libraryImportOpen: false }),
  openLibraryImport:  () => set({ libraryImportOpen: true }),
  closeLibraryImport: () => set({ libraryImportOpen: false }),
  toggleFog: () => set((s) => ({ fogEnabled: !s.fogEnabled })),
}))
