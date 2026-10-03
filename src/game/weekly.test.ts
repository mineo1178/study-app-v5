import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./config";
import { createWeeklyResult, mergeWeeklyResults } from "./weekly";

describe("weekly result identity", () => {
  it("keeps one result per week when sample finalization runs twice", () => {
    const game = createInitialGameState();
    const older = createWeeklyResult(game, [], new Date("2026-09-23T12:00:00+09:00"));
    const newer = createWeeklyResult(game, [], new Date("2026-09-30T12:00:00+09:00"));
    expect([older.weekId, newer.weekId]).toEqual(["2026-W39", "2026-W40"]);
    const first = mergeWeeklyResults([], [older, newer]);
    const replay = mergeWeeklyResults(first, [older, newer]);
    expect(replay).toEqual(first);
    expect(replay).toEqual([newer, older]);
    expect(new Set(replay.map((result) => result.weekId)).size).toBe(replay.length);
  });
});
