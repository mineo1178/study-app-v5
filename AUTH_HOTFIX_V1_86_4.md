# v1.86.4 authentication isolation hotfix

Branch: codex/v1.86.4-auth-isolation-hotfix
Base: 2d5545edbd4b08745e1295dfb06895819324607f

## Cause and change

The old Auth callback changed only user. Tasks, tests, game, history and open UI state survived the principal change. Family-wide localStorage keys restored old data before any membership check, including on permission-denied fallback. Pending study operations also had no UID ownership.

App now mounts the entire protected subtree only after a server family-membership check. A beforeAuthStateChanged barrier synchronously unmounts it before a different principal is published. Logout also closes the UI before awaiting signOut. Auth state notifications synchronously invalidate the subtree as well, covering cross-tab persistence changes. Cross-tab C/A switching passes. A session generation rejects stale membership results. Each subtree owns its state, calculations, diagnostics, listeners, caches and retry functions.

Each protected session uses a separate in-memory Firebase Auth principal copied with the public updateCurrentUser API, and its own Firestore client. The old client is terminated and its Firebase app deleted before a new principal is published. Thus an old queued write cannot acquire the next UID's credentials. This removes the previously reproduced live-listener/credential-change path associated with ca9/b815. The SDK's internal assertion implementation is not claimed to be a proven SDK defect; the tested triggering lifecycle is removed. No assertion or reload-only recovery occurred in either instrumented or uninstrumented tests.

Caches and retry queues are scoped by project, family and UID. Existing legacy family keys are retained. Since they contain no trustworthy UID provenance, their pending operations are never automatically adopted or replayed. A verified family member can explicitly confirm ownership and import them; operation IDs are merged without replacing current work. The raw legacy data remains intact. Firestore Rules, document schema and reward formulas are unchanged. No persistent cache is cleared.

## Verification on localhost Emulators only

- Unit: 237/237, 13 files. Includes Tokyo Dome/live rewards, duplicate prevention, session cache ownership and legacy queue preservation.
- Rules/transaction regression: 82/82, 3 files, unchanged Rules.
- Auth E2E: 14 instrumented groups and 11 uninstrumented control groups; continuous MutationObserver and animation-frame observation, including the pre-Auth publication barrier.
- Instrumented DOM observations: 957; protected display violations: 0. Both same-family directions and outside-family transitions pass, including real logout/login and return without reload.
- Membership response delay, stale authorization response after C login, delayed old read results, deliberately delivered old listener callbacks: PASS. Old App subscriptions are zero in C.
- Offline pending queue retained 3 operations across A to B; B's server history stays empty, B's queue stays empty; A recovery saves once. Legacy re-import remains idempotent. Reward ledger remains unchanged in this scenario.
- C allowed server reads/writes: 0, measured by Emulator Requests Monitor. Membership-denied reads are expected; the protected subtree is never mounted for C.
- SDK internal assertions: 0; unhandled page exceptions: 0. Reload, back/forward and offline/online recovery pass.
- Normal study E2E: 14 groups; START/STOP, acknowledgement delay, failure/retry, original STOP timestamp and time preservation across reload, 15-minute idle STOP, pending_review, 600s/0s confirmation, reward idempotency, calculations 1-7, redo, achievements, four charts and diagnostics.
- Calculation E2E: 8 groups; page exceptions 0.
- TypeScript and production build: PASS. Build emits the bundle-size advisory.
- Full lint: 36 existing errors, 2 existing warnings; new violations 0 (baseline App: 43 errors, 3 warnings). Full lint exits nonzero for existing issues; it is not reported as a clean lint pass.
- Calculation E2E warnings: 2 expected permission-denied fixture warnings and 36 hidden-chart dimension warnings. Neither is an SDK internal assertion.
- git diff --check: PASS.
- 320px/390px Edge screenshots and touch/overflow checks: PASS. Physical Safari: not tested.

## Files and scope

- src/App.tsx: v1.86.4, protected session boundary, cache/retry ownership and legacy confirmation UI.
- src/use-family-session.ts: server authorization, generation barrier and isolated Firebase lifecycle.
- src/session-cache.ts, src/session-cache.test.ts: UID cache and lossless legacy pending import.
- tests/timer-client.ts, tests/vite-timer.config.ts: localhost-only Auth fixture and fault injection.
- scripts/run-auth-browser.mjs, scripts/test-auth-browser.mjs: reproducible Emulator/browser security tests.
- scripts/test-timer-browser.mjs: scoped queue/version checks; restore membership before reload while SAVE alone remains unavailable.

Ignored local evidence: .auth-results.local, .timer-browser-results.local, .calculation-browser-results.local. No tokens, full UIDs or document bodies are included in this report.

## Preservation and release

The v1.87 worktree remains on codex/v1.87-encore-a. Its 16 implementation changes and 46 protected files, AGENTS.md and investigation evidence are covered by 115 before/after SHA-256 checks: all unchanged. Git status is unchanged; main and origin/main still point to the base. No Encore code, dependency changes, Rules changes, production access, merge, push or deployment.

Local commit is permitted only after these checks. The final chat reports its SHA and post-commit status. Publication requires separate review and approval. The original UI leak and reload-only recovery were not observed after the fix; Safari hardware and the SDK's internal assertion implementation remain outside the verified scope.

V1_86_4_SECURITY_READY_FOR_REVIEW
