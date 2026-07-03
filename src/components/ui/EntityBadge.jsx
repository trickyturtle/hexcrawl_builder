import React from 'react'

const SUBCLASS_STYLE = {
  Location:         'bg-amber-900/50 text-amber-300 border-amber-700/40',
  Faction:          'bg-blue-900/50 text-blue-300 border-blue-700/40',
  Nation:           'bg-purple-900/50 text-purple-300 border-purple-700/40',
  Religion:         'bg-yellow-900/40 text-yellow-300 border-yellow-700/40',
  NPC:              'bg-green-900/50 text-green-300 border-green-700/40',
  GeographicFeature:'bg-teal-900/50 text-teal-300 border-teal-700/40',
  Event:            'bg-red-900/50 text-red-300 border-red-700/40',
}

const DEFAULT_STYLE = 'bg-slate-700 text-slate-300 border-slate-600'

export default function EntityBadge({ subclass, className = '' }) {
  const style = SUBCLASS_STYLE[subclass] ?? DEFAULT_STYLE
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none ${style} ${className}`}>
      {subclass ?? 'Entity'}
    </span>
  )
}
