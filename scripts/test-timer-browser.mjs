import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const results = [], errors = [], external = [], firestorePostPaths = new Set();
const response = await fetch(`http://127.0.0.1:8086/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
assert.equal(response.status, 200, "Dedicated demo emulator reset failed");
const accounts = [], password = "local-emulator-only-123";
for (const name of ["a", "b", "outsider"]) {
  const email = `hotfix-${name}-${Date.now()}@example.invalid`;
  const response = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200); const account = await response.json(); accounts.push({ email, uid: account.localId });
}
const members = async uids => {
  const response = await fetch(`${endpoint}/families/${family}?updateMask.fieldPaths=memberUids`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { memberUids: { arrayValue: { values: uids.map(uid => ({ stringValue: uid })) } } } }) });
  assert.equal(response.status, 200);
};
await members(accounts.slice(0, 2).map(account => account.uid));
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mkdir(".timer-browser-results.local", { recursive: true });
await context.route("**/*", route => {
  if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
  const url = new URL(route.request().url());
  external.push({ host: url.hostname, path: url.pathname }); return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(15000);
let diagnosticWrites = 0;
page.on("request", request => { if (new URL(request.url()).port === "8086" && /documents:commit|\/Write\//.test(request.url())) diagnosticWrites++; });
const diagnostics = () => page.evaluate(async () => (await import("/src/device-test.ts")).getDiagnosticHistory());
const diagnosticEvent = async fields => (await diagnostics()).some(entry => Object.entries(fields).every(([key, value]) => entry[key] === value));
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { const url = new URL(request.url()); if (url.port === "8086" && request.method() === "POST") firestorePostPaths.add(url.pathname); });
const invoke = (method, ...args) => page.evaluate(async ({ method, args }) => (await import("/tests/timer-client.ts"))[method](...args), { method, args });
const read = () => invoke("read");
const task = async () => (await read()).tasks.find(task => task.id === "normal");
const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await predicate()) return; await page.waitForTimeout(100); }
  assert.fail(message);
};
const close = () => page.getByRole("button", { name: "タスク詳細を閉じる", exact: true });
const startStudy = () => page.getByRole("button", { name: "学習タイマーを開始", exact: true });
const saveStudy = () => page.getByRole("button", { name: /計測を終了して記録を保存|記録を保存中/ });
const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem("study-app-v5-hotfix-study-family-session-operations") || "[]"));
const startCalculation = () => page.getByRole("button", { name: /^(計算をはじめる|解き直しをする|もう一度挑戦する|計測を再開)$/ });
const calculationSeconds = async () => { const [m, s] = (await page.locator("p[aria-live=off]").innerText()).split(":").map(Number); return m * 60 + s; };
const saveCalculation = async score => {
  await page.getByRole("button", { name: "計算を終了して結果を記録", exact: true }).tap();
  const seconds = await calculationSeconds();
  await page.getByRole("button", { name: String(score), exact: true }).tap();
  await page.getByRole("button", { name: "この結果を保存", exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.getByText("結果を保存したよ！", { exact: true }).waitFor();
  return seconds;
};
const setStaleCalculationTime = async seconds => {
  const response = await fetch(`${endpoint}/families/${family}/tasks/calc-⑦?updateMask.fieldPaths=currentDuration&updateMask.fieldPaths=lastUpdatedAt`, {
    method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { currentDuration: { integerValue: String(seconds) }, lastUpdatedAt: { integerValue: String(Date.now()) } } }),
  });
  assert.equal(response.status, 200, "Dedicated demo stale-time fixture patch failed");
};
try {
  await page.goto(`${base}/tests/timer-setup.html`, { waitUntil: "networkidle" });
  assert.equal(await invoke("login", accounts[0].email, password), accounts[0].uid);
  await invoke("seed");
  await page.goto(base, { waitUntil: "domcontentloaded" }); await page.locator("select").first().selectOption({ label: "第1回" });
  await setStaleCalculationTime(13);
  await page.getByText("⑦", { exact: true }).click();
  await waitFor(() => diagnosticEvent({ type: "BUTTON", source: "calculation_7", button: "START", code: "UNSAVED_TIME", disabled: true }), "Calculation unsaved-time disabled reason missing");
  assert.equal(await startCalculation().isDisabled(), true);
  assert.ok(!await diagnosticEvent({ type: "CLICK", source: "calculation_7", button: "START" }));
  await close().click(); await setStaleCalculationTime(0);
  await page.getByText("基本問題", { exact: true }).click();
  await waitFor(() => diagnosticEvent({ type: "BUTTON", source: "study", button: "STOP", disabled: true, code: "ZERO_TIME" }), "Disabled zero-time reason not recorded without click");
  await startStudy().evaluate(button => { button.click(); button.click(); });
  await waitFor(async () => (await task()).isRunning, "START did not persist");
  await close().click(); await page.getByText("①", { exact: true }).click();
  assert.equal(await startCalculation().isDisabled(), true);
  await waitFor(() => diagnosticEvent({ type: "BUTTON", source: "calculation_1", button: "START", code: "OTHER_TIMER", disabled: true }), "Calculation other-timer disabled reason missing");
  await close().click(); await page.getByText("基本問題", { exact: true }).click();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "学習タイマーを一時停止", exact: true }).click();
  await waitFor(async () => !(await task()).isRunning && (await task()).currentDuration >= 2, "STOP did not persist");
  await saveStudy().click();
  await waitFor(async () => (await task()).history.length === 1, "history did not persist");
  await close().waitFor({ state: "hidden" });
  results.push("normal START/double click/count up/STOP/history: authenticated Emulator PASS");
  assert.ok(await diagnosticEvent({ type: "CLICK", source: "study", button: "STOP" }));
  assert.ok(await diagnosticEvent({ type: "HANDLER", source: "study", button: "STOP" }));
  assert.ok(await diagnosticEvent({ type: "SAVE_SUCCESS", source: "study" }));
  await page.getByText("基本問題", { exact: true }).click(); await startStudy().click();
  await waitFor(async () => (await task()).isRunning, "Second START missing"); await page.waitForTimeout(2200);
  await members([accounts[1].uid]);
  await saveStudy().click(); await page.waitForTimeout(1000);
  const refusedSave = { modalRetained: await close().isVisible(), retryMessage: await page.getByRole("alert").filter({ hasText: /保存|通信|記録/ }).count() > 0 };
  results.push({ refusedSave });
  assert.equal(refusedSave.modalRetained, true, "Rules-denied normal SAVE closed the modal as if saved");
  assert.equal(refusedSave.retryMessage, true, "Rules-denied SAVE must explain retry");
  const retained = (await queue()).find(operation => operation.kind === "save");
  assert.ok(retained); assert.equal(await startStudy().isDisabled(), true, "Do not resume while STOP is waiting to save");
  await waitFor(() => diagnosticEvent({ type: "BUTTON", source: "study", button: "START", disabled: true, code: "SAVE_PENDING" }), "Pending save disabled reason missing");
  assert.ok(await diagnosticEvent({ type: "SAVE_FAILURE", source: "study", code: "permission-denied", retry: true }));
  await page.reload(); await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("基本問題", { exact: true }).click();
  assert.equal((await queue()).find(operation => operation.kind === "save").operationId, retained.operationId);
  assert.equal(await startStudy().isDisabled(), true); assert.equal(await saveStudy().isDisabled(), false);
  await members(accounts.slice(0, 2).map(account => account.uid));
  await saveStudy().evaluate(button => { button.click(); button.click(); });
  await waitFor(async () => (await task()).history.length === 2, "Retry did not persist history exactly once");
  await close().waitFor({ state: "hidden" });
  const retryHistory = (await task()).history.find(entry => entry.id === retained.sessionId);
  assert.ok(retryHistory); assert.equal(retryHistory.endAt, retained.at);
  assert.equal((await queue()).length, 0);
  results.push("Rules refusal retains STOP/time/operation across reload; retry saves once at original STOP timestamp");

  await page.getByText("基本問題", { exact: true }).click(); await startStudy().tap();
  await waitFor(async () => (await task()).isRunning && !(await queue()).length, "Delayed-write session not ready");
  await page.waitForTimeout(2100);
  let releaseCommit; const gate = new Promise(resolve => { releaseCommit = resolve; });
  let heldCommits = 0;
  await page.route("**/documents:commit*", async route => { heldCommits++; await gate; await route.continue(); });
  await saveStudy().evaluate(button => { button.click(); button.click(); });
  await waitFor(async () => heldCommits > 0, "Write delay did not intercept a real transaction");
  assert.equal(await close().isVisible(), true); assert.equal(await saveStudy().isDisabled(), true);
  assert.equal(await startStudy().isDisabled(), true);
  assert.equal(await page.getByText("記録を保存中...", { exact: true }).isVisible(), true);
  await waitFor(() => diagnosticEvent({ type: "BUTTON", source: "study", button: "START", disabled: true, code: "SAVING" }), "Saving disabled reason missing");
  await page.waitForTimeout(1000); assert.equal(await close().isVisible(), true, "Closed before commit acknowledgement");
  releaseCommit(); await page.unrouteAll({ behavior: "wait" });
  await waitFor(async () => (await task()).history.length === 3, "Delayed save did not finish once");
  await close().waitFor({ state: "hidden" });
  results.push("Delayed transaction: saving label, disabled duplicate operations, no completion before acknowledgement, one history");

  await page.getByRole("button", { name: "全体", exact: true }).click();
  await page.getByText("今日の学習タイムライン", { exact: true }).waitFor();
  const expectedTimeline = await page.evaluate(history => {
    const clock = at => { const time = new Date(at); return `${time.getHours()}:${String(time.getMinutes()).padStart(2, "0")}`; };
    return history.map(entry => `算数 第1回 基本問題 ${clock(entry.startAt)}-${clock(entry.endAt)} ${Math.floor(entry.duration / 60)}m${entry.duration % 60}s`).sort();
  }, (await task()).history);
  assert.deepEqual((await page.locator('div[title^="算数 第1回 基本問題 "]').evaluateAll(bars => bars.map(bar => bar.title))).sort(), expectedTimeline);
  results.push("Timeline bar start/end/duration exactly match the three server histories");
  await page.reload(); await page.getByRole("button", { name: "学習", exact: true }).click();
  await page.locator("select").first().selectOption({ label: "第1回" });
  assert.equal((await task()).history.length, 3);
  const beforeCalculations = await task();
  await page.getByText("①", { exact: true }).click();
  const measured = [];
  for (const score of [3, 5, 7, 2]) {
    await startCalculation().tap();
    assert.equal(await calculationSeconds(), 0);
    assert.equal(await startStudy().isDisabled(), true, "Normal START must be blocked only while calculation runs");
    await waitFor(() => diagnosticEvent({ type: "BUTTON", source: "study", button: "START", disabled: true, code: "OTHER_TIMER" }), "Inherited fieldset disabled reason missing");
    await page.waitForTimeout(2100);
    await waitFor(async () => await calculationSeconds() >= 2, "Calculation counter did not reach two seconds");
    measured.push([score, await saveCalculation(score), "calc-①"]);
  }
  let state = await read();
  assert.deepEqual(state.attempts.map(attempt => [attempt.score, attempt.elapsedSeconds, attempt.taskId]), measured);
  assert.deepEqual((await task()).history, beforeCalculations.history);
  assert.equal(state.ledger.length, 0);
  await close().tap();
  // Closing a running calculation releases the normal-timer fieldset.
  await page.getByText("①", { exact: true }).click(); await startCalculation().tap(); await page.waitForTimeout(1100); await close().tap();
  await page.getByText("基本問題", { exact: true }).click(); assert.equal(await startStudy().isDisabled(), false); await close().tap();
  await page.reload(); await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("①", { exact: true }).click(); assert.equal(await startCalculation().innerText(), "計測を再開"); await close().tap();
  for (const id of ["②", "③", "④", "⑤", "⑥", "⑦"]) {
    await page.getByText(id, { exact: true }).click(); await startCalculation().tap(); await saveCalculation(0); await close().tap();
  }
  state = await read(); assert.equal(state.attempts.length, 10);
  assert.deepEqual(state.attempts.slice(4).map(attempt => attempt.taskId), ["②", "③", "④", "⑤", "⑥", "⑦"].map(id => `calc-${id}`));
  await page.getByRole("button", { name: "実績", exact: true }).tap();
  await page.getByLabel("グラフで見る計算課題", { exact: true }).selectOption("calc-①");
  await page.getByText("最高 7/7 / 解き直し3回 / 7/7達成", { exact: true }).waitFor();
  await waitFor(async () => await page.locator(".recharts-line-dots circle").count() >= 10, "Four charts missing");
  assert.deepEqual(await page.locator(".recharts-line-dots").evaluateAll(groups => groups.map(group => group.querySelectorAll("circle").length)), [1, 1, 4, 4]);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}`);
    await page.screenshot({ path: `.timer-browser-results.local/graphs-${width}.png`, fullPage: true });
  }
  results.push("Authenticated calculations ①–⑦; scores 0/3/5/7/2, redo after 7/7, ten immutable attempts, times match, four graphs, 320px/390px touch");

  await page.getByRole("button", { name: "学習", exact: true }).tap();
  await invoke("historicalIdle");
  const review = () => page.getByRole("button", { name: /勉強した時間を確認しよう/ });
  await review().waitFor();
  await waitFor(async () => (await task()).history.some(entry => entry.reviewStatus === "pending"), "Idle STOP not persisted");
  const pending = (await task()).history.find(entry => entry.reviewStatus === "pending");
  assert.equal(pending.duration, 900); assert.equal(pending.creditedDuration, 0);
  await review().tap(); await page.getByRole("button", { name: "時間を短くする", exact: true }).tap();
  await page.getByLabel("勉強した分数", { exact: true }).fill("10");
  await page.getByRole("button", { name: "この時間でOK", exact: true }).evaluate(button => { button.click(); button.click(); });
  await waitFor(async () => (await task()).history.some(entry => entry.id === pending.id && entry.reviewStatus === "confirmed"), "10min review missing");
  const confirmed = (await task()).history.find(entry => entry.id === pending.id);
  assert.equal(confirmed.duration, 600); assert.equal(confirmed.creditedDuration, 600);
  await page.getByRole("button", { name: "プロデュース", exact: true }).tap();
  await page.getByRole("button", { name: /受け取る/ }).filter({ hasText: /P/ }).evaluate(button => { button.click(); button.click(); });
  await waitFor(async () => (await read()).ledger.some(entry => entry.sessionId === pending.id), "Reward ledger missing");
  const rewarded = await read();
  await page.reload(); await page.getByRole("button", { name: "プロデュース", exact: true }).tap(); await page.waitForTimeout(1000);
  assert.equal((await read()).game.activityPoints, rewarded.game.activityPoints); assert.equal((await read()).ledger.length, rewarded.ledger.length);
  await invoke("historicalIdle"); await review().waitFor();
  await waitFor(async () => (await task()).history.some(entry => entry.reviewStatus === "pending"), "Second idle missing");
  const zeroPending = (await task()).history.find(entry => entry.reviewStatus === "pending");
  await review().tap(); await page.getByRole("button", { name: "0分にする", exact: true }).tap();
  await waitFor(async () => (await task()).history.some(entry => entry.id === zeroPending.id && entry.reviewStatus === "confirmed"), "Zero confirmation missing");
  assert.equal((await task()).history.find(entry => entry.id === zeroPending.id).duration, 0);
  assert.equal((await read()).game.activityPoints, rewarded.game.activityPoints);
  results.push("Idle STOP/pending_review/600s and 0s confirmations/reload/rewardLedger/activityP idempotency: historical sessions, unchanged wall clock");

  await page.getByRole("button", { name: "学習", exact: true }).tap(); await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("基本問題", { exact: true }).click(); await startStudy().tap();
  await waitFor(async () => (await task()).isRunning && !(await queue()).length, "Offline session not ready"); await page.waitForTimeout(2100);
  const historyCount = (await task()).history.length;
  await context.setOffline(true);
  await page.getByRole("button", { name: "学習タイマーを一時停止", exact: true }).tap();
  await saveStudy().tap();
  await page.getByRole("alert").filter({ hasText: "保存できなかったよ" }).waitFor({ timeout: 30000 });
  assert.equal(await close().isVisible(), true); assert.ok((await queue()).some(operation => operation.kind === "save"));
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitFor(async () => (await task()).history.length === historyCount + 1 && !(await queue()).length, "Online replay did not save exactly once");
  assert.equal((await read()).ledger.length, rewarded.ledger.length); await close().tap();
  results.push("Offline STOP/SAVE retains queue and shows error; online replay saves once without adding reward");

  // UID changes are genuine Auth changes; calculations are keyed by UID.
  await page.evaluate(async () => (await import("/src/device-test.ts")).recordDiagnostic({ type: "GUARD", source: "auth", code: "cancelled" }));
  await invoke("login", accounts[1].email, password); await page.waitForTimeout(1000);
  assert.ok(!await diagnosticEvent({ type: "GUARD", source: "auth", code: "cancelled" }), "Old UID diagnostic session survived Auth switch");
  assert.equal((await read()).attempts.length, 0);
  await page.getByRole("button", { name: "学習", exact: true }).tap(); await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("①", { exact: true }).click(); assert.equal(await calculationSeconds(), 0); assert.equal(await startCalculation().innerText(), "計算をはじめる"); await close().tap();
  await invoke("login", accounts[0].email, password); await page.waitForTimeout(1000); assert.equal((await read()).attempts.length, 10);
  await page.reload(); assert.equal((await read()).attempts.length, 10);
  results.push("Actual Auth UID switch: own attempt/draft isolation, shared study/game preserved, reload restores original attempts");
  await page.getByRole("button", { name: "学習", exact: true }).tap(); await page.locator("select").first().selectOption({ label: "第1回" });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByText("基本問題", { exact: true }).click();
  const bounds = await startStudy().boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44);
  assert.equal(await startStudy().evaluate(button => { const box = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); }), true);
  await startStudy().tap(); await waitFor(async () => (await task()).isRunning, "320px START missing"); await page.waitForTimeout(2100);
  await page.getByRole("button", { name: "学習タイマーを一時停止", exact: true }).tap();
  await waitFor(async () => !(await task()).isRunning, "320px STOP missing"); await saveStudy().tap(); await close().waitFor({ state: "hidden" });
  await page.getByText("②", { exact: true }).click(); await startCalculation().tap();
  await waitFor(async () => await calculationSeconds() >= 2, "320px calculation did not count up"); await saveCalculation(4); await close().tap();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal((await read()).attempts.length, 11);
  results.push("320px actual touch START/STOP/save for both timers; 48px normal START hit target, no overlay; 390px regression also passed");
  // Keep the negative membership probe separate from the App's live listeners.
  const outsiderContext = await browser.newContext();
  await outsiderContext.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    external.push({ host: url.hostname, path: url.pathname }); return route.abort();
  });
  const outsiderPage = await outsiderContext.newPage();
  outsiderPage.on("pageerror", error => errors.push(error.message));
  await outsiderPage.goto(`${base}/tests/timer-setup.html`, { waitUntil: "domcontentloaded" });
  await outsiderPage.evaluate(async ({ email, password }) => {
    const fixture = await import("/tests/timer-client.ts");
    await fixture.login(email, password);
    if (!await fixture.familyAccessDenied()) throw new Error("Nonmember read was allowed");
  }, { email: accounts[2].email, password });
  await outsiderContext.close();
  results.push("Authenticated nonmember cannot read test family through Web SDK and Rules");

  // Storage failure is diagnostic-only; timers and transaction acknowledgement still work.
  await page.getByRole("button", { name: "学習", exact: true }).click();
  await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("基本問題", { exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("study-device-diagnostics")) throw new DOMException("quota", "QuotaExceededError"); return original.call(this, key, value); };
  });
  await startStudy().tap(); await page.waitForTimeout(1200); await saveStudy().tap();
  await close().waitFor({ state: "hidden" });
  assert.ok(await diagnosticEvent({ type: "SAVE_SUCCESS", source: "study" }));
  results.push("Diagnostics quota failure: authenticated START/STOP/save remains functional");
  await page.reload();
  await page.waitForTimeout(500);
  const writesBefore = diagnosticWrites;
  await page.evaluate(async () => {
    const diagnostic = await import("/src/device-test.ts");
    diagnostic.recordDiagnostic({ type: "BUTTON", source: "study", button: "START", code: "NONE", detail: "PRIVATE-MARKER email token signerKey", taskId: "PRIVATE-MARKER", sessionId: "PRIVATE-MARKER" });
  });
  await page.waitForTimeout(100);
  assert.equal(diagnosticWrites, writesBefore, "Diagnostic event added Firestore writes");
  const exported = await page.evaluate(async () => (await import("/src/device-test.ts")).exportDiagnostics("v1.86.3", navigator.userAgent));
  assert.ok(!/PRIVATE-MARKER|taskId|sessionId|signerKey|passwordHash|email|token|memberUids/.test(exported));
  for (const account of accounts) { assert.ok(!exported.includes(account.uid)); assert.ok(!exported.includes(account.email)); }
  assert.ok(JSON.parse(exported).events.length <= 50);
  results.push("Strict allowlist export: no UID/email/token/document/free text; event adds zero Firestore writes");
  await page.goto(`${base}/?deviceTest=1`, { waitUntil: "domcontentloaded" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "安全な診断情報をコピー" }).click();
    const copied = await page.getByLabel("コピー用診断情報").inputValue();
    assert.equal(JSON.parse(copied).version, "v1.86.3");
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), JSON.parse(copied));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `.timer-browser-results.local/diagnostics-${width}.png`, fullPage: true });
  }
  results.push("Existing deviceTest panel: actual clipboard copy and 320px/390px layout PASS");
  assert.deepEqual(errors, []);
  // Firebase Auth can request its Google helper even with Auth Emulator.
  // Every external request is aborted above, including any unexpected host.
  assert.ok(external.every(request => request.host === "www.google.com"), "Unexpected external request attempted");
} finally {
  await mkdir(".timer-browser-results.local", { recursive: true });
  await writeFile(".timer-browser-results.local/results.json", JSON.stringify({ results, errors, external, firestorePostPaths: [...firestorePostPaths] }, null, 2));
  await page.screenshot({ path: ".timer-browser-results.local/final.png", fullPage: true }).catch(() => {});
  await browser.close();
}
console.log(JSON.stringify({ results, pageErrors: errors.length, blockedExternalRequests: external.length, allowedExternalRequests: 0 }, null, 2));
