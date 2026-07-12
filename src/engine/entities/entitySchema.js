import { v4 as uuidv4 } from 'uuid'

export const ENTITY_SUBCLASSES = [
  'Location',
  'Faction',
  'Nation',
  'Religion',
  'NPC',
  'GeographicFeature',
  'Event',
]

export function createEntity(fields = {}) {
  return {
    id: uuidv4(),
    name: '',
    description: '',
    subclass: 'Location',
    // Subclass-specific fields (unused fields stay at defaults for other subclasses):
    // Faction / Nation
    homeBaseEntityId: null,          // Location entity serving as home base
    territoryTendency: 'concentrated', // 'concentrated' | 'diffuse'
    territorySize: 'medium',          // 'small' | 'medium' | 'large' — scales the world default
    // Nation only
    diplomaticStatus: '',             // free text (e.g. "at war with the Reach")
    // Event only
    timelinePosition: '',             // free text (e.g. "300 years ago", "ongoing")
    // Location / GeographicFeature: number of hexes the entity spans (1–7).
    // The solver places the primary hex, then claims adjacent land hexes.
    hexFootprint: 1,
    sources: [],
    // locale: optional string that groups entities within a module into geographic clusters.
    // Entities sharing a locale are placed near each other; entities in different locales
    // of the same module are pushed apart. e.g. 'keep', 'caves', 'dungeon', 'city'.
    locale: null,
    obsidianLink: null,
    pdfReference: null,
    relationships: [],
    locationRequirements: {
      terrainAffinity: [],
      biomeRequirements: [],
      elevationRequirements: [],
      proximityRequirements: [],
    },
    tags: [],
    ...fields,
  }
}
