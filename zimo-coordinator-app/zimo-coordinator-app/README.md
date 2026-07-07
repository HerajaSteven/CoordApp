# Zimo Field Coordinator App

React Native (Expo) application for field coordinators to conduct physical farm verification.

## What's Built

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/(auth)/login` | JWT auth, secure token storage |
| Dashboard | `/(tabs)` | Assigned farms, stats, sync status |
| Farm List | `/(tabs)/farms` | Search by name, farmer, App ID |
| Monitor | `/(tabs)/monitor` | Flagged farms, alert overview |
| Sync Center | `/(tabs)/tasks` | Offline queue, manual sync trigger |
| Profile | `/(tabs)/profile` | Coordinator details, logout |
| Farm Detail | `/farm/[appId]` | Merged profile: registration + verification + timeline |
| Verification Wizard | `/verification/[appId]` | All 8 steps (identity → review/submit) |
| Incident Report | `/incident/[appId]` | Report incidents, auto-escalate critical |
| Sites List | `/sites/[appId]` | Top-level: geographic sites for a farm |
| Units List | `/units/[appId]?siteId=` | Units (ponds/plots) within one site |
| Verification Wizard | `/verification/[appId]?unitId=` | Per-unit 8-step wizard |

## Stack

React Native · Expo Router · TypeScript (strict) · NativeWind · Zustand · TanStack Query · React Hook Form + Zod · Axios · MMKV · Expo Secure Store · Expo Location · Expo Camera

## Setup

```bash
npm install

cp .env.example .env
# Edit .env: set EXPO_PUBLIC_API_URL to your backend URL
# e.g. EXPO_PUBLIC_API_URL=https://your-server.com
# or for local dev: EXPO_PUBLIC_API_URL=http://192.168.1.x:4000
# Use your machine's LAN IP (not localhost) when testing on a real device
# Android emulator localhost mapping: EXPO_PUBLIC_API_URL=http://10.0.2.2:4000

npx expo start
# Then scan QR code with Expo Go on Android/iOS

# Verify backend is reachable and /health responds quickly
npm run health:check
```

## Build APK

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
# Download and install the .apk on any Android device
```

## Crash Reporting

Set `EXPO_PUBLIC_SENTRY_DSN` in `.env` (free tier at sentry.io → React Native project) to
get crash reports with stack traces from real coordinator devices in the field. A global
`ErrorBoundary` also wraps the whole app — if a screen crashes, the coordinator sees a
"Try Again" screen instead of the app going to a blank white screen with no recovery path.
Leave the DSN blank and both still work, just without remote reporting.

## Over-the-Air (OTA) Updates

This app is configured for `expo-updates`, which lets you push JS-only bug fixes to
every installed app instantly — **no app-store review, no APK rebuild, no reinstall**.
Critical for a field exercise where coordinators already have the app installed.

**One-time setup (before this works):**
1. Run `eas init` — this populates the placeholder `REPLACE_WITH_EAS_PROJECT_ID`
   values in `app.json` (`extra.eas.projectId` and `updates.url`) with your real project ID.
2. Generate an Expo access token (expo.dev → Account Settings → Access Tokens) and add
   it as a GitHub Actions secret named `EXPO_TOKEN` in this repo's Settings → Secrets.
3. In `.github/workflows/ci.yml`, change `if: false && github.ref == 'refs/heads/main'`
   to just `if: github.ref == 'refs/heads/main'` — this turns on the auto-publish job.

Once configured, every push to `main` automatically publishes a JS update. To publish
manually instead: `eas update --branch production --channel production`.

**Note:** OTA only covers JS/logic changes. Any change to native modules, permissions,
or `app.json`'s native config still requires a full rebuild + reinstall.

## Workflow for Multi-Site, Multi-Unit Farms (e.g. 100+ fish ponds across several locations)

1. Open Farmer Profile → tap **Manage Sites**
2. Travel to each geographic location → tap **＋ Add New Site** (e.g. "Orolu Pond Cluster")
3. Optionally capture GPS immediately when adding the site
4. Tap into the site → tap **＋ Add New Unit** for each pond/plot discovered
5. Each unit gets a specific **Primary Focus** (e.g. "Table-size Catfish" vs "Fingerling
   Catfish") — quick-tap suggestions per unit type, or type a custom one
6. IDs are fully traceable: `ZM-ADEY-0187-SITE-01-POND-03`
7. Tap a unit → opens the full 8-step Verification Wizard scoped to that unit
8. Site screen shows **X of N units verified**; Sites screen shows **X of N sites verified**
9. Registration is marked fully verified only when **all sites** (and their units) are verified

## Verification Wizard Steps

1. **Identity** — Capture selfie + ID doc, display AI confidence, coordinator confirms
2. **Farm Type** — Crop / Livestock / Mixed (drives downstream form shapes)
3. **GPS** — Locate centre point + optional boundary walk
4. **Land Ownership** — Type, doc ref, dispute/encumbrance flags
5. **Infrastructure** — Water, irrigation, road condition, storage
6. **Capacity** — Dynamic crop/livestock categories from API (extensible without redeploy)
7. **Evidence** — Required photo slots by farm type (4–8 photos)
8. **Review & Submit** — Coordinator certification text + submit for approval

## Offline

All verification data is queued in MMKV when offline. The network sync hook polls every 10 seconds and auto-flushes the queue when connectivity returns. Manual sync available from the Tasks tab.

## Backend

This app talks to the existing Fastify + MongoDB backend (see `zimo-verification-service`). Set `EXPO_PUBLIC_API_URL` to your deployed backend URL.

## File Structure

```
src/
  app/                    # Expo Router screens
    (auth)/login.tsx
    (tabs)/               # Bottom tab screens
    farm/[appId].tsx      # Farm detail
    verification/[appId]  # 8-step wizard
    incident/[appId]      # Incident report
  components/ui/          # Shared design system components
  features/
    gps/useGPS.ts         # Location + boundary walk hook
    camera/useCamera.ts   # Camera + S3 upload hook
  services/api/           # Axios client + all API functions
  store/
    auth.store.ts         # Zustand auth (coordinator + tokens)
    offline.store.ts      # MMKV-backed offline queue
  hooks/
    useNetworkSync.ts     # Auto-sync on reconnect
    useVerification.ts    # Shared query hooks
  types/index.ts          # All TypeScript interfaces (mirrors backend DTOs)
  utils/
    errors.ts             # API error extraction
    dates.ts              # Date formatting helpers
```
