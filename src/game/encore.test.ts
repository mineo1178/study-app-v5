import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialGameState } from "./config";
import { GACHA_MEMBER_DEFINITIONS } from "./gacha/config";
import { deriveEncore, getEncoreStudyDays, type EncoreTask, type EncoreContext } from "./encore";
import { getWeekBoundsJst } from "./weekly";
import { EncorePanel } from "../components/game/EncorePanel";

const DAY = 86400000;
const now = Date.parse("2026-10-18T23:59:59.999+09:00");
function ready() {
  const game = createInitialGameState();
  game.claimedTourRewardKeys = ["tokyo-dome-first-clear"];
  game.members.forEach(m => { m.joined = true; });
  game.activeMemberIds = ["math", "japanese", "science", "yuna"];
  game.leaderMemberId = "math"; game.songs[4].status = "completed";
  const start = getWeekBoundsJst(new Date(now)).startAt;
  const tasks: EncoreTask[] = [0, 1, 2].map(day => ({ subject: "japanese", category: "読解", history: [{
    id: `session-${day}`, endAt: start + day * DAY + 600000, duration: 600, creditedDuration: 600, reviewStatus: "not_required", reviewFlags: [],
  }] }));
  return { game, tasks, start };
}
describe("read-only weekly encore", () => {
  it("accepts three distinct 600 second days, independent of recent performance/history display limits", () => {
    const { game, tasks } = ready();
    tasks[0].history = [...tasks[0].history, ...Array.from({ length: 12 }, (_, i) => ({ id: `recent-${i}`, duration: 0, creditedDuration: 0, endAt: now - i, reviewStatus: "not_required" as const }))];
    expect(deriveEncore(game, tasks, now)).toMatchObject({ eligible: true, weekId: "2026-W42" });
  });
  it.each(["two-days", "599", "duplicate-day", "pending", "zero", "flag", "missing-end", "missing-credit", "missing-status", "missing-id", "future", "long", "over-credit", "bad-confirmation", "pending-sync", "calculation", "missing-history"])("excludes %s", kind => {
    const { game, tasks } = ready(), h = tasks[0].history[0];
    if (kind === "two-days") tasks.pop();
    if (kind === "599") { h.duration = 599; h.creditedDuration = 599; }
    if (kind === "duplicate-day") tasks[1].history[0].endAt = h.endAt;
    if (kind === "pending") h.reviewStatus = "pending";
    if (kind === "zero") h.creditedDuration = 0;
    if (kind === "flag") h.reviewFlags = ["clock_changed"];
    if (kind === "missing-end") delete h.endAt;
    if (kind === "missing-credit") delete h.creditedDuration;
    if (kind === "missing-status") delete h.reviewStatus;
    if (kind === "missing-id") delete h.id;
    if (kind === "future") h.endAt = now + 1;
    if (kind === "long") { h.duration = 7200; h.creditedDuration = 3600; }
    if (kind === "over-credit") h.creditedDuration = 660;
    if (kind === "bad-confirmation") { h.reviewStatus = "confirmed"; h.confirmedDurationSeconds = 599; }
    if (kind === "pending-sync") tasks[0].pendingSync = true;
    if (kind === "calculation") { tasks[0].subject = "math"; tasks[0].category = "計算"; }
    if (kind === "missing-history") Object.assign(tasks[0], { history: undefined });
    expect(deriveEncore(game, tasks, now).eligible).toBe(false);
    expect(getEncoreStudyDays(tasks, now)).toHaveLength(2);
  });
  it("does not add short sessions or same-day records together", () => {
    const { tasks } = ready(); tasks[0].history[0].duration = 300; tasks[0].history[0].creditedDuration = 0;
    tasks[0].history = [...tasks[0].history, { ...tasks[0].history[0], id: "another-short" }];
    expect(getEncoreStudyDays(tasks, now)).toHaveLength(2);
  });
  it("counts duplicate valid sessions once and splits days at JST midnight", () => {
    const { tasks } = ready();
    const entry = tasks[0].history[0];
    tasks[0].history = [
      { ...entry, endAt: Date.parse("2026-10-13T14:59:59.999Z") },
      { ...entry, id: "midnight", endAt: Date.parse("2026-10-13T15:00:00Z") },
      { ...entry, id: "same-day", endAt: Date.parse("2026-10-14T14:59:59.999Z") },
    ];
    expect(getEncoreStudyDays([tasks[0]], now)).toEqual([
      Date.parse("2026-10-13T00:00:00+09:00"), Date.parse("2026-10-14T00:00:00+09:00"),
    ]);
  });
  it.each(["pending_review", "invalid", "unconfirmed"])("rejects unrecognized or unconfirmed stored status %s", reviewStatus => {
    const { tasks } = ready(); Object.assign(tasks[0].history[0], { reviewStatus });
    expect(getEncoreStudyDays(tasks, now)).toHaveLength(2);
  });
  it("accepts correctly confirmed time and re-evaluates source edits", () => {
    const { game, tasks } = ready(); Object.assign(tasks[0].history[0], { reviewStatus: "confirmed", confirmedDurationSeconds: 600 });
    expect(deriveEncore(game, tasks, now).eligible).toBe(true);
    tasks[0].history[0].creditedDuration = 0; expect(deriveEncore(game, tasks, now).eligible).toBe(false);
  });
  it.each(["clear", "song", "three", "duplicate", "unjoined", "leader", "study-running", "calculation-running"])("requires valid %s condition", kind => {
    const { game, tasks } = ready();
    if (kind === "clear") game.claimedTourRewardKeys = [];
    if (kind === "song") game.songs[4].status = "available";
    if (kind === "three") game.activeMemberIds!.pop();
    if (kind === "duplicate") game.activeMemberIds![1] = "math";
    if (kind === "unjoined") game.members[0].joined = false;
    if (kind === "leader") game.leaderMemberId = "outsider";
    if (kind === "study-running") tasks[0].isRunning = true;
    expect(deriveEncore(game, tasks, now, kind === "calculation-running").eligible).toBe(false);
  });
  it("uses actual gacha formation members", () => {
    const { game, tasks } = ready(), definition = GACHA_MEMBER_DEFINITIONS[0];
    game.members.push({ id: definition.id, name: definition.name, specialty: "ガチャ", joined: true, abilities: definition.baseStats });
    game.activeMemberIds![3] = definition.id; game.leaderMemberId = definition.id;
    const state = deriveEncore(game, tasks, now);
    expect(state.eligible).toBe(true); expect(state.members[3].id).toBe(definition.id);
  });
  it("resets at the exact Monday boundary and uses JST endAt", () => {
    const { game, tasks, start } = ready();
    tasks[0].history[0].endAt = start;
    expect(deriveEncore(game, tasks, now).eligible).toBe(true);
    tasks[0].history[0].endAt = start - 1; expect(deriveEncore(game, tasks, now).eligible).toBe(false);
    expect(deriveEncore(game, tasks, now + 1)).toMatchObject({ days: [], weekId: "2026-W43" });
  });
  it.each([
    ["2020-12-31T12:00:00+09:00", "2020-W53"], ["2021-01-01T12:00:00+09:00", "2020-W53"], ["2021-01-04T12:00:00+09:00", "2021-W01"],
    ["2026-12-31T12:00:00+09:00", "2026-W53"], ["2027-01-01T12:00:00+09:00", "2026-W53"], ["2027-01-04T12:00:00+09:00", "2027-W01"],
  ])("handles ISO week year %s", (at, id) => expect(deriveEncore(ready().game, [], Date.parse(at)).weekId).toBe(id));
  it("reproduces shared state after reload without mutating game or history", () => {
    const x = ready(), before = structuredClone(x), first = deriveEncore(x.game, x.tasks, now);
    const clone = structuredClone(x);
    expect(deriveEncore(clone.game, clone.tasks, now)).toEqual(first);
    expect(x).toEqual(before); expect(first).not.toHaveProperty("completedAt");
  });
  it.each(["loading", "error"] as const)("does not expose a start action when reads are %s", status => {
    const x = ready(); const context: EncoreContext = { scope: "family:uid", status, game: x.game, tasks: x.tasks, timerRunning: false };
    const html = renderToStaticMarkup(createElement(EncorePanel, context));
    expect(html).not.toContain("アンコールに応える");
    expect(html).toContain(status === "error" ? "達成判定ができません" : "確認中");
  });
});
