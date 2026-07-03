import React, { useState, useCallback } from 'react'
import { useWorldStore } from '../../store/worldStore.js'
import { SYSTEM_PRESETS, milesPerDayToHexes } from '../../data/presets/systemPresets.js'
import { BIOME_TYPES } from '../../data/schemas/defaultSchemas.js'

const MAP_SHAPES   = ['rectangle', 'circular', 'continent', 'island', 'irregular']
const DENSITIES    = ['low', 'medium', 'high']
const FRAG_OPTIONS = ['unified', 'fragmented', 'tribal', 'none']
const DANGER_OPTS  = ['even', 'concentrated', 'peripheral', 'random']
const MAGIC_OPTS   = ['none', 'low', 'medium', 'high', 'wild']
const AGE_OPTS     = ['young', 'mature', 'ancient', 'post-apocalyptic']
const SPEED_KEYS   = ['road', 'crossCountry', 'forest', 'hills', 'mountains']
const SPEED_LABELS = { road: 'Road', crossCountry: 'Cross-country', forest: 'Forest', hills: 'Hills', mountains: 'Mountains' }

const SECTIONS = ['Preset', 'Size', 'Shape', 'World', 'Biomes']

function extractForm(ws) {
  return {
    hexCount: ws.hexCount,
    dimensions: ws.dimensions,
    useDimensions: !!ws.dimensions,
    hexSizeMiles: ws.hexSizeMiles,
    mapShape: ws.mapShape,
    settlementDensity: ws.settlementDensity,
    politicalFragmentation: ws.politicalFragmentation,
    dangerDistribution: ws.dangerDistribution,
    magicDensity: ws.magicDensity,
    ageOfWorld: ws.ageOfWorld,
    weirndesseFactor: ws.weirndesseFactor,
    biomeDistribution: { ...ws.biomeDistribution },
    systemPreset: ws.systemPreset,
    travelSpeedAssumptions: { ...ws.travelSpeedAssumptions },
  }
}

