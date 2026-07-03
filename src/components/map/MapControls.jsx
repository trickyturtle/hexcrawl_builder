import React from 'react'
import { useUiStore } from '../../store/uiStore.js'

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

export default function MapControls() {
  const overlays = useUiStore((s) => s.overlays)
  const toggleOverlay = useUiStore((s) => s.toggleOverlay)

  return (
    <div className="h-9 border-b border-slate-700 flex items-center px-3 gap-1.5 overflow-x-auto">
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
    </div>
  )
}
