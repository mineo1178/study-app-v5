# v1.83 Firestore access model

## Authentication and membership

The app uses Firebase email/password authentication (`getAuth`,
`signInWithEmailAndPassword`, `onAuthStateChanged`). It does not use anonymous,
Google, custom-token authentication or override persistence. The same existing
account retains its UID across normal sign-ins and devices. Deleting/recreating
an account requires registering its new UID.

Membership is the administrator-managed `memberUids: string[]` field on
`families/{familyId}`. The current app uses `oomine-study-2026`. UIDs are never
embedded in app code. Clients cannot create/delete family documents or change
membership. Missing, empty or malformed membership denies access.

The only permitted family update is `activeStudyTaskId` (string or null), using
field differences to preserve all other existing fields. The session transaction
continues to merge this field; the family must already exist before START.

## Observed access paths

`F = families/{familyId}`, `G = F/game/idol-produce`.
All access below requires family membership. R includes document/query reads;
C/U/D indicate create/update/delete. Transactions are existing app behavior.

| Path | Operations | Transaction | Written fields / data |
| --- | --- | --- | --- |
| F | R/U | Yes | activeStudyTaskId only |
| F/tasks/{id} | R/C/U/D | Session | id, unit, subject, category, title, materialName, status, currentDuration, sessionStartTime, sessionId, isRunning, lastActivityAt, lastUpdatedAt, currentMemo, history, sessionReviewFlags, createdAt |
| F/tests/{id} | R/C/U/D | No | id, date, name, type, subjects, total4, updatedAt |
| F/rewardLedger/{key} | R/C | Yes | Session credit/boost/point records or first-clear reward records |
| G | R/C/U | Mixed | activityPoints, fans, members, claimedSessionIds, lessonsCompleted, songsCompleted, rivalEventsCompleted, producerStars, boostRemainder, songs, milestones, claimedRivalBattleIds, wonRivalBattleIds, activeMemberIds, leaderMemberId, tourProgress, claimedTourRewardKeys |
| G/weeks/{id} | R/C | Yes | Week bounds, target/actual minutes, achievement, battle result, fan change, finalizedAt, version |
| G/performances/{id} | R/C | Yes | Performance, song/venue, audience/rating, fans, formation/leader bonus and tour result |
| G/rivalBattles/{id} | R/C | Yes | Battle/attempt, rival/stage, song, category scores/results, reward, formation, version |
| G/gacha/state | R/C/U | Yes | ticketBalances, starFragments, drawsSinceSrPlus, drawsSinceSsr, itemInventory, usedItemIds |
| G/gachaWeeks/{id} | R/C | Yes | weekId, targetMinutes, creditedMinutes, achievementRate, reward, grantedAt |
| G/gachaDraws/{id} | R/C | Yes | drawId, ticketType, rarity, resultType, memberId, itemId, itemQuantity, duplicate, starFragmentsGained, pityApplied, drawnAt |
| G/gachaExchanges/{id} | R/C | Yes | exchangeId, exchangeItemId, fragmentCost, reward, exchangedAt |

Study history is embedded in tasks; members, songs and progression are embedded
in G. They are not separate collections. No other paths are allowed. Record
updates and deletes are denied except mutable tasks/tests/game/gacha state.
Subcollection payloads do not yet have full field/type allowlists. These Rules
isolate families and protect membership; they do not prove client-computed game
rewards are legitimate.

## Verification and production prerequisites

`npm run test:emulator` loads the same `firestore.rules` referenced by
`firebase.json`. Both Rules tests and the 13 existing two-client session tests
run with member tokens. Only local demo-project fixture setup uses administrator
access; transactions under test never bypass Rules. No new dependencies or
production migration are required by the test harness.

Before any future production Rules deployment, an administrator must inspect the
existing family document and preserve its fields, verify all authorized Firebase
Auth account UIDs, and add the `memberUids` array through Firebase Console or
another trusted admin operation. Do not deploy first: unregistered users would
lose access. This task does not register production membership or deploy Rules.
