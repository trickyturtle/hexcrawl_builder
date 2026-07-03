import { describe, it, expect } from 'vitest'
import { normalizeWorldData } from './worldIO.js'

describe('normalizeWorldData', () => {
  it('migrates the weirndesseFactor legacy key', () => {
    const out = normalizeWorldData({ hexCount: 200, weirndesseFactor: 7 })
    expect(out.weirdnessFactor).toBe(7)
    expect(out).not.toHaveProperty('weirndesseFactor')
    expect(out.hexCount).toBe(200)
  })

  it('migrates the weirndessFactor legacy key', () => {
    const out = normalizeWorldData({ weirndessFactor: 4 })
    expect(out.weirdnessFactor).toBe(4)
    expect(out).not.toHaveProperty('weirndessFactor')
  })

  it('prefers an existing correct key over legacy keys', () => {
    const out = normalizeWorldData({ weirdnessFactor: 3, weirndesseFactor: 9 })
    expect(out.weirdnessFactor).toBe(3)
    expect(out).not.toHaveProperty('weirndesseFactor')
  })

  it('preserves a legacy value of 0', () => {
    expect(normalizeWorldData({ weirndesseFactor: 0 }).weirdnessFactor).toBe(0)
  })

  it('leaves modern data untouched', () => {
    const modern = { hexCount: 100, weirdnessFactor: 5, mapShape: 'island' }
    expect(normalizeWorldData({ ...modern })).toEqual(modern)
  })

  it('passes through null / missing data', () => {
    expect(normalizeWorldData(null)).toBeNull()
    expect(normalizeWorldData(undefined)).toBeUndefined()
  })
})
