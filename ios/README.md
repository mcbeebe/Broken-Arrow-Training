# Broken Arrow Health — iOS Companion App

A minimal SwiftUI app that reads HRV, resting heart rate, and sleep from
Apple Health and uploads them to the Broken Arrow Training backend so the
readiness engine can use Apple Watch data alongside (or instead of) Garmin.

## What it does

1. User taps **Sign in with Google**. The Google Sign-In sheet appears;
   they pick their account. The iOS app exchanges the resulting Google
   ID token for a Broken Arrow session JWT via `POST /api/auth/google`,
   which maps the verified email to an athleteId.
2. The session JWT is stored in the iOS Keychain (device-only, no
   iCloud sync).
3. The app asks for HealthKit read permission for:
   - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`
   - `HKQuantityTypeIdentifierRestingHeartRate`
   - `HKCategoryTypeIdentifierSleepAnalysis`
4. On **Sync**, it queries HealthKit per-day, averages HRV/RHR, sums
   sleep stages, and POSTs the batch to `POST {API}/api/apple/health`
   with `Authorization: Bearer <session-jwt>`. The server reads the
   athleteId from the JWT — clients can't write to anyone else's data.
5. The backend stores the normalized records in Upstash KV under
   `apple_health_{athlete}_{date}`, then the web app reads them back via
   `GET /api/apple/health?days=7` and feeds them into the same
   readiness pipeline as Garmin.

## Project layout

```
ios/BrokenArrowHealth/
  BrokenArrowHealth/
    BrokenArrowHealthApp.swift          # @main entry point, URL handler
    ContentView.swift                   # Sign-in + sync UI
    AuthManager.swift                   # Google Sign-In → session JWT
    HealthManager.swift                 # HKHealthStore queries + upload
    KeychainStore.swift                 # Keychain wrapper for JWT
    Info.plist                          # usage strings + URL scheme
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

## Add the Google Sign-In SDK (Swift Package Manager)

1. In Xcode, select the project → **Package Dependencies** tab → **+**.
2. Paste `https://github.com/google/GoogleSignIn-iOS` and click Add.
3. Choose **Up to Next Major** starting at `7.1.0` (or later).
4. Pick the `GoogleSignIn` library and add it to the
   `BrokenArrowHealth` target.

## Create the iOS OAuth client in Google Cloud

The iOS app uses its own OAuth client ID (different from the web app's).

1. Open <https://console.cloud.google.com/apis/credentials> for the
   same project your web Sign-In uses.
2. **Create Credentials → OAuth client ID**.
3. Application type: **iOS**.
4. Bundle ID: **must exactly match** the bundle identifier Xcode shows
   under the target's **General** tab (e.g. `com.yourdomain.BrokenArrowHealth`).
5. Click Create. Copy two things from the detail page:
   - **Client ID**: looks like `1234-abcd.apps.googleusercontent.com`.
   - **iOS URL scheme**: the client ID reversed, e.g.
     `com.googleusercontent.apps.1234-abcd`.

## Wire the client ID into the iOS app

1. In Xcode, open `BrokenArrowHealth/Info.plist`.
2. Add a top-level string key `GIDClientID` with the **Client ID** value.
3. Add a `CFBundleURLTypes` array with one URL type whose
   `CFBundleURLSchemes` contains the **iOS URL scheme** above.

Info.plist fragment:

```xml
<key>GIDClientID</key>
<string>1234-abcd.apps.googleusercontent.com</string>
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.1234-abcd</string>
    </array>
  </dict>
</array>
```

## Set the Vercel env vars

The server needs to accept ID tokens from the iOS OAuth client when
they hit `/api/auth/google`. Add (or confirm) these in Vercel:

- `GOOGLE_CLIENT_ID` — your existing **web** Google OAuth client ID
- `GOOGLE_CLIENT_ID_IOS` — the new **iOS** Google OAuth client ID
- `OAUTH_JWT_SECRET` — already set; used to sign session JWTs
- `ATHLETE_EMAILS` — already set; maps verified emails to athleteIds

The Apple Health endpoint now fails closed with 503 if
`OAUTH_JWT_SECRET` is unset, so a misconfigured deploy can't leak data.

(The previous `APPLE_HEALTH_API_KEY` shared-secret env var is no longer
used — you can remove it.)

## Run it on your Watch-paired iPhone

1. Plug in your iPhone, select it as the run destination.
2. Build + Run (`⌘R`).
3. On first launch, enter the API URL
   (`https://broken-arrow-training.vercel.app` by default — the Vercel
   API host is unchanged by the attune.coach frontend cutover) and tap
   **Sign in with Google**. Pick the account tied to your athlete email.
4. Tap **Grant HealthKit access** and allow HRV, RHR, and Sleep.
   (If you accidentally deny, fix it at
   Settings → Health → Data Access & Devices → Broken Arrow Health.)
5. Tap **Sync Now**. You should see the last sync timestamp update.
   Open the web app's Readiness tab to confirm the numbers appear.

Troubleshooting:
- **"Invalid client ID"** on sign-in — `GOOGLE_CLIENT_ID_IOS` on Vercel
  doesn't match the client ID the iOS app is using. Re-copy it from
  Google Cloud Console.
- **"No athlete account found"** — the verified Google email isn't in
  the `ATHLETE_EMAILS` env var on Vercel. Add it and redeploy.
- **"missing or invalid Authorization header"** on upload — the iOS
  session JWT expired (1 year TTL) or was cleared. Sign out and sign
  back in to refresh.

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
- **401 from upload** — Session JWT expired (1 year TTL) or was
  revoked (JWT secret rotated). Sign out and sign back in.
- **403 from upload** — The `?athlete=X` query param didn't match the
  athleteId in the JWT. Remove the param (the server derives identity
  from the token now).
- **Dates are off by one** — HealthKit returns samples in UTC but we
  bucket by local day. If you travel across time zones, sync after
  you've been in the new zone for a full night's sleep.
