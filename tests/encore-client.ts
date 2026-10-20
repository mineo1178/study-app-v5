import "./timer-client";
import { getApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { createInitialGameState } from "../src/game/config";
import { normalizeGachaState } from "../src/game/gacha/logic";
import { GACHA_MEMBER_DEFINITIONS } from "../src/game/gacha/config";
import { getWeekBoundsJst, getWeekIdJst } from "../src/game/weekly";

if (location.hostname !== "127.0.0.1" || getApp().options.projectId !== "demo-study-hotfix") throw new Error("Dedicated localhost fixture only");
export const login = async (email: string, password: string) => (await signInWithEmailAndPassword(getAuth(), email, password)).user.uid;
export const uid = () => getAuth().currentUser?.uid;
export function fixture(now: number) {
  const start = getWeekBoundsJst(new Date(now)).startAt;
  const game = createInitialGameState();
  game.activityPoints = 100; game.fans = 100000;
  game.claimedTourRewardKeys = ["major-debut-live-first-clear", "arena-prelude-first-clear", "arena-first-first-clear", "tokyo-dome-first-clear"];
  game.members = game.members.map(m => ({ ...m, joined: true, abilities: Object.fromEntries(Object.keys(m.abilities).map(k => [k, 80])) as typeof m.abilities }));
  game.activeMemberIds = ["math", "japanese", "science", "yuna"]; game.leaderMemberId = "math";
  game.songs = game.songs.map(s => ({ ...s, status: "completed", songStats: { ...game.members[0].abilities } }));
  const member = GACHA_MEMBER_DEFINITIONS[0];
  const gachaMember = { id: member.id, name: member.name + "・きらめきのアンコールステージ", joined: true, specialty: "ガチャ", abilities: member.baseStats };
  const task = { id: "normal", unit: "第1回", subject: "math", category: "予習シリーズ", title: "基本問題", status: "not_started",
    materialName: "予習シリーズ - 基本問題", currentDuration: 0, sessionStartTime: null, isRunning: false, lastUpdatedAt: now, currentMemo: "", createdAt: new Date(now).toISOString(),
    history: [0, 1, 2].map(day => ({ id: `encore-${day}`, date: "10/12", startAt: start + day * 86400000, endAt: start + day * 86400000 + 600000,
      duration: 600, creditedDuration: 600, reviewStatus: "not_required", reviewFlags: [], memo: "" })) };
  const zero = Array.from({ length: 12 }, (_, i) => ({ id: `display-only-${i}`, date: "10/18", endAt: now - 1000 - i, duration: 0, creditedDuration: 0, reviewStatus: "not_required", reviewFlags: [], memo: "" }));
  const weeks = Array.from({ length: 9 }, (_, i) => {
    const date = new Date(start - i * 604800000), bounds = getWeekBoundsJst(date);
    return { weekId: getWeekIdJst(date), ...bounds, actualMinutes: 0, targetMinutes: 600, achievementRate: 0, battleResult: "LOSE", rivalId: "sparkle", fanBefore: game.fans, fanAfter: game.fans, fanDelta: 0, finalizedAt: now, version: "v1.86.3" };
  });
  return { game, task: { ...task, history: [...task.history, ...zero] }, weeks, gacha: normalizeGachaState(), gachaMember };
}
