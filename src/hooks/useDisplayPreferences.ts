import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DETAIL_LEVEL_PRESETS,
  type DetailLevel,
  type DisplayFlags,
  type DisplayPreferences,
  type SectionId,
} from '../types'

// Athlete-scoped display preferences: the detail-level preset plus granular
// flag overrides and section show/hide. Mirrors the per-athlete localStorage
// pattern used by useTerminologyMode.
//
// Backward-compat: this hook is the source of truth for the detail level, but
// it keeps the legacy `ba_show_technical_terms_{athleteId}` key in lockstep so
// the existing <Term> component (via useTerminologyMode) keeps working with
// zero changes. We never touch useTerminologyMode itself.

const STORAGE_PREFIX = 'ba_display_prefs_v1:'
const LEGACY_TERMS_PREFIX = 'ba_show_technical_terms_'
const ONBOARDING_PREFIX = 'ba_onboarding_'
// Same-tab broadcast so multiple hook instances stay in sync without a reload
// (the native `storage` event only fires in *other* tabs).
const SYNC_EVENT = 'ba-display-prefs-changed'

function storageKey(athleteId: string | undefined): string {
  return `${STORAGE_PREFIX}${athleteId ?? 'anon'}`
}

function legacyTermsKey(athleteId: string | undefined): string {
  return `${LEGACY_TERMS_PREFIX}${athleteId ?? 'anon'}`
}

function onboardingKey(athleteId: string | undefined): string {
  return athleteId ? `${ONBOARDING_PREFIX}${athleteId}` : 'ba_onboarding'
}

function isDetailLevel(v: unknown): v is DetailLevel {
  return v === 'simple' || v === 'balanced' || v === 'detailed'
}

function readStored(athleteId: string | undefined): DisplayPreferences | null {
  try {
    const raw = localStorage.getItem(storageKey(athleteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DisplayPreferences
    if (!isDetailLevel(parsed?.detailLevel)) return null
    return parsed
  } catch {
    return null
  }
}

function readOnboardingDetailLevel(athleteId: string | undefined): DetailLevel | null {
  try {
    const raw = localStorage.getItem(onboardingKey(athleteId))
    if (!raw) return null
    const cfg = JSON.parse(raw)
    return isDetailLevel(cfg?.detailLevel) ? cfg.detailLevel : null
  } catch {
    return null
  }
}

function readLegacyTechnical(athleteId: string | undefined): boolean {
  try {
    return localStorage.getItem(legacyTermsKey(athleteId)) === 'true'
  } catch {
    return false
  }
}

// First-run defaults when no display-prefs key exists yet: derive the level
// from onboarding, and preserve a pre-existing legacy "technical names" choice.
function readInitial(athleteId: string | undefined): DisplayPreferences {
  const stored = readStored(athleteId)
  if (stored) return stored

  const detailLevel = readOnboardingDetailLevel(athleteId) ?? 'balanced'
  const overrides: Partial<DisplayFlags> = {}
  if (readLegacyTechnical(athleteId) && !DETAIL_LEVEL_PRESETS[detailLevel].showTechnicalNames) {
    overrides.showTechnicalNames = true
  }
  return Object.keys(overrides).length > 0 ? { detailLevel, overrides } : { detailLevel }
}

export function resolveFlags(prefs: DisplayPreferences): DisplayFlags {
  return { ...DETAIL_LEVEL_PRESETS[prefs.detailLevel], ...(prefs.overrides ?? {}) }
}

// Every hideable section is data-heavy, so it is hidden by default only at the
// 'simple' level; balanced/detailed show everything unless explicitly hidden.
function presetSectionVisible(level: DetailLevel): boolean {
  return level !== 'simple'
}

export function resolveSectionVisible(prefs: DisplayPreferences, id: SectionId): boolean {
  return prefs.sectionOverrides?.[id] ?? presetSectionVisible(prefs.detailLevel)
}

export function useDisplayPreferences(athleteId?: string) {
  const [prefs, setPrefs] = useState<DisplayPreferences>(() => readInitial(athleteId))
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    setPrefs(readInitial(athleteId))
  }, [athleteId])

  // Seed the stored prefs on first run so the level chosen at onboarding takes
  // effect immediately — and so the legacy technical-names key gets mirrored
  // (otherwise <Term> would lag the 'detailed' preset). No-op once stored.
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey(athleteId)) === null) {
        persist(readInitial(athleteId))
      }
    } catch {
      // ignore
    }
    // persist is stable per athleteId; intentionally seed only on athlete change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId])

  useEffect(() => {
    const k = storageKey(athleteId)
    const legacy = legacyTermsKey(athleteId)
    const reread = () => setPrefs(readInitial(athleteId))
    function onStorage(e: StorageEvent) {
      if (e.key === k || e.key === legacy) reread()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(SYNC_EVENT, reread)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SYNC_EVENT, reread)
    }
  }, [athleteId])

  const persist = useCallback(
    (next: DisplayPreferences) => {
      prefsRef.current = next
      try {
        localStorage.setItem(storageKey(athleteId), JSON.stringify(next))
        // Keep the legacy boolean mirrored so <Term> stays in sync.
        localStorage.setItem(legacyTermsKey(athleteId), resolveFlags(next).showTechnicalNames ? 'true' : 'false')
      } catch {
        // localStorage may be unavailable; in-memory state still updates.
      }
      setPrefs(next)
      try {
        window.dispatchEvent(new Event(SYNC_EVENT))
      } catch {
        // Event constructor unavailable in some embedded contexts.
      }
    },
    [athleteId],
  )

  // Choosing a level is a fresh start for flag tweaks, but keeps explicit
  // section show/hide (decluttering is independent of the detail preset).
  const setDetailLevel = useCallback(
    (level: DetailLevel) => {
      const prev = prefsRef.current
      persist({ detailLevel: level, sectionOverrides: prev.sectionOverrides })
    },
    [persist],
  )

  const setFlagOverride = useCallback(
    <K extends keyof DisplayFlags>(flag: K, value: DisplayFlags[K]) => {
      const prev = prefsRef.current
      persist({ ...prev, overrides: { ...prev.overrides, [flag]: value } })
    },
    [persist],
  )

  const setSectionOverride = useCallback(
    (id: SectionId, visible: boolean) => {
      const prev = prefsRef.current
      persist({ ...prev, sectionOverrides: { ...prev.sectionOverrides, [id]: visible } })
    },
    [persist],
  )

  const resetOverrides = useCallback(() => {
    persist({ detailLevel: prefsRef.current.detailLevel })
  }, [persist])

  const flags = useMemo(() => resolveFlags(prefs), [prefs])

  const isSectionVisible = useCallback(
    (id: SectionId) => resolveSectionVisible(prefs, id),
    [prefs],
  )

  return {
    prefs,
    detailLevel: prefs.detailLevel,
    flags,
    isSectionVisible,
    setDetailLevel,
    setFlagOverride,
    setSectionOverride,
    resetOverrides,
  }
}
