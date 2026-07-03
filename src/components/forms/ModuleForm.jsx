import React, { useState, useCallback } from 'react'
import { useModuleStore } from '../../store/moduleStore.js'
import { useEntityStore } from '../../store/entityStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { DEFAULT_MODULE } from '../../data/schemas/defaultSchemas.js'
import { SYSTEM_PRESETS } from '../../data/presets/systemPresets.js'
import EntityBadge from '../ui/EntityBadge.jsx'

const DIFFICULTY_OPTS = ['low', 'medium', 'high', 'varies']
const FOOTPRINT_OPTS  = ['single', 'sprawling']
const DIST_UNITS      = ['miles', 'days', 'hexes']
const SECTIONS        = ['Info', 'Entities', 'Distances', 'Notes']

function initialForm(existing) {
  if (!existing) return { ...DEFAULT_MODULE }
  return {
    ...DEFAULT_MODULE,
    ...existing,
    explicitDistances: existing.explicitDistances ? [...existing.explicitDistances] : [],
    entryPoints: existing.entryPoints ? [...existing.entryPoints] : [],
    toneKeywords: existing.toneKeywords ? [...existing.toneKeywords] : [],
    entities: existing.entities ? [...existing.entities] : [],
  }
}

export default function ModuleForm({ moduleId }) {
  const isNew = moduleId === 'new'
  const existing = useModuleStore((s) => s.modules[isNew ? null : moduleId])
  const addModule = useModuleStore((s) => s.addModule)
  const updateModule = useModuleStore((s) => s.updateModule)
  const removeModule = useModuleStore((s) => s.removeModule)
  const removeEntityFromModule = useModuleStore((s) => s.removeEntityFromModule)
  const entities = useEntityStore((s) => s.entities)
  const stopEditingModule = useUiStore((s) => s.stopEditingModule)
  const startEditingEntity = useUiStore((s) => s.startEditingEntity)

  const [form, setForm] = useState(() => initialForm(existing))
  const [section, setSection] = useState('Info')
  const [toneInput, setToneInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), [])

  // ── Tone keywords ─────────────────────────────────────────────────────────
  const addTone = () => {
    const t = toneInput.trim()
    if (!t || form.toneKeywords.includes(t)) return
    set('toneKeywords', [...form.toneKeywords, t])
    setToneInput('')
  }

  // ── Explicit distances ────────────────────────────────────────────────────
  const addDistance = () =>
    set('explicitDistances', [...form.explicitDistances, { fromLabel: '', toLabel: '', distance: '', unit: 'miles' }])
  const updateDistance = (i, patch) =>
    set('explicitDistances', form.explicitDistances.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  const removeDistance = (i) =>
    set('explicitDistances', form.explicitDistances.filter((_, idx) => idx !== i))

  // ── Save / delete ─────────────────────────────────────────────────────────
  const handleSave = () => {
    const data = { ...form, name: form.name.trim() || 'Unnamed Module' }
    if (isNew) {
      addModule(data)
    } else {
      updateModule(moduleId, data)
    }
    stopEditingModule()
  }

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    removeModule(moduleId)
    stopEditingModule()
  }

  // ── Entity in module ──────────────────────────────────────────────────────
  const savedModuleId = isNew ? null : moduleId

  const handleNewEntityInModule = () => {
    if (!savedModuleId) {
      // Must save module first
      const data = { ...form, name: form.name.trim() || 'Unnamed Module' }
      const newId = addModule(data)
      // After save, open entity form with this module as source
      startEditingEntity('new', { sources: [newId] })
      stopEditingModule()
      return
    }
    startEditingEntity('new', { sources: [savedModuleId] })
    stopEditingModule()
  }

  const moduleEntityIds = isNew ? [] : (existing?.entities ?? [])
  const moduleEntities = moduleEntityIds.map((id) => entities[id]).filter(Boolean)

  // Also pick up entities in store that have this module in their sources (may have been added via EntityForm)
  const linkedEntities = isNew ? [] : Object.values(entities).filter(
    (e) => e.sources?.includes(moduleId) && !moduleEntityIds.includes(e.id)
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-800/30 flex items-center gap-2">
        <h2 className="text-slate-100 font-semibold flex-1">
          {isNew ? 'New Module' : (form.name || 'Unnamed Module')}
        </h2>
        {form.system && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
            {form.system}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/40 flex-shrink-0">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-1.5 text-xs border-b-2 transition-colors ${
              section === s
                ? 'border-blue-500 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">

        {/* INFO ────────────────────────────────────────────────────── */}
        {section === 'Info' && (
          <>
            <Field label="Module Name *">
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. The Dark Temple"
                className={INPUT}
                autoFocus
              />
            </Field>

            <Field label="Game System">
              <div className="flex gap-1.5 flex-wrap mb-1">
                {Object.keys(SYSTEM_PRESETS).concat(['OSR', 'OSRIC', 'BECMI', 'Pathfinder']).filter(
                  (v, i, a) => a.indexOf(v) === i
                ).map((sys) => (
                  <button
                    key={sys}
                    onClick={() => set('system', form.system === sys ? '' : sys)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      form.system === sys
                        ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                        : 'border-slate-600 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {sys}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={form.system}
                onChange={(e) => set('system', e.target.value)}
                placeholder="Or type custom system…"
                className={INPUT}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="PDF File">
                <input
                  type="text"
                  value={form.sourceFile}
                  onChange={(e) => set('sourceFile', e.target.value)}
                  placeholder="module.pdf"
                  className={INPUT}
                />
              </Field>
              <Field label="Start Page">
                <input
                  type="number"
                  value={form.pdfStartPage || ''}
                  onChange={(e) => set('pdfStartPage', Number(e.target.value) || null)}
                  placeholder="1"
                  className={INPUT}
                />
              </Field>
            </div>

            <Field label="Footprint">
              <div className="flex gap-1.5">
                {FOOTPRINT_OPTS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => set('footprint', opt)}
                    className={`flex-1 py-1 text-xs rounded border capitalize transition-colors ${
                      form.footprint === opt
                        ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                        : 'border-slate-600 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.footprint === 'sprawling' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Locale count</span>
                  <input
                    type="number" min={1}
                    value={form.localeCount || ''}
                    onChange={(e) => set('localeCount', Number(e.target.value) || 1)}
                    className={`${INPUT} w-20`}
                  />
                </div>
              )}
            </Field>

            <Field label="Difficulty">
              <div className="flex gap-1.5">
                {DIFFICULTY_OPTS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => set('difficulty', opt)}
                    className={`flex-1 py-1 text-xs rounded border capitalize transition-colors ${
                      form.difficulty === opt
                        ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                        : 'border-slate-600 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Tone Keywords">
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  value={toneInput}
                  onChange={(e) => setToneInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTone() } }}
                  placeholder="e.g. horror, dungeon crawl, political"
                  className={`${INPUT} flex-1`}
                />
                <button onClick={addTone} className={BTN_SECONDARY}>Add</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {form.toneKeywords.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    {t}
                    <button
                      onClick={() => set('toneKeywords', form.toneKeywords.filter((x) => x !== t))}
                      className="text-slate-500 hover:text-red-400"
                    >✕</button>
                  </span>
                ))}
              </div>
            </Field>

            <Field label="Obsidian Note">
              <input
                type="text"
                value={form.obsidianNote || ''}
                onChange={(e) => set('obsidianNote', e.target.value || null)}
                placeholder="path/to/module-note"
                className={INPUT}
              />
            </Field>
          </>
        )}

        {/* ENTITIES ────────────────────────────────────────────────── */}
        {section === 'Entities' && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">
                {moduleEntities.length + linkedEntities.length} entities in this module
              </p>
              <button onClick={handleNewEntityInModule} className={BTN_PRIMARY}>
                + New Entity
              </button>
            </div>

            {isNew && (
              <p className="text-xs text-yellow-600/80 bg-yellow-900/20 border border-yellow-800/40 rounded px-2 py-1.5">
                Save the module first, then add entities to it.
              </p>
            )}

            {[...moduleEntities, ...linkedEntities].length === 0 ? (
              <p className="text-xs text-slate-600 italic">No entities yet.</p>
            ) : (
              <ul className="space-y-1">
                {[...moduleEntities, ...linkedEntities].map((entity) => (
                  <li key={entity.id} className="flex items-center gap-2">
                    <button
                      onClick={() => startEditingEntity(entity.id)}
                      className="flex-1 text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/50 transition-colors min-w-0"
                    >
                      <EntityBadge subclass={entity.subclass} />
                      <span className="text-xs text-slate-200 truncate flex-1">
                        {entity.name || <span className="italic text-slate-500">Unnamed</span>}
                      </span>
                      {entity.locale && (
                        <span className="text-[10px] text-slate-500 shrink-0 px-1.5 py-0.5 rounded bg-slate-700/60">
                          {entity.locale}
                        </span>
                      )}
                    </button>
                    {!isNew && (
                      <button
                        onClick={() => removeEntityFromModule(moduleId, entity.id)}
                        className="text-slate-700 hover:text-red-400 transition-colors px-1 text-xs"
                        title="Remove from module"
                      >✕</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* DISTANCES ───────────────────────────────────────────────── */}
        {section === 'Distances' && (
          <>
            <p className="text-xs text-slate-500 leading-relaxed">
              Explicit distances from module text. Converted to hexes using the world preset's travel speeds during placement.
            </p>
            {form.explicitDistances.length === 0 ? (
              <p className="text-xs text-slate-600 italic">None</p>
            ) : (
              <div className="space-y-2">
                {form.explicitDistances.map((d, i) => (
                  <div key={i} className="flex gap-1.5 items-start">
                    <div className="flex-1 grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={d.fromLabel}
                        onChange={(e) => updateDistance(i, { fromLabel: e.target.value })}
                        placeholder="From location"
                        className={INPUT}
                      />
                      <input
                        type="text"
                        value={d.toLabel}
                        onChange={(e) => updateDistance(i, { toLabel: e.target.value })}
                        placeholder="To location"
                        className={INPUT}
                      />
                      <input
                        type="number" min={0}
                        value={d.distance}
                        onChange={(e) => updateDistance(i, { distance: e.target.value })}
                        placeholder="Distance"
                        className={INPUT}
                      />
                      <select
                        value={d.unit}
                        onChange={(e) => updateDistance(i, { unit: e.target.value })}
                        className={INPUT}
                      >
                        {DIST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => removeDistance(i)}
                      className="text-slate-600 hover:text-red-400 transition-colors pt-1.5 px-1"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addDistance} className={`mt-2 ${BTN_SECONDARY}`}>
              + Add Distance
            </button>
          </>
        )}

        {/* NOTES ───────────────────────────────────────────────────── */}
        {section === 'Notes' && (
          <Field label="GM Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Free-form notes about this module, campaign hooks, prep reminders…"
              rows={12}
              className={`${INPUT} resize-none`}
            />
          </Field>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700/40 flex items-center gap-2">
        <button onClick={handleSave} className={BTN_PRIMARY}>
          {isNew ? 'Create Module' : 'Save'}
        </button>
        <button onClick={stopEditingModule} className={BTN_SECONDARY}>Cancel</button>
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

const INPUT = 'w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500 transition-colors'
const BTN_PRIMARY = 'px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs transition-colors disabled:opacity-40'
const BTN_SECONDARY = 'px-3 py-1.5 rounded border border-slate-600 hover:border-slate-400 text-slate-300 text-xs transition-colors'
