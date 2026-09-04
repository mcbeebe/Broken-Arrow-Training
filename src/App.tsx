import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTravelActions } from './hooks/useTravelActions'
import type { ViewId, CoachSnapshot, CoachAction, PlannedDay, JournalNote } from './types'
import { resolveViewId, resolveDeepLink } from './utils/viewId'
import { DETAIL_DIRECTIVES } from './types'
import { plans } from './data'
import { generateHyroxPlan } from './utils/planGenerator'
import { useStrava } from './hooks/useStrava'
import { useGarmin } from './hooks/useGarmin'
import { repushChangedWorkouts } from './utils/garminRepush'
import { realignmentContextForWeeks } from './utils/realignment'
import { mondayOnOrBefore, todayDateString } from './utils/planDates'
import { deriveFitnessFromHistory } from './utils/fitnessFromHistory'
import { useSeason } from './hooks/useSeason'
import { spliceSeasonWithReport } from './engines/season/spliceSeason'
import { layeringAdvisories } from './engines/season/layeringAdvisories'
import { raceDateToIso } from './engines/season'
import { buildSeasonContext } from './engines/season/coachContext'
import SeasonPanel from './components/SeasonPanel'
import { assessRecalibration } from './engines/planGenerator/recalibration'
import { validatePlan, qaFindingsToAdvisories } from './engines/planQA/validatePlan'
import {
  clearUndoSnapshot, readUndoSnapshot, saveUndoSnapshot,
  type BenchmarkUndoSnapshot,
} from './engines/benchmark/undoSnapshot'
import { useReplan } from './hooks/useReplan'
import { useLockedDays } from './hooks/useLockedDays'
import { assessBenchmarkResult, benchmarkCompletedIso, scaleZoneTable } from './engines/planGenerator/benchmarkResult'
import { ESTIMATED_LTHR_PCT_OF_MAX } from './engines/planGenerator/paceTargets'
import { buildRepaceOps } from './utils/repace'
import { buildZoneAnchorOps } from './utils/rezoneByAnchor'
import { getCachedRunGAP } from './utils/runGAP'
import { buildRacePacingPlan, buildRacePacingContext } from './engines/racePacing'
import { weeklyIntensitySplit, methodEasyTarget, buildIntensityContext, decouplingFromSplits } from './utils/intensityDistribution'
import { resolveCourseForRace } from './utils/resolveCourse'
import { athleteCurrentVdot } from './engines/planGenerator/paceTargets'
import { predictRaceTime } from './engines/planGenerator/feasibility'
import { useApple } from './hooks/useApple'
import { useCompliance } from './hooks/useCompliance'
import { useManualLog } from './hooks/useManualLog'
import { useJournalNotes } from './hooks/useJournalNotes'
import { usePlanEdits } from './hooks/usePlanEdits'
import { useDaySwap } from './hooks/useDaySwap'
import { useTravelMode } from './hooks/useTravelMode'
import { useReadiness } from './hooks/useReadiness'
import { useOnboarding } from './hooks/useOnboarding'
import { useAthleteProfile, readAthleteProfileExtras } from './hooks/useAthleteProfile'
import { getReadinessTuning } from './utils/engineConfig'
import { useTutorial } from './hooks/useTutorial'
import Onboarding from './components/Onboarding'
import OnboardingValueProps from './components/OnboardingValueProps'
import OnboardingConnect from './components/OnboardingConnect'
import Tutorial from './components/Tutorial'
import MethodSelection from './components/MethodSelection'
import MethodologyPrimer from './components/MethodologyPrimer'
import ZonesPrimer from './components/ZonesPrimer'
import CoachLetter from './components/CoachLetter'
import { getMethodById } from './data/methods'
import { summarizeOp } from './utils/chatProposal'
import { resolveMethodId } from './utils/resolveMethod'
import { generatePlanFromMethod } from './engines/planGenerator/generatePlan'
import { generateGeneralFitnessPlan } from './engines/generalFitness'
import { useSoreness } from './hooks/useSoreness'
import { useMIMCalibration } from './hooks/useMIMCalibration'
import { loadRunGAPCache } from './utils/runGAP'
import { loadEccentricCache } from './utils/runEccentric'
import { useDOMSCalibration } from './hooks/useDOMSCalibration'
import { useCoachMemory } from './hooks/useCoachMemory'
import { useDailyAutoArchive } from './hooks/useDailyAutoArchive'
import { useCoachInsight } from './hooks/useCoachInsight'
import { useDailyBriefingLog, priorBriefings } from './hooks/useDailyBriefingLog'
import { useInsightReadState } from './hooks/useInsightReadState'
import { useCoachTelemetry } from './hooks/useCoachTelemetry'
import { derivePlanWeeks } from './utils/derivePlanWeeks'
import { calculateExerciseLoad } from './utils/trimp'
import { localDateStr } from './utils/format'
import { generateMorningCoach, generateEveningCoach, getCoachTimeOfDay } from './utils/coach'
import { checkStorageVersion, clearAllCachedData, clearAllAppData } from './utils/storageVersion'
import { buildCoachSnapshot } from './utils/coachSnapshot'
import { sendCoachMessageBackground, coachApiAvailable } from './utils/coachApi'
import { buildJournalSeed, buildStandaloneJournalSeed } from './utils/journal'
import { injurySummaryLine } from './utils/injuryRamp'
import { menopauseSummaryLine } from './utils/menopause'
import { fuelingSummaryLine } from './utils/fueling'
import { recoverySummaryLine } from './utils/recovery'
import { formSummaryLine } from './utils/form'
import { raceExecutionSummaryLine, mentalSummaryLine, cycleContextLine, mastersContextLine } from './utils/coachGuidance'
import { useWeather } from './hooks/useWeather'
import { useAthleteLocation } from './hooks/useAthleteLocation'
import { useWorkoutTimePreference } from './hooks/useWorkoutTimePreference'
import { useProactiveTimingPreference } from './hooks/useProactiveTimingPreference'
import WeeklyPlan from './components/WeeklyPlan'
import Summary from './components/Summary'
import Journal from './components/Journal'
import Dashboard, { type DashSubTab } from './components/Dashboard'
import RaceInfo from './components/RaceInfo'
// Methodology is now a subsection within Settings
import Settings from './components/Settings'
import CoachTab from './components/CoachTab'
import CoachPingToast from './components/CoachPingToast'
import WeeklyRecapOverlay from './components/WeeklyRecapOverlay'
import { useWeeklyRecap } from './hooks/useWeeklyRecap'
import { buildWeeklyRecap } from './engines/coach/weeklyRecap'
import { detectPRs } from './utils/strengthRecords'
import { buildWeeklyReview } from './engines/adaptive/weeklyReview'
import { getCachedHRStream } from './utils/timeInZone'
import { useMondayReview } from './hooks/useMondayReview'
import MondayReviewSheet from './components/MondayReviewSheet'
import { buildLevelUp } from './engines/adaptive/levelUp'
import { buildMorningOutlook } from './engines/adaptive/morningOutlook'
import { useMorningOutlook } from './hooks/useMorningOutlook'
import { useAdaptationLog } from './hooks/useAdaptationLog'
import VerdictCard from './components/VerdictCard'
import RhythmStrip from './components/RhythmStrip'
import ResolveStrip from './components/ResolveStrip'
import AdjustSheet from './components/AdjustSheet'
import EveningCloseCard from './components/EveningCloseCard'
import { useDayPhase } from './hooks/useDayPhase'
import { notesSeen, markNotesSeen } from './utils/planNotes'
import { leversFor, opsForLever } from './utils/adjustLevers'
import MissedDaySheet from './components/MissedDaySheet'
import { moveOutcomeFor } from './engines/planGenerator/replan'
import { resolutionNote } from './utils/resolutionNote'
import { buildRhythm, newestOpenDay, plannedDayFor } from './utils/rhythm'
import { buildTrainingSignals } from './utils/trainingSignals'
import { computeRaceReadiness } from './utils/raceReadiness'
import { weeksUntilRace } from './utils/raceCountdown'
import { buildVerdict } from './utils/verdict'
import AdaptationLogSheet from './components/AdaptationLogSheet'
import CoachToolsPanel from './components/CoachToolsPanel'
import ReviewQueuePanel, { type ApplyResult } from './components/ReviewQueuePanel'
import { appendAboutMeNote } from './utils/aboutMeNote'
import { benchmarkTitle, benchmarkConsequence, recalTitle, recalConsequence } from './utils/proposalCopy'
import { firstSeenAt, clearFirstSeen, type QueueItem } from './utils/reviewQueue'
import { weeksWithPriorLogs } from './utils/strengthHistory'
import LoginScreen from './components/LoginScreen'
import InAppBrowserGate from './components/InAppBrowserGate'
import { useHRZones } from './hooks/useHRZones'
import { useMaxHR } from './hooks/useMaxHR'
import { getStoredSession, clearSession, type AuthSession } from './utils/auth'
import { isInAppBrowser, isBypassed } from './utils/inAppBrowser'
import { useTheme } from './hooks/useTheme'
import { usePalette } from './hooks/usePalette'
import { useVisualViewport } from './hooks/useVisualViewport'
import { useDisplayPreferences } from './hooks/useDisplayPreferences'
import { useBackendSync } from './hooks/useBackendSync'
import { useStrengthCapacity } from './hooks/useStrengthCapacity'

// Auto-clear stale caches on app startup when data format changes
checkStorageVersion()

function getAthleteFromHash(): string {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  if (hash in plans) return hash
  return 'mike'
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession())
  const [gateBypassed, setGateBypassed] = useState(() => isBypassed())

  const handleLogin = useCallback((s: AuthSession) => {
    setSession(s)
    window.location.hash = s.athleteId
  }, [])

  const handleLogout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  // Google OAuth is blocked inside in-app browsers (Gmail, Facebook, etc.).
  // Existing sessions skip the gate so returning users aren't blocked.
  if (!session && !gateBypassed && isInAppBrowser()) {
    return <InAppBrowserGate onBypass={() => setGateBypassed(true)} />
  }

  // If no session and no Google client ID configured, fall back to hash-based auth
  const googleConfigured = !!import.meta.env.VITE_GOOGLE_CLIENT_ID
  const requireLogin = googleConfigured && !session

  if (requireLogin) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />
}

