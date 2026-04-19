# Broken Arrow Health — iOS Companion App

A minimal SwiftUI app that reads HRV, resting heart rate, and sleep from
Apple Health and uploads them to the Broken Arrow Training backend so the
readiness engine can use Apple Watch data alongside (or instead of) Garmin.

## What it does

1. Asks for HealthKit read permission for:
   - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
   - `HKQuantityTypeIdentifierRestingHeartRate`
   - `HKCategoryTypeIdentifierSleepAnalysis`
2. On **Sync last 7 days**, queries HealthKit per-day, averages HRV/RHR,
   sums sleep stages, and POSTs the batch to
   `POST {API}/api/apple/health?athlete={id}`.
3. The backend stores the normalized records in Upstash KV under
   `apple_health_{athlete}_{date}`, then the web app reads them back via
   `GET /api/apple/health?athlete={id}&days=7` and feeds them into the
   same readiness pipeline as Garmin.

## Project layout

```
ios/BrokenArrowHealth/
  BrokenArrowHealth/
    BrokenArrowHealthApp.swift          # @main entry point
    ContentView.swift                   # SwiftUI form + Sync button
    HealthManager.swift                 # HKHealthStore queries + upload
    Info.plist                          # NSHealthShareUsageDescription
    BrokenArrowHealth.entitlements      # HealthKit capability
    Assets.xcassets/                    # AppIcon + AccentColor
    Preview Content/
```

No `.xcodeproj` is checked in. You create one in Xcode the first time
(see below) and check the resulting files in if you want to.

## First-time Xcode setup

1. Open Xcode (16+ recommended) → **File → New → Project**.
2. Choose **iOS → App**. Click Next.
3. Use these settings:
   - Product Name: `BrokenArrowHealth`
   - Team: your Apple Developer team
   - Organization Identifier: `com.yourdomain` (anything unique)
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: **None**
4. Save it somewhere temporary (NOT inside this repo yet) — you'll copy
   the `.xcodeproj` over in a second.
5. In Finder, **delete** the generated `BrokenArrowHealthApp.swift`,
   `ContentView.swift`, `Assets.xcassets`, `Preview Content`, and
   `Info.plist` from Xcode's template output.
6. Move Xcode's generated `.xcodeproj` into
   `ios/BrokenArrowHealth/` so it sits next to the `BrokenArrowHealth/`
   source folder in this repo.
7. Re-open the `.xcodeproj` in Xcode. In the left sidebar, right-click
   the `BrokenArrowHealth` group → **Add Files…** → select every file
   under `ios/BrokenArrowHealth/BrokenArrowHealth/`. Make sure
   **Copy items if needed** is OFF and **Create groups** is ON.
8. In the target's **Signing & Capabilities** tab:
   - Select your team.
   - Click **+ Capability** → **HealthKit** (this auto-wires the
     entitlement; our file is already there so Xcode will accept it).
9. In the target's **Build Settings**:
   - Set **Info.plist File** to `BrokenArrowHealth/Info.plist`.
   - Set **Code Signing Entitlements** to
     `BrokenArrowHealth/BrokenArrowHealth.entitlements`.
10. Minimum deployment: iOS 17.0.

## Set the server API key (one time, before first run)

The `/api/apple/health` endpoint requires an `Authorization: Bearer <key>`
header on every request. Generate a strong random key and set it in two
places:

```
# 1. In Vercel project settings → Environment Variables
APPLE_HEALTH_API_KEY=<paste-64-char-random-string>

# Example generator:
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Trigger a Vercel redeploy after setting the env var so the function
picks it up. If the env var is unset the endpoint fails closed (503)
— it will **not** accidentally allow unauthenticated access.

## Run it on your Watch-paired iPhone

1. Plug in your iPhone, select it as the run destination.
2. Build + Run (`⌘R`).
3. On first launch, tap **Grant HealthKit access** and allow HRV, RHR,
   and Sleep. (If you accidentally deny, fix it at
   Settings → Health → Data Access & Devices → Broken Arrow Health.)
4. Enter your athlete id (e.g. `mike`), the API URL
   (`https://broken-arrow-training.vercel.app` by default), and paste
   the same `APPLE_HEALTH_API_KEY` value you set on Vercel.
5. Tap **Sync last 7 days**. You should see `Uploaded N days` and a
   preview list of the records. Open the web app's Readiness tab to
   confirm the numbers appear.

If you see `401 invalid API key`, the key on the phone doesn't match
the server env var — paste the Vercel value again. If you see
`503 server misconfigured`, the env var isn't set on Vercel yet.

## Distributing via TestFlight

1. **Archive**: In Xcode, select **Any iOS Device** as the destination,
   then **Product → Archive**.
2. In the Organizer window, click **Distribute App → App Store Connect
   → Upload**.
3. On [App Store Connect](https://appstoreconnect.apple.com), create a
   matching app record if you haven't (Bundle ID must match).
4. Once the build processes (5–20 min), go to **TestFlight** → add
   internal testers by email (Mike, Jim, Lori, Joel). They install the
   TestFlight app, accept the invite, and get the build.

Internal testers don't require App Review; external testers do.

## How it fits with the web app

The web readiness engine reads health data from `/api/garmin/health` or
`/api/apple/health`, whichever the user has configured. Both endpoints
return the same `GarminHealthData` shape (`hrv`, `rhr`, `sleep`,
`bodyBattery`), so the rest of the app (scores, trends, coach context)
is source-agnostic.

Apple Health doesn't provide a Body Battery equivalent, so that field
is always `null` for Apple users — the readiness engine already handles
missing fields gracefully.

## Troubleshooting

- **"No HealthKit data found for the last 7 days"** — Make sure your
  Apple Watch has actually recorded HRV/sleep in that window. HRV is
  only recorded during sleep and occasional background checks; brand
  new Watch users may not have 7 days yet.
- **"Authorization failed"** — Check Settings → Health → Data Access &
  Devices → Broken Arrow Health and toggle on the three categories.
- **401/403 from upload** — The endpoint is public (no auth); if you
  see this it's a Vercel deployment protection issue. Make sure the
  API URL points to production, not a preview deployment.
- **Dates are off by one** — HealthKit returns samples in UTC but we
  bucket by local day. If you travel across time zones, sync after
  you've been in the new zone for a full night's sleep.
