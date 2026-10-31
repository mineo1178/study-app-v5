# Calculation browser regression

This fixture exercises the real calculation components with Firestore Emulator
and the real App in sample mode. No production writes are performed. Browser
requests to hosts other than `127.0.0.1` are blocked. Rules and schema are unchanged.

Start these services in separate terminals from the repository root:

```powershell
java '-Duser.language=en' '-Duser.country=US' -jar "$env:USERPROFILE\.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar" --host 127.0.0.1 --port 8086 --project_id demo-study-v182 --single_project_mode true --rules firestore.rules
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Run with an existing Playwright installation (no dependency changes are needed):

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:/Users/mineo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/test-calculation-browser.mjs
```

Alternatively omit `PLAYWRIGHT_MODULE_PATH` when `playwright` is already resolvable.
`CALCULATION_BROWSER_URL` may specify another local Vite port.
`PLAYWRIGHT_CHANNEL` defaults to `msedge`.

The suite seeds a fresh family and seven calculation tasks in the demo emulator.
It covers pending history reads, real elapsed time, reload/pause/resume, frozen
STOP times, saved seconds, 3→5→6→7→2 retries, Rules rejection and retry, double
save, task/tab switching, UID separation, normal-timer exclusion, complete history,
four charts, and 320/390px layouts. The App integration uses sample mode.
Results and screenshots are written to the ignored `.calculation-browser-results.local/`.

Before the v1.86.1 fix, the pending-history assertion fails because the start
button is disabled. This confirms the local reproduction; it does not establish
the exact connection failure on production. Actual iPhone/iPad Safari and device
sleep are outside this desktop browser test. Visibility recovery is simulated.

## Date trend regression

With the same local services and Playwright configuration, run:

```powershell
node scripts/test-calculation-trend-browser.mjs
```

This uses synthetic records only. It checks saved JST dates across year/month
boundaries, first/latest/best scores, missing days, a real saved zero, one-day and
empty states, task/UID switches, older-page loading beyond 30 points, and
320/390px charts. Results use a fresh `.calc-trend-browser-<timestamp>.local/`
directory; `CALCULATION_TREND_OUTPUT` can select an explicit output directory.

The date chart includes every loaded day for the selected task ID, in ascending
order with the full year. Older records are loaded in pages of 30 days with
「もっと前の日を見る」. The separate lower charts show retries within one
selected day. Legacy attempts without task IDs remain under 「課題未指定」;
similar labels are never used to merge different task IDs. These are display
changes only; saved attempts, timers, rewards and Firestore Rules are unchanged.