function AuthenticatedApp({ session, onLogout }: { session: AuthSession | null; onLogout: () => void }) {
  const [athleteId, setAthleteId] = useState(() => (session?.athleteId || getAthleteFromHash()).toLowerCase())
  const onboarding = useOnboarding(athleteId)
  const tutorial = useTutorial(athleteId)
  // Cross-device sync — hydrates from Postgres on mount, then pushes
  // local writes every 60s while visible. No-op without a session.
  useBackendSync(session)

  useEffect(() => {
    function onHashChange() {
      setAthleteId(getAthleteFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Seed athletes (Mike, Jim, Lori, Joel) have a hardcoded plan. We only fall
  // back to it when the athlete hasn't completed onboarding and isn't actively
  // redoing it — otherwise their new race goal would be ignored.
  const hardcodedPlan = plans[athleteId]
  const plan = onboarding.isOnboarded || onboarding.redoRequested ? undefined : hardcodedPlan

  if (!plan && !onboarding.isOnboarded) {
    return (
      <Onboarding
        onComplete={(config) => {
          onboarding.save(config)
        }}
        onSkip={onLogout}
        previousConfig={onboarding.previousConfig}
        derivedFitness={onboarding.previousConfig ? deriveFitnessFromHistory(athleteId, todayDateString()) : null}
      />
    )
  }

  // Post-onboarding value-prop screen: sells why the app is powerful (connect
  // a wearable, talk to the coach, customize it). Shown once after the plan is
  // created and before the connect step. Skipped for seed athletes.
  if (
    !plan &&
    onboarding.config &&
    !onboarding.config.valuePropsSeenAt
  ) {
    return (
      <OnboardingValueProps
        onContinue={onboarding.markValuePropsSeen}
        athleteName={onboarding.config.athleteName}
      />
    )
  }

  // Final onboarding step: connect Garmin / Strava. Only shown to athletes
  // who came through onboarding (not seed athletes with hardcoded plans) and
  // haven't yet dismissed the screen. The OnboardingConnect component
  // auto-dismisses if either integration is already connected (covers
  // existing users who onboarded before this step existed) or if neither
  // integration is configured in this environment.
  if (
    !plan &&
    onboarding.config &&
    !onboarding.config.connectStepSeenAt
  ) {
    return (
      <OnboardingConnect
        athleteId={athleteId}
        onContinue={onboarding.markConnectStepSeen}
        wearablePreference={onboarding.config.wearable}
      />
    )
  }

  // Trail/road athletes pick a training method before plan generation.
  // Hyrox/general skip this and go straight to the legacy generator.
  const needsMethodPick =
    !plan && !!onboarding.config && !!onboarding.config.raceDistance && !onboarding.config.selectedMethodId
  if (needsMethodPick && onboarding.config) {
    const cfg = onboarding.config
    return (
      <MethodSelection
        config={cfg}
        onConfirm={(methodId) => {
          onboarding.save({ ...cfg, selectedMethodId: methodId })
        }}
        onBack={() => onboarding.clear()}
      />
    )
  }

  // Generate plan from onboarding config if no pre-built plan exists.
  // NOTE: this is intentionally a plain expression — not `useMemo` — because
  // earlier early-returns above mean hook call order would differ across
  // renders. The cost is small and cached by `MainAppShell` below.
  let generatedPlan: import('./types').TrainingPlan | null = null
  if (!plan && onboarding.config) {
    // Real-fitness overlay: when the athlete didn't declare a weekly
    // mileage, size the plan from their MEASURED trailing 4 weeks
    // (Garmin/Strava/manual logs) instead of an experience-level guess.
    // A declared/confirmed answer always wins; the stored config is
    // never mutated. Synchronous cache reads — safe in this hook-free
    // block (see the NOTE above).
    const genConfig = (() => {
      // P3.1 — biological sex set later in the profile editor reaches the
      // Hyrox load table (onboarding's optional answer wins when present).
      const profileSex = readAthleteProfileExtras(athleteId).sex
      const cfg = !onboarding.config.sex && (profileSex === 'male' || profileSex === 'female')
        ? { ...onboarding.config, sex: profileSex }
        : onboarding.config
      if (cfg.currentWeeklyMileage != null) return cfg
      const derived = deriveFitnessFromHistory(athleteId, todayDateString())
      return derived.weeklyMileage4wk != null
        ? { ...cfg, currentWeeklyMileage: derived.weeklyMileage4wk }
        : cfg
    })()
    if (genConfig.raceType === 'hyrox') {
      generatedPlan = generateHyroxPlan(genConfig)
    } else if (genConfig.raceType === 'general') {
      generatedPlan = generateGeneralFitnessPlan(genConfig)
    } else if (genConfig.selectedMethodId) {
      const method = getMethodById(genConfig.selectedMethodId)
      if (method) generatedPlan = generatePlanFromMethod(method, genConfig)
    }
  }
  const activePlan = plan || generatedPlan

  // First-time methodology primer: shown once after onboarding produces a
  // plan, so the athlete understands the structure (phases, recovery week,
  // taper, poles, etc.) before they start consuming workouts.
  if (
    activePlan &&
    onboarding.config &&
    !onboarding.config.primerSeenAt &&
    (onboarding.config.raceType === 'trail' || onboarding.config.raceType === 'road')
  ) {
    const primerMethod = onboarding.config.selectedMethodId
      ? getMethodById(onboarding.config.selectedMethodId)
      : undefined
    return (
      <MethodologyPrimer
        plan={activePlan}
        method={primerMethod}
        config={onboarding.config}
        onContinue={onboarding.markPrimerSeen}
      />
    )
  }

  // Zones primer: shown once after the methodology primer is dismissed so
  // the athlete sees their personalized bpm ranges and the method-specific
  // framing for each zone before they start consuming workouts. Skipped
  // for Hyrox (no method-based zones) and for athletes who have already
  // dismissed it.
  // General-fitness athletes never see the trail-only methodology primer, so
  // `primerSeenAt` is never set for them — which previously meant they ALSO
  // skipped this zones/plan-overview screen and dropped straight from the
  // value props into the coach letter with no look at how their plan is built.
  // Show it to them too (gated on raceType === 'general'); trail still requires
  // the methodology primer first, hyrox still opts out entirely.
  if (
    activePlan &&
    onboarding.config &&
    !onboarding.config.zonesPrimerSeenAt &&
    onboarding.config.raceType !== 'hyrox' &&
    (onboarding.config.primerSeenAt || onboarding.config.raceType === 'general')
  ) {
    const primerMethod = onboarding.config.selectedMethodId
      ? getMethodById(onboarding.config.selectedMethodId)
      : undefined
    return (
      <ZonesPrimer
        plan={activePlan}
        method={primerMethod}
        config={onboarding.config}
        onContinue={onboarding.markZonesPrimerSeen}
        onRefineZones={() => {
          onboarding.markZonesPrimerSeen()
          // sessionStorage so the next render of MainAppShell can open
          // Settings without us re-mounting the whole app tree.
          try { sessionStorage.setItem('ba_initial_view', 'settings') } catch { /* quota */ }
        }}
      />
    )
  }

  if (!activePlan) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4">
          <span className="text-5xl">{onboarding.config?.raceType === 'hyrox' ? '🏋️' : onboarding.config?.raceType === 'trail' ? '🏔' : onboarding.config?.raceType === 'road' ? '🏃' : '💪'}</span>
          <h1 className="text-2xl font-bold text-slate-800">Welcome, {onboarding.config?.athleteName || athleteId}!</h1>
          <p className="text-slate-500">
            Plan generation for <strong>{onboarding.config?.raceType || 'your goal'}</strong> is coming soon.
            {onboarding.config?.raceType === 'trail' && ' Trail race plan generator is in development.'}
          </p>
          <div className="pt-4 space-y-2">
            <button onClick={() => onboarding.requestRedo()} className="text-teal-600 font-medium text-sm">Redo onboarding</button>
            <br />
            <button onClick={onLogout} className="text-slate-400 font-medium text-sm">Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  // Final onboarding screen: a one-time AI letter from the coach, now that a
  // plan exists. Shown for every flow; gated by welcomeLetterSeenAt.
  if (onboarding.config && !onboarding.config.welcomeLetterSeenAt) {
    return (
      <CoachLetter
        plan={activePlan}
        config={onboarding.config}
        athleteId={athleteId}
        onContinue={onboarding.markWelcomeLetterSeen}
      />
    )
  }

  // Every conditional return above this point. The remaining hooks all
  // depend on `activePlan` and were violating Rules of Hooks by being
  // called after early returns. Mount them in a dedicated component that
  // is only rendered when we have a plan in hand.
  return (
    <MainAppShell
      session={session}
      onLogout={onLogout}
      athleteId={athleteId}
      activePlan={activePlan}
      onboarding={onboarding}
      tutorial={tutorial}
    />
  )
}

interface MainAppShellProps {
  session: AuthSession | null
  onLogout: () => void
  athleteId: string
  activePlan: import('./types').TrainingPlan
  onboarding: ReturnType<typeof useOnboarding>
  tutorial: ReturnType<typeof useTutorial>
}

function MainAppShell({ session, onLogout, athleteId, activePlan, onboarding, tutorial }: MainAppShellProps) {
  const [view, setView] = useState<ViewId>(() => {
    // A ?view= param wins — set by the PWA start_url and by a tapped
    // push notification's openWindow target. It's an explicit deep-link
    // into a specific tab.
    try {
      const param = new URLSearchParams(window.location.search).get('view')
      // Legacy ids ('summary', 'dashboard') still arrive from installed PWAs
      // and already-sent notifications — resolveDeepLink maps them forward.
      const linked = resolveDeepLink(param)
      if (linked) return linked
    } catch { /* ignored */ }
    // Honor the one-shot initial-view hint set by the zones primer's
    // "Refine zones in Settings" action. Read + clear immediately so a
    // reload doesn't bounce back into Settings.
    try {
      const hint = sessionStorage.getItem('ba_initial_view')
      if (hint) {
        sessionStorage.removeItem('ba_initial_view')
        // 'stats' was always written here but was never a real ViewId — it
        // used to land on a tab that did not exist. It resolves to Progress.
        const hinted = resolveViewId(hint)
        if (hinted) return hinted
      }
    } catch { /* ignored */ }
    return 'today'
  })
  // One-shot deep link: Home's "see the whole season" jumps to the Plan tab
  // AND asks it to open the Season sub-view. Cleared once handled so the
  // athlete's next manual toggle isn't fought by a stale request.
  const [planViewRequest, setPlanViewRequest] = useState<{ mode: 'season' } | null>(null)
  const [chatSeed, setChatSeed] = useState<string | null>(null)
  const theme = useTheme()
  const palette = usePalette(theme.resolved)
  useVisualViewport()
  const displayPrefs = useDisplayPreferences(athleteId)
  const strava = useStrava(athleteId)
  const garmin = useGarmin(athleteId)
  // Apple Health / Apple Watch — the iOS companion app uploads HRV/RHR/sleep
  // and workouts; this hook reads them back and feeds the same pipelines as
  // Garmin (readiness, training load, descent/DOMS).
  const apple = useApple(athleteId)

  useEffect(() => {
    function onHashChange() {
      setView('today')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // When the athlete taps a coach push notification, the service worker
  // posts a message asking us to jump to the Coach tab (the app was
  // already open, so a URL navigation alone wouldn't change the view).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; view?: string } | null
      if (data?.type === 'NOTIFICATION_CLICK' && data.view === 'coach') {
        setView('coach')
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
  const manualLog = useManualLog(athleteId)
  const journalNotes = useJournalNotes(athleteId)
  // Day swaps and plan edits are index-keyed against the CURRENT plan —
  // config.completedAt is the plan's birth stamp, and both hooks prune
  // anything older at load (June's edits must never replay onto a
  // September rebuild, even when a sync pull resurrects them).
  const daySwap = useDaySwap(athleteId, onboarding.config?.completedAt)
  // Season (G1b): the race calendar + derived block timeline. The plan's
  // race is always race #1 (degenerate one-race season = no season UI).
  const seasonState = useSeason(activePlan.race, athleteId, onboarding.config?.additionalRaces, onboarding.config?.completedAt)
  const planEdits = usePlanEdits(athleteId, onboarding.config?.completedAt)
  // Phase 5 (PRD-110): the missed-workout log, replayed over the derived
  // weeks like swaps and edits. Same generation pruning — a replan can
  // only ever describe the plan it was made against.
  const replan = useReplan(athleteId, onboarding.config?.completedAt)
  // Locked days (P12): ISO-keyed pins the athlete sets to fix a day. Same
  // generation pruning as replans/edits. Applied before replan so the rules
  // see day.locked and skip a pinned day.
  const lockedDays = useLockedDays(athleteId, onboarding.config?.completedAt)
  // Travel mode — declared trips, rebalanced into the plan as usePlanEdits
  // batches. The window store holds only each trip's batchId (same
  // generation pruning as edits/replans); the day rewrites live in planEdits.
  const travelMode = useTravelMode(athleteId, onboarding.config?.completedAt)
  const soreness = useSoreness(athleteId)
  const hrZones = useHRZones(athleteId, activePlan.zones)
  const maxHROverride = useMaxHR(athleteId, activePlan.athlete.maxHR)
  const athleteProfileExtras = useAthleteProfile(athleteId)
  const effectiveAthlete = useMemo(
    () => {
      const extras = athleteProfileExtras.profile
      return {
        ...activePlan.athlete,
        maxHR: maxHROverride.maxHR,
        ...extras,
        // R7 — experienceLevel falls back to onboarding when the profile editor
        // hasn't set it, so generated plans personalize out of the box.
        experienceLevel:
          extras.experienceLevel ?? onboarding.config?.experienceLevel ?? activePlan.athlete.experienceLevel,
      }
    },
    [activePlan.athlete, maxHROverride.maxHR, athleteProfileExtras.profile, onboarding.config],
  )
  const handleSaveHRZones = useCallback(
    (zones: import('./types').HRZone[], nextMaxHR: number) => {
      hrZones.save(zones)
      if (nextMaxHR > 0 && nextMaxHR !== activePlan.athlete.maxHR) {
        maxHROverride.save(nextMaxHR)
      } else if (nextMaxHR === activePlan.athlete.maxHR && maxHROverride.isCustomized) {
        maxHROverride.reset()
      }
    },
    [hrZones, maxHROverride, activePlan.athlete.maxHR],
  )
  const handleResetHRZones = useCallback(() => {
    hrZones.reset()
    maxHROverride.reset()
  }, [hrZones, maxHROverride])
  const showStrava = true  // All athletes can connect Strava and Garmin
  // Coach is now available to all athletes. Per-athlete isolation is
  // handled server-side via athleteId-keyed KV memory. Soft cost caps
  // enforced in api/coach/_core.py budget helpers.
  const coachEnabled = true
  const coachMemory = useCoachMemory(athleteId, coachEnabled)
  const coachTelemetry = useCoachTelemetry(athleteId, coachEnabled)

  // Archive the coach thread once per day (midnight rollover + catch-up on
  // launch). Lives here, above the tab switch, so it runs no matter which
  // tab is active.
  useDailyAutoArchive({
    athleteId,
    enabled: coachEnabled,
    loaded: coachMemory.loaded,
    conversation: coachMemory.conversation,
    rolloverDay: coachMemory.rolloverDay,
    onArchived: date =>
      coachTelemetry.logInteraction(
        'day_rolled_over' as Parameters<typeof coachTelemetry.logInteraction>[0],
        { archivedDate: date },
      ),
  })

  const TABS: { id: ViewId; label: string; badge?: number }[] = useMemo(() => {
    const base: { id: ViewId; label: string; badge?: number }[] = [
      { id: 'today', label: 'Today' },
      { id: 'plan', label: 'Plan' },
      { id: 'progress', label: 'Progress' },
    ]
    if (coachEnabled) {
      // Hide the badge when the user is already on the Coach tab —
      // they're reading the messages, so the dot is redundant and
      // the onMarkRead() effect will clear unread flags anyway.
      base.push({ id: 'coach', label: 'Coach', badge: view === 'coach' ? 0 : coachMemory.unreadCount })
    }
    // Settings has moved to the header gear to keep the bottom bar at five.
    base.push({ id: 'journal', label: 'Journal' })
    return base
  }, [coachEnabled, coachMemory.unreadCount, view])

  // Season splice (G1): multi-race athletes get the rest of the chain —
  // RECOVER + BRIDGE weeks and each subsequent race's generated plan —
  // appended after the anchor race. Runs FIRST so every downstream layer
  // (swaps, edits, actuals, rezone, compliance, watch push, realignment,
  // repace) treats season weeks as plain plan weeks. Single-race seasons
  // return the base weeks untouched (the guard). A splice failure (e.g. a
  // poisoned race record arriving via sync) must degrade to the base plan —
  // never take the whole app down.
  //
  // Its own memo because it also reports what the LAYERING transform did, and
  // the advisories below have to derive from that outcome rather than from the
  // athlete's request (D6) — splicing twice would regenerate every later
  // race's plan for the sake of a sentence.
  const spliced = useMemo(() => {
    try {
      return spliceSeasonWithReport(activePlan.weeks, seasonState.planResult, onboarding.config, todayDateString())
    } catch (err) {
      console.error('[season] splice failed — falling back to the base plan:', err)
      return { weeks: activePlan.weeks, layerReports: [] }
    }
  }, [activePlan.weeks, seasonState.planResult, onboarding.config])

  // Merge Strava or manual log data into training plan.
  //
  // The ten-transform pipeline itself lives in utils/derivePlanWeeks — it is
  // order-dependent in several non-obvious ways and could not be tested while
  // it was inline here, closing over a dozen hook values. See that module for
  // why each step sits where it does; this memo only supplies the inputs.
  const weeks = useMemo(() => derivePlanWeeks({
    base: spliced.weeks,
    applySwaps: daySwap.applySwapsToWeeks,
    applyEdits: planEdits.applyEditsToWeeks,
    applyLocks: lockedDays.applyLocksToWeeks,
    applyReplans: replan.applyReplansToWeeks,
    applyManualLogs: manualLog.applyLogsToWeeks,
    showStrava,
    stravaActivities: strava.activities,
    garminConnected: garmin.connected,
    garminActivityDetails: garmin.activityDetails,
    appleActivities: apple.appleActivities,
    zones: hrZones.zones,
  }), [spliced, strava.activities, showStrava, manualLog.applyLogsToWeeks, daySwap.applySwapsToWeeks, planEdits.applyEditsToWeeks, lockedDays.applyLocksToWeeks, replan.applyReplansToWeeks, garmin.connected, garmin.activityDetails, apple.appleActivities, hrZones.zones])

  // Travel mode. The pairing of "rewrite the days" with "remember the trip"
  // lives in utils — see useTravelActions for why it is not inline here.
  const { activateTravel, deactivateTravel } = useTravelActions({
    weeks,
    applyBatch: planEdits.applyBatch,
    undoBatch: planEdits.undoBatch,
    addWindow: travelMode.add,
    removeWindow: travelMode.remove,
  })

  // ── Auto re-push (G2a): whenever the derived plan changes, re-send any
  // previously-pushed FUTURE workout whose content no longer matches what
  // the watch has (coach proposal, realignment, manual edit, swap, undo —
  // one seam catches them all). The ledger diff makes this a no-op unless
  // a pushed day genuinely changed, so the watch never holds a stale plan
  // and untouched days are never re-sent. Debounced: rapid successive
  // edits (an applied multi-op proposal) collapse into one pass.
  useEffect(() => {
    if (!garmin.connected) return
    const timer = setTimeout(() => {
      repushChangedWorkouts(weeks, athleteId)
        .then(result => {
          if (result.sent > 0) {
            console.info(`[garmin] plan changed — re-sent ${result.sent} workout(s) to watch`)
          }
          if (result.failed > 0) {
            console.warn(`[garmin] re-push: ${result.failed} failed`, result.errors)
          }
        })
        .catch(() => { /* re-push is best-effort; next edit retries */ })
    }, 2500)
    return () => clearTimeout(timer)
  }, [weeks, garmin.connected, athleteId])

  const compliance = useCompliance(weeks)

  // ── Pin the plan's start, once (field bug: "the updates pushed my start
  // date to next week"). Both engines counted runway from `today`, so every
  // passing week dropped a week off the front and slid week 1 forward. The
  // stamp is this week's Monday, so the plan covers the week the athlete is
  // standing in — and from then on it holds still and they advance through
  // it. Seed athletes (hardcoded plans, no onboarding config) are untouched.
  useEffect(() => {
    if (!onboarding.config || onboarding.config.planStartPinnedIso) return
    onboarding.pinPlanStart(mondayOnOrBefore(todayDateString()))
  }, [onboarding])


  // Measured strength capacity (N4). Describes the ATHLETE, not the plan,
  // so it survives a plan rebuild and expires on its own re-test clock.
  const strengthCapacity = useStrengthCapacity(athleteId)

  // ── G5: performance-adaptive pace targets ─────────────────────
  // Assessed from completed sessions (GAP-corrected via the cached
  // Minetti multiplier — the trail-true input); dismissal is remembered
  // per evidence-set so declining doesn't nag, and new evidence re-offers.
  const recalAssessment = useMemo(
    () => assessRecalibration(weeks, todayDateString(), {
      gapFactor: (isoDate, name) => getCachedRunGAP(isoDate, name, athleteId),
    }),
    [weeks, athleteId],
  )
  const recalDismissKey = `ba_recal_dismissed_v1_${athleteId}`
  const recalEvidenceKey = recalAssessment.evidence.join('|')
  const recalDismissed = (() => {
    try { return localStorage.getItem(recalDismissKey) === recalEvidenceKey } catch { return false }
  })()

  // ── 4.1: benchmark-result → zone re-anchor ────────────────────
  // The zones_estimated advisory promises "test → the plan updates";
  // this closes that loop. Same trust pattern as G5: assess, offer,
  // apply-on-tap, undoable.
  const currentLthr =
    onboarding.config?.testedLthrBpm
      ? onboarding.config.testedLthrBpm
      : onboarding.config?.fitnessAnchor?.type === 'lthr' && onboarding.config.fitnessAnchor.bpm
        ? onboarding.config.fitnessAnchor.bpm
        : Math.round(maxHROverride.maxHR * ESTIMATED_LTHR_PCT_OF_MAX)
  const benchAssessment = useMemo(
    () => assessBenchmarkResult(
      weeks, todayDateString(), maxHROverride.maxHR, currentLthr,
      strengthCapacity.capacity?.erg500Sec ?? null,
      strengthCapacity.capacity?.ergManual ?? false,
    ),
    [weeks, maxHROverride.maxHR, currentLthr, strengthCapacity.capacity],
  )
  const benchDismissKey = `ba_benchmark_dismissed_v1_${athleteId}`
  const benchEvidenceKey = benchAssessment.evidence.join('|')
  const benchDismissed = (() => {
    try { return localStorage.getItem(benchDismissKey) === benchEvidenceKey } catch { return false }
  })()
  const applyBenchmarkResult = useCallback(() => {
    const a = benchAssessment
    // Captured BEFORE anything is written, and stored rather than held in a
    // ref: the undo has to survive the athlete navigating away and coming
    // back, which is exactly when they decide the new zones feel wrong.
    const undoSnapshot: Omit<BenchmarkUndoSnapshot, 'batchId'> = {
      zones: hrZones.isCustomized ? hrZones.zones : null,
      maxHROverride: maxHROverride.isCustomized ? maxHROverride.maxHR : null,
      fitnessAnchor: onboarding.config?.fitnessAnchor ?? null,
      testedLthrBpm: onboarding.config?.testedLthrBpm ?? null,
      configMaxHR: onboarding.config?.maxHR ?? null,
      ...(a.suggestedErg500Sec != null ? { capacity: strengthCapacity.capacity ?? null } : {}),
    }
    // The erg baseline goes straight to the measured strength
    // benchmarks — the number the advisory asked the athlete to type in.
    if (a.suggestedErg500Sec != null) {
      strengthCapacity.save({
        ...(strengthCapacity.capacity ?? {}),
        measuredAt: todayDateString(),
        erg500Sec: a.suggestedErg500Sec,
        ...(a.suggestedErg1kSec != null ? { erg1kSec: a.suggestedErg1kSec } : {}),
        ergManual: false,
      })
    }
    // One anchor drives the whole rewrite: LTHR when the test measured
    // it (method 20-min TT — every method bpm band is linear in LTHR),
    // else the observed maxHR (Hyrox %maxHR ladder).
    const newZones = a.suggestedLthr != null
      ? scaleZoneTable(hrZones.zones, a.currentLthr, a.suggestedLthr)
      : scaleZoneTable(hrZones.zones, a.currentMaxHR, a.suggestedMaxHR ?? a.currentMaxHR)
    handleSaveHRZones(newZones, a.suggestedMaxHR ?? maxHROverride.maxHR)
    // P4.1 — the measured LTHR lives BESIDE the pace anchor. v1 replaced an
    // easy-pace anchor with {type:'lthr'} and every /mi band vanished from
    // the regenerated plan the moment the athlete tested.
    onboarding.applyBenchmarkAnchors({
      ...(a.suggestedLthr != null ? { testedLthrBpm: a.suggestedLthr } : {}),
      ...(a.suggestedMaxHR != null ? { maxHR: a.suggestedMaxHR } : {}),
    })
    const batchId = planEdits.applyBatch(buildZoneAnchorOps(
      weeks,
      { oldLthr: a.currentLthr, newLthr: a.suggestedLthr ?? a.currentLthr, newZones },
      todayDateString(),
      `Benchmark re-anchor: ${a.evidence[0] ?? 'field test result'}`,
    ))
    // Keyed by the batch it undoes. A second apply replaces it, and the
    // read below refuses a snapshot from a different batch rather than
    // rolling the athlete back to a state a later apply already replaced.
    saveUndoSnapshot(athleteId, { ...undoSnapshot, batchId })
    return batchId
  }, [athleteId, benchAssessment, hrZones, maxHROverride, onboarding, planEdits, weeks, handleSaveHRZones, strengthCapacity])
  const undoBenchmarkResult = useCallback((batchId: string) => {
    // Read the way back BEFORE reverting the plan edits: a half-undo (days
    // restored, zones still rewritten) is the worst of the three outcomes,
    // so if there is nothing to restore we do nothing at all and leave the
    // athlete with the state they can still see and undo later.
    const snap = readUndoSnapshot(athleteId, batchId)
    if (!snap) return false
    planEdits.undoBatch(batchId)
    if (snap.zones) hrZones.save(snap.zones); else hrZones.reset()
    if (snap.maxHROverride != null) maxHROverride.save(snap.maxHROverride); else maxHROverride.reset()
    onboarding.applyBenchmarkAnchors({ fitnessAnchor: snap.fitnessAnchor, testedLthrBpm: snap.testedLthrBpm, maxHR: snap.configMaxHR })
    if (snap.capacity !== undefined) {
      if (snap.capacity) strengthCapacity.save(snap.capacity); else strengthCapacity.clear()
    }
    clearUndoSnapshot(athleteId)
    return true
  }, [athleteId, planEdits, hrZones, maxHROverride, onboarding, strengthCapacity])

  // ── R0: season-level QA ───────────────────────────────────────
  // The anchor plan is validated at generation time, but the spliced
  // season (recover / bridge / second-build weeks) never was — cross-block
  // ramp seams and duplicate blocks were structurally invisible. Validate
  // the FULL derived week stream and surface findings from weeks beyond
  // the anchor as advisories (the anchor's own findings already ride in
  // activePlan.advisories).
  const seasonQaAdvisories = useMemo(() => {
    if ((seasonState.planResult?.season.races.length ?? 0) < 2) return []
    const anchorLen = activePlan.weeks.length
    // D11 — the layered rules live INSIDE the anchor weeks by definition (that
    // is what layering is), so the "beyond the anchor" filter below silently
    // discarded every one of them, and the early return skipped the validator
    // entirely for a season whose only change is layered days.
    const hasLayered = weeks.some(w => w.days.some(d => d.layeredFor != null))
    if (weeks.length <= anchorLen && !hasLayered) return []
    const qa = validatePlan({ weeks, zones: hrZones.zones, race: activePlan.race, methodId: activePlan.methodId })
    const later = qa.findings.filter(f => (f.weekNum ?? 0) > anchorLen || f.id.startsWith('qa_layered_'))
    if (later.length === 0) return []
    return qaFindingsToAdvisories({
      findings: later,
      errors: later.filter(f => f.severity === 'error'),
      warnings: later.filter(f => f.severity === 'warn'),
      pass: later.every(f => f.severity !== 'error'),
    })
  }, [weeks, activePlan.weeks.length, activePlan.race, activePlan.methodId, hrZones.zones, seasonState.planResult])
  // D6 — what the layering transform ACTUALLY did, said out loud. The coach
  // letter and the review screens used to describe "1–2 sessions a week woven
  // into your build" from the athlete's REQUEST, including on the anchors
  // where the transform refuses outright and the athlete got zero days.
  const layerAdvisories = useMemo(
    () => layeringAdvisories(spliced.layerReports, activePlan.race.name, onboarding.config?.raceType),
    [spliced.layerReports, activePlan.race.name, onboarding.config?.raceType],
  )
  const allAdvisories = useMemo(() => {
    const base = [
      ...(activePlan.advisories ?? []),
      ...seasonQaAdvisories,
      ...layerAdvisories,
    ]
    // "Estimated until you test" retires itself the day a benchmark is
    // actually recorded — primary or secondary. The benchmark card and
    // the athlete model carry the calibration from there.
    return benchmarkCompletedIso(weeks, todayDateString())
      ? base.filter(adv => adv.id !== 'zones_estimated')
      : base
  }, [activePlan.advisories, seasonQaAdvisories, layerAdvisories, weeks])

  // ── G6: course-aware race pacing ──────────────────────────────
  // Only for curated courses (the 3 Broken Arrow editions today) and only
  // when the athlete has a fitness anchor to pace from — unmatched course
  // or no anchor → no card, no section (the guard).
  const racePacingPlan = useMemo(() => {
    const resolution = resolveCourseForRace(activePlan.race)
    const vdot = onboarding.config ? athleteCurrentVdot(onboarding.config) : null
    if (!resolution || !vdot) return null
    const raceMiles = activePlan.race.distanceMiles
    if (!raceMiles || raceMiles <= 0) return null
    const flatPace = predictRaceTime(vdot, raceMiles) / raceMiles
    return buildRacePacingPlan(resolution.course, flatPace)
  }, [activePlan.race, onboarding.config])
  const raceName = activePlan.race.name || (activePlan.race.distance.includes('18K') ? 'BROKEN ARROW 18K' : 'BROKEN ARROW 11K')

  const daysUntilRace = useMemo(() => {
    // TZ-safe: bare-ISO race dates must never hit `new Date("YYYY-MM-DD")`
    // (UTC-midnight parse — shifts a day west of UTC). raceDateToIso owns
    // that rule; anchor the countdown at local noon.
    const iso = raceDateToIso(activePlan.race.date)
    if (!iso) return 0
    const raceMs = new Date(`${iso}T12:00:00`).getTime()
    return Math.max(0, Math.ceil((raceMs - Date.now()) / (1000 * 60 * 60 * 24)))
  }, [activePlan.race.date])

  // Determine the current training week from the plan's actual calendar.
  // Anchor week 1's Monday off the race date (mirrors plan generation, which
  // counts back from the Monday on/before race day) so "this week" tracks the
  // real date instead of a hard-coded start clamped to 10. Falls back to
  // matching today's date label, then week 1, when there's no parseable race
  // date (e.g. open-ended general-fitness plans).
  const currentWeekNum = useMemo(() => {
    const totalWeeks = weeks.length
    if (totalWeeks === 0) return 1
    const raceStr = activePlan.race.date.match(/\w+,\s*(.+)/)?.[1] || activePlan.race.date
    // Parse a bare ISO date at noon-local so a negative UTC offset doesn't shift
    // the anchor back a day (mirrors plan generation's 'T12:00:00' anchoring).
    const raceDate = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raceStr.trim()) ? `${raceStr.trim()}T12:00:00` : raceStr,
    )
    if (!isNaN(raceDate.getTime())) {
      const raceMonday = new Date(raceDate)
      raceMonday.setDate(raceDate.getDate() - ((raceDate.getDay() + 6) % 7))
      const week1Monday = new Date(raceMonday)
      week1Monday.setDate(raceMonday.getDate() - (totalWeeks - 1) * 7)
      const elapsed = Math.floor((Date.now() - week1Monday.getTime()) / (7 * 24 * 60 * 60 * 1000))
      return Math.max(1, Math.min(totalWeeks, elapsed + 1))
    }
    const now = new Date()
    const mmdd = `${now.getMonth() + 1}/${now.getDate()}`
    const idx = weeks.findIndex(w => w.days.some(d => d.day.includes(mmdd)))
    return idx >= 0 ? weeks[idx].num : 1
  }, [weeks, activePlan.race.date])

  // Find today's planned workout
  const todayPlannedWorkout = useMemo(() => {
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()
    const dayLabel = `${month}/${day}`
    for (const week of weeks) {
      for (const d of week.days) {
        if (d.day.includes(dayLabel)) return d
      }
    }
    return undefined
  }, [weeks])

  // Find tomorrow's planned workout
  const tomorrowPlannedWorkout = useMemo(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const month = tomorrow.getMonth() + 1
    const day = tomorrow.getDate()
    const dayLabel = `${month}/${day}`
    for (const week of weeks) {
      for (const d of week.days) {
        if (d.day.includes(dayLabel)) return d
      }
    }
    return undefined
  }, [weeks])

  // Current week days and today's index for coach engine
  const currentWeekDays = useMemo(() => {
    const currentWeek = weeks.find(w => w.num === currentWeekNum)
    return currentWeek?.days || []
  }, [weeks, currentWeekNum])

  const todayDayIndex = useMemo(() => {
    const today = new Date()
    const dayLabel = `${today.getMonth() + 1}/${today.getDate()}`
    return currentWeekDays.findIndex(d => d.day.includes(dayLabel))
  }, [currentWeekDays])

  // Planned days from tomorrow forward through the next ~10 days. Drives the
  // soreness alert's "next quad-loading session" callout.
  const upcomingPlannedDays = useMemo(() => {
    const remainingThisWeek = todayDayIndex >= 0
      ? currentWeekDays.slice(todayDayIndex + 1)
      : currentWeekDays
    const nextWeek = weeks.find(w => w.num === currentWeekNum + 1)?.days ?? []
    return [...remainingThisWeek, ...nextWeek]
  }, [currentWeekDays, todayDayIndex, weeks, currentWeekNum])

  // Extract RPE ratings and manual exercise load from actuals.
  //
  // exerciseLoad is intentionally limited to *manually-logged* strength —
  // Garmin's on-device EPOC already captures the musculoskeletal load when
  // the watch records a strength activity, so adding it again as a
  // "manual exercise" segment double-counts the same workout (the symptom:
  // a strength_full bar PLUS an identical-day manual_exercise bar in the
  // 7-Day Training Load chart). The matching layer prefers Garmin's
  // exercise sets when present (matching.ts), so day.actual.strengthLog
  // ends up Garmin-sourced whenever the watch has them — we detect that
  // case via two complementary signals (either is sufficient) and skip
  // the manual computation for those dates:
  //   1. Activity detail has non-empty exerciseSets (the Garmin parser
  //      built strengthLog from these — most reliable when the detail is
  //      cached).
  //   2. Summary activity for the date maps to a strength_* sport type
  //      (covers cases where the detail isn't cached yet but a
  //      strength_* TRIMP record was already produced from the summary).
  const { rpeByDate, exerciseLoadByDate } = useMemo(() => {
    const garminStrengthDates = new Set<string>()
    for (const details of Object.values(garmin.activityDetails)) {
      for (const d of details) {
        if (!d.exerciseSets?.length) continue
        const date = d.startTimeLocal?.slice(0, 10)
        if (date) garminStrengthDates.add(date)
      }
    }
    for (const a of garmin.garminActivities) {
      if (!a.date) continue
      const normalized = (a.type ?? '').toLowerCase().replace(/\s+/g, '_')
      if (
        normalized === 'strength_training' ||
        normalized === 'weighttraining' ||
        normalized === 'workout' ||
        normalized.startsWith('strength_')
      ) {
        garminStrengthDates.add(a.date)
      }
    }

    const rpeMap = new Map<string, number>()
    const exMap = new Map<string, number>()
    for (const week of weeks) {
      for (const day of week.days) {
        if (!day.actual?.startDate) continue
        const date = day.actual.startDate.slice(0, 10)
        if (day.actual.rpe) {
          rpeMap.set(date, day.actual.rpe)
        }
        if (day.actual.strengthLog?.length && !garminStrengthDates.has(date)) {
          const load = calculateExerciseLoad(day.actual.strengthLog)
          if (load > 0) exMap.set(date, load)
        }
      }
    }
    return { rpeByDate: rpeMap, exerciseLoadByDate: exMap }
  }, [weeks, garmin.activityDetails, garmin.garminActivities])

  // Tertiary HR fallback for the IF computation. The matching layer in
  // mergeGarminDetailIntoWeeks/matchActivitiesToPlan already wrote avgHR/maxHR
  // onto each PlannedDay.actual — those values are often complete even when
  // the raw Garmin summary list is missing HR. Build a date-keyed lookup so
  // useReadiness can use it as a final fallback before falling back to the
  // static MIM lookup.
  // Per-activity GAP-derived MIM cache. WorkoutModal writes to localStorage
  // when a stream loads; we bump `runGAPVersion` on a custom event to
  // re-read so the engine picks up the precise number on next render.
  const [runGAPVersion, setRunGAPVersion] = useState(0)
  useEffect(() => {
    function onUpdate() { setRunGAPVersion(v => v + 1) }
    window.addEventListener('ba:run-gap-cache-updated', onUpdate)
    return () => window.removeEventListener('ba:run-gap-cache-updated', onUpdate)
  }, [])
  const runGAPByActivity = useMemo(
    () => loadRunGAPCache(athleteId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athleteId, runGAPVersion],
  )

  // Same pattern for the per-activity eccentric cache. WorkoutModal
  // dispatches `ba:run-eccentric-cache-updated` after caching; the engine
  // reads the map on the next render so DOMS carry-forward switches from
  // static T4 coefficients to research-backed eccentric-derived ones.
  const [runEccentricVersion, setRunEccentricVersion] = useState(0)
  useEffect(() => {
    function onUpdate() { setRunEccentricVersion(v => v + 1) }
    window.addEventListener('ba:run-eccentric-cache-updated', onUpdate)
    return () => window.removeEventListener('ba:run-eccentric-cache-updated', onUpdate)
  }, [])
  const eccentricByActivity = useMemo(
    // Local per-second GPS-stream cache (full eccentric profile) wins over
    // Apple's on-device steep-descent scalar — spread last — when both exist.
    () => ({ ...apple.eccentricByActivity, ...loadEccentricCache(athleteId) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athleteId, runEccentricVersion, apple.eccentricByActivity],
  )

  const actualHRByDate = useMemo(() => {
    const m = new Map<string, { avgHR?: number; maxHR?: number }>()
    for (const week of weeks) {
      for (const d of week.days) {
        const a = d.actual
        if (!a) continue
        const date = a.startDate?.slice(0, 10)
        if (!date) continue
        if (a.avgHR || a.maxHR) {
          m.set(date, { avgHR: a.avgHR, maxHR: a.maxHR })
        }
      }
    }
    return m
  }, [weeks])

  // Merge Apple Health into Garmin for the readiness engine. Garmin wins on
  // date conflicts (Firstbeat-derived HRV/RHR/Body Battery are richer); Apple
  // fills gaps and is the sole source for Apple-only athletes.
  const combinedHealth = useMemo(() => {
    if (apple.healthData.length === 0) return garmin.healthData
    if (garmin.healthData.length === 0) return apple.healthData
    const byDate = new Map(apple.healthData.map(d => [d.date, d] as const))  // Apple base
    for (const d of garmin.healthData) byDate.set(d.date, d)                 // Garmin wins
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
  }, [apple.healthData, garmin.healthData])

  // Combined activity feed for training load + coach. Apple workouts that
  // duplicate a Garmin/Strava session (same day, sport family, ~duration) are
  // dropped — those sources are richer (EPOC, zones, splits) and win. Apple
  // adds only workouts they don't have (notably for Apple-only athletes).
  const combinedActivities = useMemo(() => {
    if (apple.appleActivities.length === 0) return garmin.garminActivities
    const fam = (t: string): string => {
      const s = (t || '').toLowerCase()
      if (/run|jog/.test(s)) return 'run'
      if (/cycl|bike|ride/.test(s)) return 'ride'
      if (/hik/.test(s)) return 'hike'
      if (/walk/.test(s)) return 'walk'
      if (/swim/.test(s)) return 'swim'
      if (/strength|weight|workout/.test(s)) return 'strength'
      return 'other'
    }
    const dupOfRicher = (a: (typeof apple.appleActivities)[number]): boolean =>
      garmin.garminActivities.some(g =>
        g.date === a.date &&
        fam(g.type) === fam(a.type) &&
        Math.abs((g.durationMinutes || 0) - (a.durationMinutes || 0)) <= Math.max(5, (g.durationMinutes || 0) * 0.15),
      )
    return [...garmin.garminActivities, ...apple.appleActivities.filter(a => !dupOfRicher(a))]
  }, [garmin.garminActivities, apple.appleActivities])

  // Readiness engine (combines Garmin + Apple health data and activities)
  // R8 — age/experience tuning for the readiness engine (defaults when the
  // profile has no birthDate/experienceLevel, so behavior is unchanged then).
  const readinessTuning = useMemo(() => getReadinessTuning(effectiveAthlete), [effectiveAthlete])
  const readiness = useReadiness({
    healthData: combinedHealth,
    stravaActivities: strava.activities,
    garminActivities: combinedActivities,
    garminActivityDetails: garmin.activityDetails,
    rpeByDate,
    exerciseLoadByDate,
    sorenessLoadByDate: soreness.sorenessLoadByDate,
    maxHR: maxHROverride.maxHR,
    ftpWatts: activePlan.athlete.ftpWatts,
    athleteId,
    todayPlannedWorkout,
    currentWeekNum,
    raceDate: activePlan.race.date,
    actualHRByDate,
    runGAPByActivity,
    eccentricByActivity,
    upcomingPlannedDays,
    readinessTuning,
  })

  // Today's health data for banner
  const todayHealth = useMemo(() => {
    const today = localDateStr()
    return combinedHealth.find(d => d.date === today)
  }, [combinedHealth])

  const latestPerf = useMemo(
    () => (readiness.performance.length > 0 ? readiness.performance[readiness.performance.length - 1] : null),
    [readiness.performance],
  )
  const mimCalibration = useMIMCalibration(athleteId, readiness.dailyTrimp, soreness.sorenessLoadByDate)
  const domsCalibration = useDOMSCalibration(athleteId, readiness.dailyTrimp, soreness.sorenessLoadByDate)

  // Athlete-configurable proactive-coaching timing (Settings → Proactive
  // coaching): when Summary reveals tomorrow's card, and when the coach flips
  // morning→evening. Drives getCoachTimeOfDay + the daily briefing period.
  const proactiveTiming = useProactiveTimingPreference(athleteId)

  // AI Coach recommendation (legacy heuristic — still drives TodayBriefing)
  const coachRecommendation = useMemo(() => {
    const timeOfDay = getCoachTimeOfDay(proactiveTiming.morningHour, proactiveTiming.eveningHour)
    if (timeOfDay === 'morning') {
      return generateMorningCoach(
        readiness.todayScore,
        todayPlannedWorkout,
        currentWeekDays,
        todayDayIndex,
        latestPerf,
        todayHealth?.sleep,
        readiness.trainingStateInfo,
      )
    } else {
      return generateEveningCoach(
        readiness.todayScore,
        tomorrowPlannedWorkout,
        todayHealth?.sleep,
        todayHealth?.bodyBattery,
        latestPerf,
        readiness.trainingStateInfo,
      )
    }
  }, [readiness.todayScore, todayPlannedWorkout, tomorrowPlannedWorkout, currentWeekDays, todayDayIndex, latestPerf, todayHealth, readiness.trainingStateInfo, proactiveTiming.morningHour, proactiveTiming.eveningHour])

  // Wrap daySwap.swapDays to also re-anchor plan overrides. Without
  // this, an override stays pinned to its original dayIndex and would
  // merge into the wrong workout after a swap (manifesting as the
  // destination day appearing as a Rest day).
  const swapDaysWithOverrides = useCallback((weekNum: number, fromIndex: number, toIndex: number) => {
    daySwap.swapDays(weekNum, fromIndex, toIndex)
    planEdits.swapDayIndices(weekNum, fromIndex, toIndex)
  }, [daySwap, planEdits])

  const wrappedDaySwap = useMemo(() => ({
    swapDays: swapDaysWithOverrides,
    resetWeek: daySwap.resetWeek,
    hasSwaps: daySwap.hasSwaps,
  }), [swapDaysWithOverrides, daySwap.resetWeek, daySwap.hasSwaps])

  // Handler for coach swap
  const handleCoachSwap = useCallback((fromIndex: number, toIndex: number) => {
    swapDaysWithOverrides(currentWeekNum, fromIndex, toIndex)
  }, [swapDaysWithOverrides, currentWeekNum])

  // Manual workout editor — writes through the same planEdits hook the
  // Coach uses, so user edits compose with logs/swaps automatically.
  const planEdit = useMemo(() => ({
    editDay: (weekNum: number, dayIndex: number, updates: import('./components/WorkoutEditor').WorkoutEdits) => {
      planEdits.applyOverride({
        weekNum,
        dayIndex,
        updates,
        rationale: 'Manual edit',
      })
    },
    revertDay: (weekNum: number, dayIndex: number) => {
      planEdits.removeForDay(weekNum, dayIndex)
    },
    hasEdit: (weekNum: number, dayIndex: number) =>
      planEdits.hasEditForDay(weekNum, dayIndex),
  }), [planEdits])

  // Sprint 5 — fetch 14-day forecast + 10-year race-day climate. Returns
  // null when race coordinates aren't configured (legacy plans), in
  // which case the weather block stays off the snapshot and the coach
  // doesn't change behavior.
  // Sprint 5 — home location lets the day-to-day forecast track where
  // the athlete actually trains, not the race destination. When unset,
  // useWeather falls back to race coords (legacy behavior).
  const athleteLocation = useAthleteLocation(athleteId)
  const workoutTimePref = useWorkoutTimePreference(athleteId)
  // ── Sunday recap (N3) ──────────────────────────────────────────
  // The week that just ENDED is the one before the current week; on a
  // Sunday afternoon that is the week the athlete just lived through.
  // Strength history that survives plan rebuilds: current weeks plus the
  // ISO-keyed manual logs no current day represents (synthetic week 0).
  // Feeds the records layer everywhere — Stats, recap PRs, Dashboard.
  const strengthWeeks = useMemo(
    () => weeksWithPriorLogs(weeks, manualLog.logs),
    [weeks, manualLog.logs],
  )
  const weeklyRecapState = useWeeklyRecap(athleteId)
  const weeklyRecap = useMemo(() => {
    if (!weeklyRecapState.visible) return null
    const reviewNum = (currentWeekNum ?? 1) - 1
    const week = weeks.find(w => w.num === reviewNum)
    const wc = compliance.weeks.find(w => w.weekNum === reviewNum)
    if (!week || !wc) return null
    const perfLatest = readiness.performance.length > 0
      ? readiness.performance[readiness.performance.length - 1]
      : null
    const perfPrior = readiness.performance.length > 7
      ? readiness.performance[readiness.performance.length - 8]
      : null
    return buildWeeklyRecap({
      week,
      compliance: wc,
      history: compliance.weeks.filter(w => w.weekNum < reviewNum),
      perf: perfLatest,
      priorPerf: perfPrior,
      race: activePlan.race,
      weekNum: reviewNum,
      totalWeeks: weeks.length,
      athleteName: activePlan.athlete.name,
      todayIso: todayDateString(),
      // Phase 4 — PRs are detected against ALL history (prior plans
      // included), then narrowed to the week under review.
      strengthPRs: detectPRs(strengthWeeks).filter(pr => pr.weekNum === reviewNum),
    })
  }, [weeklyRecapState.visible, weeks, strengthWeeks, compliance.weeks, currentWeekNum, readiness.performance, activePlan.race, activePlan.athlete.name])

  // ── Monday review (Adaptive Engine phase 1) ────────────────────
  // The week that just finished, scored into advance/hold/ease with
  // one-tap adjustment diffs; a detected resumption-tier gap overrides
  // the Monday cadence and surfaces immediately.
  const mondayReview = useMemo(() => {
    const reviewNum = (currentWeekNum ?? 1) - 1
    if (reviewNum < 1) return null
    return buildWeeklyReview(weeks, reviewNum, todayDateString(), {
      hrStream: d => getCachedHRStream(d.actual?.stravaId || d.actual?.garminId),
    })
  }, [weeks, currentWeekNum])
  const reviewGapIso =
    mondayReview && (mondayReview.gap.tier === 'ease75' || mondayReview.gap.tier === 'rebuild50' || mondayReview.gap.tier === 'restart')
      ? mondayReview.gap.lastActivityIso
      : null
  const mondayReviewState = useMondayReview(athleteId, reviewGapIso)

  // Level Up (phase 2) — the accelerator: top evidence-ranked levers.
  // Phase 3's daily-health join added the sleep-before-hard-days lever.
  const levelUpLevers = useMemo(
    () => buildLevelUp(weeks, todayDateString(), {
      health: combinedHealth,
      raceType: onboarding.config?.raceType,
      readinessDown: readiness.todayScore != null &&
        (readiness.todayScore.status === 'YELLOW' || readiness.todayScore.status === 'RED'),
    }),
    [weeks, combinedHealth, onboarding.config?.raceType, readiness.todayScore],
  )

  const weatherBlock = useWeather(activePlan.race, athleteLocation.location, workoutTimePref.hour)

  // Daily Autopilot (phase 3) — same-day modulation from overnight data.
  // The engine is pure; useMorningOutlook owns the once-per-morning
  // auto-apply + one-tap revert, and everything lands in the log.
  const adaptationLog = useAdaptationLog(athleteId)
  const [showAdaptationLog, setShowAdaptationLog] = useState(false)
  // Coach tab split (N14): Chat | Tools sub-menu, plus the one-shot
  // deep link Tools uses to land Stats on the Engine sub-tab.
  const [coachSubTab, setCoachSubTab] = useState<'chat' | 'review' | 'tools'>('chat')
  const [dashSubTabRequest, setDashSubTabRequest] = useState<DashSubTab | null>(null)
  const todayHeatF = useMemo(() => {
    // Honest heat only: the forecast AT the training hour. Daily highs
    // overstate a 7am run, so no hourly data means no heat action.
    if (!weatherBlock?.hourly?.length) return null
    const today = localDateStr()
    const hour = workoutTimePref.hour ?? 7
    return weatherBlock.hourly.find(h => h.date === today && h.hour === hour)?.tempF ?? null
  }, [weatherBlock, workoutTimePref.hour])
  const morningOutlook = useMemo(() => buildMorningOutlook(weeks, todayDateString(), {
    score: readiness.todayScore,
    recentScores: readiness.weekScores,
    baselines: readiness.baselines,
    health: todayHealth ?? null,
    heatTempF: todayHeatF,
  }), [weeks, readiness.todayScore, readiness.weekScores, readiness.baselines, todayHealth, todayHeatF])
  // The verdict shown on every morning the autopilot did NOT act — the
  // green ones, the ones where it is still arming, and the ones with no
  // wearable to ask. Together with the outlook card this makes Today
  // answer the athlete's question every day rather than only on the days
  // the engine had something to change.
  // "Locked in" is the athlete committing to today's session. It is keyed
  // by date and persisted, because a commitment that vanishes on reload is
  // worse than not offering one — and it must not carry into tomorrow.
  const [lockedInDate, setLockedInDate] = useState<string | null>(() => {
    try { return localStorage.getItem(`ba_locked_in_${athleteId ?? 'me'}`) } catch { return null }
  })
  const lockedInToday = lockedInDate === todayDateString()
  // Which half of the ritual Today is in, on the athlete's own clock.
  const phaseWindow = useMemo(() => ({
    morningHour: proactiveTiming.morningHour,
    eveningHour: proactiveTiming.eveningHour,
  }), [proactiveTiming.morningHour, proactiveTiming.eveningHour])
  const todayPhase = useDayPhase(phaseWindow)

  // Proposals waiting on a decision. They are deliberately held out of the
  // morning: none of them changes what the athlete does in the next hour,
  // and the morning is for the next hour. They speak at the close.
  const notesWaiting = useMemo(() => (
    (benchAssessment.qualifies && !benchDismissed ? 1 : 0)
    + (recalAssessment.qualifies && !recalDismissed ? 1 : 0)
    + mimCalibration.pendingSuggestions.length
    + domsCalibration.pendingSuggestions.length
  ), [
    benchAssessment.qualifies, benchDismissed, recalAssessment.qualifies, recalDismissed,
    mimCalibration.pendingSuggestions, domsCalibration.pendingSuggestions,
  ])

  // Applying or snoozing a queue item routes to whichever mechanism owns
  // that proposal — the queue is a shared front door, not a second store.
  const applyQueueItem = useCallback((item: QueueItem): ApplyResult => {
    // Returns the way back where one exists. Benchmark and recalibration
    // both apply as a plan-edit batch, which is reversible by id; the two
    // calibrations change the model itself and have no inverse, so they
    // return nothing and the receipt says so out loud.
    if (item.kind === 'benchmark') {
      const batchId = applyBenchmarkResult()
      clearFirstSeen(athleteId, item.id)
      // Both forms: the closure for this mount, the token so the receipt's
      // Undo survives navigating to another view and back.
      return {
        undo: () => { undoBenchmarkResult(batchId) },
        undoToken: { kind: 'benchmark', batchId },
      }
    }
    if (item.kind === 'recalibration') {
      const batchId = planEdits.applyBatch(buildRepaceOps(
        weeks, recalAssessment.suggestedFactor, todayDateString(),
        `Pace recalibration: ${recalAssessment.evidence[0]}`,
      ))
      clearFirstSeen(athleteId, item.id)
      return {
        undo: () => planEdits.undoBatch(batchId),
        undoToken: { kind: 'recalibration', batchId },
      }
    }
    // Accepting a calibration also teaches the coach something about this
    // athlete. That sentence used to be written only by the Today card's
    // own handler, so the same proposal accepted from Coach changed the
    // numbers and lost the explanation.
    const note = item.kind === 'mim'
      ? mimCalibration.acceptSuggestion(item.id.replace(/^mim_/, ''))
      : domsCalibration.acceptSuggestion(item.id.replace(/^doms_/, ''))
    if (note && coachMemory.saveAboutMe) {
      coachMemory.saveAboutMe(appendAboutMeNote(coachMemory.aboutMe, note))
    }
    clearFirstSeen(athleteId, item.id)
    return {}
  }, [
    athleteId, applyBenchmarkResult, undoBenchmarkResult, planEdits, weeks,
    recalAssessment, mimCalibration, domsCalibration, coachMemory,
  ])

  /** Rebuild the way back from a stored receipt. Returns false when it is
   *  genuinely gone, so the receipt says so instead of claiming success. */
  const undoQueueToken = useCallback((token: { kind: QueueItem['kind']; batchId: string }): boolean => {
    if (token.kind === 'benchmark') return undoBenchmarkResult(token.batchId)
    if (token.kind === 'recalibration') {
      // Nothing to restore beyond the batch itself, so "can it still be
      // undone" is just "is the batch still there" — a plan reset or a
      // sync from another device can have taken it away.
      if (!planEdits.edits.some(e => e.batchId === token.batchId)) return false
      planEdits.undoBatch(token.batchId)
      return true
    }
    return false // the two calibrations teach the model and have no inverse
  }, [undoBenchmarkResult, planEdits])

  const snoozeQueueItem = useCallback((item: QueueItem) => {
    if (item.kind === 'benchmark') {
      try { localStorage.setItem(benchDismissKey, benchEvidenceKey) } catch { /* quota */ }
    } else if (item.kind === 'recalibration') {
      try { localStorage.setItem(recalDismissKey, recalEvidenceKey) } catch { /* quota */ }
    } else if (item.kind === 'mim') mimCalibration.dismissSuggestion(item.id.replace(/^mim_/, ''))
    else domsCalibration.dismissSuggestion(item.id.replace(/^doms_/, ''))
    clearFirstSeen(athleteId, item.id)
  }, [athleteId, benchDismissKey, benchEvidenceKey, recalDismissKey, recalEvidenceKey, mimCalibration, domsCalibration])

  // Proposals as queue items. raisedAt is persisted per id, so ageing is
  // real: an item that reset to "new" on every app open could never grow
  // stale and could never expire, which is exactly how a queue rots.
  const reviewItems = useMemo<QueueItem[]>(() => {
    const raw: Omit<QueueItem, 'raisedAt'>[] = []
    if (benchAssessment.qualifies && !benchDismissed) {
      raw.push({
        id: 'benchmark', kind: 'benchmark',
        title: benchmarkTitle(benchAssessment),
        consequence: benchmarkConsequence(benchAssessment),
      })
    }
    if (recalAssessment.qualifies && !recalDismissed) {
      raw.push({
        id: 'recalibration', kind: 'recalibration',
        title: recalTitle(),
        consequence: recalConsequence(recalAssessment),
      })
    }
    for (const sug of mimCalibration.pendingSuggestions) {
      raw.push({
        id: `mim_${sug.sport}`, kind: 'mim', title: `Load calibration — ${sug.sport.replace(/_/g, ' ')}`,
        consequence: sug.reason,
      })
    }
    for (const sug of domsCalibration.pendingSuggestions) {
      raw.push({
        id: `doms_${sug.sport}`, kind: 'doms', title: `Recovery calibration — ${sug.sport.replace(/_/g, ' ')}`,
        consequence: sug.reason,
      })
    }
    return raw.map(r => ({ ...r, raisedAt: firstSeenAt(athleteId, r.id) }))
  }, [
    athleteId, benchAssessment, benchDismissed, recalAssessment,
    recalDismissed, mimCalibration.pendingSuggestions, domsCalibration.pendingSuggestions,
  ])

  const [closedDate, setClosedDate] = useState<string | null>(() => {
    try { return localStorage.getItem(`ba_day_closed_${athleteId ?? 'me'}`) } catch { return null }
  })
  const closedToday = closedDate === todayDateString()
  const closeTheDay = useCallback(() => {
    const iso = todayDateString()
    setClosedDate(iso)
    try { localStorage.setItem(`ba_day_closed_${athleteId ?? 'me'}`, iso) } catch { /* quota */ }
  }, [athleteId])

  // The Adjust tray. The lever's own outcome sentence is what the athlete
  // sees afterwards, and the batch id is what Undo reverses — one value
  // each, so what was promised, what was applied and what is undone are
  // the same thing.
  const [adjusting, setAdjusting] = useState(false)
  const [adjustApplied, setAdjustApplied] = useState<{ text: string; batchId: string } | null>(null)
  const todayLevers = useMemo(() => leversFor(todayPlannedWorkout), [todayPlannedWorkout])

  const [openTodayRequest, setOpenTodayRequest] = useState(0)
  const [openReadinessRequest, setOpenReadinessRequest] = useState(0)
  // P14: Today's plan-notes row. The tap IS the acknowledgement — you asked
  // to read them, so they stop asking. A different plan means a different
  // set of notes, and the row comes back on its own.
  const [planNotesOpenRequest, setPlanNotesOpenRequest] = useState(0)
  // Derived, not stored: re-reading on every change of the note set means a
  // regenerated plan brings the row back on its own. A boolean latched at
  // mount would stay true through a rebuild and swallow the new plan's notes.
  const [planNotesSeenTick, setPlanNotesSeenTick] = useState(0)
  const planNotesRead = useMemo(
    () => notesSeen(athleteId, allAdvisories),
    // planNotesSeenTick re-reads storage after we write to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athleteId, allAdvisories, planNotesSeenTick],
  )
  const openPlanNotes = useCallback(() => {
    markNotesSeen(athleteId, allAdvisories)
    setPlanNotesSeenTick(n => n + 1)
    setPlanNotesOpenRequest(n => n + 1)
    setView('plan')
  }, [athleteId, allAdvisories])
  const openReadiness = useCallback(() => setOpenReadinessRequest(n => n + 1), [])
  const setShowTodayModal = useCallback(() => setOpenTodayRequest(n => n + 1), [])
  const lockInToday = useCallback(() => {
    const iso = todayDateString()
    setLockedInDate(iso)
    try { localStorage.setItem(`ba_locked_in_${athleteId ?? 'me'}`, iso) } catch { /* quota */ }
  }, [athleteId])

  // Race-readiness gauge for the countdown card, which moved off Today into
  // Plan > Season. Computed here because Plan has no performance series.
  const raceReadinessForPlan = useMemo(() => {
    const race = activePlan.race
    if (!race) return null
    const wks = weeksUntilRace(race.date)
    if (wks == null || wks < 0 || wks > 8) return null
    return computeRaceReadiness({ race, performance: readiness.performance })
  }, [activePlan.race, readiness.performance])

  // Load / body / damage coherence. Previously computed inside Summary for
  // a full-width banner; it now feeds one line of the Verdict card, so it
  // is computed here alongside the other verdict inputs.
  const trainingSignals = useMemo(() => buildTrainingSignals({
    performance: latestPerf,
    readiness: readiness.todayScore,
    sorenessLoadByDate: soreness.sorenessLoadByDate,
  }), [latestPerf, readiness.todayScore, soreness.sorenessLoadByDate])

  // The 12-day rhythm shown in Today's header. Resolved = trained, or
  // rested as the plan asked; only an open day is outstanding.
  const rhythm = useMemo(() => buildRhythm(weeks, todayDateString()), [weeks])

  // The most recent day the plan asked for a session and nothing was
  // logged. Shown on Today so an open day is never silently absorbed —
  // only the newest, because a wall of chips for a bad fortnight is the
  // shame spiral this design exists to avoid.
  const openDay = useMemo(() => newestOpenDay(rhythm), [rhythm])
  const [resolving, setResolving] = useState<{ day: PlannedDay; iso: string } | null>(null)

  const todayVerdict = useMemo(() => buildVerdict({
    score: readiness.todayScore,
    baselines: readiness.baselines,
    health: todayHealth ?? null,
    today: todayPlannedWorkout ?? null,
    nightsOfHistory: combinedHealth.filter(h => h.hrv?.lastNightAvg != null).length,
    hasSource: garmin.connected || strava.connected || apple.connected,
    signals: trainingSignals,
  }), [
    readiness.todayScore, readiness.baselines, todayHealth, todayPlannedWorkout,
    combinedHealth, garmin.connected, strava.connected, apple.connected, trainingSignals,
  ])

  const morningAutopilot = useMorningOutlook(athleteId, morningOutlook, {
    applyBatch: planEdits.applyBatch,
    undoBatch: planEdits.undoBatch,
    appendLog: adaptationLog.append,
    markLogReverted: adaptationLog.markReverted,
    onArchive: coachEnabled ? text => { void coachMemory.appendTurn('system-handoff', text) } : undefined,
    morningHour: proactiveTiming.morningHour,
  })

  // The training philosophy this athlete follows — their onboarding pick,
  // or the seed-athlete default (TrainingPeaks). Grounds the coach's plan
  // edits in the chosen methodology and drives the Methodology screen.
  const trainingMethod = useMemo(() => {
    const id = resolveMethodId(athleteId, onboarding.config)
    return id ? getMethodById(id) : undefined
  }, [athleteId, onboarding.config])

  // Assemble the CoachSnapshot for LLM calls
  const coachSnapshot: CoachSnapshot | null = useMemo(() => {
    if (!coachEnabled) return null
    // Wait for Garmin sync to finish before building the snapshot so the
    // coach sees fresh data, not stale cache from the previous session.
    if ((garmin.connected && garmin.loading) || (apple.connected && apple.loading)) return null
    // Only feed wearable-derived signals (readiness, load/performance, raw
    // activity feeds, today's health) to the coach when a data source is
    // actually CONNECTED. A session can expire — flipping `connected` false
    // while last-known health/activity data lingers in localStorage cache —
    // and the readiness engine will happily compute a self-consistent but
    // phantom Fitness/Fatigue/Load Ratio off that stale cache. Surfacing it
    // makes the coach narrate training that never happened (e.g. inventing a
    // "tour" to explain the numbers) while the UI correctly says "Connect
    // Garmin". Gate on the live connection so the coach's view matches it.
    const wearableConnected = garmin.connected || strava.connected || apple.connected
    const effReadiness = wearableConnected ? readiness.todayScore : null
    const effPerformance = wearableConnected ? readiness.performance : []
    if (!effReadiness && effPerformance.length === 0) return null
    const snap = buildCoachSnapshot({
      athleteProfile: effectiveAthlete,
      race: activePlan.race,
      zones: hrZones.zones,
      raceDistanceMiles: activePlan.race.distanceMiles,
      raceElevationFt: parseInt((activePlan.race.elevation || '0').replace(/[^0-9]/g, ''), 10) || 0,
      currentWeekNum,
      weeks,
      generalGoal: activePlan.generalGoal,
      plannedToday: todayPlannedWorkout,
      plannedTomorrow: tomorrowPlannedWorkout,
      readiness: effReadiness,
      performance: effPerformance,
      dailyTrimp: wearableConnected ? readiness.dailyTrimp : [],
      compliance,
      todaySoreness: soreness.todaySoreness,
      sorenessLog: [],
      planStartDate: '2026-04-13',
      todayHealth: wearableConnected ? todayHealth : undefined,
      // Raw activity feeds so the coach can see workouts outside the
      // plan window (pre-plan base, non-plan-day bonus runs, etc.)
      stravaActivities: wearableConnected ? strava.activities : [],
      garminActivities: wearableConnected ? combinedActivities : [],
      garminActivityDetails: wearableConnected ? garmin.activityDetails : {},
      trainingMethod,
      morningHour: proactiveTiming.morningHour,
      eveningHour: proactiveTiming.eveningHour,
    })
    // Attach persona so the API can shape the system prompt voice
    const persona = coachMemory.coachPersona
    if (persona && (persona.name || persona.traits.length > 0)) {
      snap.coachPersona = persona
    }
    // Attach proactive injury risk flags so the coach can raise concerns
    if (readiness.riskFlags && readiness.riskFlags.length > 0) {
      snap.riskFlags = readiness.riskFlags
    }
    // Sprint 5 — attach weather forecast when configured. Drives the
    // two-tier WARN/SWAP doctrine in COACH_ROLE.
    if (weatherBlock) {
      snap.weatherForecast = weatherBlock
    }
    // Match the coach's voice to the athlete's chosen detail level.
    snap.detailLevel = displayPrefs.detailLevel
    snap.detailLevelDirective = DETAIL_DIRECTIVES[displayPrefs.detailLevel]
    // Carry the athlete's injury context so the coach can speak to it.
    const injuryContext = injurySummaryLine(onboarding.config)
    if (injuryContext) snap.injuryContext = injuryContext
    // Carry the athlete's menopause context (midlife tailoring) the same way.
    const menopauseContext = menopauseSummaryLine(onboarding.config)
    if (menopauseContext) snap.menopauseContext = menopauseContext
    // Carry fueling guidance (R2) so the coach can give concrete carb/hydration
    // advice; null for short races that don't need per-hour fueling.
    const fuelingContext = fuelingSummaryLine(activePlan.race?.distanceMiles ?? 0)
    if (fuelingContext) snap.fuelingContext = fuelingContext
    // Carry post-race recovery guidance (R5) so the coach can answer recovery
    // and overtraining questions with concrete formulas.
    const recoveryContext = recoverySummaryLine(activePlan.race?.distanceMiles ?? 0)
    if (recoveryContext) snap.recoveryContext = recoveryContext
    // Carry running form / cadence cues (R9) so the coach can answer form questions.
    snap.formContext = formSummaryLine()
    // Carry race-execution/pacing (R6), mental skills (R10), and gated cycle (R11)
    // and masters (R12) guidance so the coach can speak to each concretely.
    const raceExecutionContext = raceExecutionSummaryLine(activePlan.race?.distanceMiles ?? 0, onboarding.config?.raceType === 'trail')
    if (raceExecutionContext) snap.raceExecutionContext = raceExecutionContext
    snap.mentalContext = mentalSummaryLine()
    const cycleContext = cycleContextLine(onboarding.config)
    if (cycleContext) snap.cycleContext = cycleContext
    const mastersContext = mastersContextLine(onboarding.config)
    if (mastersContext) snap.mastersContext = mastersContext
    // Realignment signal (G4): 1 missed key session or 2+ missed of any
    // type in the trailing 7 days → the coach is prompted to OFFER a
    // rebalanced week as a proposal card. Absent when on track, so a
    // compliant athlete never sees a phantom realignment nudge.
    const realignmentContext = realignmentContextForWeeks(weeks, todayDateString())
    if (realignmentContext) snap.realignmentContext = realignmentContext
    // Season narration (G1b): only multi-race athletes get a SEASON section
    // — where they are in the chain and why today serves the NEXT race.
    const seasonContext = buildSeasonContext(seasonState.planResult, todayDateString())
    if (seasonContext) snap.seasonContext = seasonContext
    // Race pacing (G6): the segment-band plan reaches the coach in the
    // final 2 weeks — when "what pace on the climbs?" gets asked.
    if (racePacingPlan && daysUntilRace <= 14) {
      snap.racePacingContext = buildRacePacingContext(racePacingPlan)
    }
    // Intensity distribution (G7): the athlete's measured weekly easy/hard
    // split vs their own method's phase target, plus long-run decoupling
    // when lap data exists. Quiet without a method or enough HR data.
    const g7Method = onboarding.config?.selectedMethodId
      ? getMethodById(onboarding.config.selectedMethodId) : undefined
    const g7Week = compliance.weeks.find(w => w.weekNum === snap.currentWeekNum)
    if (g7Method && g7Week) {
      const split = weeklyIntensitySplit(g7Week.days)
      const target = methodEasyTarget(g7Method, snap.planBlocks?.currentPhase)
      const longDay = [...weeks].reverse().flatMap(w => w.days)
        .find(d => d.type === 'long' && d.actual)
      const longDetail = longDay?.actual
        ? Object.values(garmin.activityDetails).flat()
            .find(det => det.name === longDay.actual!.name)
        : undefined
      const decoupling = decouplingFromSplits(longDetail?.splits)
      const intensityContext = buildIntensityContext(split, target, g7Method.name, decoupling)
      if (intensityContext) snap.intensityContext = intensityContext
    }
    // Carry the plan's honest advisories (feasibility, runway, goal-derived
    // paces) so the welcome letter can acknowledge them plainly rather than
    // writing around them. They already surface in MethodSelection + Summary.
    const planAdvisories = activePlan.advisories ?? []
    if (planAdvisories.length > 0) {
      snap.advisoriesContext = planAdvisories
        .map(a => `${a.title}: ${a.detail}${a.suggestion ? ` ${a.suggestion}` : ''}`)
        .join(' · ')
    }
    // Carry the athlete's free-text race description + goal so the coach can
    // weave them into every surface (and the welcome letter).
    if (onboarding.config && snap.race && (onboarding.config.raceDescription || onboarding.config.athleteGoal)) {
      snap.race.description = onboarding.config.raceDescription
      snap.race.athleteGoal = onboarding.config.athleteGoal
    }
    return snap
  }, [
    coachEnabled,
    effectiveAthlete,
    activePlan.race,
    hrZones.zones,
    currentWeekNum,
    weeks,
    todayPlannedWorkout,
    tomorrowPlannedWorkout,
    readiness.todayScore,
    readiness.performance,
    readiness.dailyTrimp,
    compliance,
    soreness.todaySoreness,
    todayHealth,
    coachMemory.coachPersona,
    strava.activities,
    strava.connected,
    combinedActivities,
    garmin.connected,
    garmin.loading,
    apple.connected,
    apple.loading,
    weatherBlock,
    trainingMethod,
    displayPrefs.detailLevel,
    onboarding.config,
    proactiveTiming.morningHour,
    proactiveTiming.eveningHour,
  ])

  // Daily LLM insight (shared between Summary + Coach tab)
  const dailyInsight = useCoachInsight({
    athleteId,
    surface: 'daily',
    snapshot: coachSnapshot,
    enabled: coachEnabled && !!coachSnapshot,
    morningHour: proactiveTiming.morningHour,
    eveningHour: proactiveTiming.eveningHour,
  })

  // Record each period's briefing so an earlier read (e.g. the morning
  // briefing) isn't silently overwritten when dayPeriod() flips. The live
  // card shows the current period; these earlier reads surface as read-only
  // cards at the top of the Coach thread.
  const briefingLog = useDailyBriefingLog(athleteId, dailyInsight.insight, proactiveTiming.morningHour, proactiveTiming.eveningHour)
  const earlierBriefings = priorBriefings(briefingLog, dailyInsight.insight, proactiveTiming.morningHour, proactiveTiming.eveningHour)

  // Proactive pings are intentionally disabled — the daily insight (the
  // blue "COACH PHIL ENGLISH" card on the Coach tab) is now THE coach's
  // proactive voice, refreshing twice daily — a morning read and an evening
  // read at the athlete-configured hour — via the dayPeriod() cache key inside
  // useCoachInsight. Yellow ping cards
  // (readiness_shift, new_workout, hrv_drop, etc.) cluttered the chat
  // with messages that overlapped the daily read; the conversation
  // surface is now reserved for the athlete's questions and the coach's
  // direct replies. The detector helpers in useProactivePings stay
  // exported for tests in case we want to revive scheduled briefings
  // server-side later.

  // Today no longer previews the coach message — the athlete
  // reads + replies entirely on the Coach tab. The alert banner is how
  // they learn a fresh daily insight is waiting: it fires whenever the
  // insight is newer than the last one they opened on the Coach tab.
  const { seenAt: seenInsightAt, markSeen: markInsightSeen } = useInsightReadState(athleteId)
  const hasUnreadInsight = !!(
    coachEnabled &&
    dailyInsight.insight &&
    !dailyInsight.insight.silent &&
    dailyInsight.insight.text &&
    dailyInsight.insight.generatedAt > seenInsightAt
  )
  // Landing on the Coach tab (via the banner or the nav) counts as
  // reading the current insight. Re-runs if the insight refreshes while
  // the athlete is already on the tab, so the banner never pops over a
  // message they're actively looking at.
  useEffect(() => {
    if (view === 'coach') {
      markInsightSeen(dailyInsight.insight?.generatedAt)
    }
  }, [view, dailyInsight.insight?.generatedAt, markInsightSeen])

  // "Ask about this" → seed chat + open Coach tab
  const handleAskCoach = useCallback(
    (seed: string) => {
      setChatSeed(seed)
      setView('coach')
      coachTelemetry.logInteraction('ask_tapped')
    },
    [coachTelemetry],
  )

  // Share a workout journal note with the coach in the BACKGROUND — no
  // navigation. The note has already been persisted onto the workout
  // (actual.notes) by the caller; this posts it as a coach turn so the
  // coach receives + analyzes it (durable facts extracted server-side) and
  // its reply waits in the Coach tab. Best-effort: a failed send leaves the
  // note saved. Skips when nothing changed so re-saving the same note (or
  // saving a workout without touching notes) doesn't spam the coach.
  const shareWorkoutNote = useCallback(
    async (day: PlannedDay, note: string) => {
      const trimmed = note.trim()
      if (!trimmed) return
      if (trimmed === (day.actual?.notes?.trim() || '')) return
      if (!coachSnapshot || !coachApiAvailable()) return
      try {
        await sendCoachMessageBackground(athleteId, buildJournalSeed(day, trimmed), coachSnapshot)
        await coachMemory.refresh()
        coachTelemetry.logInteraction('ask_tapped', { source: 'journal_note' })
      } catch {
        // Note is persisted regardless; coach share is best-effort.
      }
    },
    [athleteId, coachSnapshot, coachMemory, coachTelemetry],
  )

  // Free-standing journal entries (the "+ New entry" button) auto-share to the
  // coach when coach is on — same best-effort background path as a workout
  // note, but with no planned-vs-actual context (see buildStandaloneJournalSeed).
  const shareJournalNote = useCallback(
    async (note: JournalNote) => {
      if (!note.text.trim()) return
      if (!coachSnapshot || !coachApiAvailable()) return
      try {
        await sendCoachMessageBackground(athleteId, buildStandaloneJournalSeed(note), coachSnapshot)
        await coachMemory.refresh()
        coachTelemetry.logInteraction('ask_tapped', { source: 'journal_entry' })
      } catch {
        // Entry is persisted regardless; coach share is best-effort.
      }
    },
    [athleteId, coachSnapshot, coachMemory, coachTelemetry],
  )

  // Resolve a planned day by (weekNum, dayIndex). Uses base plan days
  // (pre-override) so the ProposalCard can show a "before → after" diff
  // with the original workout.
  const getPlannedDay = useCallback((weekNum: number, dayIndex: number): PlannedDay | null => {
    const w = activePlan.weeks.find(wk => wk.num === weekNum)
    if (!w) return null
    return w.days[dayIndex] ?? null
  }, [activePlan.weeks])

  // Sprint 2 — record what the athlete did with each proposal as a
  // system-handoff turn so the coach can see the negotiation history
  // and the inference engine can learn preferences over time. Best
  // effort; appendTurn is a no-op offline so the apply path still
  // works without a network.
  const describeProposal = useCallback((action: CoachAction): string => {
    const pe = action.proposedEdit
    if (!pe || !pe.ops?.length) return 'unknown proposal'
    return pe.ops.map(o => summarizeOp(o.op, getPlannedDay)).join(' · ')
  }, [getPlannedDay])

  const handleApproveAction = useCallback((turnId: string, action: CoachAction) => {
    if (action.type !== 'propose_edit' || !action.proposedEdit?.ops?.length) return
    const overrideId = planEdits.applyBatch(action.proposedEdit.ops)
    coachMemory.updateTurn(turnId, { actionStatus: 'applied', actionOverrideId: overrideId })
    coachMemory.appendTurn(
      'system-handoff',
      `[PLAN EDIT APPLIED] Athlete accepted the proposed change → ${describeProposal(action)}. Batch id ${overrideId}.`,
    )
  }, [planEdits, coachMemory, describeProposal])

  const handleRejectAction = useCallback((turnId: string) => {
    const turn = coachMemory.conversation.find(t => t.id === turnId)
    const action = turn?.action
    coachMemory.updateTurn(turnId, { actionStatus: 'rejected' })
    const swap = action ? ` → ${describeProposal(action)}` : ''
    coachMemory.appendTurn(
      'system-handoff',
      `[PLAN EDIT DECLINED] Athlete kept the original instead of the proposed swap${swap}. They did not modify or apply — note this preference for similar future suggestions.`,
    )
  }, [coachMemory, describeProposal])

  const handleUndoAction = useCallback((turnId: string, overrideId: string) => {
    planEdits.removeOverride(overrideId)
    coachMemory.updateTurn(turnId, { actionStatus: 'pending', actionOverrideId: undefined })
    coachMemory.appendTurn(
      'system-handoff',
      `[PLAN EDIT REVERTED] Athlete undid a previously-applied change (batch ${overrideId}). Treat as a soft signal that the change may not have worked for them.`,
    )
  }, [planEdits, coachMemory])

  // Daily-insight proposals don't live in coachMemory, so they get their
  // own approve/undo path that just touches planEdits. The card
  // tracks its own pending/applied/rejected status in localStorage.
  const handleApproveInsightProposal = useCallback((action: CoachAction): string | undefined => {
    if (action.type !== 'propose_edit' || !action.proposedEdit?.ops?.length) return undefined
    const overrideId = planEdits.applyBatch(action.proposedEdit.ops)
    coachMemory.appendTurn(
      'system-handoff',
      `[PLAN EDIT APPLIED] Athlete accepted the proposed change from a daily insight → ${describeProposal(action)}. Batch id ${overrideId}.`,
    )
    return overrideId
  }, [planEdits, coachMemory, describeProposal])

  const handleUndoInsightProposal = useCallback((overrideId: string) => {
    planEdits.removeOverride(overrideId)
    coachMemory.appendTurn(
      'system-handoff',
      `[PLAN EDIT REVERTED] Athlete undid a daily-insight change (batch ${overrideId}).`,
    )
  }, [planEdits, coachMemory])

  // First-time post-onboarding walkthrough — shown only when the athlete
  // came in via the onboarding flow (so pre-built handcrafted plans like
  // mike-18k skip it) and hasn't yet dismissed it.
  const showTutorial = !!onboarding.config && !tutorial.seen

  return (
    <div
      className={`${
        view === 'coach'
          // Coach is a self-contained app shell: a fixed-height (visible
          // viewport) flex column that does NOT scroll at the document
          // level. The header sits at its real measured height, the chat
          // is the only scroll region, and the composer pins to the bottom.
          // This avoids both (a) the previous tab's document scroll bleeding
          // in so the composer lands below the fold, and (b) relying on a
          // hardcoded header-height token that never matches every device.
          ? 'h-[var(--app-vh)] overflow-hidden flex flex-col'
          // Every other tab keeps the normal scrolling document + bottom
          // padding so content clears the fixed nav.
          : 'min-h-screen pb-24'
      } bg-slate-50 dark:bg-slate-950 dark:text-slate-200 transition-colors`}
      style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      {showTutorial && (
        <Tutorial
          onClose={tutorial.markSeen}
          athleteName={onboarding.config?.athleteName || activePlan.athlete.name}
        />
      )}
      {/* Header */}
      <div
        className="bg-slate-800 dark:bg-slate-900 text-white px-3 pb-2.5 shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}
      >
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold tracking-tight leading-tight">{raceName}</h1>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-teal-400 text-sm font-semibold">{daysUntilRace} days</span>
            <button
              type="button"
              onClick={() => setView('settings')}
              aria-label="Settings"
              aria-current={view === 'settings' ? 'page' : undefined}
              className="self-center -my-1 p-1 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={view === 'settings' ? '#5eead4' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
        {view === 'today' && rhythm.length > 0 ? (
          <RhythmStrip rhythm={rhythm} onOpenPlan={() => setView('plan')} />
        ) : (
          <>
            <p className="text-slate-300 text-xs mt-0.5">
              {activePlan.athlete.name} · {activePlan.race.date}
            </p>
            <p className="text-teal-400 text-[10px] mt-0.5">{activePlan.athlete.weeklyStructure}</p>
          </>
        )}
      </div>

      {adjusting && (
        <AdjustSheet
          levers={todayLevers}
          applied={adjustApplied?.text ?? null}
          onApply={lever => {
            const batchId = planEdits.applyBatch(opsForLever(lever, currentWeekNum ?? 1, todayDayIndex))
            setAdjustApplied({ text: lever.outcome, batchId })
          }}
          onUndo={() => {
            if (adjustApplied) planEdits.undoBatch(adjustApplied.batchId)
            setAdjustApplied(null)
          }}
          onClose={() => { setAdjusting(false); setAdjustApplied(null) }}
        />
      )}

      {/* Resolving an open day from Today. The sheet is presentation-only
          and useReplan already lives at this level, so Today opens the same
          sheet Plan does rather than sending the athlete to another tab. */}
      {resolving && (
        <MissedDaySheet
          day={resolving.day}
          hasReplan={replan.hasReplan(resolving.iso)}
          moveOutcome={moveOutcomeFor(weeks, resolving.iso)}
          onChoose={kind => {
            replan.apply(kind, resolving.iso)
            // The athlete's own record gets the decision too. Without this
            // a skipped or moved day left no trace at all — reading back a
            // block, it was simply absent, which reads as forgetting.
            const outcome = kind === 'move' ? moveOutcomeFor(weeks, resolving.iso) : null
            journalNotes.addNote({
              dateISO: resolving.iso,
              text: resolutionNote({
                kind,
                workout: resolving.day.workout,
                movedToDay: outcome?.kind === 'moved' ? outcome.toDay : null,
              }),
            })
          }}
          onUndo={() => replan.undoFor(resolving.iso)}
          onClose={() => setResolving(null)}
        />
      )}

      {/* Coach alert banner — surfaces a fresh daily insight the athlete
          hasn't opened yet. Tapping "Open" jumps to the Coach tab, which
          marks the insight read (see the hasUnreadInsight effect above). */}
      {coachEnabled && (
        <CoachPingToast
          unreadCount={hasUnreadInsight ? 1 : 0}
          onOpen={() => setView('coach')}
          onDismiss={() => coachTelemetry.logInteraction('toast_dismissed')}
        />
      )}

      {/* Sunday recap — the week, told back once. Lives 24h, then it is
          in the coach conversation and never re-raises. */}
      {weeklyRecap && (
        <WeeklyRecapOverlay
          recap={weeklyRecap}
          athleteId={athleteId}
          snapshot={coachSnapshot ? { ...coachSnapshot, lastWeekDigest: weeklyRecap.digest } : null}
          onClose={weeklyRecapState.dismiss}
          onArchive={(markdown) => {
            if (!weeklyRecapState.markShown()) return
            if (coachEnabled) void coachMemory.appendTurn('coach', markdown, 'weekly_recap')
          }}
          onRebuildPlan={onboarding.requestRedo}
        />
      )}

      {/* Monday review — last week's evidence, next week's adjustments.
          Applied ops flow through planEdits as one undoable batch per
          adjustment; a resumption-tier gap surfaces this immediately. */}
      {mondayReview && mondayReviewState.visible && !weeklyRecap && (
        <MondayReviewSheet
          review={mondayReview}
          onApply={(chosen) => {
            for (const adj of chosen) {
              const batchId = planEdits.applyBatch(adj.ops)
              adaptationLog.append({
                dateIso: todayDateString(), source: 'monday-review', kind: 'applied',
                title: adj.label, detail: `${adj.before} → ${adj.after}`, batchId,
              })
            }
            if (coachEnabled) {
              const lines = chosen.map(a => `- ${a.label}: ${a.before} → ${a.after}`).join('\n')
              void coachMemory.appendTurn('coach', `**Monday review — Week ${mondayReview.reviewedWeekNum}** (${mondayReview.execution.verdict}). Applied:\n${lines}`, 'weekly_recap')
            }
            mondayReviewState.dismiss()
          }}
          onDismiss={mondayReviewState.dismiss}
          onRebuild={() => { mondayReviewState.dismiss(); onboarding.requestRedo() }}
        />
      )}

      {/* Adaptation log — every engine change, with undo where the
          batch still exists. */}
      {showAdaptationLog && (
        <AdaptationLogSheet
          entries={adaptationLog.entries}
          onUndo={(entry) => {
            if (entry.batchId) planEdits.undoBatch(entry.batchId)
            adaptationLog.markReverted(entry.id)
          }}
          onClose={() => setShowAdaptationLog(false)}
        />
      )}

      {/* Content */}
      {view === 'today' && (<>
        {openDay && (
          <div className="px-3 mb-3">
            <ResolveStrip
              day={openDay}
              onResolve={d => {
                const planned = plannedDayFor(weeks, d.iso)
                if (planned) setResolving({ day: planned, iso: d.iso })
              }}
            />
          </div>
        )}
        {todayPhase === 'evening' ? (
          <div className="px-3 mb-3">
            <EveningCloseCard
              today={todayPlannedWorkout ?? null}
              tomorrow={tomorrowPlannedWorkout ?? null}
              notesWaiting={notesWaiting}
              notesInline={reviewItems.length > 0}
              closed={closedToday}
              lightsOut={null}
              onOpenNotes={() => setView('coach')}
              onOpenTomorrow={setShowTodayModal}
              onClose={closeTheDay}
            />
            {/* P15: the calibration proposals used to render as four
                independent cards under this one — the same four the
                queue already holds, in a different grammar, with a row
                above them promising they were somewhere else. One queue,
                capped and aged, with a consequence and an Undo. */}
            {reviewItems.length > 0 && (
              <div className="mt-3">
                <ReviewQueuePanel
                  items={reviewItems}
                  onApply={applyQueueItem}
                  onSnooze={snoozeQueueItem}
                  athleteId={athleteId}
                  onUndoToken={undoQueueToken}
                />
              </div>
            )}
          </div>
        ) : (
        <div className="px-3 mb-3">
          <VerdictCard
            verdict={todayVerdict}
            outlook={morningAutopilot.visible ? morningAutopilot.card : null}
            today={todayPlannedWorkout ?? null}
            lockedIn={lockedInToday}
            onOpenReadiness={openReadiness}
            onOpenSession={setShowTodayModal}
            onLockIn={lockInToday}
            onAdjust={() => { setAdjustApplied(null); setAdjusting(true) }}
            onSoundsRight={morningAutopilot.dismiss}
            onRevert={morningAutopilot.revert}
          />
        </div>
        )}
        {todayPhase === 'morning' && notesWaiting > 0 && (
          <div className="px-3 mb-3">
            {/* Held back, not hidden. The athlete knows something is waiting
                and can go to it now; it simply does not get to interrupt the
                morning, because none of it changes the next hour. */}
            <button
              onClick={() => setView('coach')}
              className="w-full flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl px-3.5 py-2.5 shadow-sm border border-slate-100 dark:border-slate-700 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
              data-testid="ledger-row"
            >
              <span className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Coach noted {notesWaiting} thing{notesWaiting === 1 ? '' : 's'}
                </span>
                {' '}— at your close
              </span>
              <span className="text-sm text-slate-400">›</span>
            </button>
          </div>
        )}
        {adaptationLog.entries.length > 0 && (
          <div className="px-3 mb-3">
            <button
              onClick={() => setShowAdaptationLog(true)}
              className="w-full flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl px-4 py-2.5 shadow-sm border border-slate-100 dark:border-slate-700"
              data-testid="open-adaptation-log"
            >
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Adaptation log</span>
              <span className="text-[11px] text-slate-400">
                {adaptationLog.entries.length} change{adaptationLog.entries.length === 1 ? '' : 's'} ›
              </span>
            </button>
          </div>
        )}
        <Summary
          openTodayRequest={openTodayRequest}
          openReadinessRequest={openReadinessRequest}
          athleteId={athleteId}
          todayScore={readiness.todayScore}
          todayHealth={todayHealth}
          healthHistory={combinedHealth}
          garminConnected={garmin.connected || apple.connected}
          coachRecommendation={coachRecommendation}
          onCoachSwap={handleCoachSwap}
          dailyTrimp={readiness.dailyTrimp}
          performance={readiness.performance}
          todaySoreness={soreness.todaySoreness}
          onLogSoreness={soreness.logSoreness}
          sorenessLoadByDate={soreness.sorenessLoadByDate}
          coachEnabled={coachEnabled}
          todayPlannedWorkout={todayPlannedWorkout}
          currentWeekNum={currentWeekNum}
          zones={hrZones.zones}
          coachSnapshot={coachSnapshot}
          riskFlags={readiness.riskFlags}
          advisories={allAdvisories}
          onOpenPlanNotes={openPlanNotes}
          planNotesSeen={planNotesRead}
          weeks={weeks}
          race={activePlan.race}
          season={seasonState.season}
          onOpenSeason={() => { setPlanViewRequest({ mode: 'season' }); setView('plan') }}
          manualLog={manualLog}
          onAskCoach={handleAskCoach}
          onShareNote={shareWorkoutNote}
        />
      </>)}
      {view === 'plan' && (
        <WeeklyPlan
          planNotes={allAdvisories}
          planNotesOpenRequest={planNotesOpenRequest}
          raceReadiness={raceReadinessForPlan}
          primaryGoalText={onboarding.config?.athleteGoal}
          weeks={weeks}
          primaryRace={(() => {
            const p = seasonState.season.races.find(r => r.isPrimary)
            const iso = p ? raceDateToIso(p.raceInfo.date) : null
            return p && iso ? { name: p.raceInfo.name, dateIso: iso } : null
          })()}
          zones={hrZones.zones}
          manualLog={manualLog}
          daySwap={wrappedDaySwap}
          planEdit={planEdit}
          travel={{ windows: travelMode.windows, onActivate: activateTravel, onDeactivate: deactivateTravel }}
          onToggleLock={lockedDays.toggleLock}
          replan={replan}
          onRebuildPlan={onboarding.requestRedo}
          weekReadiness={readiness.weekScores}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          latestPerf={latestPerf}
          coachSnapshot={coachSnapshot}
          onAskCoach={handleAskCoach}
          onShareNote={shareWorkoutNote}
          race={activePlan.race}
          compliance={compliance.weeks}
          dailyTrimp={readiness.dailyTrimp}
          injuryStatus={onboarding.config?.injuryStatus}
          strengthLevel={onboarding.config?.strengthExperience}
          racePacing={racePacingPlan}
          season={seasonState.season}
          plan={activePlan}
          method={onboarding.config?.selectedMethodId ? getMethodById(onboarding.config.selectedMethodId) : undefined}
          onboardingConfig={onboarding.config ?? undefined}
          requestView={planViewRequest}
          onReweightPlan={onboarding.setWeakStation}
          strength={{
            capacity: strengthCapacity.capacity,
            save: strengthCapacity.save,
            kind: onboarding.config?.raceType === 'hyrox' ? 'hyrox' : 'general',
          }}
        />
      )}
      {view === 'progress' && (
        <Dashboard
          weeks={weeks}
          compliance={compliance}
          raceDate={activePlan.race.date}
          race={activePlan.race}
          planZones={hrZones.zones}
          athleteMaxHR={maxHROverride.maxHR}
          todayScore={readiness.todayScore}
          weekScores={readiness.weekScores}
          todayHealth={todayHealth}
          healthHistory={combinedHealth}
          dailyTrimp={readiness.dailyTrimp}
          performance={readiness.performance}
          weeklyRecommendations={readiness.weeklyRecommendations}
          riskFlags={readiness.riskFlags}
          garminConnected={garmin.connected || apple.connected}
          sorenessLoadByDate={soreness.sorenessLoadByDate}
          strengthCapacity={strengthCapacity.capacity}
          strengthWeeks={strengthWeeks}
          currentWeekNum={currentWeekNum}
          onboardingConfig={onboarding.config}
          athleteId={athleteId}
          subTabRequest={dashSubTabRequest}
          onSubTabRequestHandled={() => setDashSubTabRequest(null)}
        />
      )}
      {view === 'coach' && coachEnabled && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-3 pt-2 shrink-0">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            {(['chat', 'review', 'tools'] as const).map(t => (
              <button
                key={t}
                onClick={() => setCoachSubTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  coachSubTab === t
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t === 'chat' ? 'Chat' : t === 'tools' ? 'Tools'
                  : notesWaiting > 0 ? `To review (${notesWaiting})` : 'To review'}
              </button>
            ))}
          </div>
        </div>
        {coachSubTab === 'review' ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
            <ReviewQueuePanel
              items={reviewItems}
              onApply={item => applyQueueItem(item)}
              onSnooze={item => snoozeQueueItem(item)}
              athleteId={athleteId}
              onUndoToken={undoQueueToken}
            />
          </div>
        ) : coachSubTab === 'tools' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CoachToolsPanel
              autopilot={{
                baselineNights: readiness.baselines?.lnRmssd.sampleSize ?? 0,
                baselineTarget: 21,
                healthConnected: combinedHealth.length > 0,
                lastAction: adaptationLog.entries.find(e => e.source === 'autopilot') ?? null,
              }}
              mondayReviewLive={Boolean(mondayReview && mondayReviewState.visible)}
              logCount={adaptationLog.entries.length}
              onOpenLog={() => setShowAdaptationLog(true)}
              levers={levelUpLevers}
              onAskCoach={(seed) => { setCoachSubTab('chat'); handleAskCoach(seed) }}
              onOpenEngine={() => { setDashSubTabRequest('engine'); setView('progress') }}
            />
          </div>
        ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
        <CoachTab
          athleteId={athleteId}
          memory={coachMemory}
          snapshot={coachSnapshot}
          dailyInsight={dailyInsight.insight}
          dailyInsightLoading={dailyInsight.loading}
          priorBriefings={earlierBriefings}
          chatSeed={chatSeed}
          onChatSeedConsumed={() => setChatSeed(null)}
          onMarkRead={() => coachMemory.markRead()}
          onGoSettings={() => setView('settings')}
          onInteraction={(k, m) => coachTelemetry.logInteraction(k as Parameters<typeof coachTelemetry.logInteraction>[0], m)}
          getPlannedDay={getPlannedDay}
          onApproveAction={handleApproveAction}
          onRejectAction={handleRejectAction}
          onUndoAction={handleUndoAction}
          onApproveInsightProposal={handleApproveInsightProposal}
          onUndoInsightProposal={handleUndoInsightProposal}
          onRegenerateInsight={dailyInsight.regenerate}
          onAskCoach={handleAskCoach}
          onboardingConfig={onboarding.config}
        />
        </div>
        )}
        </div>
      )}
      {view === 'journal' && (
        <Journal
          weeks={weeks}
          athleteId={athleteId}
          coachEnabled={coachEnabled}
          coachSnapshot={coachSnapshot}
          zones={hrZones.zones}
          latestPerf={latestPerf}
          strengthLevel={onboarding.config?.strengthExperience}
          onAskCoach={handleAskCoach}
          onShareNote={shareWorkoutNote}
          manualLog={manualLog}
          journalNotes={journalNotes}
          onShareEntry={shareJournalNote}
        />
      )}
      {/* Methodology moved into Settings as a collapsible subsection */}
      {view === 'info' && (
        <div className="px-3 pt-3">
          <SeasonPanel seasonState={seasonState} anchorRaceType={onboarding.config?.raceType} />
          <RaceInfo race={activePlan.race} />
        </div>
      )}
      {view === 'settings' && showStrava && (
        <Settings
          connected={strava.connected}
          configured={strava.configured}
          loading={strava.loading}
          error={strava.error}
          athleteName={strava.athleteName}
          lastSync={strava.lastSync}
          onConnect={strava.connect}
          onDisconnect={strava.disconnect}
          onSync={strava.sync}
          garminConnected={garmin.connected}
          garminConfigured={garmin.configured}
          garminActivityDetails={garmin.activityDetails}
          onProbeGarminDay={garmin.refreshDetailsForDate}
          garminLoading={garmin.loading}
          garminError={garmin.error}
          garminMfaRequired={garmin.mfaRequired}
          garminDisplayName={garmin.displayName}
          garminLastSync={garmin.lastSync}
          onGarminConnect={garmin.connect}
          onGarminSubmitMfa={garmin.submitMfa}
          onGarminDisconnect={garmin.disconnect}
          onGarminSync={garmin.sync}
          appleConnected={apple.connected}
          appleLastSync={apple.lastSync}
          onAppleSync={apple.sync}
          hrZones={hrZones.zones}
          hrZonesCustomized={hrZones.isCustomized}
          hrZonesMaxHR={maxHROverride.maxHR}
          hrZonesMaxHRCustomized={maxHROverride.isCustomized}
          onSaveHRZones={handleSaveHRZones}
          onResetHRZones={handleResetHRZones}
          onClearCache={clearAllCachedData}
          onClearAll={clearAllAppData}
          onSetHyroxDivision={onboarding.setHyroxDivision}
          onSetTestedLthr={bpm => onboarding.applyBenchmarkAnchors({ testedLthrBpm: bpm })}
          onResetOnboarding={() => {
            onboarding.requestRedo()
            setView('today')
          }}
          planStartIso={onboarding.config ? (onboarding.config.planStartPinnedIso ?? mondayOnOrBefore(todayDateString())) : undefined}
          onSetPlanStart={onboarding.setPlanStart}
          planBackups={onboarding.planBackups}
          onRestorePlan={(savedAt) => { onboarding.restorePlan(savedAt); setView('today') }}
          coachEnabled={coachEnabled}
          aboutMeText={coachMemory.aboutMe}
          pendingInferences={coachMemory.pendingInferences}
          onAcceptInference={coachMemory.acceptInference}
          onDismissInference={coachMemory.dismissInference}
          coachPersona={coachMemory.coachPersona}
          onSaveCoachPersona={coachMemory.saveCoachPersona}
          coachConversation={coachMemory.conversation}
          coachDailyArchives={coachMemory.dailyArchives}
          onClearCoachConversation={coachMemory.clearConversation}
          coachAboutMeFacts={coachMemory.aboutMeFacts}
          onAddCoachFact={coachMemory.addAboutMeFact}
          onEditCoachFact={coachMemory.editAboutMeFact}
          onDeleteCoachFact={coachMemory.deleteAboutMeFact}
          athleteHomeLocation={athleteLocation.location}
          athleteHomeDetecting={athleteLocation.detecting}
          athleteHomeError={athleteLocation.detectError}
          raceLocationLabel={activePlan.race.coordinates?.label}
          onSaveAthleteHome={athleteLocation.save}
          onClearAthleteHome={athleteLocation.clear}
          onUseBrowserHomeLocation={athleteLocation.useBrowserLocation}
          workoutTimeSlot={workoutTimePref.slot}
          onSaveWorkoutTimeSlot={workoutTimePref.save}
          morningHour={proactiveTiming.morningHour}
          eveningHour={proactiveTiming.eveningHour}
          onSaveMorningHour={proactiveTiming.saveMorningHour}
          onSaveEveningHour={proactiveTiming.saveEveningHour}
          athleteProfileExtras={athleteProfileExtras.profile}
          onSaveAthleteProfile={athleteProfileExtras.save}
          athleteId={athleteId}
          authSession={session}
          onLogout={onLogout}
          themeMode={theme.mode}
          onSetThemeMode={theme.setMode}
          paletteId={palette.paletteId}
          onSetPalette={palette.setPalette}
          mimOverrides={mimCalibration.allOverrides}
          mimLastCalibrated={mimCalibration.lastCalibrated}
          onSetMIMManual={mimCalibration.setManualOverride}
          onResetMIM={mimCalibration.resetOverride}
          onRecalibrateMIM={mimCalibration.calibrate}
          activePlan={activePlan}
          trainingMethod={trainingMethod}
          onboardingConfig={onboarding.config ?? undefined}
          performance={readiness.performance}
          mergedWeeks={weeks}
          season={seasonState.season}
        />
      )}

      {/* Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}
      >
        {TABS.map(t => {
          const active = view === t.id
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 min-h-[60px] transition-colors relative ${
                active ? 'text-teal-700' : 'text-slate-400'
              }`}
            >
              <span className="relative">
                <TabIcon id={t.id} active={active} />
                {!!t.badge && (
                  <span className="absolute -top-1 -right-2 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                )}
              </span>
              <span className={`text-[11px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function TabIcon({ id, active }: { id: string; active: boolean }) {
  const color = active ? '#0f766e' : '#94a3b8'
  const size = 24
  const sw = active ? 2.2 : 1.8
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'today':
      return <svg {...common}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    case 'plan':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    case 'progress':
      return <svg {...common}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
    case 'coach':
      return <svg {...common}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
    case 'journal':
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="10" /></svg>
  }
}
