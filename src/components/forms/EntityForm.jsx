import React, { useState, useCallback, useMemo } from 'react'
import { useEntityStore } from '../../store/entityStore.js'
import { useHexStore } from '../../store/hexStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { createEntity, ENTITY_SUBCLASSES } from '../../engine/entities/entitySchema.js'
import { createRelationship } from '../../engine/entities/relationshipSchema.js'
import { TERRAIN_TYPES, BIOME_TYPES } from '../../data/schemas/defaultSchemas.js'
import EntityBadge from '../ui/EntityBadge.jsx'

const ELEVATION_TYPES = ['lowland', 'mountain', 'underground']
const DIRECTIONALITY = ['bidirectional', 'one-way']
const ACCESS_TYPES = ['land', 'sea', 'either', 'none']

function initialFormState(existing, initial = null) {
  if (!existing) return { ...createEntity(), name: '', ...initial }
  return {
    ...existing,
    locationRequirements: {
      terrainAffinity: [],
      biomeRequirements: [],
      elevationRequirements: [],
      proximityRequirements: [],
      ...existing.locationRequirements,
    },
    relationships: existing.relationships ? [...existing.relationships] : [],
    tags: existing.tags ? [...existing.tags] : [],
  }
}

export default function EntityForm({ entityId }) {
  const existing = useEntityStore((s) => s.entities[entityId === 'new' ? null : entityId])
  const addEntity = useEntityStore((s) => s.addEntity)
  const updateEntity = useEntityStore((s) => s.updateEntity)
  const removeEntity = useEntityStore((s) => s.removeEntity)
  const entities = useEntityStore((s) => s.entities)
  const stopEditing = useUiStore((s) => s.stopEditing)
  const selectEntity = useUiStore((s) => s.selectEntity)
  const entityFormInitial = useUiStore((s) => s.entityFormInitial)

  const [form, setForm] = useState(() => initialFormState(existing, entityFormInitial))
  const [tagInput, setTagInput] = useState('')
  const [relForm, setRelForm] = useState(null) // null | 'new' | relationshipId
  const [newRel, setNewRel] = useState(null)
  const [activeSection, setActiveSection] = useState('basic')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isNew = entityId === 'new'

  const set = useCallback((key, value) =>
    setForm((f) => ({ ...f, [key]: value })), [])

  const setReq = useCallback((key, value) =>
    setForm((f) => ({ ...f, locationRequirements: { ...f.locationRequirements, [key]: value } })), [])

  const toggleMulti = useCallback((reqKey, value) => {
    setForm((f) => {
      const arr = f.locationRequirements[reqKey] ?? []
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
      return { ...f, locationRequirements: { ...f.locationRequirements, [reqKey]: next } }
    })
  }, [])

  // ── Tag handling ─────────────────────────────────────────────────────────
  const addTag = useCallback(() => {
    const t = tagInput.trim()
    if (!t || form.tags.includes(t)) return
    set('tags', [...form.tags, t])
    setTagInput('')
  }, [tagInput, form.tags, set])

  const removeTag = useCallback((t) =>
    set('tags', form.tags.filter((x) => x !== t)), [form.tags, set])

  // ── Relationship handling ─────────────────────────────────────────────────
  const startNewRel = () => {
    setNewRel(createRelationship({ fromEntityId: form.id }))
    setRelForm('new')
  }

  const startEditRel = (rel) => {
    setNewRel({ ...rel, distanceConstraint: rel.distanceConstraint ? { ...rel.distanceConstraint } : null })
    setRelForm(rel.id)
  }

  const commitRel = () => {
    if (!newRel?.toEntityId) return
    if (relForm === 'new') {
      set('relationships', [...form.relationships, newRel])
    } else {
      set('relationships', form.relationships.map((r) => (r.id === relForm ? newRel : r)))
    }
    setRelForm(null)
    setNewRel(null)
  }

  const removeRel = (id) =>
    set('relationships', form.relationships.filter((r) => r.id !== id))

  // ── Save / delete ─────────────────────────────────────────────────────────
  const handleSave = () => {
    const entity = { ...form, name: form.name.trim() || 'Unnamed Entity' }
    if (isNew) {
      addEntity(entity)
      selectEntity(entity.id)
    } else {
      updateEntity(entity.id, entity)
      selectEntity(entity.id)
    }
    stopEditing()
  }

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    removeEntity(form.id)
    cascadeEntityRemoval(form.id)
    stopEditing()
  }

  // Locale values already used by sibling entities (same source module) — shown as quick-pick chips
  const siblingLocales = useMemo(() => {
    if (!form.sources?.length) return []
    const seen = new Set()
    for (const e of Object.values(entities)) {
      if (e.id === form.id || !e.locale) continue
      if (e.sources?.some((s) => form.sources.includes(s))) seen.add(e.locale)
    }
    return [...seen].sort()
  }, [entities, form.sources, form.id])

  const otherEntities = Object.values(entities).filter((e) => e.id !== form.id)

  const SECTIONS = ['basic', 'tags', 'placement', 'relationships', 'references']

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-sm">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-800/30 flex items-center justify-between gap-2">
        <h2 className="text-slate-100 font-semibold text-sm">
          {isNew ? 'New Entity' : `Edit: ${form.name || 'Unnamed'}`}
        </h2>
        <EntityBadge subclass={form.subclass} />
      </div>

      {/* ── Section tabs ──────────────────────────────────────────── */}
      <div className="flex border-b border-slate-700/40 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`px-3 py-1.5 text-xs capitalize shrink-0 border-b-2 transition-colors ${
              activeSection === s
                ? 'border-blue-500 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {s === 'placement' ? 'Placement' : s}
          </button>
        ))}
      </div>

      {/* ── Form body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* BASIC ──────────────────────────────────────────────────── */}
        {activeSection === 'basic' && (
          <>
            <Field label="Name">
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Entity name"
                className={INPUT}
                autoFocus
              />
            </Field>

            <Field label="Subclass">
              <select
                value={form.subclass}
                onChange={(e) => set('subclass', e.target.value)}
                className={INPUT}
              >
                {ENTITY_SUBCLASSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            {/* Location / GeographicFeature footprint — hexes the entity spans */}
            {(form.subclass === 'Location' || form.subclass === 'GeographicFeature') && (
              <Field label="Hex Footprint">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set('hexFootprint', n)}
                      className={`flex-1 py-1 text-xs rounded border transition-colors ${
                        (form.hexFootprint ?? 1) === n
                          ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                          : 'border-slate-600 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-1">
                  Hexes this {form.subclass === 'GeographicFeature' ? 'feature' : 'place'} spans — placement claims adjacent land hexes
                </p>
              </Field>
            )}

            {/* Faction / Nation territory fields — drive the territory overlays */}
            {(form.subclass === 'Faction' || form.subclass === 'Nation') && (
              <>
                <Field label="Home Base">
                  <select
                    value={form.homeBaseEntityId ?? ''}
                    onChange={(e) => set('homeBaseEntityId', e.target.value || null)}
                    className={INPUT}
                  >
                    <option value="">— this entity's own hex —</option>
                    {otherEntities
                      .filter((e) => e.subclass === 'Location')
                      .map((e) => (
                        <option key={e.id} value={e.id}>{e.name || 'Unnamed'}</option>
                      ))}
                  </select>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Territory grows outward from here once placed on the map
                  </p>
                </Field>
                <Field label="Territory Tendency">
                  <div className="flex gap-1.5">
                    {['concentrated', 'diffuse'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set('territoryTendency', t)}
                        className={`flex-1 py-1 text-xs rounded border capitalize transition-colors ${
                          (form.territoryTendency ?? 'concentrated') === t
                            ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                            : 'border-slate-600 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Territory Size">
                  <div className="flex gap-1.5">
                    {['small', 'medium', 'large'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set('territorySize', t)}
                        className={`flex-1 py-1 text-xs rounded border capitalize transition-colors ${
                          (form.territorySize ?? 'medium') === t
                            ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                            : 'border-slate-600 text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}

            {form.subclass === 'Nation' && (
              <Field label="Diplomatic Status">
                <input
                  type="text"
                  value={form.diplomaticStatus ?? ''}
                  onChange={(e) => set('diplomaticStatus', e.target.value)}
                  placeholder="e.g. at war with the Reach, truce with the Guild"
                  className={INPUT}
                />
              </Field>
            )}

            {form.subclass === 'Event' && (
              <Field label="Timeline Position">
                <input
                  type="text"
                  value={form.timelinePosition ?? ''}
                  onChange={(e) => set('timelinePosition', e.target.value)}
                  placeholder="e.g. 300 years ago, ongoing, prophesied"
                  className={INPUT}
                />
              </Field>
            )}

            <Field label="Locale">
              <input
                type="text"
                value={form.locale ?? ''}
                onChange={(e) => set('locale', e.target.value.trim() || null)}
                placeholder="e.g. dungeon, keep, caves, city…"
                className={INPUT}
              />
              {siblingLocales.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {siblingLocales.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => set('locale', form.locale === l ? null : l)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        form.locale === l
                          ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                          : 'border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-600 mt-1">
                Groups this entity with others at the same locale — they'll cluster together on the map. Entities from different locales in the same module spread apart.
              </p>
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Supports [[Entity Name]] links"
                rows={5}
                className={`${INPUT} resize-none`}
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Use [[Entity Name]] to link to other entities
              </p>
            </Field>
          </>
        )}

        {/* TAGS ───────────────────────────────────────────────────── */}
        {activeSection === 'tags' && (
          <Field label="Tags">
            <div className="flex gap-1.5 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add tag…"
                className={`${INPUT} flex-1`}
              />
              <button onClick={addTag} className={BTN_SECONDARY}>Add</button>
            </div>
            {form.tags.length === 0
              ? <p className="text-xs text-slate-600 italic">No tags</p>
              : (
                <div className="flex flex-wrap gap-1">
                  {form.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                      {t}
                      <button onClick={() => removeTag(t)} className="text-slate-500 hover:text-red-400">✕</button>
                    </span>
                  ))}
                </div>
              )
            }
          </Field>
        )}

        {/* PLACEMENT ─────────────────────────────────────────────── */}
        {activeSection === 'placement' && (
          <>
            <Field label="Terrain Affinity">
              <ChipToggleGroup
                options={TERRAIN_TYPES}
                selected={form.locationRequirements.terrainAffinity}
                onToggle={(v) => toggleMulti('terrainAffinity', v)}
              />
            </Field>
            <Field label="Biome Requirements">
              <OpenChipInput
                suggestions={BIOME_TYPES}
                selected={form.locationRequirements.biomeRequirements}
                onChange={(v) => setReq('biomeRequirements', v)}
              />
            </Field>
            <Field label="Elevation Requirements">
              <ChipToggleGroup
                options={ELEVATION_TYPES}
                selected={form.locationRequirements.elevationRequirements}
                onToggle={(v) => toggleMulti('elevationRequirements', v)}
              />
            </Field>
            <ProximityEditor
              requirements={form.locationRequirements.proximityRequirements}
              entities={otherEntities}
              onChange={(v) => setReq('proximityRequirements', v)}
            />
          </>
        )}

        {/* RELATIONSHIPS ──────────────────────────────────────────── */}
        {activeSection === 'relationships' && (
          <Field label={`Relationships (${form.relationships.length})`}>
            {form.relationships.length === 0 && (
              <p className="text-xs text-slate-600 italic mb-2">No relationships defined</p>
            )}
            <ul className="space-y-2 mb-3">
              {form.relationships.map((rel) => {
                const other = entities[rel.toEntityId === form.id ? rel.fromEntityId : rel.toEntityId]
                return (
                  <li key={rel.id} className="border border-slate-700/50 rounded px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-500">
                          {rel.directionality === 'bidirectional' ? '↔' : '→'}
                        </span>
                        <span className="text-slate-300 truncate">
                          {other?.name ?? rel.toEntityId ?? 'Unknown'}
                        </span>
                        {rel.label && <span className="text-slate-500 italic truncate">"{rel.label}"</span>}
                        {rel.distanceConstraint && (
                          <span className="text-slate-600 shrink-0">
                            {rel.distanceConstraint.min ?? 0}–{rel.distanceConstraint.max ?? '∞'}h
                            {rel.distanceIsHard ? '!' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEditRel(rel)}
                          className="text-slate-600 hover:text-blue-400 transition-colors"
                          title="Edit relationship"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => removeRel(rel.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {relForm && newRel ? (
              <RelationshipSubForm
                rel={newRel}
                isNew={relForm === 'new'}
                onChange={setNewRel}
                entities={otherEntities}
                onCommit={commitRel}
                onCancel={() => { setRelForm(null); setNewRel(null) }}
              />
            ) : (
              <button onClick={startNewRel} className={BTN_SECONDARY}>
                + Add Relationship
              </button>
            )}
          </Field>
        )}

        {/* REFERENCES ─────────────────────────────────────────────── */}
        {activeSection === 'references' && (
          <>
            <Field label="Obsidian Link">
              <input
                type="text"
                value={form.obsidianLink ?? ''}
                onChange={(e) => set('obsidianLink', e.target.value || null)}
                placeholder="path/to/note"
                className={INPUT}
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Path within your Obsidian vault (no leading slash)
              </p>
            </Field>
            <Field label="PDF Reference">
              <input
                type="text"
                value={form.pdfReference?.file ?? ''}
                onChange={(e) => set('pdfReference', e.target.value ? { ...form.pdfReference, file: e.target.value } : null)}
                placeholder="module-name.pdf"
                className={`${INPUT} mb-1.5`}
              />
              <input
                type="number"
                value={form.pdfReference?.page ?? ''}
                onChange={(e) => set('pdfReference', {
                  ...(form.pdfReference ?? {}),
                  page: e.target.value ? Number(e.target.value) : null,
                })}
                placeholder="Page number"
                className={INPUT}
              />
            </Field>
          </>
        )}
      </div>

      {/* ── Footer actions ────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate-700/40 flex items-center gap-2">
        <button onClick={handleSave} className={BTN_PRIMARY}>
          {isNew ? 'Create' : 'Save'}
        </button>
        <button onClick={() => { stopEditing(); if (!isNew) selectEntity(entityId) }} className={BTN_SECONDARY}>
          Cancel
        </button>
        {!isNew && (
          <button
            onClick={handleDelete}
            onMouseLeave={() => setConfirmDelete(false)}
            className={`ml-auto text-xs px-2 py-1.5 rounded transition-colors ${
              confirmDelete
                ? 'bg-red-700 text-white hover:bg-red-600'
                : 'text-red-500 hover:text-red-400 hover:bg-red-900/20'
            }`}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deleting an entity must not leave dangling UUIDs behind: strip it from every
// hex's entityIds, from other entities' relationships, and from route pairs.
function cascadeEntityRemoval(entityId) {
  const hexStore = useHexStore.getState()
  for (const [hid, hex] of Object.entries(hexStore.hexes)) {
    if ((hex.entityIds ?? []).includes(entityId)) {
      hexStore.updateHex(hid, { entityIds: hex.entityIds.filter((id) => id !== entityId) })
    }
  }
  hexStore.setRoutes(
    hexStore.routes.filter((r) => !(r.entityPairIds ?? []).includes(entityId))
  )

  const entityStore = useEntityStore.getState()
  for (const e of Object.values(entityStore.entities)) {
    const patch = {}
    const rels = e.relationships ?? []
    const keptRels = rels.filter((r) => r.fromEntityId !== entityId && r.toEntityId !== entityId)
    if (keptRels.length !== rels.length) patch.relationships = keptRels

    const proxReqs = e.locationRequirements?.proximityRequirements ?? []
    const keptProx = proxReqs.filter((p) => (p.entityId ?? p.targetEntityId) !== entityId)
    if (keptProx.length !== proxReqs.length) {
      patch.locationRequirements = { ...e.locationRequirements, proximityRequirements: keptProx }
    }

    if (Object.keys(patch).length > 0) entityStore.updateEntity(e.id, patch)
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

// Open-ended chip input: preset suggestions + free-text entry
function OpenChipInput({ suggestions, selected, onChange }) {
  const [input, setInput] = React.useState('')

  const add = (raw) => {
    const v = raw.trim().toLowerCase()
    if (!v || selected.includes(v)) return
    onChange([...selected, v])
    setInput('')
  }

  const remove = (v) => onChange(selected.filter((x) => x !== v))

  const unselected = suggestions.filter((s) => !selected.includes(s))

  return (
    <div className="space-y-1.5">
      {/* Active selections — removable chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-blue-500 text-blue-300 bg-blue-900/30 capitalize"
            >
              {v}
              <button
                onClick={() => remove(v)}
                className="text-blue-400 hover:text-red-400 leading-none transition-colors"
              >✕</button>
            </span>
          ))}
        </div>
      )}
      {/* Unselected presets — one-click add */}
      {unselected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unselected.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="text-[10px] px-2 py-0.5 rounded border border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300 capitalize transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {/* Free-text custom entry */}
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="Custom biome…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input) } }}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
        />
        <button
          onClick={() => add(input)}
          disabled={!input.trim()}
          className="text-[10px] px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
        >Add</button>
      </div>
    </div>
  )
}

function ChipToggleGroup({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onToggle(opt)}
          className={`text-[10px] px-2 py-0.5 rounded border capitalize transition-colors ${
            selected.includes(opt)
              ? 'border-blue-500 text-blue-300 bg-blue-900/30'
              : 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function ProximityEditor({ requirements, entities, onChange }) {
  const add = () =>
    onChange([...requirements, { entityId: null, minHexes: 1, maxHexes: 5, isHard: false }])
  const update = (i, patch) =>
    onChange(requirements.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remove = (i) =>
    onChange(requirements.filter((_, idx) => idx !== i))

  return (
    <Field label="Proximity Requirements">
      {requirements.length === 0 && (
        <p className="text-xs text-slate-600 italic mb-2">None</p>
      )}
      <div className="space-y-2 mb-2">
        {requirements.map((req, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <select
              value={req.entityId ?? ''}
              onChange={(e) => update(i, { entityId: e.target.value || null })}
              className={`${INPUT} flex-1 text-xs`}
            >
              <option value="">— pick entity —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name || 'Unnamed'}</option>
              ))}
            </select>
            <input
              type="number" min={0} value={req.minHexes}
              onChange={(e) => update(i, { minHexes: Number(e.target.value) })}
              className={`${INPUT} w-12 text-center text-xs`}
              title="Min hexes"
            />
            <span className="text-slate-600">–</span>
            <input
              type="number" min={0} value={req.maxHexes}
              onChange={(e) => update(i, { maxHexes: Number(e.target.value) })}
              className={`${INPUT} w-12 text-center text-xs`}
              title="Max hexes"
            />
            <label className="flex items-center gap-1 text-slate-500">
              <input
                type="checkbox" checked={req.isHard}
                onChange={(e) => update(i, { isHard: e.target.checked })}
              />
              hard
            </label>
            <button onClick={() => remove(i)} className="text-slate-600 hover:text-red-400">✕</button>
          </div>
        ))}
      </div>
      <button onClick={add} className={BTN_SECONDARY}>+ Add proximity</button>
    </Field>
  )
}

function RelationshipSubForm({ rel, isNew = true, onChange, entities, onCommit, onCancel }) {
  const set = (k, v) => onChange({ ...rel, [k]: v })
  const setDistance = (k, raw) => {
    const v = raw === '' ? null : Math.max(0, Number(raw))
    const next = { ...(rel.distanceConstraint ?? {}), [k]: v }
    // both bounds cleared → no constraint at all
    const empty = (next.min === null || next.min === undefined)
      && (next.max === null || next.max === undefined)
    onChange({ ...rel, distanceConstraint: empty ? null : next })
  }
  return (
    <div className="border border-slate-600 rounded p-3 space-y-2 text-xs bg-slate-800/40">
      <Field label="Target Entity">
        <select
          value={rel.toEntityId ?? ''}
          onChange={(e) => set('toEntityId', e.target.value || null)}
          className={INPUT}
        >
          <option value="">— select entity —</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name || 'Unnamed'} ({e.subclass})</option>
          ))}
        </select>
      </Field>
      <Field label="Label">
        <input
          type="text"
          value={rel.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="e.g. trade agreement, ancient rivalry"
          className={INPUT}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={rel.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          className={`${INPUT} resize-none`}
        />
      </Field>
      <div className="flex gap-3">
        <Field label="Directionality">
          <select value={rel.directionality} onChange={(e) => set('directionality', e.target.value)} className={INPUT}>
            {DIRECTIONALITY.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Access type">
          <select value={rel.accessType} onChange={(e) => set('accessType', e.target.value)} className={INPUT}>
            {ACCESS_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Distance Constraint (hexes)">
        <div className="flex items-center gap-1.5">
          <input
            type="number" min={0}
            value={rel.distanceConstraint?.min ?? ''}
            onChange={(e) => setDistance('min', e.target.value)}
            placeholder="min"
            className={`${INPUT} w-16 text-center`}
          />
          <span className="text-slate-600">–</span>
          <input
            type="number" min={0}
            value={rel.distanceConstraint?.max ?? ''}
            onChange={(e) => setDistance('max', e.target.value)}
            placeholder="max"
            className={`${INPUT} w-16 text-center`}
          />
          <label className="flex items-center gap-1 text-slate-400 cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={rel.distanceIsHard ?? false}
              onChange={(e) => set('distanceIsHard', e.target.checked)}
            />
            hard
          </label>
        </div>
        <p className="text-[10px] text-slate-600 mt-1">
          Leave blank for none. Hard constraints must be satisfied; soft ones are preferred.
        </p>
      </Field>
      <Field label="Spatial Exception">
        <input
          type="text"
          value={rel.spatialException ?? ''}
          onChange={(e) => set('spatialException', e.target.value)}
          placeholder="e.g. exiled — deliberately separated, historical only"
          className={INPUT}
        />
      </Field>
      <div className="flex gap-4 text-xs text-slate-400">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={rel.impliesSpatialAccess}
            onChange={(e) => set('impliesSpatialAccess', e.target.checked)} />
          Implies spatial access
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={rel.isPublicKnowledge}
            onChange={(e) => set('isPublicKnowledge', e.target.checked)} />
          Public knowledge
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCommit} disabled={!rel.toEntityId} className={BTN_PRIMARY}>
          {isNew ? 'Add' : 'Save'}
        </button>
        <button onClick={onCancel} className={BTN_SECONDARY}>Cancel</button>
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────
const INPUT = 'w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500 transition-colors'
const BTN_PRIMARY = 'px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs transition-colors disabled:opacity-40'
const BTN_SECONDARY = 'px-3 py-1.5 rounded border border-slate-600 hover:border-slate-400 text-slate-300 text-xs transition-colors'
