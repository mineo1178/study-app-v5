import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.CALCULATION_BROWSER_URL || "http://127.0.0.1:5174";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Local Vite server required");
const familyId = `browser-calculation-${Date.now()}`;
const endpoint = "http://127.0.0.1:8086/v1/projects/demo-study-v182/databases/(default)/documents";
const seed = async (path, fields) => {
  const response = await fetch(`${endpoint}/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  assert.equal(response.status, 200, await response.text());
};
await seed(`families/${familyId}`, { memberUids: { arrayValue: { values: ["browser-a", "browser-b"].map(uid => ({ stringValue: uid })) } } });
for (const id of ["①", "②", "③", "④", "⑤", "⑥", "⑦"]) await seed(`families/${familyId}/tasks/calc-${id}`, { subject: { stringValue: "math" }, category: { stringValue: "計算" } });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const results = [];
const errors = [];
const warnings = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mkdir(".calculation-browser-results.local", { recursive: true });
await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
const url = `${base}/tests/calculation-browser.html?family=${familyId}`;
const start = () => page.getByRole("button", { name: /^(計算をはじめる|解き直しをする|もう一度挑戦する|計測を再開)$/ });
const timer = () => page.locator("p[aria-live=off]");
const seconds = async () => { const [minutes, seconds] = (await timer().innerText()).split(":").map(Number); return minutes * 60 + seconds; };
const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await predicate()) return; await page.waitForTimeout(100); }
  assert.fail(message);
};
const readSaved = async () => {
  await page.getByRole("button", { name: "保存値を確認" }).click();
  await waitFor(async () => !!await page.getByLabel("保存値").textContent(), "saved records not available");
  return JSON.parse(await page.getByLabel("保存値").textContent());
};
try {
  // Keep Listen requests pending: START must not depend on history loading.
  await page.route("http://127.0.0.1:8086/**", () => {});
  await page.goto(url);
  await page.getByText("記録を読み込み中…", { exact: true }).waitFor();
  assert.equal(await start().isDisabled(), false, "history loading must not disable START");
  await start().evaluate(button => { button.click(); button.click(); });
  const measuredAt = Date.now();
  assert.equal(await seconds(), 0);
  await waitFor(async () => await seconds() >= 1, "timer did not advance to 1 second");
  assert.equal(await seconds(), 1);
  await waitFor(async () => await seconds() >= 2, "timer did not advance to 2 seconds");
  assert.equal(await seconds(), 2);
  await waitFor(async () => await seconds() >= 3, "timer did not advance to 3 seconds");
  assert.ok(Date.now() - measuredAt < 4200, "display lag exceeded the timer update cycle");
  results.push(`history pending: 0:00 → 0:01 → 0:02 → 0:03 in ${Date.now() - measuredAt}ms`);
  await page.unroute("http://127.0.0.1:8086/**");
  await page.reload();
  await start().waitFor();
  assert.equal(await start().innerText(), "計測を再開");
  const restored = await seconds();
  await page.waitForTimeout(1100);
  assert.equal(await seconds(), restored);
  await start().click();
  await page.waitForTimeout(2100);
  await waitFor(async () => await seconds() >= restored + 2, "resumed timer did not advance");
  assert.equal(await seconds(), restored + 2);
  await page.getByRole("button", { name: "計算を終了して結果を記録" }).click();
  const stopped = await seconds();
  await page.waitForTimeout(1100);
  assert.equal(await seconds(), stopped);
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: "この結果を保存", exact: true }).click();
  await start().waitFor();
  const first = (await readSaved())[0];
  assert.equal(first.elapsedSeconds, stopped);
  assert.equal(first.score, 3);
  results.push(`reload pause/resume, STOP and Firestore: ${stopped}s`);

  const expected = [first];
  for (const score of [5, 6, 7, 2]) {
    await start().click();
    assert.equal(await seconds(), 0, "new trial inherited previous seconds");
    assert.equal(await page.getByRole("button", { name: "通常学習START" }).isDisabled(), true);
    await page.waitForTimeout(2200);
    await waitFor(async () => await seconds() >= 2, "redo timer stopped");
    await page.getByRole("button", { name: "計算を終了して結果を記録" }).click();
    const frozen = await seconds();
    await page.getByRole("button", { name: String(score), exact: true }).click();
    if (score === 5) {
      await seed(`families/${familyId}`, { memberUids: { arrayValue: { values: [{ stringValue: "browser-b" }] } } });
      await page.getByRole("button", { name: "この結果を保存", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "保存できなかったよ" }).waitFor();
      assert.equal(await seconds(), frozen);
      assert.equal(await page.getByRole("button", { name: "5", exact: true }).getAttribute("aria-pressed"), "true");
      await page.reload();
      assert.equal(await seconds(), frozen);
      assert.equal(await page.getByRole("button", { name: "5", exact: true }).getAttribute("aria-pressed"), "true");
      await seed(`families/${familyId}`, { memberUids: { arrayValue: { values: ["browser-a", "browser-b"].map(uid => ({ stringValue: uid })) } } });
      await page.reload();
      results.push("Rules rejection keeps score/time/draft across reload for retry");
    }
    // Two synchronous clicks exercise the busy ref before React disables the UI.
    await page.getByRole("button", { name: "この結果を保存", exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByText("結果を保存したよ！", { exact: true }).waitFor();
    await start().waitFor();
    const saved = await readSaved();
    assert.equal(saved.length, expected.length + 1, "duplicate or missing attempt");
    assert.deepEqual(saved.slice(0, -1), expected, "past attempts changed");
    assert.equal(saved.at(-1).elapsedSeconds, frozen);
    assert.equal(saved.at(-1).score, score);
    expected.push(saved.at(-1));
  }
  assert.equal(await start().innerText(), "もう一度挑戦する");
  results.push(`redo 3→5→6→7→2, unique attempts/times: ${expected.map(a => a.elapsedSeconds).join(",")}s`);

  await page.getByRole("button", { name: "通常学習START" }).click();
  assert.equal(await start().isDisabled(), true);
  await page.getByText("先に学習タイマーを終了して、途中の学習記録を保存してね。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "通常学習STOP" }).click();
  await start().click();
  await page.waitForTimeout(1200);
  await page.getByLabel("計算課題", { exact: true }).selectOption("②");
  assert.equal(await seconds(), 0);
  await page.getByLabel("計算課題", { exact: true }).selectOption("①");
  assert.equal(await start().innerText(), "計測を再開");
  const paused = await seconds();
  await page.getByLabel("UID", { exact: true }).selectOption("browser-b");
  assert.equal(await seconds(), 0);
  assert.equal(await start().innerText(), "計算をはじめる");
  assert.deepEqual(await readSaved(), []);
  await page.getByLabel("UID", { exact: true }).selectOption("browser-a");
  assert.equal(await seconds(), paused);
  await start().click();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(1200);
  await waitFor(async () => await seconds() >= paused + 1, "visibility recovery timer did not advance");
  await page.getByRole("button", { name: "実績", exact: true }).click();
  await page.getByRole("button", { name: "学習", exact: true }).click();
  assert.equal(await start().innerText(), "計測を再開");
  results.push("task/tab switches pause, visibility refresh, UID isolation, mutual exclusion");

  for (const id of ["②", "③", "④", "⑤", "⑥", "⑦"]) {
    await page.getByLabel("計算課題", { exact: true }).selectOption(id);
    await start().click();
    assert.equal(await seconds(), 0);
    await page.getByRole("button", { name: "計算を終了して結果を記録" }).click();
    await page.getByRole("button", { name: "0", exact: true }).click();
    await page.getByRole("button", { name: "この結果を保存", exact: true }).click();
    await page.getByText("結果を保存したよ！", { exact: true }).waitFor();
  }
  const all = await readSaved();
  assert.deepEqual(all.slice(5).map(a => [a.taskId, a.taskLabel, a.score, a.elapsedSeconds]), ["②", "③", "④", "⑤", "⑥", "⑦"].map(id => [`calc-${id}`, `第1回 / 計算${id}`, 0, 0]));
  results.push("calculation ①–⑦ task IDs, score 0/7, zero seconds");

  await page.getByRole("button", { name: "実績", exact: true }).click();
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-①");
  await page.getByText(`初回 3/7 ・ ${Math.floor(first.elapsedSeconds / 60)}:${String(first.elapsedSeconds % 60).padStart(2, "0")}`, { exact: true }).waitFor();
  await page.getByText("最高 7/7 / 解き直し4回 / 7/7達成", { exact: true }).waitFor();
  await waitFor(async () => await page.locator(".recharts-line-dots circle").count() >= 12, "four charts not rendered");
  assert.deepEqual(await page.locator(".recharts-line-dots").evaluateAll(groups => groups.map(group => group.querySelectorAll("circle").length)), [1, 1, 5, 5]);
  const history = page.getByRole("heading", { name: "第1回 / 計算①", exact: true }).locator("..").locator("ol li");
  assert.deepEqual(await history.allTextContents(), expected.map((a, index) => `${index === 0 ? "初回" : `解き直し${index}回目`}${a.score}/7 ・ ${Math.floor(a.elapsedSeconds / 60)}:${String(a.elapsedSeconds % 60).padStart(2, "0")}`));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await waitFor(async () => await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px after chart resize`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    await page.screenshot({ path: `.calculation-browser-results.local/records-${width}.png`, fullPage: true });
  }
  await page.reload();
  await page.getByRole("button", { name: "実績", exact: true }).click();
  await page.getByText("最高 7/7 / 解き直し4回 / 7/7達成", { exact: true }).waitFor();
  results.push("first/latest/best, complete history, 4 charts, reload, 320px/390px");

  // Exercise the real App/modal integration, using sample mode without writes.
  await page.goto(base);
  await page.getByRole("button", { name: "サンプルデータで試す" }).click();
  await page.locator("select").first().selectOption({ label: "第14回" });
  for (const id of ["①", "②", "③", "④", "⑤", "⑥", "⑦"]) {
    await page.getByText(id, { exact: true }).click();
    await page.getByRole("button", { name: "計算をはじめる", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "学習タイマーを開始", exact: true }).isDisabled(), true);
    await page.waitForTimeout(2200);
    await waitFor(async () => await seconds() >= 2, "App timer did not advance");
    if (id === "①") {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `App overflow at ${width}px`);
        await page.screenshot({ path: `.calculation-browser-results.local/app-timer-${width}.png` });
      }
    }
    await page.getByRole("button", { name: "計算を終了して結果を記録" }).click();
    await page.getByRole("button", { name: "7", exact: true }).click();
    await page.getByRole("button", { name: "この結果を保存", exact: true }).click();
    await page.getByText("結果を保存したよ！", { exact: true }).waitFor();
    if (id === "①") {
      await page.getByRole("button", { name: "学習タイマーを開始", exact: true }).click();
      await waitFor(async () => await page.getByRole("button", { name: "もう一度挑戦する", exact: true }).isDisabled(), "App allowed parallel start");
      await page.getByRole("button", { name: "学習タイマーを一時停止", exact: true }).click();
    }
    await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).click();
  }
  results.push("real App: calculation ①–⑦ starts/counts/stops/saves; normal START blocked");
} finally {
  await mkdir(".calculation-browser-results.local", { recursive: true });
  await writeFile(".calculation-browser-results.local/results.json", JSON.stringify({ results, errors, warnings }, null, 2));
  await browser.close();
}
assert.deepEqual(errors, []);
console.log(JSON.stringify({ results, pageErrors: errors.length, warnings: warnings.length }, null, 2));
