import { describe, it, expect } from 'vitest'
import {
  indexVault, resolveNoteLink, buildObsidianUri,
  sanitizeNoteName, entityNoteContent, writeEntityNote, readNote,
} from './obsidianVault.js'

// ── Mock File System Access API handles ───────────────────────────────────────
function mockFile(name, content = '') {
  return {
    kind: 'file',
    name,
    async getFile() { return { text: async () => content } },
  }
}

function mockDir(name, children) {
  const files = {}
  return {
    kind: 'directory',
    name,
    children,
    async *values() { yield* children },
    async getDirectoryHandle(dirName) {
      const d = children.find((c) => c.kind === 'directory' && c.name === dirName)
      if (!d) throw new DOMException('not found', 'NotFoundError')
      return d
    },
    async getFileHandle(fileName, opts) {
      const f = children.find((c) => c.kind === 'file' && c.name === fileName)
      if (f) return f
      if (!opts?.create) throw new DOMException('not found', 'NotFoundError')
      const created = {
        kind: 'file',
        name: fileName,
        async getFile() { return { text: async () => files[fileName] ?? '' } },
        async createWritable() {
          return {
            write: async (data) => { files[fileName] = data },
            close: async () => {},
          }
        },
      }
      children.push(created)
      return created
    },
    _written: files,
  }
}

const vault = () => mockDir('MyVault', [
  mockFile('The Baron.md', '---\ntags: [npc]\n---\nA cruel man with a kind dog.'),
  mockFile('readme.txt', 'not a note'),
  mockDir('.obsidian', [mockFile('config.md', 'skip me')]),
  mockDir('places', [
    mockFile('Iron Keep.md', 'A fortress of black stone.'),
    mockDir('ruins', [mockFile('Old Tower.md', 'Fallen.')]),
  ]),
])

describe('indexVault', () => {
  it('indexes .md notes recursively, skipping dot-directories and non-notes', async () => {
    const index = await indexVault(vault())
    expect(index.count).toBe(3)
    expect(index.byName['the baron']).toBe('The Baron')
    expect(index.byName['iron keep']).toBe('places/Iron Keep')
    expect(index.byName['old tower']).toBe('places/ruins/Old Tower')
    expect(index.byName['config']).toBeUndefined()
  })
})

describe('resolveNoteLink', () => {
  it('resolves basenames, full paths, and heading suffixes case-insensitively', async () => {
    const index = await indexVault(vault())
    expect(resolveNoteLink(index, 'The Baron')).toBe('The Baron')
    expect(resolveNoteLink(index, 'iron keep')).toBe('places/Iron Keep')
    expect(resolveNoteLink(index, 'places/Iron Keep')).toBe('places/Iron Keep')
    expect(resolveNoteLink(index, 'Iron Keep#History')).toBe('places/Iron Keep')
    expect(resolveNoteLink(index, 'Iron Keep.md')).toBe('places/Iron Keep')
    expect(resolveNoteLink(index, 'No Such Note')).toBeNull()
  })
})

describe('buildObsidianUri', () => {
  it('builds the vault-qualified obsidian://open URI with encoding', () => {
    const uri = buildObsidianUri('My Vault', 'places/Iron Keep')
    expect(uri).toBe('obsidian://open?vault=My+Vault&file=places%2FIron+Keep')
  })
})

describe('readNote', () => {
  it('reads nested notes by vault-relative path', async () => {
    const text = await readNote(vault(), 'places/ruins/Old Tower')
    expect(text).toBe('Fallen.')
  })
})

describe('entity notes', () => {
  const entity = {
    id: 'ent-1', name: 'The Baroness', subclass: 'NPC',
    description: 'Sharp-eyed and sharper-tongued.',
    tags: ['court', 'schemer'],
    relationships: [
      { id: 'r1', fromEntityId: 'ent-1', toEntityId: 'ent-2', directionality: 'one-way', label: 'despises' },
    ],
  }
  const entities = { 'ent-2': { id: 'ent-2', name: 'The Baron' } }

  it('sanitizes forbidden filename characters', () => {
    expect(sanitizeNoteName('The Baron: a "study" [draft] #2')).toBe('The Baron a study draft 2')
    expect(sanitizeNoteName('')).toBe('Unnamed Entity')
  })

  it('renders frontmatter, description, and relationship wikilinks', () => {
    const md = entityNoteContent(entity, entities)
    expect(md).toContain('entity-id: ent-1')
    expect(md).toContain('type: NPC')
    expect(md).toContain('tags: [court, schemer]')
    expect(md).toContain('# The Baroness')
    expect(md).toContain('Sharp-eyed and sharper-tongued.')
    expect(md).toContain('- → [[The Baron]] — despises')
  })

  it('writes a new note and never overwrites an existing one', async () => {
    const dir = vault()
    const first = await writeEntityNote(dir, entity, entities)
    expect(first).toEqual({ path: 'The Baroness', existed: false })
    expect(dir._written['The Baroness.md']).toContain('# The Baroness')

    // existing note with the same name → link, don't clobber
    const clash = await writeEntityNote(dir, { ...entity, name: 'The Baron' }, entities)
    expect(clash).toEqual({ path: 'The Baron', existed: true })
    expect(dir._written['The Baron.md']).toBeUndefined() // untouched
  })
})
