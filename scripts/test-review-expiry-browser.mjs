import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", output = ".review-expiry-results.local";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
const errors = [], blocked = [], results = [];
await context.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.hostname === "127.0.0.1") return route.continue();
  blocked.push(url.hostname); return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on("pageerror", e => errors.push(e.message));
const panel = () => page.getByRole("region", { name: "テスト対策・復習", exact: true });
const tab = async () => { await page.getByRole("navigation", { name: "メインナビゲーション", exact: true }).getByRole("button", { name: "対策・復習", exact: true }).click(); await panel().getByText("復習データを読み込み中…", { exact: true }).waitFor({ state: "hidden" }); };
const enterSample = async () => {
  const button = page.getByRole("button", { name: "サンプルデータで試す", exact: true });
  const nav = page.getByRole("navigation", { name: "メインナビゲーション", exact: true });
  await button.or(nav).first().waitFor();
  if (await button.isVisible()) await button.click();
};
const reloadSample = async () => { await page.reload(); await enterSample(); };
const details = async () => { if (!await panel().getByLabel("根拠付き対策計画", { exact: true }).isVisible()) await panel().getByText("この端末のテスト対策計画", { exact: true }).click(); };
const upload = async (value, label = "根拠付き対策計画") => {
  await details();
  const completed = Number(await panel().locator("[data-review-import-completed]").getAttribute("data-review-import-completed"));
  await panel().getByLabel(label, { exact: true }).setInputFiles({ name: "fictional.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await page.waitForFunction(n => Number(document.querySelector("[data-review-import-completed]")?.getAttribute("data-review-import-completed")) > n, completed);
};
const saved = () => page.evaluate(() => { const key = Object.keys(localStorage).find(k => k.endsWith(":target-plan")); return { key, plan: JSON.parse(localStorage.getItem(key)), data: JSON.parse(localStorage.getItem(key.replace(":target-plan", ":sample-data"))) }; });
try {
  await page.clock.install({ time: new Date("2026-11-08T23:59:00+09:00") });
  await page.goto(base); await enterSample(); await tab();
  const fixture = await page.evaluate(async () => {
    const { sampleQuestions, nextProgress } = await import("/src/review/model.ts");
    const { fictionalPlan } = await import("/tests/review-plan-fixture.ts");
    const { questionHash, topicSkill } = await import("/src/review/exchange-plan.ts");
    const questions = sampleQuestions.slice(0, 2);
    const history = questions.map((q, i) => ({ id: "fictional-" + i, uid: "sample", sessionId: "fictional", questionId: q.id, questionVersion: q.version, selectedIndex: 0, correct: i === 1, answeredAt: Date.parse("2026-11-07T12:00:00+09:00"), elapsedMs: 1, mode: "daily", prompt: q.prompt, selected: q.choices[0], expected: q.choices[q.correctIndex], explanation: q.explanation }));
    const data = { questions, history, weaknesses: [], progress: history.map(a => nextProgress(undefined, a)) };
    const plan = fictionalPlan(); plan.revision = 2; plan.targetExam.date = "2026-11-08"; plan.topics[0].subject = questions[1].subject;
    const bindings = { schemaVersion: "review-question-bindings/1", planId: plan.planId, bindings: [{ topicId: plan.topics[0].topicId, topicTitle: plan.topics[0].title, topicSkill: topicSkill(plan.topics[0]), subject: questions[1].subject, questionId: questions[1].id, questionVersion: questions[1].version, questionSha256: await questionHash(questions[1]), coverage: "partial", reason: "架空の期限切替検証" }] };
    return { data, plan, bindings };
  });
  await upload(fixture.plan);
  await page.evaluate(data => { const key = Object.keys(localStorage).find(k => k.endsWith(":target-plan")); localStorage.setItem(key.replace(":target-plan", ":sample-data"), JSON.stringify(data)); }, fixture.data);
  await reloadSample(); await tab(); await upload(fixture.bindings, "内容照合済み問題対応表");
  await panel().getByText(/現在の対策：.*開催日：2026-11-08/).waitFor();
  await panel().getByText(/対策計画：設定済み ／ 今日の候補：0問/).waitFor();
  await panel().getByText(/対象問題の不足：対応済みは1問/).waitFor();
  assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  const before = await saved();
  await page.clock.fastForward(60000); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await panel().getByText("一般復習", { exact: true }).waitFor();
  await panel().getByText(/対策計画：期限切れ ／ 今日の候補：1問/).waitFor();
  assert.equal(await panel().getByText(/現在の対策：.*開催日：2026-11-08/).count(), 0);
  await panel().getByText(/期限切れ・保存済み計画/).waitFor();
  await panel().getByRole("button", { name: "今日の1問を始める", exact: true }).waitFor();
  assert.deepEqual(await saved(), before);
  results.push("JST 11/8 23:59 → 11/9 00:00: expired targeting removed, due out-of-plan review returns, future review excluded; saved plan/history/progress unchanged");
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: `${output}/expired-${width}.png`, fullPage: true }); }
  await reloadSample(); await tab(); await panel().getByRole("button", { name: "今日の1問を始める", exact: true }).waitFor();
  await panel().getByRole("button", { name: "今日の1問を始める", exact: true }).click();
  await panel().getByText(fixture.data.questions[0].prompt, { exact: true }).waitFor();
  await reloadSample(); await tab(); await panel().getByRole("button", { name: "今回はここで終わる", exact: true }).click();
  await panel().getByRole("button", { name: "未保存の回答を破棄してホームへ", exact: true }).click();
  results.push("reload and actual daily start use general candidates; 320/390px no overflow");
  const newer = structuredClone(fixture.plan); newer.revision = 3; newer.targetExam.date = "2026-11-15";
  await upload(newer); await panel().getByText(/現在の対策：.*開催日：2026-11-15/).waitFor();
  assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  assert.deepEqual((await saved()).data, before.data);
  await upload(fixture.plan); await panel().getByRole("alert").filter({ hasText: "旧revision" }).waitFor();
  assert.equal((await saved()).plan.activePlan.integration.source.revision, 3);
  results.push("new revision restores targeting and zero eligible state; old revision rejected; all history/progress retained");
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors: errors.length, blockedExternalHosts: [...new Set(blocked)], sampleOnly: true }, null, 2));
  console.log(JSON.stringify({ passed: results.length, pageErrors: errors.length, sampleOnly: true }));
} catch (error) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); throw error; }
finally { await browser.close(); }
