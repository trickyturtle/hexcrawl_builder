import React, { useCallback, useState } from 'react'
import { useWorldStore } from './store/worldStore.js'
import { useHexStore } from './store/hexStore.js'
import { useUiStore } from './store/uiStore.js'
import { usePersistenceStore } from './store/persistenceStore.js'
import { generateHexes } from './engine/generator/terrainGenerator.js'
import HexGrid from './components/map/HexGrid.jsx'
import MapControls from './components/map/MapControls.jsx'
import HexDetailPanel from './components/panels/HexDetailPanel.jsx'
import EntityDetail from './components/panels/EntityDetail.jsx'
import EntityBrowser from './components/panels/EntityBrowser.jsx'
import ModuleBrowser from './components/panels/ModuleBrowser.jsx'
import EntityForm from './components/forms/EntityForm.jsx'
import ModuleForm from './components/forms/ModuleForm.jsx'
import MapSetupForm from './components/forms/MapSetupForm.jsx'
import LibraryImport from './components/forms/LibraryImport.jsx'
import { isSupported, pickDirectory } from './persistence/fileSystem.js'
import { saveWorld, loadWorld, isWorldDirectory } from './persistence/worldIO.js'
import { indexVault } from './persistence/obsidianVault.js'
import { useVaultStore } from './store/vaultStore.js'

// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 p-4 bg-red-950 text-red-300 text-xs font-mono overflow-auto flex flex-col gap-2">
          <p className="font-bold text-red-200">⚠ Render error:</p>
          <pre className="whitespace-pre-wrap bg-red-900/40 p-2 rounded">{this.state.error.message}</pre>
          <pre className="whitespace-pre-wrap text-red-400 text-[10px]">{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

const NAV_ITEMS = ['Map', 'Modules', 'Entities', 'World Settings']

export default function App() {
  const sidebarView        = useUiStore((s) => s.sidebarView)
  const setSidebarView     = useUiStore((s) => s.setSidebarView)
  const libraryImportOpen  = useUiStore((s) => s.libraryImportOpen)
  const closeLibraryImport = useUiStore((s) => s.closeLibraryImport)
  const hexes = useHexStore((s) => s.hexes)
  const setHexes = useHexStore((s) => s.setHexes)
  const setRoutes = useHexStore((s) => s.setRoutes)
  const worldParams = useWorldStore((s) => s)
  const selectedHexId = useUiStore((s) => s.selectedHexId)
  const selectedEntityId = useUiStore((s) => s.selectedEntityId)
  const editingEntityId = useUiStore((s) => s.editingEntityId)
  const editingModuleId = useUiStore((s) => s.editingModuleId)
  const selectHex = useUiStore((s) => s.selectHex)
  const clearSelection = useUiStore((s) => s.clearSelection)
  const stopEditing = useUiStore((s) => s.stopEditing)
  const stopEditingModule = useUiStore((s) => s.stopEditingModule)

  const {
    dirHandle, lastSaved, isSaving, isLoading, error,
    setDirHandle, markSaved, setIsSaving, setIsLoading, setError, clearError,
  } = usePersistenceStore()

  const hasWorld = Object.keys(hexes).length > 0
  const fsSupported = isSupported()
  const [confirmRegen, setConfirmRegen] = useState(false)

  const vaultName = useVaultStore((s) => s.vaultName)
  const noteIndex = useVaultStore((s) => s.noteIndex)
  const vaultIndexing = useVaultStore((s) => s.isIndexing)

  // ── Connect Obsidian vault ─────────────────────────────────────────────────
  const handleConnectVault = useCallback(async () => {
    if (!fsSupported) return
    let dir
    try {
      dir = await pickDirectory()
    } catch (e) {
      if (e.name === 'AbortError') return
      useVaultStore.getState().setError(e.message)
      return
    }
    useVaultStore.getState().setIndexing(true)
    try {
      const index = await indexVault(dir)
      useVaultStore.getState().setVault(dir, index)
    } catch (e) {
      useVaultStore.getState().setError(`Vault indexing failed: ${e.message}`)
    }
  }, [fsSupported])

  // ── New World (accepts optional param override from MapSetupForm) ───────────
  const handleNewWorld = useCallback((overrideParams) => {
    const params = overrideParams ?? worldParams
    const { hexes: generated } = generateHexes(params)
    const indexed = {}
    for (const h of generated) indexed[h.id] = h
    setHexes(indexed)
    setRoutes([])  // routes reference the old map's placements
    clearSelection()
    setSidebarView('Map')
  }, [worldParams, setHexes, setRoutes, clearSelection, setSidebarView])

  // ── Open World ─────────────────────────────────────────────────────────────
  const handleOpenWorld = useCallback(async () => {
    if (!fsSupported) return
    let dir
    try {
      dir = await pickDirectory()
    } catch (e) {
      if (e.name === 'AbortError') return
      setError(e.message)
      return
    }
    const isWorld = await isWorldDirectory(dir)
    if (!isWorld) {
      setError('Selected folder is not a saved world (no world.json found).')
      return
    }
    setIsLoading(true)
    try {
      await loadWorld(dir)
      setDirHandle(dir)
      clearSelection()
    } catch (e) {
      setError(`Load failed: ${e.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [fsSupported, setDirHandle, setIsLoading, setError, clearSelection])

  // ── Save World ─────────────────────────────────────────────────────────────
  const handleSaveWorld = useCallback(async () => {
    if (!fsSupported) return
    let dir = dirHandle
    if (!dir) {
      try {
        dir = await pickDirectory()
        setDirHandle(dir)
      } catch (e) {
        if (e.name === 'AbortError') return
        setError(e.message)
        return
      }
    }
    setIsSaving(true)
    try {
      await saveWorld(dir)
      markSaved()
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }, [fsSupported, dirHandle, setDirHandle, setIsSaving, markSaved, setError])

  // ── Main content (non-map views) ──────────────────────────────────────────
  const mainContent =
    libraryImportOpen                ? <LibraryImport onBack={closeLibraryImport} /> :
    sidebarView === 'Entities'       ? <EntityBrowser /> :
    sidebarView === 'Modules'        ? <ModuleBrowser /> :
    sidebarView === 'World Settings' ? <MapSetupForm onRegenerate={handleNewWorld} /> :
    null  // Map view

  // ── Right panel routing ────────────────────────────────────────────────────
  let panelHeader
  let panelContent

  if (editingModuleId) {
    panelHeader = (
      <div className="px-3 py-2.5 border-b border-slate-700/60 flex items-center gap-2">
        <button
          onClick={stopEditingModule}
          className="text-slate-500 hover:text-slate-200 transition-colors text-xs"
        >
          ←
        </button>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {editingModuleId === 'new' ? 'New Module' : 'Edit Module'}
        </span>
      </div>
    )
    panelContent = <ModuleForm moduleId={editingModuleId} />
  } else if (editingEntityId) {
    const isNew = editingEntityId === 'new'
    panelHeader = (
      <div className="px-3 py-2.5 border-b border-slate-700/60 flex items-center gap-2">
        <button
          onClick={stopEditing}
          className="text-slate-500 hover:text-slate-200 transition-colors text-xs"
        >
          ←
        </button>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {isNew ? 'New Entity' : 'Edit Entity'}
        </span>
      </div>
    )
    panelContent = <EntityForm entityId={editingEntityId} />
  } else if (selectedEntityId) {
    panelHeader = (
      <div className="px-3 py-2.5 border-b border-slate-700/60 flex items-center gap-2">
        <button
          onClick={() => selectedHexId ? selectHex(selectedHexId) : clearSelection()}
          className="text-slate-500 hover:text-slate-200 transition-colors text-xs flex items-center gap-1"
        >
          ← {selectedHexId ? 'Hex' : 'Back'}
        </button>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-auto">
          Entity Detail
        </span>
      </div>
    )
    panelContent = <EntityDetail entityId={selectedEntityId} />
  } else if (selectedHexId) {
    panelHeader = (
      <div className="px-4 py-2.5 border-b border-slate-700/60 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Hex Detail
        </span>
        <button
          onClick={clearSelection}
          className="text-slate-600 hover:text-slate-400 transition-colors text-sm leading-none"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    )
    panelContent = <HexDetailPanel hexId={selectedHexId} />
  } else {
    panelHeader = (
      <div className="px-4 py-2.5 border-b border-slate-700/60">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Hex Detail
        </span>
      </div>
    )
    panelContent = (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-600 select-none">
        Click a hex to inspect
      </div>
    )
  }

  const isMapView = sidebarView === 'Map'

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0a14] text-slate-200">
      {/* ── Left sidebar: nav + file controls only ─────────────────── */}
      <aside className="w-48 flex-shrink-0 border-r border-slate-700/60 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-700/60">
          <h1 className="text-sm font-bold tracking-wide text-slate-100">Hexcrawl Builder</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">GM Reference Tool</p>
        </div>

        <nav className="px-2 py-2 flex flex-col gap-0.5 border-b border-slate-700/60 flex-shrink-0">
          {NAV_ITEMS.map((label) => (
            <button
              key={label}
              onClick={() => setSidebarView(label)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                sidebarView === label
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="px-3 py-3 border-t border-slate-700/60 space-y-2">
          {dirHandle && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
              <FolderIcon />
              <span className="truncate">{dirHandle.name}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-900/40 border border-red-700/50 rounded px-2 py-1.5 text-xs text-red-300 flex gap-1.5 items-start">
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="shrink-0 text-red-400 hover:text-red-200">✕</button>
            </div>
          )}

          <button
            onClick={() => {
              // Regenerating an existing map wipes placements, fog, and event
              // logs — require a second click to confirm. A fresh world doesn't.
              if (hasWorld && !confirmRegen) { setConfirmRegen(true); return }
              setConfirmRegen(false)
              handleNewWorld()
            }}
            onMouseLeave={() => setConfirmRegen(false)}
            className={`w-full px-3 py-1.5 rounded text-sm transition-colors ${
              confirmRegen
                ? 'bg-red-800 hover:bg-red-700 text-red-100'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            {confirmRegen ? 'Confirm — wipes placements' : hasWorld ? 'Regenerate' : 'New World'}
          </button>

          {/* Obsidian vault connection */}
          {fsSupported && (
            vaultName ? (
              <div className="flex items-center gap-1.5 text-xs text-violet-300/90">
                <span>⬡</span>
                <span className="truncate flex-1" title={vaultName}>
                  {vaultName} · {noteIndex?.count ?? 0} notes
                </span>
                <button
                  onClick={() => useVaultStore.getState().disconnect()}
                  className="text-slate-600 hover:text-slate-400 shrink-0"
                  title="Disconnect vault"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={handleConnectVault}
                disabled={vaultIndexing}
                className="w-full px-2 py-1.5 rounded border border-violet-800/60 hover:border-violet-600 text-violet-300/80 hover:text-violet-200 text-xs transition-colors disabled:opacity-40"
              >
                {vaultIndexing ? 'Indexing vault…' : '⬡ Connect Obsidian vault…'}
              </button>
            )
          )}

          {fsSupported ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleOpenWorld}
                disabled={isLoading}
                className="px-2 py-1.5 rounded border border-slate-600 hover:border-slate-400 text-slate-300 text-xs transition-colors disabled:opacity-40"
              >
                {isLoading ? 'Loading…' : 'Open…'}
              </button>
              <button
                onClick={handleSaveWorld}
                disabled={isSaving || !hasWorld}
                className="px-2 py-1.5 rounded border border-slate-600 hover:border-slate-400 text-slate-300 text-xs transition-colors disabled:opacity-40"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-slate-600 text-center">
              File System API not supported
            </p>
          )}

          <div className="text-[10px] text-slate-600 text-center min-h-[14px]">
            {isLoading && 'Loading world…'}
            {isSaving && 'Saving…'}
            {!isLoading && !isSaving && lastSaved && `Saved ${formatTime(lastSaved)}`}
            {!isLoading && !isSaving && !lastSaved && hasWorld && `${Object.keys(hexes).length} hexes · unsaved`}
          </div>
        </div>
      </aside>

      {/* ── Main content area: map OR gen tool ─────────────────────── */}
      {isMapView ? (
        <>
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <MapControls />
            <div className="flex-1 flex overflow-hidden">
              <HexGrid />
            </div>
          </main>

          {/* ── Right detail panel (map view only) ─────────────────── */}
          <aside className="w-72 flex-shrink-0 border-l border-slate-700/60 flex flex-col">
            {panelHeader}
            {panelContent}
          </aside>
        </>
      ) : (
        <main className="flex-1 overflow-hidden flex min-w-0">
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <ErrorBoundary key={sidebarView + String(libraryImportOpen)}>
              {mainContent}
            </ErrorBoundary>
          </div>
          {/* ── Right detail/editing panel (non-map views) ─────────── */}
          {(editingEntityId || editingModuleId || selectedEntityId) && (
            <aside className="w-80 flex-shrink-0 border-l border-slate-700/60 flex flex-col">
              {panelHeader}
              {panelContent}
            </aside>
          )}
        </main>
      )}
    </div>
  )
}

// ── Utility components ────────────────────────────────────────────────────────

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <path d="M1 3.5A1.5 1.5 0 012.5 2h3.086a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 008.62 3.9H13.5A1.5 1.5 0 0115 5.4V12.5A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5V3.5z" fill="#94a3b8"/>
    </svg>
  )
}

function formatTime(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 5)   return 'just now'
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
