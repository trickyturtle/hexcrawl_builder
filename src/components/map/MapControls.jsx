import React from 'react'
import { useUiStore } from '../../store/uiStore.js'
import { useEntityStore } from '../../store/entityStore.js'
import { useWorldStore } from '../../store/worldStore.js'
import { colorForId } from './overlayColors.js'

const OVERLAYS = [
  { key: 'terrain',        label: 'Terrain' },
  { key: 'factions',       label: 'Factions' },
  { key: 'nations',        label: 'Nations' },
  { key: 'religion',       label: 'Religion' },
  { key: 'danger',         label: 'Danger' },
  { key: 'magic',          label: 'Magic' },
  { key: 'fog',            label: 'Fog of War' },
  { key: 'moduleFootprints', label: 'Modules' },
  { key: 'tradeRoutes',    label: 'Trade Routes' },
]

const SEASONS = ['spring', 'summer', 'autumn', 'winter']

export default function MapControls() {
  const overlays = useUiStore((s) => s.overlays)
  const toggleOverlay = useUiStore((s) => s.toggleOverlay)
  const entities = useEntityStore((s) => s.entities)
  const season = useWorldStore((s) => s.currentSeason)
  const setParam = useWorldStore((s) => s.setParam)

  // Legend entries for whichever political overlays are active
  const legend = []
  if (overlays.factions || overlays.nations) {
    for (const e of Object.values(entities)) {
      if (e.subclass === 'Nation' && overlays.nations) legend.push(e)
      else if ((e.subclass === 'Faction' || e.subclass === 'Nation') && overlays.factions) legend.push(e)
    }
  }
  if (overlays.religion) {
    for (const e of Object.values(entities)) {
      if (e.subclass === 'Religion') legend.push(e)
    }
  }

  return (
    <div className="border-b border-slate-700 flex-shrink-0">
      <div className="h-9 flex items-center px-3 gap-1.5 overflow-x-auto">
        <span className="text-xs text-slate-500 mr-1 shrink-0">Overlays</span>
        {OVERLAYS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleOverlay(key)}
            className={`shrink-0 px-2 py-0.5 rounded text-xs border transition-colors ${
              overlays[key]
                ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}

        {/* Season selector — live-play temporal state */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-slate-500">Season</span>
          <select
            value={season ?? ''}
            onChange={(e) => setParam('currentSeason', e.target.value || null)}
            className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-300 capitalize focus:outline-none focus:border-blue-500"
          >
            <option value="">none</option>
            {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Legend for active political overlays */}
      {legend.length > 0 && (
        <div className="px-3 pb-1.5 flex items-center gap-3 flex-wrap">
          {legend.map((e) => (
            <span key={e.id} className="flex items-center gap-1 text-[10px] text-slate-400">
              {e.subclass === 'Religion' ? (
                <span className="w-2 h-2 shrink-0" style={{ background: `rgb(${colorForId(e.id)})` }} />
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: `rgba(${colorForId(e.id)},0.6)`, border: `1px solid rgb(${colorForId(e.id)})` }}
                />
              )}
              {e.name || 'Unnamed'}
              {e.subclass === 'Nation' && <span className="text-slate-600">(nation)</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
