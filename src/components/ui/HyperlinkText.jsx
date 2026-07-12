import React from 'react'
import { useEntityStore } from '../../store/entityStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { useVaultStore } from '../../store/vaultStore.js'
import { resolveNoteLink, buildObsidianUri } from '../../persistence/obsidianVault.js'

// Parses text for [[Entity Name]] or [[Entity Name|display text]] patterns
// and renders them as clickable links that navigate to the named entity.
// Unrecognised links still render as styled text so the author knows they exist.
// Kept as source (not a /g regex instance): a shared global regex carries
// lastIndex state across renders, which is a concurrency hazard.
const LINK_SOURCE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/.source

export default function HyperlinkText({ text, className = '' }) {
  const entities = useEntityStore((s) => s.entities)
  const selectEntity = useUiStore((s) => s.selectEntity)
  const vaultName = useVaultStore((s) => s.vaultName)
  const noteIndex = useVaultStore((s) => s.noteIndex)

  // Build name → entity lookup (case-insensitive).
  // Hooks must run unconditionally — the empty-text early return comes after.
  const byName = React.useMemo(() => {
    const map = {}
    for (const e of Object.values(entities)) {
      if (e.name) map[e.name.toLowerCase()] = e
    }
    return map
  }, [entities])

  if (!text) return null

  const linkRe = new RegExp(LINK_SOURCE, 'g')
  const parts = []
  let last = 0
  let match

  while ((match = linkRe.exec(text)) !== null) {
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
        // No entity match — try the connected Obsidian vault
        const notePath = noteIndex ? resolveNoteLink(noteIndex, p.targetName) : null
        if (notePath) {
          return (
            <button
              key={i}
              onClick={() => window.open(buildObsidianUri(vaultName, notePath), '_blank', 'noreferrer')}
              title={`Open in Obsidian: ${notePath}`}
              className="text-violet-400 hover:text-violet-300 hover:underline transition-colors"
            >
              ⬡{p.display}
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
