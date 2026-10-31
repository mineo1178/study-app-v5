import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.CALCULATION_BROWSER_URL || "http://127.0.0.1:5174";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Local Vite server required");
const output = process.env.CALCULATION_TREND_OUTPUT || `.calc-trend-browser-${Date.now()}.local`;
await mkdir(output, { recursive: true });
const family = `trend-${Date.now()}`;
const root = `http://127.0.0.1:8086/v1/projects/demo-study-v182/databases/(default)/documents/families/${family}`;
const field = value => Array.isArray(value) ? { arrayValue: { values: value.map(field) } } :
  typeof value === "number" ? { integerValue: String(value) } : { stringValue: value };
const seed = async (path, data) => {
  const response = await fetch(root + path, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])) }) });
  assert.equal(response.status, 200);
};
await seed("", { memberUids: ["browser-a", "browser-b"] });
const saveDay = async (dateKey, scores = [2, 7, 4], taskId = "calc-③", taskLabel = "第8回 / 計算③（推移テスト）") => {
  const day = `/dailyCalculations/browser-a/days/${dateKey}`;
  await seed(day, { dateKey, attemptCount: scores.length, firstScore: scores[0], firstElapsedSeconds: 60,
    latestScore: scores.at(-1), latestElapsedSeconds: 60, bestScore: Math.max(...scores), latestAttemptId: `a-${scores.length}` });
  for (const [i, score] of scores.entries()) {
    const startedAt = Date.parse(dateKey + "T00:00:00+09:00");
    await seed(day + `/attempts/a-${i + 1}`, { id: `a-${i + 1}`, dateKey, attemptNo: i + 1, taskId, taskLabel,
      score, maxScore: 7, elapsedSeconds: 60, startedAt, finishedAt: startedAt + 60000, createdAt: startedAt + 60000, attemptType: i ? "redo" : "first" });
  }
};
await saveDay("2025-12-31", [7]);
await saveDay("2026-01-01");
await saveDay("2026-02-01", [0]);
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
const page = await context.newPage();
const errors = [], results = [];
page.on("pageerror", error => errors.push(error.message));
const graph = () => page.getByRole("heading", { name: /^日付ごとの(初回|最新|最高)得点推移/ }).locator("..");
try {
  await page.goto(base + "/tests/calculation-browser.html?family=" + family);
  await page.getByRole("button", { name: "実績", exact: true }).click();
  await page.getByText("この課題は3日分の記録があるよ。", { exact: true }).waitFor();
  await graph().locator(".recharts-line-dots circle").nth(2).waitFor();
  assert.equal(await graph().locator(".recharts-line-dots circle").count(), 3);
  await graph().locator(".recharts-xAxis-tick-labels").getByText("2026-02-01", { exact: true }).waitFor();
  const labels = await graph().locator(".recharts-xAxis-tick-labels").textContent();
  assert.ok(labels.includes("2025-12-31") && labels.includes("2026-02-01"));
  const y = () => graph().locator(".recharts-line-dots circle").evaluateAll(dots => dots.map(dot => Number(dot.getAttribute("cy"))));
  const first = await y();
  assert.ok(first[0] < first[1] && first[1] < first[2], "7/2/0 must plot high/middle/low");
  await page.getByLabel("日付ごとに表示する得点", { exact: true }).selectOption("latest");
  const latest = await y();
  assert.ok(latest[1] < first[1], "latest 4 must plot above first 2");
  await page.getByLabel("日付ごとに表示する得点", { exact: true }).selectOption("best");
  const best = await y();
  assert.equal(best[0], best[1], "best 7 must equal first day's 7");
  results.push("3 JST days, year/month boundaries, first/latest/best, saved zero and missing days");
  await saveDay("2026-02-02", [6], "calc-②", "別課題②");
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-②");
  await page.getByText(/この課題は読み込み済みの記録が1日分だけ/).waitFor();
  assert.equal(await graph().locator(".recharts-line-dots circle").count(), 1);
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-③");
  await page.getByText("この課題は3日分の記録があるよ。", { exact: true }).waitFor();
  results.push("single day guidance and task ID separation");
  for (let i = 0; i < 36; i++) await saveDay(new Date(Date.UTC(2026, 2, i + 1)).toISOString().slice(0, 10), [i % 8]);
  await page.getByRole("button", { name: "もっと前の日を見る", exact: true }).click();
  await page.getByText("この課題は39日分の記録があるよ。", { exact: true }).waitFor();
  assert.equal(await graph().locator(".recharts-line-dots circle").count(), 39);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await graph().screenshot({ path: output + `/trend-${width}.png` });
  }
  results.push("pagination beyond 30 points; full dates and no overflow at 320/390px");
  await page.getByLabel("UID", { exact: true }).selectOption("browser-b");
  await page.getByText("まだ記録がないよ。「学習 → 算数 → 計算」のカードから結果を保存してね。", { exact: true }).waitFor();
  assert.equal(await page.getByText("第8回 / 計算③（推移テスト）", { exact: true }).count(), 0);
  await page.getByLabel("UID", { exact: true }).selectOption("browser-a");
  await page.getByText("この課題は30日分の記録があるよ。", { exact: true }).waitFor();
  results.push("UID switch clears old records, selection and older-page state");
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  await writeFile(output + "/failure.html", await page.content());
  throw error;
} finally {
  await writeFile(output + "/results.json", JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ results, pageErrors: errors.length }));
