import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const output = process.env.REVIEW_SPACING_OUTPUT || ".review-spacing-results.local";
await mkdir(output, { recursive: true });
// Optional private files stay outside the repository and are never printed or copied to artifacts.
const questions = process.env.REVIEW_PRIVATE_QUESTIONS ? JSON.parse(await readFile(process.env.REVIEW_PRIVATE_QUESTIONS, "utf8")) : Array.from({ length: 5 }, (_, i) => ({ id: "spacing-" + i, version: "v1", published: true, subject: "math", unit: "架空単元" + i, prompt: "架空問題" + i, choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "架空の解説", testKind: "未指定", source: "Emulator専用" }));
const plan = process.env.REVIEW_PRIVATE_PLAN ? JSON.parse(await readFile(process.env.REVIEW_PRIVATE_PLAN, "utf8")) : { schemaVersion: 1, label: "架空の対策計画", testDay: "2027-12-31", items: questions.slice(0, 4).map((q, i) => ({ questionId: q.id, questionVersion: q.version, priority: i < 2 ? 1 : 2, reason: "前に間違えたところを確かめよう。", evidence: "架空答案", scopeBasis: "架空範囲" })), gaps: ["記述は未確認"], notes: ["架空資料"] };
const encode = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
const seed = async (path, value) => assert.equal((await fetch(endpoint + path, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: encode(value).mapValue.fields }) })).status, 200);
assert.equal((await fetch(`http://127.0.0.1:8086/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" })).status, 200);
const accounts = [], password = "local-spacing-only-123";
for (const role of ["a", "b"]) {
  const email = `spacing-${role}-${Date.now()}@example.invalid`;
  const response = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200); accounts.push({ email, uid: (await response.json()).localId });
}
await seed(`/families/${family}`, { memberUids: accounts.map(a => a.uid) });
for (const q of questions) await seed(`/families/${family}/reviewUsers/${accounts[0].uid}/questions/${q.id}`, q);
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [], external = [], results = [];
await context.route("**/*", route => {
  const u = new URL(route.request().url()); if (u.hostname === "127.0.0.1") return route.continue();
  if (!(u.hostname === "www.google.com" && u.pathname === "/images/cleardot.gif")) external.push(u.hostname);
  return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(20000); page.on("pageerror", e => errors.push(e.message));
const call = (file, method, ...args) => page.evaluate(async ({ file, method, args }) => (await import(`/tests/${file}.ts`))[method](...args), { file, method, args });
const invoke = (method, ...args) => call("timer-client", method, ...args);
const inspect = () => call("review-client", "inspect");
const panel = () => page.getByRole("region", { name: "テスト対策・復習", exact: true });
const loaded = async () => { await panel().waitFor(); await panel().getByText("復習データを読み込み中…", { exact: true }).waitFor({ state: "hidden" }); };
const tab = async () => { await page.getByRole("button", { name: "対策・復習", exact: true }).click(); await loaded(); };
const home = () => panel().getByRole("button", { name: "復習ホームへ", exact: true }).click();
const noOverflow = async width => { await page.setViewportSize({ width, height: 844 }); await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth); };
async function solve(correct, offline = false) {
  for (let i = 0; i < 4; i++) {
    const prompt = await panel().locator("h3").innerText(), q = questions.find(q => q.prompt === prompt); assert.ok(q);
    await panel().getByRole("group", { name: "解答候補" }).getByRole("button").nth(correct ? q.correctIndex : (q.correctIndex + 1) % 4).click();
    await panel().getByRole("button", { name: /^(回答を決めて次へ|最後の回答を決めて採点)$/ }).click();
    if (i === 0) { await page.reload(); await tab(); }
  }
  if (offline) {
    await context.setOffline(true);
    await panel().getByRole("button", { name: "結果を保存する（失敗時は再試行）", exact: true }).click();
    await panel().getByRole("alert").filter({ hasText: "保存できませんでした" }).waitFor();
    await context.setOffline(false);
  }
  await panel().getByRole("button", { name: "結果を保存する（失敗時は再試行）", exact: true }).click();
  await panel().getByText("保存しました", { exact: true }).waitFor();
}
async function advance(days) { await page.clock.fastForward(days * 86400000); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); }
try {
  await page.goto(base + "/tests/timer-setup.html"); await invoke("login", accounts[0].email, password); await invoke("seed");
  await page.clock.install({ time: new Date(Date.now() - 90 * 86400000) });
  await page.goto(base); await tab(); await page.waitForTimeout(1500);
  const before = await invoke("read");
  await panel().getByText("この端末のテスト対策計画", { exact: true }).click();
  await panel().getByLabel("根拠付き対策計画", { exact: true }).setInputFiles({ name: "plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(plan)) });
  await panel().getByRole("button", { name: "今日の4問を始める", exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: "今日の4問を始める", exact: true }).isEnabled(), true);
  for (const width of [320, 390]) { await noOverflow(width); if (!process.env.REVIEW_PRIVATE_PLAN) await page.screenshot({ path: `${output}/plan-${width}.png`, fullPage: true }); }
  await page.reload(); await tab(); await panel().getByRole("button", { name: "今日の4問を始める", exact: true }).waitFor();
  results.push("evidence plan import; version-matched four of five; missing skills; 320/390; reload");
  await panel().getByRole("button", { name: "今日の4問を始める", exact: true }).click(); await solve(false, true);
  const raw = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith(":draft"))?.[1]); assert.ok(raw);
  await Promise.all([call("review-client", "replay", JSON.parse(raw)), call("review-client", "replay", JSON.parse(raw))]);
  assert.equal((await inspect()).history.length, 4);
  assert.deepEqual((await inspect()).history.map(a => a.questionId).sort(), plan.items.map(i => i.questionId).sort());
  await panel().getByRole("button", { name: "間違えた問題をもう一度", exact: true }).click(); await solve(true); await home();
  assert.ok((await inspect()).progress.every(p => p.reviewStage === 0));
  assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  results.push("wrong -> tomorrow; same-day retry correct does not advance; draft reload; offline save retry; concurrent replay idempotent");
  for (const [days, stage] of [[1, 1], [3, 2], [7, 3]]) {
    await advance(days); await panel().getByRole("button", { name: "今日の4問を始める", exact: true }).click(); await solve(true); await home();
    assert.ok((await inspect()).progress.every(p => p.reviewStage === stage));
    assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  }
  results.push("due-day correct advances 3/7/14; no padding with not-due or excluded questions");
  assert.deepEqual(await invoke("read"), before);
  await invoke("login", accounts[1].email, password); await tab();
  assert.equal(await panel().getByText(plan.label, { exact: false }).count(), 0);
  assert.equal(await call("review-client", "crossUidDenied", accounts[0].uid), true);
  await invoke("login", accounts[0].email, password); await tab();
  await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).waitFor();
  assert.equal((await inspect()).history.length, 20);
  results.push("family UID separation; return without reload; unchanged study/game snapshots");
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors: errors.length, externalRequests: external.length, privatePlanUsed: !!process.env.REVIEW_PRIVATE_PLAN }, null, 2));
  console.log(JSON.stringify({ passed: results.length, pageErrors: errors.length, externalRequests: external.length }));
} catch (error) { if (!process.env.REVIEW_PRIVATE_PLAN) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); }
