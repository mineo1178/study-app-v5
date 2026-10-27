import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const encode = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
async function seed(path, data) { assert.equal((await fetch(`${endpoint}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: encode(data).mapValue.fields }) })).status, 200); }
assert.equal((await fetch(`http://127.0.0.1:8086/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" })).status, 200);
const accounts = [], password = "role-emulator-only-123";
for (const role of ["parent", "child", "other-child", "outsider"]) {
  const email = `role-${role}-${Date.now()}@example.invalid`;
  const r = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", { method: "POST", headers: owner, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(r.status, 200); accounts.push({ role, email, uid: (await r.json()).localId });
}
const rolePath = `families/${family}/reviewManagers/${accounts[0].uid}`;
const setRole = (active, childUids = accounts.slice(1, 3).map(a => a.uid)) => seed(rolePath, { active, childUids, schemaVersion: 1 });
await seed(`families/${family}`, { memberUids: accounts.slice(0, 3).map(a => a.uid) }); await setRole(true);
const q = { published: true, id: "role-q", version: "role-v1", subject: "math", unit: "架空の確認単元", prompt: "ROLE-CHILD-B-PRIVATE", choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "架空の確認用解説", testKind: "未指定", source: "Emulator only" };
await seed(`families/${family}/reviewUsers/${accounts[1].uid}/questions/${q.id}`, q);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [], external = [], results = [];
await context.route("**/*", route => { const u = new URL(route.request().url()); if (u.hostname === "127.0.0.1") return route.continue(); external.push(u.hostname + u.pathname); return route.abort(); });
const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", e => errors.push(e.message));
const invoke = (method, ...args) => page.evaluate(async ({ method, args }) => (await import("/tests/timer-client.ts"))[method](...args), { method, args });
const login = i => invoke("login", accounts[i].email, password);
const tab = () => page.getByRole("button", { name: "対策・復習", exact: true });
const region = () => page.getByRole("region", { name: "保護者の復習管理", exact: true });
const manager = () => region().getByText("保護者の操作：問題登録・編集／苦手分野", { exact: true });
async function enter() { await tab().click(); await page.getByRole("button", { name: "保護者の管理", exact: true }).click(); await manager().waitFor(); }
const waitFor = async (predicate, label) => { const end = Date.now() + 15000; while (Date.now() < end) { if (await predicate()) return; await page.waitForTimeout(100); } assert.fail(label); };
async function installTrace() {
  await page.evaluate(async accounts => {
    const { auth, beforeAuthStateChanged, onAuthStateChanged } = await import("/tests/timer-client.ts");
    const t = window.__roleTrace = { phase: "parent", leaks: 0, observations: 0, switches: 0 };
    const sample = () => {
      t.observations++;
      if (["switching", "outsider", "signed-out"].includes(t.phase) && document.querySelector("[data-protected-session]")) t.leaks++;
      if (["child", "other-child"].includes(t.phase) && document.querySelector("[data-review-administration]")) t.leaks++;
      if (t.phase === "other-child" && document.body.textContent.includes("ROLE-CHILD-B-PRIVATE")) t.leaks++;
    };
    beforeAuthStateChanged(auth, next => { if (next?.uid !== auth.currentUser?.uid) { t.phase = "switching"; t.switches++; sample(); } });
    onAuthStateChanged(auth, user => { t.phase = accounts.find(a => a.uid === user?.uid)?.role ?? "signed-out"; sample(); });
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    const frame = () => { sample(); requestAnimationFrame(frame); }; frame();
    window.__reviewHeld = [];
    window.__reviewDelay = (kind, uid) => window.__reviewHold?.kind === kind && (!window.__reviewHold.uid || window.__reviewHold.uid === uid) ? new Promise(resolve => window.__reviewHeld.push(resolve)) : Promise.resolve();
  }, accounts);
}
const release = () => page.evaluate(() => { window.__reviewHold = null; window.__reviewHeld.splice(0).forEach(resolve => resolve()); });
try {
  await page.goto(base + "/tests/timer-setup.html"); await login(0); await invoke("seed"); await page.goto(base); await tab().waitFor(); await installTrace(); await enter();
  await manager().click(); await region().getByLabel("編集する問題", { exact: true }).selectOption(q.id);
  await region().getByLabel("短い解説", { exact: true }).fill("保護者が編集した架空の解説");
  await region().getByRole("button", { name: "問題を保存", exact: true }).click(); await region().getByText("問題を登録しました。", { exact: true }).waitFor();
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  results.push("parent assigned child edit and responsive management");
  await region().getByLabel("管理対象の子ども").selectOption(accounts[2].uid); await manager().waitFor(); await manager().click();
  await region().getByText("まとめて取り込む（JSON・50問まで）", { exact: true }).click();
  const { id: _id, version: _version, ...template } = q; void _id; void _version;
  await region().getByLabel("問題JSON").fill(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ ...template, prompt: `非公開の架空確認問題${i}`, published: false }))));
  await region().getByRole("button", { name: "JSONを取り込む", exact: true }).click(); await region().getByText("50問を登録しました。", { exact: true }).waitFor();
  await region().getByLabel("管理対象の子ども").selectOption(accounts[1].uid); await manager().waitFor();
  results.push("50 distinct unpublished questions imported through actual parent UI");
  // Delayed read for B must never populate the newly selected C form.
  await page.evaluate(uid => { window.__reviewHold = { kind: "read", uid }; }, accounts[1].uid);
  await region().getByLabel("管理対象の子ども").selectOption(accounts[2].uid);
  await manager().waitFor();
  await region().getByLabel("管理対象の子ども").selectOption(accounts[1].uid);
  await waitFor(() => page.evaluate(() => window.__reviewHeld.length > 0), "read was not delayed");
  await region().getByLabel("管理対象の子ども").selectOption(accounts[2].uid); await manager().waitFor(); await release();
  assert.equal(await region().getByRole("option", { name: /ROLE-CHILD-B-PRIVATE/ }).count(), 0);
  results.push("late B read cannot populate selected C");
  await page.evaluate(() => { window.__reviewHold = { kind: "read" }; });
  await region().getByLabel("管理対象の子ども").selectOption(accounts[1].uid);
  await waitFor(() => page.evaluate(() => window.__reviewHeld.length > 0), "pending read missing");
  await login(1); await tab().click(); await release();
  assert.equal(await page.getByRole("button", { name: "保護者の管理", exact: true }).count(), 0);
  assert.equal(await page.locator("[data-review-administration]").count(), 0);
  await login(3); await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor();
  await waitFor(() => page.evaluate(() => window.__reviewMetrics.active === 0), "review listeners remained after outsider login");
  await login(0); await enter(); await manager().click();
  await region().getByLabel("編集する問題", { exact: true }).selectOption(q.id);
  await region().getByLabel("短い解説", { exact: true }).fill("MUST-NOT-SAVE-AFTER-UID-SWITCH");
  await page.evaluate(() => { window.__reviewHold = { kind: "write" }; });
  await region().getByRole("button", { name: "問題を保存", exact: true }).click();
  await waitFor(() => page.evaluate(() => window.__reviewHeld.length > 0), "save was not delayed");
  await login(1); await tab().click(); await release(); await page.waitForTimeout(500);
  const stored = await (await fetch(`${endpoint}/families/${family}/reviewUsers/${accounts[1].uid}/questions/${q.id}`, { headers: owner })).json();
  assert.notEqual(stored.fields.explanation.stringValue, "MUST-NOT-SAVE-AFTER-UID-SWITCH");
  await login(2); await tab().click(); await page.getByText(/利用できる問題：0問/).waitFor();
  await login(0); await enter();
  results.push("parent-child-outsider-parent; pending save cancelled; listeners removed; continuous DOM separation");
  await setRole(false); await manager().waitFor({ state: "hidden" }); await region().getByText("管理対象はありません。管理操作を停止しています。", { exact: true }).waitFor();
  await setRole(true); await manager().waitFor();
  await setRole(true, [accounts[2].uid]); await manager().waitFor();
  assert.equal(await region().getByLabel("管理対象の子ども").locator("option").count(), 1);
  assert.equal(await region().getByLabel("管理対象の子ども").inputValue(), accounts[2].uid);
  assert.equal((await fetch(`${endpoint}/${rolePath}`, { method: "DELETE", headers: owner })).status, 200);
  await manager().waitFor({ state: "hidden" });
  await setRole(true); await manager().waitFor();
  await context.setOffline(true); await manager().waitFor({ state: "hidden" });
  await context.setOffline(false); await manager().waitFor();
  results.push("disable/reassign/delete roles and cache-only state immediately close management");
  await invoke("logout"); await page.getByRole("button", { name: "サンプルデータで試す", exact: true }).waitFor();
  await waitFor(() => page.evaluate(() => window.__reviewMetrics.active === 0), "logout kept review listeners");
  const trace = await page.evaluate(() => window.__roleTrace);
  assert.equal(trace.leaks, 0); assert.ok(trace.observations > 10); assert.ok(trace.switches >= 6);
  assert.deepEqual(errors, []); assert.ok(external.every(u => u === "www.google.com/images/cleardot.gif"));
  await mkdir(".review-role-results.local", { recursive: true });
  await writeFile(".review-role-results.local/report.json", JSON.stringify({ results, trace, errors, allowedExternal: 0 }, null, 2));
  console.log(JSON.stringify({ suite: "roles", results, trace, errors, allowedExternal: 0 }, null, 2));
} finally { await browser.close(); }
