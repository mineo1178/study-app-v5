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
await saveDay("2026-10-19", [7], "calc-①", "2日分の課題①");
await saveDay("2026-10-31", [0], "calc-①", "2日分の課題①");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
const page = await context.newPage();
const errors = [], results = [];
page.on("pageerror", error => errors.push(error.message));
const graph = () => page.locator(".design20-calculation-charts > .design20-series").first();
const rows = () => graph().getByRole("listitem");
const scores = async () => (await rows().locator(".design20-series-value").allTextContents()).map(s => s.replace(" 点", ""));
const dates = () => rows().locator(".design20-series-label").evaluateAll(nodes => nodes.map(node => node.title));
try {
  await page.goto(base + "/tests/calculation-browser.html?family=" + family);
  await page.getByRole("button", { name: "実績", exact: true }).click();
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-①");
  await page.getByText(/比較できる記録：2日分/).waitFor();
  assert.deepEqual(await dates(), ["2026-10-19", "2026-10-31"]);
  assert.deepEqual(await rows().locator(".design20-series-label").allTextContents(), ["10/19", "10/31"]);
  assert.deepEqual(await scores(), ["7/7", "0/7"]);
  assert.equal(await graph().locator(".recharts-line").count(), 0);
  const widths = await rows().locator(".design20-series-fill").evaluateAll(bars => bars.map(bar => bar.getBoundingClientRect().width));
  assert.ok(widths[0] > 0 && widths[1] === 0, "a saved zero must show an empty bar, not a positive score");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await scores(), ["7/7", "0/7"]);
    await graph().screenshot({ path: output + `/two-days-${width}.png` });
  }
  await page.reload();
  await page.getByRole("button", { name: "実績", exact: true }).click();
  await page.getByText(/比較できる記録：2日分/).waitFor();
  assert.deepEqual(await scores(), ["7/7", "0/7"]);
  results.push("two sparse dates 10/19=7 and 10/31=0; no connecting line or filled missing days; reload; 320/390px");
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-③");
  await page.getByText(/比較できる記録：3日分/).waitFor();
  assert.deepEqual(await dates(), ["2025-12-31", "2026-01-01", "2026-02-01"]);
  assert.deepEqual(await scores(), ["7/7", "2/7", "0/7"]);
  assert.equal(await page.getByLabel("日付ごとに表示する得点", { exact: true }).inputValue(), "first");
  await page.getByLabel("日付ごとに表示する得点", { exact: true }).selectOption("latest");
  assert.deepEqual(await scores(), ["7/7", "4/7", "0/7"]);
  assert.equal(await page.getByLabel("日付ごとに表示する得点", { exact: true }).inputValue(), "latest");
  await page.getByLabel("日付ごとに表示する得点", { exact: true }).selectOption("best");
  assert.deepEqual(await scores(), ["7/7", "7/7", "0/7"]);
  assert.equal(await page.getByLabel("日付ごとに表示する得点", { exact: true }).inputValue(), "best");
  assert.equal(await rows().count(), 3);
  results.push("3 JST days, year/month boundaries, first/latest/best, saved zero and missing days");
  await saveDay("2026-02-02", [6], "calc-②", "別課題②");
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-②");
  await page.getByText(/1日分の記録です。推移を判断するには/).waitFor();
  assert.equal(await rows().count(), 0);
  assert.match(await graph().locator(".design20-series-single strong").innerText(), /6\/7/);
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-③");
  await page.getByText(/比較できる記録：3日分/).waitFor();
  await saveDay("2026-02-03", [0], "calc-④", "1日0点④");
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-④");
  await page.getByText(/1日分の記録です。推移を判断するには/).waitFor();
  assert.match(await graph().locator(".design20-series-single strong").innerText(), /0\/7/);
  assert.equal(await rows().count(), 0);
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-③");
  results.push("single day 6/7 and 0/7 cards, guidance and task ID separation");
  for (let i = 0; i < 36; i++) await saveDay(new Date(Date.UTC(2026, 2, i + 1)).toISOString().slice(0, 10), [i % 8]);
  await page.getByRole("button", { name: /^2026-04-05 \/ / }).waitFor();
  await page.getByText("日付別の記録を読み込み中…", { exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "もっと前の日を見る", exact: true }).click();
  await page.getByText(/比較できる記録：39日分/).waitFor();
  await graph().getByRole("button", { name: /全39件を見る/ }).click();
  assert.equal(await rows().count(), 39);
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
  await page.getByText(/比較できる記録：2日分/).waitFor();
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
