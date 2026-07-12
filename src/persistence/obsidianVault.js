// Obsidian vault integration (File System Access API).
//
// The vault is a linked view, never the source of truth: the app indexes the
// vault's .md notes so [[wikilinks]] resolve, entity links open in Obsidian
// via its URI scheme, and entity notes can optionally be written back. The
// tool works fully without a vault connected.

// ── Indexing ──────────────────────────────────────────────────────────────────
// Walks the vault directory and indexes every .md note two ways:
//   byName — lowercased basename → path   (how Obsidian resolves [[Note]])
//   byPath — lowercased full path → path  (for [[folder/Note]] links)
// Paths are vault-relative, '/'-separated, without the .md extension.
// Dot-directories (.obsidian, .trash, …) are skipped.
export async function indexVault(dirHandle) {
  const byName = {}
  const byPath = {}
  let count = 0

  async function walk(handle, prefix) {
    for await (const entry of handle.values()) {
      if (entry.name.startsWith('.')) continue
      if (entry.kind === 'directory') {
        await walk(entry, `${prefix}${entry.name}/`)
      } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) {
        const base = entry.name.slice(0, -3)
        const path = `${prefix}${base}`
        // first note wins on basename collisions (Obsidian picks one too)
        if (!(base.toLowerCase() in byName)) byName[base.toLowerCase()] = path
        byPath[path.toLowerCase()] = path
        count++
      }
    }
  }

  await walk(dirHandle, '')
  return { byName, byPath, count }
}

// Resolve a wikilink target against the index. Handles [[Note]],
// [[folder/Note]], and heading suffixes ([[Note#Section]]). Returns the
// vault-relative path or null.
export function resolveNoteLink(index, rawTarget) {
  if (!index || !rawTarget) return null
  const target = rawTarget.split('#')[0].trim().replace(/\.md$/i, '')
  if (!target) return null
  const lower = target.toLowerCase()
  return index.byPath[lower] ?? index.byName[lower] ?? null
}

// ── Obsidian URI ──────────────────────────────────────────────────────────────
export function buildObsidianUri(vaultName, filePath) {
  const params = new URLSearchParams()
  if (vaultName) params.set('vault', vaultName)
  params.set('file', filePath)
  return `obsidian://open?${params.toString()}`
}

// ── Reading ───────────────────────────────────────────────────────────────────
// path is vault-relative without extension, e.g. 'npcs/The Baron'
export async function readNote(dirHandle, path) {
  const segments = path.replace(/\.md$/i, '').split('/').filter(Boolean)
  const fileName = `${segments.pop()}.md`
  let dir = dirHandle
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment)
  }
  const fh = await dir.getFileHandle(fileName)
  const file = await fh.getFile()
  return file.text()
}

// ── Writing entity notes back ─────────────────────────────────────────────────
export function sanitizeNoteName(name) {
  // characters Obsidian/filesystems reject in filenames
  const cleaned = (name || 'Unnamed Entity').replace(/[\\/:*?"<>|#^[\]]/g, '').trim()
  return cleaned || 'Unnamed Entity'
}

// Markdown content for an entity note: frontmatter + description +
// relationships as wikilinks so they resolve inside Obsidian too
export function entityNoteContent(entity, entitiesById = {}) {
  const lines = [
    '---',
    `entity-id: ${entity.id}`,
    `type: ${entity.subclass ?? 'Entity'}`,
  ]
  if (entity.tags?.length) lines.push(`tags: [${entity.tags.join(', ')}]`)
  lines.push('---', '', `# ${entity.name || 'Unnamed Entity'}`, '')
  if (entity.description) lines.push(entity.description, '')

  const rels = entity.relationships ?? []
  if (rels.length > 0) {
    lines.push('## Relationships', '')
    for (const rel of rels) {
      const otherId = rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId
      const other = entitiesById[otherId]
      const arrow = rel.directionality === 'bidirectional' ? '↔' : '→'
      const name = other?.name || otherId || 'Unknown'
      lines.push(`- ${arrow} [[${name}]]${rel.label ? ` — ${rel.label}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// Create a note for the entity in the vault root. Never overwrites: if a note
// with that name already exists, links to it instead of clobbering user prose.
// Returns { path, existed }.
export async function writeEntityNote(dirHandle, entity, entitiesById = {}) {
  const base = sanitizeNoteName(entity.name)
  const fileName = `${base}.md`

  try {
    await dirHandle.getFileHandle(fileName)
    return { path: base, existed: true }
  } catch {
    // doesn't exist — create it
  }

  const fh = await dirHandle.getFileHandle(fileName, { create: true })
  const writable = await fh.createWritable()
  await writable.write(entityNoteContent(entity, entitiesById))
  await writable.close()
  return { path: base, existed: false }
}
