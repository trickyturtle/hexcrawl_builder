// Stable color assignment for faction/nation/religion overlays: an entity id
// always hashes to the same palette slot, so colors survive reloads and don't
// shift when other entities are added. Entries are "r,g,b" so callers pick
// their own alpha.
const OVERLAY_PALETTE = [
  '59,130,246',   // blue
  '245,158,11',   // amber
  '16,185,129',   // green
  '239,68,68',    // red
  '139,92,246',   // purple
  '236,72,153',   // pink
  '20,184,166',   // teal
  '249,115,22',   // orange
]

function hashIdx(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % OVERLAY_PALETTE.length
}

export function colorForId(id) {
  return OVERLAY_PALETTE[hashIdx(id)]
}
