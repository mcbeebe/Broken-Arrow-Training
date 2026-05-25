import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useDisplayPreferences,
  resolveFlags,
  resolveSectionVisible,
} from '../hooks/useDisplayPreferences'
import { DETAIL_LEVEL_PRESETS } from '../types'

describe('display-preference resolution (pure)', () => {
  it('resolves the preset flags for each level', () => {
    expect(resolveFlags({ detailLevel: 'simple' })).toEqual(DETAIL_LEVEL_PRESETS.simple)
    expect(resolveFlags({ detailLevel: 'balanced' })).toEqual(DETAIL_LEVEL_PRESETS.balanced)
    expect(resolveFlags({ detailLevel: 'detailed' })).toEqual(DETAIL_LEVEL_PRESETS.detailed)
  })

  it('layers explicit flag overrides on top of the preset', () => {
    const flags = resolveFlags({ detailLevel: 'simple', overrides: { showTechnicalNames: true } })
    expect(flags.showTechnicalNames).toBe(true)
    // untouched keys still follow the preset
    expect(flags.showAdvancedMetrics).toBe(false)
  })

  it('hides data-heavy sections only at the simple level, unless overridden', () => {
    expect(resolveSectionVisible({ detailLevel: 'simple' }, 'dash.volume')).toBe(false)
    expect(resolveSectionVisible({ detailLevel: 'balanced' }, 'dash.volume')).toBe(true)
    // explicit override wins over the preset
    expect(resolveSectionVisible({ detailLevel: 'simple', sectionOverrides: { 'dash.volume': true } }, 'dash.volume')).toBe(true)
    expect(resolveSectionVisible({ detailLevel: 'detailed', sectionOverrides: { 'dash.volume': false } }, 'dash.volume')).toBe(false)
  })
})

describe('useDisplayPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to balanced when nothing is stored', () => {
    const { result } = renderHook(() => useDisplayPreferences('a1'))
    expect(result.current.detailLevel).toBe('balanced')
    expect(result.current.flags.showTechnicalNames).toBe(false)
    expect(result.current.flags.showAdvancedMetrics).toBe(true)
  })

  it('mirrors the legacy technical-names key when the level turns it on', () => {
    const { result } = renderHook(() => useDisplayPreferences('a2'))
    act(() => result.current.setDetailLevel('detailed'))
    expect(result.current.flags.showTechnicalNames).toBe(true)
    expect(localStorage.getItem('ba_show_technical_terms_a2')).toBe('true')

    act(() => result.current.setDetailLevel('simple'))
    expect(localStorage.getItem('ba_show_technical_terms_a2')).toBe('false')
  })

  it('migrates a pre-existing legacy technical-names choice on first run', () => {
    localStorage.setItem('ba_show_technical_terms_a3', 'true')
    const { result } = renderHook(() => useDisplayPreferences('a3'))
    // balanced preset has technical names off, but the legacy choice is preserved
    expect(result.current.flags.showTechnicalNames).toBe(true)
  })

  it('seeds the detail level from onboarding config when no prefs exist', () => {
    localStorage.setItem('ba_onboarding_a4', JSON.stringify({ detailLevel: 'detailed' }))
    const { result } = renderHook(() => useDisplayPreferences('a4'))
    expect(result.current.detailLevel).toBe('detailed')
    expect(result.current.flags.showTechnicalNames).toBe(true)
  })

  it('applies and resets granular flag + section overrides', () => {
    const { result } = renderHook(() => useDisplayPreferences('a5'))
    act(() => result.current.setFlagOverride('showAdvancedMetrics', false))
    expect(result.current.flags.showAdvancedMetrics).toBe(false)

    act(() => result.current.setSectionOverride('dash.volume', false))
    expect(result.current.isSectionVisible('dash.volume')).toBe(false)

    act(() => result.current.resetOverrides())
    expect(result.current.flags.showAdvancedMetrics).toBe(true)
    expect(result.current.isSectionVisible('dash.volume')).toBe(true)
  })
})
