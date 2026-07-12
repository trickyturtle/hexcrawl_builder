import { create } from 'zustand'
import { SYSTEM_PRESETS } from '../data/presets/systemPresets.js'

export const useWorldStore = create((set) => ({
  // Map parameters
  hexCount: 200,
  dimensions: null,         // { width, height } — if set, overrides hexCount
  hexSizeMiles: 6,
  mapShape: 'continent',
  settlementDensity: 'medium',
  politicalFragmentation: 'fragmented',
  dangerDistribution: 'even',
  magicDensity: 'low',
  ageOfWorld: 'mature',
  weirdnessFactor: 2,
  biomeDistribution: {},
  systemPreset: 'OSR',
  travelSpeedAssumptions: { ...SYSTEM_PRESETS.OSR.travelSpeed },
  currentSeason: null, // null | 'spring' | 'summer' | 'autumn' | 'winter'

  setParam: (key, value) => set({ [key]: value }),
  setParams: (params) => set(params),
  hydrate: (data) => set(data),
}))
