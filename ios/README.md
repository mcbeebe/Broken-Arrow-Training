# Broken Arrow Health — iOS Companion App

A minimal iOS app that reads Apple Health data (HRV, resting HR, sleep) and pushes it to the Broken Arrow training backend for readiness scoring.

## Setup in Xcode

1. Open Xcode → File → New → Project → iOS App
2. Product Name: `BrokenArrowHealth`
3. Interface: SwiftUI, Language: Swift
4. **Delete** the auto-generated files and **copy in** the files from this directory:
   - `BrokenArrowHealthApp.swift`
   - `ContentView.swift`
   - `HealthManager.swift`
   - `Info.plist`
   - `BrokenArrowHealth.entitlements`

5. In your target's Signing & Capabilities:
   - Add **HealthKit** capability
   - Check "Clinical Health Records" and "Background Delivery"
   - Set your Team (Apple Developer account)

6. In your target's Info tab, verify these keys exist:
   - `NSHealthShareUsageDescription` — "Broken Arrow Health syncs your HRV..."
   - `UIBackgroundModes` → `fetch`

7. Build and run on a real device (HealthKit doesn't work in Simulator)

## TestFlight Distribution

1. Archive: Product → Archive
2. Distribute → TestFlight (Internal Testing)
3. Add Lori, Joel, and others as testers by email
4. They install via TestFlight app on their iPhone

## How It Works

1. User opens the app, enters their athlete ID (e.g. "lori") and the API URL
2. App requests Apple Health permission for HRV, resting HR, and sleep
3. On each sync, it reads the last 7 days of health data from HealthKit
4. POSTs batch data to `POST /api/apple/health?athlete=lori`
5. The backend stores it in Upstash KV per athlete per date
6. The web app's readiness engine picks it up via `GET /api/apple/health?athlete=lori`

## Data Synced

| Metric | HealthKit Type | Used For |
|--------|---------------|----------|
| HRV (RMSSD) | `heartRateVariabilitySDNN` | 40% of readiness score |
| Resting HR | `restingHeartRate` | 20% of readiness score |
| Sleep duration | `sleepAnalysis` | 20% of readiness score |
| Sleep stages | `sleepAnalysis` (deep/REM/core/awake) | Sleep quality display |

## What's NOT synced

- Workout data → comes from Strava (users sync Apple Watch → Strava)
- Body Battery → Garmin-proprietary, not available from Apple Health
- Training Effect / EPOC → Garmin-proprietary