export default function MapSetupForm({ onRegenerate }) {
  const worldStore = useWorldStore((s) => s)
  const setParams = useWorldStore((s) => s.setParams)

  const [form, setForm] = useState(() => extractForm(worldStore))
  const [section, setSection] = useState('Preset')
  const [dirty, setDirty] = useState(false)

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }, [])

  const setSpeed = useCallback((key, value) => {
    setForm((f) => ({ ...f, travelSpeedAssumptions: { ...f.travelSpeedAssumptions, [key]: Number(value) } }))
    setDirty(true)
  }, [])

  const setBiome = useCallback((biome, value) => {
    setForm((f) => ({ ...f, biomeDistribution: { ...f.biomeDistribution, [biome]: Number(value) } }))
    setDirty(true)
  }, [])

  const handlePresetChange = (presetKey) => {
    const preset = SYSTEM_PRESETS[presetKey]
    setForm((f) => ({
      ...f,
      systemPreset: presetKey,
      hexSizeMiles: preset.hexSizeMiles,
      travelSpeedAssumptions: { ...preset.travelSpeed },
    }))
    setDirty(true)
  }

  const buildParams = () => {
    const p = { ...form }
    delete p.useDimensions
    if (!form.useDimensions) p.dimensions = null
    else if (!form.dimensions) p.dimensions = { width: 20, height: 13 }
    return p
  }

  const handleApply = () => {
    const params = buildParams()
    setParams(params)
    setDirty(false)
  }

  const handleApplyAndRegenerate = () => {
    const params = buildParams()
    setParams(params)
    setDirty(false)
    onRegenerate?.(params)
  }

  const biomeTotal = Object.values(form.biomeDistribution).reduce((s, v) => s + (v || 0), 0)
  const isCustomPreset = form.systemPreset === 'Custom'

  return (
    <div className="flex flex-col flex-1 min-h-0 text-sm">
      {/* ── Section tabs ─────────────────────────────────────── */}
      <div className="flex border-b border-slate-700/60 flex-shrink-0 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-2 text-xs shrink-0 border-b-2 transition-colors ${
              section === s
                ? 'border-blue-500 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Section body ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">

        {/* PRESET ─────────────────────────────────────────────── */}
        {section === 'Preset' && (
          <>
            <Field label="System Preset">
              <SegmentedControl
                options={Object.keys(SYSTEM_PRESETS)}
                value={form.systemPreset}
                onChange={handlePresetChange}
              />
            </Field>

            <Field label={`Travel Speeds (miles/day)${isCustomPreset ? '' : ' — read-only'}`}>
              <div className="space-y-2">
                {SPEED_KEYS.map((k) => {
                  const mph = form.travelSpeedAssumptions[k] ?? 0
                  const hexes = milesPerDayToHexes(mph, { hexSizeMiles: form.hexSizeMiles })
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-28 shrink-0">{SPEED_LABELS[k]}</span>
                      {isCustomPreset ? (
                        <input
                          type="number" min={1} max={100}
                          value={mph}
                          onChange={(e) => setSpeed(k, e.target.value)}
                          className={`${INPUT} w-16 text-center`}
                        />
                      ) : (
                        <span className="text-slate-300 text-xs w-16 text-center">{mph}</span>
                      )}
                      <span className="text-xs text-slate-600">mi/day</span>
                      <span className="text-xs text-slate-500 ml-auto">
                        = {hexes} hex{hexes !== 1 ? 'es' : ''}/day
                      </span>
                    </div>
                  )
                })}
              </div>
            </Field>

            <Field label="Hex Size">
              {isCustomPreset ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={100}
                    value={form.hexSizeMiles}
                    onChange={(e) => set('hexSizeMiles', Number(e.target.value))}
                    className={`${INPUT} w-20`}
                  />
                  <span className="text-xs text-slate-500">miles per hex</span>
                </div>
              ) : (
                <p className="text-xs text-slate-300">{form.hexSizeMiles} miles per hex</p>
              )}
            </Field>
          </>
        )}

        {/* SIZE ───────────────────────────────────────────────── */}
        {section === 'Size' && (
          <>
            <Field label="Size Mode">
              <SegmentedControl
                options={['Hex Count', 'Dimensions']}
                value={form.useDimensions ? 'Dimensions' : 'Hex Count'}
                onChange={(v) => set('useDimensions', v === 'Dimensions')}
              />
            </Field>

            {form.useDimensions ? (
              <Field label="Grid Dimensions (columns × rows)">
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={2} max={100}
                    value={form.dimensions?.width ?? 20}
                    onChange={(e) => set('dimensions', { ...(form.dimensions ?? { height: 13 }), width: Number(e.target.value) })}
                    className={`${INPUT} w-16 text-center`}
                  />
                  <span className="text-slate-500 text-xs">×</span>
                  <input
                    type="number" min={2} max={100}
                    value={form.dimensions?.height ?? 13}
                    onChange={(e) => set('dimensions', { ...(form.dimensions ?? { width: 20 }), height: Number(e.target.value) })}
                    className={`${INPUT} w-16 text-center`}
                  />
                  <span className="text-xs text-slate-500">
                    = {(form.dimensions?.width ?? 20) * (form.dimensions?.height ?? 13)} hexes
                  </span>
                </div>
              </Field>
            ) : (
              <Field label="Total Hex Count">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={20} max={1000} step={10}
                      value={form.hexCount}
                      onChange={(e) => set('hexCount', Number(e.target.value))}
                      className="flex-1 accent-blue-500"
                    />
                    <input
                      type="number" min={20} max={1000}
                      value={form.hexCount}
                      onChange={(e) => set('hexCount', Math.max(20, Math.min(1000, Number(e.target.value))))}
                      className={`${INPUT} w-16 text-center`}
                    />
                  </div>
                  <p className="text-[10px] text-slate-600">
                    Typical: 100–300 · Max: 1000
                    {form.hexCount > 500 && <span className="text-yellow-600"> · Large grids may be slow</span>}
                  </p>
                </div>
              </Field>
            )}

            <Field label="Approximate Coverage">
              <p className="text-xs text-slate-400">
                {(effectiveCount(form) * form.hexSizeMiles * form.hexSizeMiles).toLocaleString()} mi²
                &nbsp;·&nbsp;
                {Math.round(effectiveCount(form) * form.hexSizeMiles * form.hexSizeMiles / 640).toLocaleString()} sq miles (approx)
              </p>
            </Field>
          </>
        )}

        {/* SHAPE ──────────────────────────────────────────────── */}
        {section === 'Shape' && (
          <Field label="Map Shape">
            <div className="space-y-2">
              {MAP_SHAPES.map((shape) => (
                <label key={shape} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="mapShape"
                    value={shape}
                    checked={form.mapShape === shape}
                    onChange={() => set('mapShape', shape)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <span className={`text-xs capitalize font-medium ${form.mapShape === shape ? 'text-blue-300' : 'text-slate-300 group-hover:text-slate-200'}`}>
                      {shape}
                    </span>
                    <p className="text-[10px] text-slate-600">{SHAPE_DESC[shape]}</p>
                  </div>
                </label>
              ))}
            </div>
          </Field>
        )}

        {/* WORLD ──────────────────────────────────────────────── */}
        {section === 'World' && (
          <>
            <Field label="Settlement Density">
              <SegmentedControl options={DENSITIES} value={form.settlementDensity} onChange={(v) => set('settlementDensity', v)} />
            </Field>
            <Field label="Political Fragmentation">
              <SegmentedControl options={FRAG_OPTIONS} value={form.politicalFragmentation} onChange={(v) => set('politicalFragmentation', v)} />
            </Field>
            <Field label="Danger Distribution">
              <SegmentedControl options={DANGER_OPTS} value={form.dangerDistribution} onChange={(v) => set('dangerDistribution', v)} />
            </Field>
            <Field label="Magic Density">
              <SegmentedControl options={MAGIC_OPTS} value={form.magicDensity} onChange={(v) => set('magicDensity', v)} />
            </Field>
            <Field label="Age of World">
              <SegmentedControl options={AGE_OPTS} value={form.ageOfWorld} onChange={(v) => set('ageOfWorld', v)} wrap />
            </Field>
            <Field label={`Weirdness Factor — ${form.weirndesseFactor}/10`}>
              <input
                type="range" min={0} max={10} step={1}
                value={form.weirndesseFactor}
                onChange={(e) => set('weirndesseFactor', Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>Realistic</span>
                <span>Weird</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                {WEIRDNESS_DESC[form.weirndesseFactor] ?? ''}
              </p>
            </Field>
          </>
        )}

        {/* BIOMES ─────────────────────────────────────────────── */}
        {section === 'Biomes' && (
          <>
            <p className="text-xs text-slate-500">
              Set preferred coverage percentages. Leave blank to let the solver decide.
              {biomeTotal > 0 && (
                <span className={biomeTotal > 105 || biomeTotal < 95 ? ' text-yellow-500' : ' text-green-500'}>
                  {' '}Total: {biomeTotal}%
                </span>
              )}
            </p>
            <div className="space-y-3">
              {BIOME_TYPES.map((biome) => {
                const val = form.biomeDistribution[biome] ?? ''
                return (
                  <div key={biome} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 capitalize w-24 shrink-0">{biome}</span>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={val || 0}
                      onChange={(e) => setBiome(biome, e.target.value === '0' && !val ? '' : e.target.value)}
                      className="flex-1 accent-blue-500"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={100}
                        value={val}
                        onChange={(e) => setBiome(biome, e.target.value)}
                        placeholder="—"
                        className={`${INPUT} w-14 text-center`}
                      />
                      <span className="text-xs text-slate-600">%</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => { setForm((f) => ({ ...f, biomeDistribution: {} })); setDirty(true) }}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate-700/60 flex gap-2 flex-shrink-0">
        <button
          onClick={handleApplyAndRegenerate}
          className="flex-1 px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs transition-colors"
        >
          Apply &amp; Regenerate
        </button>
        <button
          onClick={handleApply}
          disabled={!dirty}
          className="px-3 py-1.5 rounded border border-slate-600 hover:border-slate-400 text-slate-300 text-xs transition-colors disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveCount(form) {
  if (form.useDimensions && form.dimensions) {
    return form.dimensions.width * form.dimensions.height
  }
  return form.hexCount
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

function SegmentedControl({ options, value, onChange, wrap = false }) {
  return (
    <div className={`flex gap-1 ${wrap ? 'flex-wrap' : ''}`}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2 py-1 text-xs rounded border capitalize transition-colors ${
            value === opt
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

// ── Static data ───────────────────────────────────────────────────────────────

const INPUT = 'bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500 transition-colors'

const SHAPE_DESC = {
  rectangle:  'Simple grid, good for campaign maps and structured regions.',
  circular:   'Round landmass, useful for islands or self-contained regions.',
  continent:  'Organic coastline with interior terrain variation.',
  island:     'Small landmass surrounded by ocean hexes.',
  irregular:  'Asymmetric shape, best for unusual campaign areas.',
}

const WEIRDNESS_DESC = {
  0: 'Strict biome adjacency. Cold never touches hot. Coasts require ocean.',
  1: 'Near-strict. Rare natural exceptions only.',
  2: 'Standard. Occasional odd adjacency from terrain features.',
  3: 'Slightly loose. Magical geography tolerated.',
  4: 'Noticeable oddities. Volcanic tundra, desert coasts.',
  5: 'Half and half. Strange terrain expected.',
  6: 'Unusual biome pairings common.',
  7: 'Highly strange. Geography barely follows natural rules.',
  8: 'Very weird. Dimensional anomalies likely.',
  9: 'Near-planar. Most adjacency rules ignored.',
  10: 'Full weirdness. Anything next to anything.',
}
