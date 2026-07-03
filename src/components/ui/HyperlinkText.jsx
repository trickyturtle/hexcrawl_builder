import React from 'react'
import { useEntityStore } from '../../store/entityStore.js'
import { useUiStore } from '../../store/uiStore.js'

// Parses text for [[Entity Name]] or [[Entity Name|display text]] patterns
// and renders them as clickable links that navigate to the named entity.
// Unrecognised links still render as styled text so the author knows they exist.
const LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

export default function HyperlinkText({ text, className = '' }) {
  const entities = useEntityStore((s) => s.entities)
  const selectEntity = useUiStore((s) => s.selectEntity)

  if (!text) return null

  // Build name → entity lookup (case-insensitive)
  const byName = React.useMemo(() => {
    const map = {}
    for (const e of Object.values(entities)) {
      if (e.name) map[e.name.toLowerCase()] = e
    }
    return map
  }, [entities])

  const parts = []
  let last = 0
  let match

  LINK_RE.lastIndex = 0
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) })
    }
    const targetName = match[1]
    const display = match[2] ?? match[1]
    const entity = byName[targetName.toLowerCase()]
    parts.push({ type: 'link', targetName, display, entity })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })

  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <React.Fragment key={i}>{p.value}</React.Fragment>
        if (p.entity) {
          return (
            <button
              key={i}
              onClick={() => selectEntity(p.entity.id)}
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              {p.display}
            </button>
          )
        }
        // Unresolved link — show styled but not clickable, title shows raw target
        return (
          <span
            key={i}
            title={`Unknown entity: ${p.targetName}`}
            className="text-slate-500 border-b border-dashed border-slate-600"
          >
            {p.display}
          </span>
        )
      })}
    </span>
  )
}
