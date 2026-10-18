import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = "http://127.0.0.1:8086/v1/projects/" + project + "/databases/(default)/documents";
assert.equal((await fetch("http://127.0.0.1:8086/emulator/v1/projects/" + project + "/databases/(default)/documents", { method: "DELETE" })).status, 200);
const accounts = [], password = "emulator-only-123";
for (const role of ["A", "B", "C"]) {
  const email = "auth-" + role + "-" + Date.now() + "@example.invalid";
  const r = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(r.status, 200); const a = await r.json(); accounts.push({ role, email, uid: a.localId });
}
assert.equal((await fetch(endpoint + "/families/" + family, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { memberUids: { arrayValue: { values: accounts.slice(0, 2).map(a => ({ stringValue: a.uid })) } } } }) })).status, 200);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [], internal = [], external = [], results = [], monitor = [];
const roles = Object.fromEntries(accounts.map(a => [a.uid, a.role]));
const ws = new WebSocket("ws://127.0.0.1:9158/requests");
ws.addEventListener("message", event => { const parsed = JSON.parse(String(event.data)); for (const x of Array.isArray(parsed) ? parsed : [parsed]) { const uid = x.rulesContext?.request?.mapValue?.fields?.auth?.mapValue?.fields?.uid?.stringValue; monitor.push({ role: roles[uid] ?? "other", method: x.rulesContext?.method, outcome: x.outcome }); } });
await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
await context.route("**/*", route => { const u = new URL(route.request().url()); if (u.hostname === "127.0.0.1") return route.continue(); external.push(u.hostname); return route.abort(); });
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on("pageerror", error => errors.push(error.name));
page.on("console", message => { if (/INTERNAL ASSERTION|ca9|b815/.test(message.text())) internal.push("internal-assertion"); });
const invoke = (method, ...args) => page.evaluate(async ({ method, args }) => (await import("/tests/timer-client.ts"))[method](...args), { method, args });
const waitProtected = async () => { await page.locator("[data-protected-session]").waitFor(); const close = page.getByRole("complementary", {name:"端末診断"}).getByRole("button",{name:"閉じる",exact:true}); if (await close.isVisible()) await close.click(); };
const installObservation = async () => page.evaluate(async accounts => {
  const { auth, beforeAuthStateChanged, onAuthStateChanged } = await import("/tests/timer-client.ts"); const trace = window.__authTrace = { phase: "A", observations: 0, leaks: 0, switches: 0 };
  const sample = () => { trace.observations++; if (["C", "switching", "signed-out"].includes(trace.phase) && document.querySelector("[data-protected-session]")) { trace.leaks++; trace.lastLeak = trace.phase; } };
  beforeAuthStateChanged(auth, next => { if (next?.uid === auth.currentUser?.uid) return; trace.phase = "switching"; trace.switches++; sample(); });
  onAuthStateChanged(auth, user => { trace.phase = accounts.find(a => a.uid === user?.uid)?.role ?? "signed-out"; sample(); });
  new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  const frame = () => { sample(); requestAnimationFrame(frame); }; frame();
}, accounts.map(({ role, uid }) => ({ role, uid })));
const trace = () => page.evaluate(() => window.__authTrace);
const login = async role => { const a = accounts.find(a => a.role === role); await invoke("login", a.email, password); };
try {
  await page.goto(base + "/tests/timer-setup.html"); await login("A"); await invoke("seed");
  await page.goto(base + "?deviceTest=1"); await waitProtected(); await installObservation();
  for (const role of ["B", "A", "C", "A"]) {
    await login(role);
    if (role === "C") { await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor(); assert.equal(await page.locator("[data-protected-session]").count(), 0); if (process.env.AUTH_SESSION_CONTROL !== "1") assert.equal(await page.evaluate(() => window.__authMetrics.active), 0); }
    else { await waitProtected(); await page.locator("select").first().selectOption({ label: "第1回" }); await page.getByText("基本問題", { exact: true }).click(); assert.equal(await page.getByRole("button", { name: "学習タイマーを開始", exact: true }).isEnabled(), true); await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).click(); }
    assert.equal((await trace()).leaks, 0); results.push("switch-to-" + role);
  }
  for (const role of ["C", "A"]) {
    await page.getByRole("button", { name: "ログアウト", exact: true }).click(); await page.getByRole("button", { name: "実行する", exact: true }).click();
    await page.getByPlaceholder("family@example.com").waitFor();
    const a = accounts.find(a => a.role === role);
    await page.getByPlaceholder("family@example.com").fill(a.email); await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    if (role === "C") { await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor(); await page.getByRole("button", { name: "ログアウト", exact: true }).click(); await login("A"); }
    await waitProtected(); assert.equal((await trace()).leaks, 0); results.push("UI-logout-login-" + role);
  }
  const otherTab = await context.newPage();
  await otherTab.goto(base + "/tests/timer-setup.html");
  for (const role of ["C", "A"]) {
    const a = accounts.find(a=>a.role===role);
    await otherTab.evaluate(async ({email,password})=>(await import("/tests/timer-client.ts")).login(email,password),{email:a.email,password});
    if (role === "C") await page.getByText("このアカウントでは利用できません。",{exact:true}).waitFor(); else await waitProtected();
    assert.equal((await trace()).leaks,0);
  }
  await otherTab.close(); results.push("cross-tab-Auth-persistence-C-A-isolation");
  if (process.env.AUTH_SESSION_CONTROL !== "1") {
  await page.evaluate(() => {
    window.__authHeld = []; window.__authHolds = { membership: true };
    window.__authDelay = kind => window.__authHolds[kind] ? new Promise(resolve => window.__authHeld.push({kind, resolve})) : Promise.resolve();
  });
  await login("B"); await page.waitForFunction(() => window.__authHeld.length > 0);
  assert.equal(await page.locator("[data-protected-session]").count(), 0);
  await page.evaluate(() => { window.__authHolds = {}; window.__authHeld.splice(0).forEach(h => h.resolve()); });
  await waitProtected(); results.push("membership-read-response-delay-blocked");
  await page.evaluate(() => { window.__authHolds = {membership:true}; });
  await login("A"); await page.waitForFunction(() => window.__authHeld.length > 0);
  await login("C"); await page.getByText("このアカウントでは利用できません。", {exact:true}).waitFor();
  await page.evaluate(() => { window.__authHolds = {}; window.__authHeld.splice(0).forEach(h => h.resolve()); });
  await page.waitForTimeout(150); assert.equal(await page.locator("[data-protected-session]").count(), 0);
  await login("B"); await waitProtected(); results.push("stale-membership-response-cannot-authorize-C");
  // Deliver a read result and listener event from B only after A is authorized.
  await page.evaluate(() => { window.__authHolds = { read: true }; window.__authHoldEvents = true; });
  await page.getByRole("button", { name: "手動更新", exact: true }).click();
  await page.waitForFunction(() => window.__authHeld.some(h => h.kind === "read"));
  await fetch(endpoint + "/families/" + family + "/tasks/normal?updateMask.fieldPaths=lastUpdatedAt", { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { lastUpdatedAt: { integerValue: String(Date.now()) } } }) });
  await page.waitForFunction(() => (window.__authEvents ?? []).length > 0);
  await login("A"); await waitProtected();
  await page.evaluate(() => { window.__authHoldEvents = false; window.__authHolds = {}; window.__authHeld.splice(0).forEach(h => h.resolve()); (window.__authEvents ?? []).splice(0).forEach(f => f()); });
  await page.waitForTimeout(300); assert.equal((await trace()).leaks, 0); results.push("stale-read-and-event-isolation");
  }
  // Pending saves are deliberately failed offline, kept under A, and not replayed as B.
  await login("A"); await waitProtected(); await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("基本問題", { exact: true }).click(); await page.getByRole("button", { name: "学習タイマーを開始", exact: true }).click(); await page.waitForTimeout(2200);
  await context.setOffline(true);
  await page.getByRole("button", { name: /計測を終了して記録を保存/ }).click(); await page.waitForTimeout(1000);
  const keyA = "study-app-v5-" + family + "-session-operations:" + project + ":" + accounts[0].uid;
  const pending = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), keyA); assert.ok(pending.some(o => o.kind === "save"));
  await invoke("switchCachedUser", accounts[1].uid);
  assert.equal(await page.locator("[data-protected-session]").count(), 0);
  const retained = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), keyA);
  assert.ok(retained.some(o => o.operationId === pending.find(o => o.kind === "save").operationId));
  const keyB = "study-app-v5-" + family + "-session-operations:" + project + ":" + accounts[1].uid;
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]").length, keyB), 0);
  await context.setOffline(false);
  if (await page.getByText("所属を確認できませんでした。通信を確認して再試行してください。", { exact: true }).isVisible()) await page.getByRole("button", {name:"再試行",exact:true}).click();
  await waitProtected();
  assert.equal((await invoke("read")).tasks.find(t=>t.id==="normal").history.length, 0, "B must not save A pending work");
  await login("A"); await waitProtected(); await page.waitForTimeout(1000);
  const saved = await invoke("read"); assert.equal(saved.tasks.find(t => t.id === "normal").history.length, 1); assert.equal(saved.ledger.length,0);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]").length, keyA), 0); results.push({ pendingPreserved: true, retainedOnSwitch: retained.length });
  await page.evaluate(({legacy,operations}) => localStorage.setItem(legacy, JSON.stringify(operations)), {legacy: "study-app-v5-" + family + "-session-operations", operations:pending});
  await invoke("logout"); await login("A"); await waitProtected();
  await page.getByRole("button", {name:"未保存記録を確認して引き継ぐ",exact:true}).click();
  await page.getByRole("button", {name:"実行する",exact:true}).click();
  await page.waitForTimeout(800); assert.equal((await invoke("read")).tasks.find(t=>t.id==="normal").history.length,1);
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)??"[]").length,keyA),0);
  results.push("legacy-pending-explicit-ownership-idempotent-retry");
  await page.getByRole("button", {name:"プロデュース",exact:true}).click();
  await login("C"); await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor();
  const traceBeforeReload = await trace(); assert.equal(traceBeforeReload.leaks,0); results.push("game-screen-C-isolation");
  await page.reload();
  await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor(); assert.equal(await page.locator("[data-protected-session]").count(), 0);
  await installObservation(); await login("A"); await waitProtected();
  await page.evaluate(() => { history.pushState({}, "", "?deviceTest=1"); history.pushState({}, "", "/"); }); await page.goBack(); await page.goForward(); await waitProtected();
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: ".auth-results.local/auth-" + width + ".png" }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
  assert.equal((await trace()).leaks, 0); assert.deepEqual(errors, []); assert.deepEqual(internal, []); assert.ok(external.every(host => host === "www.google.com"));
  assert.equal(monitor.filter(m => m.role === "C" && m.outcome === "allow").length, 0);
  results.push("reload-back-forward-mobile-offline-recovery");
  await writeFile(process.env.AUTH_SESSION_CONTROL === "1" ? ".auth-results.local/auth-control.json" : ".auth-results.local/auth.json", JSON.stringify({ results, traceBeforeReload, trace: await trace(), unhandledExceptions: errors.length, sdkAssertions: internal.length, blockedExternalRequests: external.length, outsiderAllowedRequests: monitor.filter(m => m.role === "C" && m.outcome === "allow").length, serverMonitor: monitor }, null, 2));
  console.log("Auth browser PASS: " + results.length + " checks; continuous DOM leaks=0, SDK assertions=0, pageerrors=0");
} catch (error) { await writeFile(".auth-results.local/auth-failure.json", JSON.stringify({results, trace: await trace(), error: error.name, line: error.stack?.split("\n").filter(x=>x.includes("test-auth-browser.mjs")).map(x=>x.replace(/.*test-auth-browser.mjs:/,""))})); await page.screenshot({ path: ".auth-results.local/auth-failure.png" }); console.error(error.name + ": " + error.message.replace(/[A-Za-z0-9_-]{25,}/g, "[redacted]")); process.exitCode = 1; }
finally { ws.close(); await context.close(); await browser.close(); }
