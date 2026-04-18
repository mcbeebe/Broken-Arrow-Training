import type { WorkoutType, WorkoutStyle } from '../types'

export const WORKOUT_STYLES: Record<WorkoutType, WorkoutStyle> = {
  strength: { bg: "#EDE9FE", border: "#7C3AED", label: "\u{1F4AA}" },
  run:      { bg: "#ECFDF5", border: "#059669", label: "\u{1F3C3}" },
  quality:  { bg: "#FEF3C7", border: "#D97706", label: "\u26A1" },
  long:     { bg: "#DBEAFE", border: "#2563EB", label: "\u{1F3D4}" },
  cross:    { bg: "#F0FDFA", border: "#0D9488", label: "\u{1F6B4}" },
  rest:     { bg: "#F9FAFB", border: "#D1D5DB", label: "\u{1F634}" },
  limited:  { bg: "#FEF9C3", border: "#CA8A04", label: "\u26A0\uFE0F" },
  travel:   { bg: "#FEE2E2", border: "#DC2626", label: "\u2708\uFE0F" },
  race:     { bg: "#FDF2F8", border: "#DB2777", label: "\u{1F3C6}" },
}

export function getWorkoutStyle(type: WorkoutType): WorkoutStyle {
  return WORKOUT_STYLES[type] ?? WORKOUT_STYLES.rest
}

const DARK_BG: Record<string, string> = {
  '#EDE9FE': '#2e1065', '#ECFDF5': '#064e3b', '#FEF3C7': '#451a03',
  '#DBEAFE': '#1e3a5f', '#F0FDFA': '#042f2e', '#F9FAFB': '#1e293b',
  '#FEF9C3': '#422006', '#FEE2E2': '#450a0a', '#FDF2F8': '#500724',
  '#D1FAE5': '#064e3b',
}

export function getDarkBg(lightBg: string): string {
  return DARK_BG[lightBg] || '#1e293b'
}

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function adaptBg(lightBg: string): string {
  return isDarkMode() ? getDarkBg(lightBg) : lightBg
}
