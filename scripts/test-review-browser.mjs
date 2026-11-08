import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
await mkdir(".review-results.local", { recursive: true });
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
assert.equal((await fetch(`http://127.0.0.1:8086/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" })).status, 200);
const accounts = [], password = "review-local-only-123";
for (const role of ["a", "b", "outsider"]) {
  const email = `review-${role}-${Date.now()}@example.invalid`;
  const r = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(r.status, 200); accounts.push({ email, uid: (await r.json()).localId });
}
assert.equal((await fetch(`${endpoint}/families/${family}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { memberUids: { arrayValue: { values: accounts.slice(0, 2).map(a => ({ stringValue: a.uid })) } } } }) })).status, 200);
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const external = [], blockedConnectivityProbes = [], errors = [], results = [];
await context.route("**/*", route => {
  const url = new URL(route.request().url()); if (url.hostname === "127.0.0.1") return route.continue();
  // The SDK's offline diagnostic image is blocked too; it is not a data endpoint.
  if (url.hostname === "www.google.com" && url.pathname === "/images/cleardot.gif") blockedConnectivityProbes.push(url.hostname + url.pathname);
  else external.push(url.hostname + url.pathname);
  return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on("pageerror", e => errors.push(e.message));
const call = (file, method, ...args) => page.evaluate(async ({ file, method, args }) => (await import(`/tests/${file}.ts`))[method](...args), { file, method, args });
const invoke = (method, ...args) => call("timer-client", method, ...args);
const reviewCall = (method, ...args) => call("review-client", method, ...args);

const login = i => invoke("login", accounts[i].email, password);
const panel = () => page.getByRole("region", { name: "テスト対策・復習", exact: true });
const tab = () => page.getByRole("button", { name: "対策・復習", exact: true });
const waitLoaded = async () => { await panel().waitFor(); await panel().getByText("復習データを読み込み中…", { exact: true }).waitFor({ state: "hidden" }); };
const save = async () => { await panel().getByRole("button", { name: "結果を保存する（失敗時は再試行）", exact: true }).click(); await panel().getByText("保存しました", { exact: true }).waitFor(); };
const home = async () => { await panel().getByRole("button", { name: "復習ホームへ", exact: true }).click(); };
async function answer(correct, remaining) {
  for (let i = 0; i < remaining; i++) {
    await panel().getByRole("group", { name: "解答候補" }).getByRole("button").nth(correct ? 0 : 1).click();
    await panel().getByRole("button", { name: /^(回答を決めて次へ|最後の回答を決めて採点)$/ }).click();
  }
}
const rows = Array.from({ length: 5 }, (_, i) => ({ subject: ["math", "japanese", "science", "social", "math"][i], unit: "テスト専用の架空単元", prompt: `架空の確認問題 ${i + 1}`, choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: `確認用の短い解説 ${i + 1}`, testKind: "未指定", source: "Emulator E2E専用・実問題ではない" }));
async function noOverflow(width) {
  await page.setViewportSize({ width, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const nav = await page.locator("nav button").evaluateAll(buttons => buttons.map(b => { const r = b.getBoundingClientRect(), s = b.querySelector("span").getBoundingClientRect(); return { x: r.x, right: r.right, sx: s.x, sr: s.right }; }));
  assert.equal(nav.length, 5);
  nav.forEach((b, i) => { assert.ok(b.sx >= b.x && b.sr <= b.right); if (i) assert.ok(nav[i - 1].right <= b.x + 1); });
}
try {
  await page.goto(base + "/tests/timer-setup.html"); await login(0); await invoke("seed");
  await page.goto(base); await tab().waitFor();
  await page.getByRole("button", { name: "成績", exact: true }).click();
  await page.getByRole("button", { name: "テスト記録を追加", exact: true }).click();
  await page.getByPlaceholder("例: 第14回 カリテ", { exact: true }).fill("Emulator専用の架空成績");
  await page.locator('input[type="date"]').fill("2026-10-20");
  for (let i = 0; i < 5; i++) await page.locator('input[type="number"]').nth(i).fill(String(50 + i));
  await page.getByRole("button", { name: "追加する", exact: true }).click();
  await page.getByRole("button", { name: "「Emulator専用の架空成績」を編集", exact: true }).click();
  await page.getByPlaceholder("例: 第14回 カリテ", { exact: true }).fill("Emulator専用の架空成績（編集済み）");
  await page.getByRole("button", { name: "更新する", exact: true }).click();
  await page.getByText("Emulator専用の架空成績（編集済み）", { exact: true }).waitFor();
  // The grade UI updates optimistically; wait for the actual server write before measuring isolation.
  const gradeDeadline=Date.now()+15000;
  while(Date.now()<gradeDeadline){const savedGrades=await reviewCall('inspectTests');if(savedGrades.length===1&&JSON.stringify(savedGrades).includes('Emulator専用の架空成績（編集済み）'))break;await page.waitForTimeout(100);}
  const testsBefore = await reviewCall("inspectTests"); assert.equal(testsBefore.length, 1);
  await tab().click(); await waitLoaded();
  // Let existing weekly initialization settle before measuring review-only changes.
  await page.waitForTimeout(2000);
  const before = await invoke("read");
  assert.equal(await panel().getByRole("button", { name: "今日の0問を始める" }).isDisabled(), true);
  assert.equal(await page.getByRole('button',{name:'保護者の管理',exact:true}).count(),0);
  const encode = v => v === null ? {nullValue:null} : Array.isArray(v) ? {arrayValue:{values:v.map(encode)}} : typeof v==='string' ? {stringValue:v} : typeof v==='boolean' ? {booleanValue:v} : typeof v==='number' ? {integerValue:String(v)} : {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
  const seedQuestion = async i => { const q={...rows[i],id:'single-q'+i,version:'v1',published:true};assert.equal((await fetch(endpoint+'/families/'+family+'/reviewUsers/'+accounts[1].uid+'/questions/'+q.id,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:encode(q).mapValue.fields})})).status,200); };
  await page.clock.install({ time: new Date(Date.now() - 400000) });
  await seedQuestion(0);await login(1);await tab().click();await waitLoaded();
  await panel().getByRole('button',{name:'今日の1問を始める',exact:true}).click();await answer(false,1);await save();await home();
  for(let i=1;i<5;i++)await seedQuestion(i);
  await panel().getByRole('button',{name:'復習データを再読込',exact:true}).click();await waitLoaded();
  for(const width of [320,390])await noOverflow(width);
  results.push('single UID; trusted fixture registration; no live management UI; 320/390 navigation');
  // Start in the past so >3min elapsed can be verified without forging future answer timestamps.
  await page.clock.fastForward(200000);
  // One question was answered earlier on this same JST day: 4 of the 5 daily slots remain.
  await panel().getByText("利用できる問題：5問 ／ 今日の候補：4問", { exact: true }).waitFor();
  await panel().getByRole("button", { name: "今日の4問を始める", exact: true }).click();
  assert.equal(await panel().getByRole("button", { name: "回答を決めて次へ", exact: true }).isDisabled(), true);
  await answer(false, 1);
  await page.getByRole("button", { name: "成績", exact: true }).click(); await tab().click(); await waitLoaded();
  await page.clock.fastForward(190000);
  await panel().getByText(/2 \/ 4 問 · 3分/).waitFor();
  await page.reload(); await tab().click(); await waitLoaded();
  await panel().getByText(/2 \/ 4 問/).waitFor(); await answer(false, 3); await panel().getByText("0 / 4 問 正解", { exact: true }).waitFor();
  await noOverflow(320); await page.screenshot({ path: ".review-results.local/320-result.png", fullPage: true });
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("study-review-v1:") && k.endsWith(":draft")))));
  await context.setOffline(true); await panel().getByRole("button", { name: "結果を保存する（失敗時は再試行）", exact: true }).click();
  await panel().getByRole("alert").filter({ hasText: "保存できませんでした" }).waitFor(); await context.setOffline(false);
  await save(); await reviewCall("replay", draft); const saved = await reviewCall("inspect"); assert.equal(saved.history.length, 5);
  assert.equal(saved.progress.length, 5); assert.ok(saved.progress.every(p => !p.latestCorrect));
  results.push("one already answered plus four remaining daily slots; zero score; >3min; tab switch/reload draft restore; explanation; offline save retry; duplicate save");
  await panel().getByRole("button", { name: "間違えた問題をもう一度", exact: true }).click(); await answer(true, 4); await panel().getByText("4 / 4 問 正解", { exact: true }).waitFor();
  await save(); await home();
  // The question answered incorrectly before the four-question session stays wrong.
  // It is not due again until tomorrow, and same-day retry must not pull it forward.
  await panel().getByText("1問を確認中。期限と対策範囲に合う日に取り組もう。", { exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: "間違い直しを始める", exact: true }).isDisabled(), true);
  await panel().getByText("復習問題一覧（5問）", { exact: true }).click(); await panel().getByText(/^直後の再挑戦で正解・後日も確認しよう ／ 次の確認 /).first().waitFor();
  await noOverflow(390); await page.screenshot({ path: ".review-results.local/390-home.png", fullPage: true });
  const after = await invoke("read"); const { uid: beforeUid, ...beforeShared } = before; const { uid: afterUid, ...afterShared } = after; void beforeUid; void afterUid;
  assert.deepEqual(afterShared, beforeShared, "review must not change study/calculation/game rewards");
  assert.deepEqual(await reviewCall("inspectTests"), testsBefore, "review must preserve existing grade records");
  results.push("existing grade input/edit/reload and review isolation");
  assert.ok(await reviewCall("foreignFamilyDenied"));
  await login(0); await tab().click(); await waitLoaded();
  await panel().getByText("利用できる問題：0問 ／ 今日の候補：0問", { exact: true }).waitFor();
  assert.equal(await panel().getByText("保護者の確認事項", { exact: false }).count(), 0);
  assert.ok(await reviewCall("crossUidDenied", accounts[1].uid));
  await login(2); await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor(); assert.equal(await page.locator("[data-protected-session]").count(), 0);
  await login(1); await tab().click(); await waitLoaded();
  // Saved result can be shown after reload; replay remains idempotent.
  if (await panel().getByRole("button", { name: "結果を保存する（失敗時は再試行）", exact: true }).count()) { await save(); await home(); }
  assert.equal((await reviewCall("inspect")).history.length, 9);
  results.push("four correct retry while prior wrong question remains due tomorrow; progress improvement; no study/calculation/game/reward changes; UID/family separation and restoration");
  // Exercise failed reads without using a cached snapshot as success.
  await context.setOffline(true); await panel().getByRole("button", { name: "復習データを再読込", exact: true }).click();
  await panel().getByRole("alert").filter({ hasText: "読み込めませんでした" }).waitFor();
  await context.setOffline(false); await panel().getByRole("button", { name: "復習データを再読込", exact: true }).first().click(); await waitLoaded();
  await invoke("logout"); await page.getByRole("button", { name: "サンプルデータで試す", exact: true }).click(); await tab().click(); await waitLoaded();
  await panel().getByText(/サンプルモード：架空の問題です/).waitFor();
  await panel().getByRole("button", { name: "今日の5問を始める", exact: true }).click(); await answer(true, 5); await save(); await home();
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.includes(":sample:sample:sample-data"))), true);
  results.push("fictional questions only in explicit sample mode; sample results saved separately on device");
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(".review-results.local/report.json", JSON.stringify({ results, errors, external, blockedConnectivityProbes }, null, 2));
  console.log(JSON.stringify({ suite: "review", results, errors, external, blockedConnectivityProbes: blockedConnectivityProbes.length }, null, 2));
} finally { await browser.close(); }
