import React, { useState, useMemo } from 'react'
import { useHexStore } from '../../store/hexStore.js'
import { useEntityStore } from '../../store/entityStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { TERRAIN_FILL } from '../map/HexCell.jsx'
import EntityBadge from '../ui/EntityBadge.jsx'

const FOG_OPTIONS = [
  { value: 'unknown',  label: 'Unknown' },
  { value: 'explored', label: 'Explored' },
  { value: 'known',    label: 'Known' },
]

export default function HexDetailPanel({ hexId }) {
  const hex = useHexStore((s) => s.hexes[hexId])
  const updateHex = useHexStore((s) => s.updateHex)
  const entities = useEntityStore((s) => s.entities)
  const selectEntity = useUiStore((s) => s.selectEntity)

  const [assignQuery, setAssignQuery] = useState('')
  const [showAssign, setShowAssign] = useState(false)

  // Entities not yet in this hex, filtered by query.
  // Hooks must run unconditionally — the null-hex early return comes after them.
  const assignCandidates = useMemo(() => {
    const q = assignQuery.toLowerCase()
    return Object.values(entities)
      .filter((e) => !(hex?.entityIds ?? []).includes(e.id))
      .filter((e) => !q || e.name?.toLowerCase().includes(q) || e.subclass?.toLowerCase().includes(q))
      .slice(0, 10)
  }, [entities, hex?.entityIds, assignQuery])

  if (!hex) return null

  const hexEntities = (hex.entityIds ?? []).map((id) => entities[id]).filter(Boolean)

  const assignEntity = (entityId) => {
    updateHex(hex.id, { entityIds: [...(hex.entityIds ?? []), entityId] })
    setAssignQuery('')
    setShowAssign(false)
  }

  const removeEntity = (entityId) => {
    updateHex(hex.id, { entityIds: (hex.entityIds ?? []).filter((id) => id !== entityId) })
  }

  return (
    <div className="flex-1 overflow-y-auto text-sm">
      {/* ── Coordinate header ───────────────────────────────────────── */}
      <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700/40 flex items-center justify-between">
        <span className="font-mono text-xs text-slate-400">q={hex.q}, r={hex.r}</span>
        <span className="text-[10px] text-slate-600">{hex.id}</span>
      </div>

      <div className="px-4 py-3 space-y-5">
        {/* ── Terrain ─────────────────────────────────────────────── */}
        <Section label="Terrain">
          <div className="flex items-center gap-2 mb-1">
            <TerrainSwatch terrain={hex.terrain} />
            <span className="capitalize text-slate-200 font-medium">{hex.terrain}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {hex.biome && <Tag>{hex.biome}</Tag>}
            {hex.elevation && hex.elevation !== 'lowland' && <Tag>{hex.elevation}</Tag>}
            {hex.danger > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">
                danger {hex.danger}/3
              </span>
            )}
            {hex.magic > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">
                magic {hex.magic}/3
              </span>
            )}
            {hex.anomaly && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-900/40 text-fuchsia-300">
                dimensional anomaly
              </span>
            )}
          </div>
        </Section>

        {/* ── Fog of war ──────────────────────────────────────────── */}
        <Section label="Visibility">
          <div className="flex gap-1">
            {FOG_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateHex(hex.id, { fog: value })}
                className={`flex-1 py-1 text-xs rounded border transition-colors ${
                  hex.fog === value
                    ? fogActiveClass(value)
                    : 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Entities ────────────────────────────────────────────── */}
        <Section label={`Entities${hexEntities.length ? ` (${hexEntities.length})` : ''}`}>
          {hexEntities.length === 0 ? (
            <p className="text-xs text-slate-600 italic mb-2">No entities placed in this hex</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {hexEntities.map((entity) => (
                <EntityRow
                  key={entity.id}
                  entity={entity}
                  onClick={() => selectEntity(entity.id)}
                  onRemove={() => removeEntity(entity.id)}
                />
              ))}
            </ul>
          )}

          {/* Assign entity toggle */}
          {!showAssign ? (
            <button
              onClick={() => setShowAssign(true)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              + Assign entity…
            </button>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                value={assignQuery}
                onChange={(e) => setAssignQuery(e.target.value)}
                placeholder="Search entities…"
                autoFocus
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {assignCandidates.length === 0 ? (
                <p className="text-[10px] text-slate-600 italic">No entities found</p>
              ) : (
                <ul className="border border-slate-700 rounded overflow-hidden">
                  {assignCandidates.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => assignEntity(e.id)}
                        className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-slate-700/60 transition-colors border-b border-slate-700/50 last:border-b-0"
                      >
                        <EntityBadge subclass={e.subclass} />
                        <span className="text-xs text-slate-200 truncate flex-1">
                          {e.name || <span className="italic text-slate-500">Unnamed</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => { setShowAssign(false); setAssignQuery('') }}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </Section>

        {/* ── Event log ───────────────────────────────────────────── */}
        {hex.eventLog?.length > 0 && (
          <Section label={`Events (${hex.eventLog.length})`}>
            <ol className="space-y-1.5">
              {hex.eventLog.map((ev, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-slate-600 select-none">{i + 1}.</span>
                  <span className="text-slate-400">
                    {typeof ev === 'string' ? ev : ev.description ?? JSON.stringify(ev)}
                  </span>
                  {ev.timestamp && (
                    <span className="text-slate-600 ml-auto shrink-0">
                      {new Date(ev.timestamp).toLocaleDateString()}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <section>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      {children}
    </section>
  )
}

function TerrainSwatch({ terrain }) {
  return (
    <span
      className="w-4 h-4 rounded-sm flex-shrink-0 border border-black/20"
      style={{ background: TERRAIN_FILL[terrain] ?? '#555' }}
    />
  )
}

function Tag({ children }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 capitalize">
      {children}
    </span>
  )
}

function EntityRow({ entity, onClick, onRemove }) {
  return (
    <li className="flex items-center gap-1">
      <button
        onClick={onClick}
        className="flex-1 text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/50 transition-colors group min-w-0"
      >
        <EntityBadge subclass={entity.subclass} />
        <span className="text-slate-200 text-xs flex-1 truncate group-hover:text-white">
          {entity.name || <span className="italic text-slate-500">Unnamed</span>}
        </span>
        <span className="text-slate-600 text-[10px] group-hover:text-slate-400">→</span>
      </button>
      <button
        onClick={onRemove}
        className="text-slate-700 hover:text-red-400 transition-colors px-1 text-xs"
        title="Remove from hex"
      >
        ✕
      </button>
    </li>
  )
}

function fogActiveClass(value) {
  if (value === 'known')    return 'border-green-600 text-green-400 bg-green-900/20'
  if (value === 'explored') return 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
  return 'border-slate-500 text-slate-300 bg-slate-700/40'
}
