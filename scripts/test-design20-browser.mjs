import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const out = process.env.DESIGN20_OUTPUT || ".design20-browser.local";
await mkdir(out, { recursive: true });
const encode = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
async function seed(path, data) {
  assert.equal((await fetch(endpoint + path, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: encode(data).mapValue.fields }) })).status, 200);
}
assert.equal((await fetch(`http://127.0.0.1:8086/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" })).status, 200);
const email = `design20-${Date.now()}@example.invalid`, password = "local-design20-only-123";
const response = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
assert.equal(response.status, 200); const uid = (await response.json()).localId;
await seed(`/families/${family}`, { memberUids: [uid], activeStudyTaskId: null });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [], external = [], results = [], screenshots = [];
await context.route("**/*", route => {
  const u = new URL(route.request().url()); if (u.hostname === "127.0.0.1") return route.continue();
  if (!(u.hostname === "www.google.com" && u.pathname === "/images/cleardot.gif")) external.push(u.hostname);
  return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on("pageerror", e => errors.push(e.message));
const call = (file, method, ...args) => page.evaluate(async ({ file, method, args }) => (await import(`/tests/${file}.ts`))[method](...args), { file, method, args });
const nav = () => page.getByRole("navigation", { name: "メインナビゲーション", exact: true });
async function tab(name) { await nav().getByRole("button", { name, exact: true }).click(); await page.waitForFunction(() => document.querySelector("nav [aria-current=page]") !== null); }
async function geometry() {
  await page.waitForFunction(() => { const m = document.querySelector(".design20-main"); return document.documentElement.scrollWidth <= innerWidth && m && m.scrollWidth <= m.clientWidth + 1; });
  const geometry = await nav().evaluate(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
  const width = await page.evaluate(() => innerWidth);
  if (width >= 1024) { assert.equal(geometry.width, 228); assert.ok(geometry.x < 2); }
  else { assert.ok(geometry.y >= (await page.evaluate(() => innerHeight)) - 160); assert.ok(geometry.width <= width); }
  const labels = await nav().locator("button span").evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(), b = e.closest("button").getBoundingClientRect(); return r.x >= b.x - 1 && r.right <= b.right + 1; }));
  assert.ok(labels.every(Boolean));
}
async function shot(name) { const file = `${out}/${name}.png`; await page.screenshot({ path: file }); screenshots.push(file); }
try {
  await page.goto(base + "/tests/timer-setup.html"); await call("timer-client", "login", email, password); await call("timer-client", "seed");
  const now = Date.parse("2026-10-28T12:00:00+09:00");
  const fixture = await call("encore-client", "fixture", now);
  await seed(`/families/${family}/tasks/normal`, fixture.task);
  await seed(`/families/${family}/game/idol-produce`, fixture.game);
  await seed(`/families/${family}/game/idol-produce/gacha/state`, fixture.gacha);
  for (const week of fixture.weeks) await seed(`/families/${family}/game/idol-produce/weeks/${week.weekId}`, week);
  const questions = await page.evaluate(async () => (await import("/src/review/model.ts")).sampleQuestions);
  for (const q of questions) await seed(`/families/${family}/reviewUsers/${uid}/questions/${q.id}`, q);
  for (const [dateKey, score] of [["2026-10-26", 7], ["2026-10-28", 0]]) {
    const at = Date.parse(dateKey + "T09:00:00+09:00"), id = "first";
    await seed(`/families/${family}/dailyCalculations/${uid}/days/${dateKey}`, { dateKey, attemptCount: 1, firstScore: score, firstElapsedSeconds: 60, latestScore: score, latestElapsedSeconds: 60, bestScore: score, latestAttemptId: id });
    await seed(`/families/${family}/dailyCalculations/${uid}/days/${dateKey}/attempts/${id}`, { id, dateKey, attemptNo: 1, taskId: "calc-①", taskLabel: "第1回 / 計算①", score, maxScore: 7, elapsedSeconds: 60, startedAt: at, finishedAt: at + 60000, createdAt: at + 60000, attemptType: "first" });
  }
  await page.clock.install({ time: new Date(now) }); await page.goto(base);
  await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByRole("region", { name: "学習を始める", exact: true }).waitFor();
  const beforeHero = await call("timer-client", "read");
  await page.getByRole("button", { name: "このタスクを開く", exact: true }).click();
  await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).waitFor();
  await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).click();
  assert.deepEqual(await call("timer-client", "read"), beforeHero);
  results.push("next-task CTA opens real task without starting timer or modifying shared records");
  await tab("成績"); await page.getByRole("button", { name: "テスト記録を追加", exact: true }).click();
  await page.getByPlaceholder("例: 第14回 カリテ", { exact: true }).fill("表示確認用の架空カリテ");
  await page.locator('input[type="date"]').fill("2026-10-17");
  for (let i = 0; i < 5; i++) await page.locator('input[type="number"]').nth(i).fill(String(50 + i));
  await page.getByRole("button", { name: "追加する", exact: true }).click();
  await page.getByText("表示確認用の架空カリテ", { exact: true }).waitFor();
  await tab("対策・復習"); const panel = page.getByRole("region", { name: "テスト対策・復習", exact: true });
  await panel.getByText("復習データを読み込み中…", { exact: true }).waitFor({ state: "hidden" });
  const { plan, bindings } = await page.evaluate(async questions => {
    const { fictionalPlan } = await import("/tests/review-plan-fixture.ts"); const { topicSkill, questionHash } = await import("/src/review/exchange-plan.ts");
    const plan = fictionalPlan(); plan.revision = 2; plan.topics = plan.topics.map((t, i) => i < questions.length ? { ...t, subject: questions[i].subject } : t);
    return { plan, bindings: { schemaVersion: "review-question-bindings/1", planId: plan.planId, bindings: await Promise.all(questions.map(async (q, i) => ({ topicId: plan.topics[i].topicId, topicTitle: plan.topics[i].title, topicSkill: topicSkill(plan.topics[i]), subject: q.subject, questionId: q.id, questionVersion: q.version, questionSha256: await questionHash(q), coverage: "partial", reason: "架空の表示確認。技能全体の確認ではありません。" }))) } };
  }, questions);
  await panel.getByText("この端末のテスト対策計画", { exact: true }).click();
  await panel.getByLabel("根拠付き対策計画", { exact: true }).setInputFiles({ name: "fictional-plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(plan)) });
  await panel.getByLabel("内容照合済み問題対応表", { exact: true }).setInputFiles({ name: "fictional-bindings.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bindings)) });
  await panel.getByRole("button", { name: "今日の5問を始める", exact: true }).waitFor();
  const baseline = await call("timer-client", "read"), grades = await call("review-client", "inspectTests");
  for (const [label, width, height] of [["320", 320, 844], ["390", 390, 844], ["ipad", 834, 1112], ["pc", 1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const [name, slug, heading] of [["学習", "learning", "次の学習を始めよう"], ["成績", "results", "テストの記録"], ["実績", "history", "学習の実績"], ["対策・復習", "review", "対策・復習"], ["プロデュース", "game", null]]) {
      await tab(name); if (heading) await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      if (slug === "game") await page.getByRole("region", { name: "東京ドームのアンコール", exact: true }).waitFor();
      await page.locator(".design20-main").evaluate(e => { e.scrollTop = 0; }); await geometry(); await shot(`${label}-${slug}`);
    }
    await tab("学習"); await page.locator("#design20-task-list").getByText("基本問題", { exact: true }).click();
    await page.getByRole("button", { name: "学習タイマーを開始", exact: true }).waitFor(); await shot(`${label}-timer`);
    await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).click();
    await page.locator("#design20-task-list").getByText("①", { exact: true }).click();
    await page.getByText(/今日の最新 0\/7/).waitFor(); await shot(`${label}-calculation`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).click();
    results.push(`${label}: learning/results/history/review/game + study/calculation dialogs; layout and navigation`);
  }
  assert.deepEqual(await call("timer-client", "read"), baseline); assert.deepEqual(await call("review-client", "inspectTests"), grades);
  await page.reload(); await tab("対策・復習"); await panel.getByRole("button", { name: "今日の5問を始める", exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(`${out}/results.json`, JSON.stringify({ results, screenshots, pageErrors: errors.length, externalDataRequests: external.length, sharedDataUnchanged: true }, null, 2));
  console.log(JSON.stringify({ sections: results.length, screenshots: screenshots.length, pageErrors: errors.length, sharedDataUnchanged: true }));
} catch (error) { await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error; }
finally { await browser.close(); }
