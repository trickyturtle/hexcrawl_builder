import React, { useState, useMemo } from 'react'
import { useHexStore } from '../../store/hexStore.js'
import { useEntityStore } from '../../store/entityStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { TERRAIN_FILL } from '../map/HexCell.jsx'
import EntityBadge from '../ui/EntityBadge.jsx'
import { TERRAIN_TYPES, BIOME_TYPES, DEFAULT_HEX } from '../../data/schemas/defaultSchemas.js'
import { biomeForTerrain, elevationForTerrain } from '../../engine/generator/terrainGenerator.js'
import { createHexAt, getNeighborIds, parseHexId } from '../../engine/generator/hexGrid.js'
import { colorForId } from '../map/overlayColors.js'

const FOG_OPTIONS = [
  { value: 'unknown',  label: 'Unknown' },
  { value: 'explored', label: 'Explored' },
  { value: 'known',    label: 'Known' },
]

const ELEVATION_TYPES = ['lowland', 'mountain', 'underground']

// Labels for the six axial neighbor directions, matching getNeighborIds order
// ([1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1] on a pointy-top grid)
const NEIGHBOR_LABELS = ['E', 'NE', 'NW', 'W', 'SW', 'SE']

export default function HexDetailPanel({ hexId }) {
  const hex = useHexStore((s) => s.hexes[hexId])
  const allHexes = useHexStore((s) => s.hexes)
  const updateHex = useHexStore((s) => s.updateHex)
  const mergeHexes = useHexStore((s) => s.mergeHexes)
  const entities = useEntityStore((s) => s.entities)
  const selectEntity = useUiStore((s) => s.selectEntity)
  const selectHex = useUiStore((s) => s.selectHex)

  const logEvent = useHexStore((s) => s.logEvent)

  const [assignQuery, setAssignQuery] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [editTerrain, setEditTerrain] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [eventInput, setEventInput] = useState('')

  const addEvent = () => {
    const description = eventInput.trim()
    if (!description) return
    logEvent(hexId, { description, timestamp: new Date().toISOString() })
    setEventInput('')
  }

  // Changing terrain re-derives biome/elevation defaults; both stay editable
  const handleTerrainChange = (terrain) => {
    updateHex(hexId, {
      terrain,
      biome: biomeForTerrain(terrain),
      elevation: elevationForTerrain(terrain),
    })
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || (hex.tags ?? []).includes(t)) return
    updateHex(hexId, { tags: [...(hex.tags ?? []), t] })
    setTagInput('')
  }

  // Create a missing neighbor hex, copying this hex's terrain so extending
  // land (or water) feels continuous; the new hex is selected for editing
  const addNeighbor = (nid) => {
    const { q, r } = parseHexId(nid)
    mergeHexes([{
      ...DEFAULT_HEX,
      ...createHexAt(q, r),
      id: nid,
      terrain: hex.terrain,
      biome: hex.biome,
      elevation: hex.elevation,
      danger: hex.danger ?? 0,
      magic: hex.magic ?? 0,
      fog: 'known',
    }])
    selectHex(nid)
  }

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
        <Section
          label="Terrain"
          action={
            <button
              onClick={() => setEditTerrain((v) => !v)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                editTerrain
                  ? 'border-blue-500 text-blue-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {editTerrain ? 'Done' : 'Edit'}
            </button>
          }
        >
          {!editTerrain ? (
            <>
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
            </>
          ) : (
            <div className="space-y-2">
              <EditRow label="Terrain">
                <select
                  value={hex.terrain}
                  onChange={(e) => handleTerrainChange(e.target.value)}
                  className={SELECT}
                >
                  {TERRAIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </EditRow>
              <EditRow label="Biome">
                <select
                  value={hex.biome ?? ''}
                  onChange={(e) => updateHex(hexId, { biome: e.target.value })}
                  className={SELECT}
                >
                  {/* preserve unknown/custom biome values from imports */}
                  {!BIOME_TYPES.includes(hex.biome) && hex.biome && (
                    <option value={hex.biome}>{hex.biome}</option>
                  )}
                  {BIOME_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </EditRow>
              <EditRow label="Elevation">
                <select
                  value={hex.elevation ?? 'lowland'}
                  onChange={(e) => updateHex(hexId, { elevation: e.target.value })}
                  className={SELECT}
                >
                  {ELEVATION_TYPES.map((el) => <option key={el} value={el}>{el}</option>)}
                </select>
              </EditRow>
              <EditRow label="Danger">
                <LevelPicker
                  value={hex.danger ?? 0}
                  onChange={(v) => updateHex(hexId, { danger: v })}
                  activeClass="border-red-600 text-red-300 bg-red-900/30"
                />
              </EditRow>
              <EditRow label="Magic">
                <LevelPicker
                  value={hex.magic ?? 0}
                  onChange={(v) => updateHex(hexId, { magic: v })}
                  activeClass="border-purple-600 text-purple-300 bg-purple-900/30"
                />
              </EditRow>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!hex.anomaly}
                  onChange={(e) => updateHex(hexId, { anomaly: e.target.checked })}
                  className="accent-fuchsia-500"
                />
                Dimensional anomaly
              </label>
            </div>
          )}
        </Section>

        {/* ── Tags ────────────────────────────────────────────────── */}
        <Section label="Tags">
          {(hex.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {hex.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                  {t}
                  <button
                    onClick={() => updateHex(hexId, { tags: hex.tags.filter((x) => x !== t) })}
                    className="text-slate-500 hover:text-red-400"
                  >✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Add tag…"
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={addTag}
              disabled={!tagInput.trim()}
              className="text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
            >Add</button>
          </div>
        </Section>

        {/* ── Territory ───────────────────────────────────────────── */}
        {((hex.factionIds ?? []).length > 0 || (hex.religionIds ?? []).length > 0) && (
          <Section label="Territory">
            <div className="space-y-1">
              {(hex.factionIds ?? []).map((fid) => {
                const f = entities[fid]
                if (!f) return null
                return (
                  <button
                    key={fid}
                    onClick={() => selectEntity(fid)}
                    className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white hover:underline"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: `rgba(${colorForId(fid)},0.7)` }}
                    />
                    {f.name || 'Unnamed'}
                    <span className="text-[10px] text-slate-600">{f.subclass}</span>
                  </button>
                )
              })}
              {(hex.religionIds ?? []).map((rid) => {
                const r = entities[rid]
                if (!r) return null
                return (
                  <button
                    key={rid}
                    onClick={() => selectEntity(rid)}
                    className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white hover:underline"
                  >
                    <span
                      className="w-2 h-2 shrink-0"
                      style={{ background: `rgb(${colorForId(rid)})` }}
                    />
                    {r.name || 'Unnamed'}
                    <span className="text-[10px] text-slate-600">Religion</span>
                  </button>
                )
              })}
            </div>
          </Section>
        )}

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

        {/* ── Add adjacent hexes ──────────────────────────────────── */}
        {(() => {
          const missing = getNeighborIds(hex.q, hex.r)
            .map((nid, i) => ({ nid, label: NEIGHBOR_LABELS[i] }))
            .filter(({ nid }) => !allHexes[nid])
          if (missing.length === 0) return null
          return (
            <Section label="Expand Map">
              <p className="text-[10px] text-slate-600 mb-1.5">
                Add a new hex adjacent to this one (copies this hex's terrain)
              </p>
              <div className="flex flex-wrap gap-1">
                {missing.map(({ nid, label }) => (
                  <button
                    key={nid}
                    onClick={() => addNeighbor(nid)}
                    title={`Add hex at ${nid}`}
                    className="text-xs px-2 py-1 rounded border border-dashed border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-colors"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            </Section>
          )
        })()}

        {/* ── Event log ───────────────────────────────────────────── */}
        <Section label={`Events${hex.eventLog?.length ? ` (${hex.eventLog.length})` : ''}`}>
          {hex.eventLog?.length > 0 && (
            <ol className="space-y-1.5 mb-2">
              {hex.eventLog.map((ev, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-slate-600 select-none">{i + 1}.</span>
                  <span className="text-slate-400 flex-1">
                    {typeof ev === 'string' ? ev : ev.description ?? JSON.stringify(ev)}
                  </span>
                  {ev.timestamp && (
                    <span className="text-slate-600 shrink-0" title={new Date(ev.timestamp).toLocaleString()}>
                      {new Date(ev.timestamp).toLocaleDateString()}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={eventInput}
              onChange={(e) => setEventInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEvent() } }}
              placeholder="Record an event… (faction takes hex, ruin cleared)"
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={addEvent}
              disabled={!eventInput.trim()}
              className="text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
            >Log</button>
          </div>
        </Section>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, action = null, children }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </p>
        {action}
      </div>
      {children}
    </section>
  )
}

function EditRow({ label, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-16 shrink-0">{label}</span>
      {children}
    </div>
  )
}

function LevelPicker({ value, onChange, activeClass }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3].map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`w-7 py-0.5 text-xs rounded border transition-colors ${
            value === v
              ? activeClass
              : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

const SELECT = 'flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 capitalize focus:outline-none focus:border-blue-500 transition-colors'

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
