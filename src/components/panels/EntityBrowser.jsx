import React, { useState, useMemo } from 'react'
import { useEntityStore } from '../../store/entityStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { ENTITY_SUBCLASSES } from '../../engine/entities/entitySchema.js'
import EntityBadge from '../ui/EntityBadge.jsx'

export default function EntityBrowser() {
  const entities = useEntityStore((s) => s.entities)
  const selectEntity = useUiStore((s) => s.selectEntity)
  const startEditingEntity = useUiStore((s) => s.startEditingEntity)
  const selectedEntityId = useUiStore((s) => s.selectedEntityId)

  const [query, setQuery] = useState('')
  const [subclassFilter, setSubclassFilter] = useState(null)

  const entityList = useMemo(() => {
    let arr = Object.values(entities)
    if (subclassFilter) arr = arr.filter((e) => e.subclass === subclassFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      arr = arr.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return arr.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [entities, query, subclassFilter])

  const counts = useMemo(() => {
    const c = {}
    for (const e of Object.values(entities)) c[e.subclass] = (c[e.subclass] ?? 0) + 1
    return c
  }, [entities])

  const total = Object.keys(entities).length

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700/60 flex items-center justify-between">
        <span className="text-xs text-slate-500">{total} entit{total === 1 ? 'y' : 'ies'}</span>
        <button
          onClick={() => startEditingEntity('new')}
          className="text-xs px-2 py-1 rounded bg-blue-800 hover:bg-blue-700 text-blue-200 transition-colors"
        >
          + New Entity
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-700/40">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entities…"
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Subclass filter */}
      <div className="px-3 py-2 border-b border-slate-700/40 flex flex-wrap gap-1">
        <button
          onClick={() => setSubclassFilter(null)}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
            !subclassFilter
              ? 'border-slate-400 text-slate-200 bg-slate-700'
              : 'border-slate-700 text-slate-500 hover:border-slate-500'
          }`}
        >
          All
        </button>
        {ENTITY_SUBCLASSES.filter((s) => counts[s]).map((s) => (
          <button
            key={s}
            onClick={() => setSubclassFilter(subclassFilter === s ? null : s)}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
              subclassFilter === s
                ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                : 'border-slate-700 text-slate-500 hover:border-slate-500'
            }`}
          >
            {s} <span className="opacity-60">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto">
        {entityList.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-600">
            {total === 0
              ? 'No entities yet. Create one or add a module.'
              : 'No matches.'}
          </div>
        ) : (
          <ul>
            {entityList.map((entity) => (
              <li key={entity.id}>
                <button
                  onClick={() => selectEntity(entity.id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b border-slate-700/30 hover:bg-slate-800/60 ${
                    selectedEntityId === entity.id ? 'bg-slate-800' : ''
                  }`}
                >
                  <EntityBadge subclass={entity.subclass} className="shrink-0" />
                  <span className="text-xs text-slate-200 flex-1 truncate">
                    {entity.name || <span className="italic text-slate-500">Unnamed</span>}
                  </span>
                  {entity.tags?.length > 0 && (
                    <span className="text-[10px] text-slate-600 shrink-0">
                      {entity.tags.slice(0, 2).join(', ')}
                      {entity.tags.length > 2 && '…'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
