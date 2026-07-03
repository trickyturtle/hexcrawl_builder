import React, { useState, useMemo, useRef } from 'react'
import { useModuleStore } from '../../store/moduleStore.js'
import { useEntityStore } from '../../store/entityStore.js'

export default function LibraryImport({ onBack }) {
  const existingModules = useModuleStore((s) => s.modules)
  const importModule    = useModuleStore((s) => s.importModule)
  const importEntities  = useEntityStore((s) => s.importEntities)

  const fileInputRef = useRef(null)

  const [libraryData, setLibraryData]   = useState(null)
  const [libraryName, setLibraryName]   = useState(null)
  const [isLoading, setIsLoading]       = useState(false)
  const [error, setError]               = useState(null)
  const [selected, setSelected]         = useState(() => new Set())
  const [search, setSearch]             = useState('')
  const [importResult, setImportResult] = useState(null)

  const existingIds = useMemo(
    () => new Set(Object.keys(existingModules)),
    [existingModules]
  )

  // ── File reading ───────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setError(null)
    setImportResult(null)
    setIsLoading(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result)
        if (!data.modules || typeof data.modules !== 'object') {
          setError('Not a valid module library file — missing "modules" key.')
          setIsLoading(false)
          return
        }
        setLibraryData(data)
        setLibraryName(file.name)
        setSelected(new Set())
        setError(null)
      } catch (err) {
        setError('Failed to parse JSON: ' + err.message)
      }
      setIsLoading(false)
    }
    reader.onerror = () => {
      setError('Failed to read file.')
      setIsLoading(false)
    }
    reader.readAsText(file)
    // reset so the same file can be re-picked next time
    e.target.value = ''
  }

  // ── Filtered list ──────────────────────────────────────────────────────────
  const moduleList = useMemo(() => {
    if (!libraryData) return []
    const all = Object.values(libraryData.modules)
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.system?.toLowerCase().includes(q) ||
        (Array.isArray(m.environment) && m.environment.some((k) => k.toLowerCase().includes(q))) ||
        (Array.isArray(m.toneKeywords) && m.toneKeywords.some((k) => k.toLowerCase().includes(q)))
    )
  }, [libraryData, search])

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAll = () =>
    setSelected(new Set(moduleList.filter((m) => !existingIds.has(m.id)).map((m) => m.id)))

  const clearAll = () => setSelected(new Set())

  const newCount = useMemo(
    () => [...selected].filter((id) => !existingIds.has(id)).length,
    [selected, existingIds]
  )

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = () => {
    if (!libraryData || newCount === 0) return
    let mCount = 0, eCount = 0, skipped = 0

    for (const id of selected) {
      const mod = libraryData.modules[id]
      if (!mod) continue
      const added = importModule(mod)
      if (added) {
        mCount++
        const entityObjs = (Array.isArray(mod.entities) ? mod.entities : [])
          .map((eid) => libraryData.entities && libraryData.entities[eid])
          .filter(Boolean)
        importEntities(entityObjs)
        eCount += entityObjs.length
      } else {
        skipped++
      }
    }

    setImportResult({ mCount, eCount, skipped })
    setSelected(new Set())
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalInLibrary = libraryData ? Object.keys(libraryData.modules).length : 0

  return (
    <div className="flex flex-col flex-1 min-h-0 text-sm">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-slate-500 hover:text-slate-200 transition-colors text-xs"
        >
          ← Modules
        </button>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Import from Library
        </span>
        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={isLoading}
          className="ml-auto text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {isLoading ? 'Reading…' : libraryName ? 'Change file…' : 'Open library…'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 flex-shrink-0 bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-xs text-red-300 flex gap-2 items-start">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-300 leading-none"
          >✕</button>
        </div>
      )}

      {/* Success */}
      {importResult && (
        <div className="mx-4 mt-3 flex-shrink-0 bg-green-900/20 border border-green-700/40 rounded px-3 py-2 text-xs text-green-300">
          <div className="flex gap-2 items-start mb-2">
            <span className="flex-1">
              Imported{' '}
              <strong>{importResult.mCount}</strong>{' '}
              {importResult.mCount === 1 ? 'module' : 'modules'} and{' '}
              <strong>{importResult.eCount}</strong>{' '}
              {importResult.eCount === 1 ? 'entity' : 'entities'}.
              {importResult.skipped > 0 &&
                ' (' + importResult.skipped + ' already existed — skipped.)'}
            </span>
            <button
              onClick={() => setImportResult(null)}
              className="text-green-600 hover:text-green-300 leading-none flex-shrink-0"
            >✕</button>
          </div>
          <button
            onClick={onBack}
            className="w-full py-1.5 rounded bg-green-800/60 hover:bg-green-700/60 text-green-200 font-medium transition-colors"
          >
            View module list →
          </button>
        </div>
      )}

      {/* Body */}
      {!libraryData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-xs text-slate-600 px-6 text-center">
          <p className="text-slate-400">No library loaded.</p>
          <p>
            Pick your{' '}
            <span className="font-mono text-slate-500">module-library.json</span>{' '}
            to browse and import modules.
          </p>
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isLoading}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors disabled:opacity-40"
          >
            {isLoading ? 'Reading…' : 'Open module-library.json…'}
          </button>
        </div>
      ) : (
        <>
          {/* Search + controls */}
          <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2 border-b border-slate-700/40">
            <p className="text-[10px] text-slate-600">
              {libraryName} &middot; {totalInLibrary}{' '}
              {totalInLibrary === 1 ? 'module' : 'modules'}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search name, system, tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-slate-600 hover:text-slate-400 text-xs"
                >✕</button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex gap-3">
                <button
                  onClick={selectAll}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Select all{search ? ' matching' : ''}
                </button>
                <button
                  onClick={clearAll}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              </div>
              <span className="text-slate-600">
                {moduleList.length !== totalInLibrary
                  ? moduleList.length + ' shown · '
                  : ''}
                {selected.size > 0 ? selected.size + ' selected' : 'none selected'}
              </span>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {moduleList.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-8">No modules match.</p>
            ) : (
              <ul>
                {moduleList.map((mod) => {
                  const alreadyImported = existingIds.has(mod.id)
                  const isSelected = selected.has(mod.id)
                  const entityCount = Array.isArray(mod.entities) ? mod.entities.length : 0
                  const levelMin = mod.levelMin
                  const levelMax = mod.levelMax
                  const levelStr = levelMin
                    ? 'Lvl ' + levelMin + (levelMax && levelMax !== levelMin ? '\u2013' + levelMax : '')
                    : null

                  return (
                    <li
                      key={mod.id}
                      className={'border-b border-slate-700/30' + (alreadyImported ? ' opacity-40' : '')}
                    >
                      <label className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/40 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={alreadyImported}
                          onChange={() => toggleSelect(mod.id)}
                          className="mt-0.5 accent-blue-500 cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs text-slate-100 font-medium">
                              {mod.name || 'Unnamed'}
                            </span>
                            {levelStr && (
                              <span className="text-[10px] text-slate-500">{levelStr}</span>
                            )}
                            {alreadyImported && (
                              <span className="text-[10px] text-green-700 font-medium">
                                imported
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500">
                            {mod.system && <span>{mod.system}</span>}
                            {mod.difficulty && (
                              <span className="capitalize">{mod.difficulty}</span>
                            )}
                            {entityCount > 0 && (
                              <span>
                                {entityCount}{' '}
                                {entityCount === 1 ? 'entity' : 'entities'}
                              </span>
                            )}
                            {mod.type && (
                              <span className="capitalize">{mod.type}</span>
                            )}
                          </div>
                          {Array.isArray(mod.environment) && mod.environment.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {mod.environment.map((env) => (
                                <span
                                  key={env}
                                  className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded"
                                >
                                  {env}
                                </span>
                              ))}
                            </div>
                          )}
                          {typeof mod.environment === 'string' && mod.environment && (
                            <p className="text-[10px] text-slate-500">{mod.environment}</p>
                          )}
                          {Array.isArray(mod.toneKeywords) && mod.toneKeywords.length > 0 && (
                            <p className="text-[10px] text-slate-600 truncate">
                              {mod.toneKeywords.join(' \u00b7 ')}
                            </p>
                          )}
                          {mod.description && (
                            <p className="text-[10px] text-slate-600 leading-relaxed line-clamp-2">
                              {mod.description}
                            </p>
                          )}
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-700/60 flex-shrink-0">
            <button
              onClick={handleImport}
              disabled={newCount === 0}
              className="w-full py-2 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {newCount === 0
                ? 'Select modules to import'
                : 'Import ' + newCount + (newCount === 1 ? ' module' : ' modules') + ' \u2192'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
