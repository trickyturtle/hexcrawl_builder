export const SYSTEM_PRESETS = {
  OSR: {
    name: 'OSR',
    hexSizeMiles: 6,
    travelSpeed: {
      road: 24,
      crossCountry: 18,
      forest: 12,
      hills: 12,
      mountains: 6,
    },
  },
  '5e': {
    name: 'D&D 5e',
    hexSizeMiles: 6,
    travelSpeed: {
      road: 24,
      crossCountry: 18,
      forest: 9,
      hills: 9,
      mountains: 6,
    },
  },
  Custom: {
    name: 'Custom',
    hexSizeMiles: 6,
    travelSpeed: {
      road: 24,
      crossCountry: 18,
      forest: 12,
      hills: 12,
      mountains: 6,
    },
  },
}

export function milesPerDayToHexes(miles, preset) {
  return Math.round(miles / preset.hexSizeMiles)
}
