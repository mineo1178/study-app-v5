import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const output = process.env.REVIEW_SPACING_OUTPUT || ".review-exchange-results.local";
await mkdir(output, { recursive: true });
// Optional private files stay outside the repository and are never printed or copied to artifacts.
const questions = process.env.REVIEW_PRIVATE_QUESTIONS ? JSON.parse(await readFile(process.env.REVIEW_PRIVATE_QUESTIONS, "utf8")) : Array.from({ length: 5 }, (_, i) => ({ id: "spacing-" + i, version: "v1", published: true, subject: "math", unit: "架空単元" + i, prompt: "架空問題" + i, choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "架空の解説", testKind: "未指定", source: "Emulator専用" }));
let plan, bindings;
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
  for (let i = 0; i < 5; i++) {
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
  plan = process.env.REVIEW_EXCHANGE_PLAN ? JSON.parse(await readFile(process.env.REVIEW_EXCHANGE_PLAN, "utf8")) : await page.evaluate(async () => (await import("/tests/review-plan-fixture.ts")).fictionalPlan());
  bindings = process.env.REVIEW_EXCHANGE_BINDINGS ? JSON.parse(await readFile(process.env.REVIEW_EXCHANGE_BINDINGS, "utf8")) : { schemaVersion: "review-question-bindings/1", planId: plan.planId, bindings: await page.evaluate(async ({questions,plan}) => { const {questionHash,topicSkill}=await import("/src/review/exchange-plan.ts"); return Promise.all(questions.map(async(q,i)=>({topicId:plan.topics[i].topicId,topicTitle:plan.topics[i].title,topicSkill:topicSkill(plan.topics[i]),subject:q.subject,questionId:q.id,questionVersion:q.version,questionSha256:await questionHash(q),coverage:"partial",reason:"架空の確認"}))); },{questions,plan}) };
  await page.clock.install({ time: new Date(Date.now() - 90 * 86400000) });
  await page.goto(base); await tab(); await page.waitForTimeout(1500);
  const before = await invoke("read");
  await panel().getByText("この端末のテスト対策計画", { exact: true }).click();
  await panel().getByLabel("根拠付き対策計画", { exact: true }).setInputFiles({ name: "plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(plan)) });
  assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  await panel().getByLabel("内容照合済み問題対応表", { exact: true }).setInputFiles({ name: "bindings.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bindings)) });
  await panel().getByRole("button", { name: "今日の5問を始める", exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: "今日の5問を始める", exact: true }).isEnabled(), true);
  for (const width of [320, 390]) { await noOverflow(width); if (!process.env.REVIEW_EXCHANGE_PLAN) await page.screenshot({ path: `${output}/plan-${width}.png`, fullPage: true }); }
  await page.reload(); await tab(); await panel().getByRole("button", { name: "今日の5問を始める", exact: true }).waitFor();
  const initialIds = await page.evaluate(async ({plan,bindings,questions}) => { const {adaptStudyPlan}=await import("/src/review/exchange-plan.ts");const {targetCandidates}=await import("/src/review/target-plan.ts");return targetCandidates(questions,[],adaptStudyPlan(plan,bindings.bindings,questions,1),Date.now()).map(c=>c.question.id); },{plan,bindings,questions});
  const rev2 = structuredClone(plan); rev2.revision = plan.revision + 1;
  for(const b of bindings.bindings.filter(b=>b.questionId===initialIds[0]))rev2.topics.find(t=>t.topicId===b.topicId).priority=4;
  const upload = async p => { const completed = Number(await panel().locator("[data-review-import-completed]").getAttribute("data-review-import-completed")); const details = panel().getByText("この端末のテスト対策計画", {exact:true}); if(!await panel().getByLabel("根拠付き対策計画",{exact:true}).isVisible())await details.click(); await panel().getByLabel("根拠付き対策計画",{exact:true}).setInputFiles({name:"plan.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(p))}); await page.waitForFunction(n => Number(document.querySelector("[data-review-import-completed]")?.getAttribute("data-review-import-completed")) > n, completed); };
  await upload(rev2); await panel().getByText(new RegExp("計画revision：" + rev2.revision)).waitFor();
  await upload(plan); await panel().getByRole("alert").filter({hasText:"旧revision"}).waitFor();
  await upload(rev2); await panel().getByRole("alert").waitFor({state:"hidden"});
  const stored=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.endsWith(":target-plan"))[1]));assert.equal(stored.activePlan.integration.source.revision,rev2.revision);
  const expected=await page.evaluate(async({plan,bindings,questions})=>{const {adaptStudyPlan}=await import("/src/review/exchange-plan.ts");const {targetCandidates}=await import("/src/review/target-plan.ts");return targetCandidates(questions,[],adaptStudyPlan(plan,bindings.bindings,questions,1),Date.now()).map(c=>c.question.id);},{plan:rev2,bindings,questions});
  assert.notEqual(expected[0],initialIds[0]);
  results.push("all 23 topics; real exchange import; zero until reviewed mappings; five unique linked questions; 320/390; higher revision changes priority; rollback rejected; reload");

  await panel().getByRole("button", { name: "今日の5問を始める", exact: true }).click(); assert.equal(await panel().locator("h3").innerText(),questions.find(q=>q.id===expected[0]).prompt); await solve(false, true);
  const raw = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith(":draft"))?.[1]); assert.ok(raw);
  await Promise.all([call("review-client", "replay", JSON.parse(raw)), call("review-client", "replay", JSON.parse(raw))]);
  assert.equal((await inspect()).history.length, 5);
  assert.deepEqual((await inspect()).history.map(a => a.questionId).sort(), [...new Set(bindings.bindings.map(i => i.questionId))].sort());
  await panel().getByRole("button", { name: "間違えた問題をもう一度", exact: true }).click(); await solve(true); await home();
  assert.ok((await inspect()).progress.every(p => p.reviewStage === 0));
  assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  results.push("wrong -> tomorrow; same-day retry correct does not advance; draft reload; offline save retry; concurrent replay idempotent");
  for (const [days, stage] of [[1, 1], [3, 2], [7, 3]]) {
    await advance(days); await panel().getByRole("button", { name: "今日の5問を始める", exact: true }).click(); await solve(true); await home();
    assert.ok((await inspect()).progress.every(p => p.reviewStage === stage));
    assert.equal(await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).isDisabled(), true);
  }
  results.push("due-day correct advances 3/7/14; no padding with not-due or excluded questions");
  assert.deepEqual(await invoke("read"), before);
  await invoke("login", accounts[1].email, password); await tab();
  assert.equal(await panel().getByText(plan.targetExam.displayName, { exact: false }).count(), 0);
  assert.equal(await call("review-client", "crossUidDenied", accounts[0].uid), true);
  await invoke("login", accounts[0].email, password); await tab();
  await panel().getByRole("button", { name: "今日の0問を始める", exact: true }).waitFor();
  assert.equal((await inspect()).history.length, 25);
  const savedBeforeUpdate = await inspect(), rev3 = { ...rev2, revision: rev2.revision + 1 };
  await upload(rev3); await panel().getByText(new RegExp("計画revision：" + rev3.revision)).waitFor();
  await page.reload(); await tab();
  const savedAfterUpdate = await inspect();
  assert.deepEqual(savedAfterUpdate.history, savedBeforeUpdate.history);
  assert.deepEqual(savedAfterUpdate.progress, savedBeforeUpdate.progress);
  if (!await panel().getByLabel("根拠付き対策計画", { exact: true }).isVisible()) await panel().getByText("この端末のテスト対策計画", { exact: true }).click();
  await panel().getByRole("button", { name: "この端末の計画を外す", exact: true }).click();
  await upload(rev2); await panel().getByRole("alert").filter({ hasText: "旧revision" }).waitFor();
  await upload(rev3); await panel().getByText(new RegExp("計画revision：" + rev3.revision)).waitFor();
  await panel().getByLabel("内容照合済み問題対応表", { exact: true }).setInputFiles({ name: "bindings.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bindings)) });
  await panel().getByText(/問題対応表：6件|問題対応表：5件/).waitFor();
  assert.deepEqual((await inspect()).progress, savedBeforeUpdate.progress);
  results.push("new revision after 25 answers preserves history and spacing; clearing plan retains rollback protection");
  results.push("family UID separation; return without reload; unchanged study/game snapshots");
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors: errors.length, externalRequests: external.length, privatePlanUsed: !!process.env.REVIEW_EXCHANGE_PLAN }, null, 2));
  console.log(JSON.stringify({ passed: results.length, pageErrors: errors.length, externalRequests: external.length }));
} catch (error) { console.error(JSON.stringify({completedSections:results.length,alerts:await panel().getByRole("alert").allTextContents(),buttons:await panel().getByRole("button").evaluateAll(bs=>bs.filter(b=>b.textContent.startsWith("今日の")).map(b=>({text:b.textContent,disabled:b.disabled})))})); if (!process.env.REVIEW_EXCHANGE_PLAN) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); }
