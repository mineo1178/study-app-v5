import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178", project = "demo-study-hotfix", family = "hotfix-study-family";
const endpoint = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents`;
const out = process.env.ENCORE_BROWSER_OUT || ".encore-results.local";
await mkdir(out, { recursive: true });
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
function encode(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}
async function seed(path, value) {
  const response = await fetch(`${endpoint}/${encodeURI(path)}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields: encode(value).mapValue.fields }) });
  assert.equal(response.status, 200, await response.text());
}
async function dump() {
  const docs = [];
  async function visit(parent) {
    const response = await fetch(`${endpoint}/${encodeURI(parent)}:listCollectionIds`, { method: "POST", headers: owner, body: JSON.stringify({ pageSize: 1000 }) });
    assert.equal(response.status, 200);
    for (const name of (await response.json()).collectionIds || []) {
      const list = await fetch(`${endpoint}/${encodeURI(parent)}/${name}?pageSize=1000`, { headers: owner }); assert.equal(list.status, 200);
      const body = await list.json(); assert.equal(body.nextPageToken, undefined);
      for (const doc of body.documents || []) {
        const path = doc.name.split("/documents/")[1]; docs.push({ path, fields: doc.fields }); await visit(path);
      }
    }
  }
  const root = await fetch(`${endpoint}/families/${family}`, { headers: owner }); assert.equal(root.status, 200);
  docs.push({ path: `families/${family}`, fields: (await root.json()).fields });
  await visit(`families/${family}`);
  return docs.sort((a, b) => a.path.localeCompare(b.path));
}
assert.equal((await fetch(`http://127.0.0.1:8086/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" })).status, 200);
const accounts = [], password = "encore-local-only-123";
for (const who of ["a", "b", "outsider"]) {
  const email = `encore-${who}-${Date.now()}@example.invalid`;
  const response = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200); accounts.push({ email, uid: (await response.json()).localId });
}
await seed(`families/${family}`, { memberUids: accounts.slice(0, 2).map(a => a.uid), activeStudyTaskId: null });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const external = [], errors = [], expectedErrors = [], phases = [], results = [], monitor = [];
let expectingReadError = false;
await context.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.hostname === "127.0.0.1") return route.continue();
  external.push(url.hostname); return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on("pageerror", e => errors.push(e.message));
page.on("console", message => {
  if (message.type() === "error" && /FirebaseError|firestore.*error|PERMISSION_DENIED/i.test(message.text())) {
    (expectingReadError && /permission|insufficient|evaluation error.*false/i.test(message.text()) ? expectedErrors : errors).push(message.text());
  }
});
const ws = new WebSocket("ws://127.0.0.1:9158/requests");
ws.addEventListener("message", event => { const data = JSON.parse(String(event.data)); monitor.push(...(Array.isArray(data) ? data : [data])); });
await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
const call = (method, ...args) => page.evaluate(async ({ method, args }) => (await import("/tests/encore-client.ts"))[method](...args), { method, args });
const panel = () => page.getByRole("region", { name: "東京ドームのアンコール", exact: true });
const start = () => panel().getByRole("button", { name: "アンコールに応える", exact: true });
const replay = () => panel().getByRole("button", { name: "もう一度見る", exact: true });
const skip = () => panel().getByRole("button", { name: "演出をスキップ・閉じる", exact: true });
async function waitFor(fn, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await fn()) return; await page.waitForTimeout(100); }
  assert.fail(label);
}
async function produce() { await page.getByRole("button", { name: "プロデュース", exact: true }).tap(); await panel().waitFor(); }
async function measure(label, operation) {
  const before = await dump(), cursor = monitor.length;
  await operation(); await page.waitForTimeout(600);
  const attempts = monitor.slice(cursor).filter(x => ["create", "update", "delete"].includes(x.rulesContext?.method));
  const writes = attempts.filter(x => x.outcome === "allow");
  const after = await dump(); assert.deepEqual(after, before, `${label}: Firestore state changed`);
  assert.equal(writes.length, 0, `${label}: Firestore writes`);
  assert.equal(attempts.length, 0, `${label}: Firestore write attempts`);
  const reads = monitor.slice(cursor).filter(x => ["get", "list"].includes(x.rulesContext?.method));
  phases.push({ label, writeAttempts: attempts.length, allowedWrites: writes.length, documentsCompared: before.length,
    readEvaluations: reads.length, readPaths: [...new Set(reads.map(x => x.rulesContext.path))] });
}
try {
  await page.goto(`${base}/tests/timer-setup.html`);
  await call("login", accounts[0].email, password);
  await page.clock.install({ time: new Date("2026-10-18T12:00:00+09:00") });
  const fixture = await call("fixture", await page.evaluate(() => Date.now()));
  const normal = fixture.task;
  const twoDays = { ...normal, history: normal.history.filter(h => h.id !== "encore-2") };
  const locked = { ...fixture.game, claimedTourRewardKeys: fixture.game.claimedTourRewardKeys.filter(k => k !== "tokyo-dome-first-clear") };
  await seed(`families/${family}/game/idol-produce`, locked);
  await seed(`families/${family}/game/idol-produce/gacha/state`, fixture.gacha);
  for (const week of fixture.weeks) await seed(`families/${family}/game/idol-produce/weeks/${week.weekId}`, week);
  await seed(`families/${family}/tasks/normal`, twoDays);
  for (const title of ["①", "②", "③", "④", "⑤", "⑥", "⑦"]) await seed(`families/${family}/tasks/calc-${title}`, { ...normal, id: `calc-${title}`, title, category: "計算", history: [] });
  await seed(`families/${family}/dailyCalculations/${accounts[0].uid}/days/2000-01-01`, { sentinel: "unchanged-attempt-day" });
  await page.goto(base); await produce();
  await panel().getByText("🔒 東京ドームを成功させよう", { exact: true }).waitFor();
  await measure("locked display", async () => assert.equal(await start().count(), 0));
  await seed(`families/${family}/game/idol-produce`, fixture.game);
  await panel().getByText(/今週 2／3日/).waitFor();
  await measure("two-day display", async () => { assert.equal(await start().isDisabled(), true); assert.match(await panel().innerText(), /あと1日/); });
  await seed(`families/${family}/tasks/normal`, normal);
  await waitFor(() => start().isEnabled(), "Three-day source was not restored");
  const reads = await page.evaluate(() => ({ ...globalThis.__encoreReads })); assert.equal(reads.active, 1);
  await measure("start-double-tap-skip-replay", async () => {
    await start().evaluate(b => { b.click(); b.click(); });
    assert.equal(await panel().locator("strong").count(), 4);
    for (const name of ["ミオ", "コトハ", "リナ", "ユナ"]) assert.ok((await panel().innerText()).includes(name));
    await skip().tap(); await replay().tap(); await skip().tap(); assert.equal(await replay().count(), 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => /encore/i.test(k)).length), 0);
  });
  assert.deepEqual(await page.evaluate(() => ({ ...globalThis.__encoreReads })), reads, "Replay resubscribed to game");
  await measure("automatic-ending", async () => { await replay().tap(); await replay().waitFor({ timeout: 12000 }); });
  await measure("reload", async () => { await page.reload(); await produce(); await start().waitFor(); await waitFor(() => start().isEnabled(), "Reload eligibility"); assert.equal(await replay().count(), 0); });
  await measure("same-family UID switch", async () => {
    await call("login", accounts[1].email, password); await produce(); await waitFor(async () => await call("uid") === accounts[1].uid && await start().isEnabled(), "UID switch");
    const scopes = await page.evaluate(() => globalThis.__encoreRenders);
    const own = scopes.filter(s => s.scope.includes(`:${accounts[1].uid}:`));
    assert.ok(own.length > 0); assert.equal(own.at(-1).status, "ready");
    assert.equal(new Set(own.map(s => s.scope)).size, 1);
    assert.equal(await page.evaluate(() => globalThis.__encoreReads.active), 1);
    assert.equal(await replay().count(), 0);
  });
  await measure("independent device context", async () => {
    const device = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await device.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const other = await device.newPage(); other.on("pageerror", error => errors.push(error.message));
    try {
      await other.clock.install({ time: new Date("2026-10-18T12:00:00+09:00") });
      await other.goto(`${base}/tests/timer-setup.html`);
      await other.evaluate(async ({ email, password }) => (await import("/tests/encore-client.ts")).login(email, password), { email: accounts[0].email, password });
      await other.goto(base); await other.getByRole("button", { name: "プロデュース", exact: true }).tap();
      const region = other.getByRole("region", { name: "東京ドームのアンコール", exact: true });
      await region.getByText(/今週 3／3日/).waitFor();
      assert.equal(await region.getByRole("button", { name: "アンコールに応える", exact: true }).isEnabled(), true);
      assert.equal(await region.getByRole("button", { name: "もう一度見る", exact: true }).count(), 0);
    } finally { await device.close(); }
  });
  const gacha = structuredClone(fixture.game); gacha.members.push(fixture.gachaMember); gacha.activeMemberIds[3] = fixture.gachaMember.id; gacha.leaderMemberId = fixture.gachaMember.id;
  await seed(`families/${family}/game/idol-produce`, gacha);
  await page.waitForTimeout(500);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" });
    await measure(`gacha-touch-layout-${width}`, async () => {
      const button = await replay().count() ? replay() : start(); await button.tap();
      assert.ok((await panel().innerText()).includes(fixture.gachaMember.name));
      assert.equal(await panel().locator("strong").count(), 4);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
      const animation = await panel().getByRole("status", { name: "アンコール演出" }).evaluate(e => getComputedStyle(e).animationName);
      assert.equal(animation, "none");
      await panel().screenshot({ path: join(out, `encore-${width}.png`) }); await skip().tap();
    });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const runningNow = await page.evaluate(() => Date.now());
  const running = { ...normal, isRunning: true, sessionStartTime: runningNow, sessionId: "test-running", lastUserActivityAt: runningNow };
  await seed(`families/${family}/tasks/normal`, running);
  await waitFor(() => start().isDisabled(), "Running study guard");
  assert.match(await panel().innerText(), /タイマーを終えて/);
  await seed(`families/${family}/tasks/normal`, normal); await waitFor(() => start().isEnabled(), "Study guard recovery");
  results.push("study timer blocks start and recovers");
  await page.getByRole("button", { name: "学習", exact: true }).tap();
  await page.locator("select").first().selectOption({ label: "第1回" });
  await page.getByText("①", { exact: true }).tap();
  await page.getByRole("button", { name: "計算をはじめる", exact: true }).tap();
  await page.getByRole("button", { name: "プロデュース", exact: true }).evaluate(b => b.click());
  assert.equal(await start().isDisabled(), true); assert.match(await panel().innerText(), /タイマーを終えて/);
  await page.getByRole("button", { name: "タスク詳細を閉じる", exact: true }).tap();
  await waitFor(() => start().isEnabled(), "Calculation guard recovery"); results.push("actual calculation timer callback blocks start");
  await measure("injected game listener read error", async () => {
    await page.evaluate(() => globalThis.__encoreFail());
    await panel().getByText(/達成判定ができません/).waitFor();
    assert.equal(await start().count(), 0);
    assert.doesNotMatch(await panel().innerText(), /今週 0／3日/);
  });
  await page.reload(); await produce(); await waitFor(() => start().isEnabled(), "Listener error reload recovery");
  expectingReadError = true;
  await measure("read failure / outsider", async () => {
    await page.goto(`${base}/tests/timer-setup.html`);
    await call("login", accounts[2].email, password);
    await page.goto(base);
    await page.getByText("このアカウントでは利用できません。", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-protected-session]").count(), 0);
    assert.equal(await panel().count(), 0);
  });
  await page.goto(`${base}/tests/timer-setup.html`);
  await call("login", accounts[0].email, password); await page.goto(base); await produce();
  await waitFor(() => start().isEnabled(), "Read error recovery");
  await page.waitForTimeout(500); expectingReadError = false;
  const beforeHistoryChange = await dump();
  await seed(`families/${family}/tasks/normal`, twoDays); await panel().getByText(/今週 2／3日/).waitFor();
  await seed(`families/${family}/tasks/normal`, normal); await waitFor(() => start().isEnabled(), "History update recovery");
  assert.deepEqual(await dump(), beforeHistoryChange); results.push("live source edits recalculate progress without extra query");
  const time = await page.evaluate(() => Date.now());
  const sunday = new Date(time + 32400000); sunday.setUTCHours(23, 59, 59, 750);
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7));
  await page.clock.setSystemTime(new Date(sunday.getTime() - 32400000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => start().isEnabled(), "Sunday eligibility");
  await measure("JST week rollover", async () => {
    await page.clock.runFor(500); await panel().getByText(/今週 0／3日/).waitFor(); assert.equal(await start().isDisabled(), true);
  });
  await page.clock.setSystemTime(new Date(time)); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => start().isEnabled(), "Clock restored");
  await measure("navigation read reuse", async () => {
    const before = await page.evaluate(() => ({ ...globalThis.__encoreReads }));
    await page.getByRole("button", { name: "学習", exact: true }).tap(); await produce();
    assert.deepEqual(await page.evaluate(() => ({ ...globalThis.__encoreReads })), before);
  });
  // Existing Dome replay is an intentional game write, outside encore measurements.
  await page.reload(); await produce(); await waitFor(() => start().isEnabled(), "Dome replay ready");
  const oldGame = (await dump()).find(d => d.path.endsWith("game/idol-produce"));
  await page.getByRole("button", { name: "東京ドームライブに挑戦！", exact: true }).tap();
  await page.getByText("東京ドームライブ 大成功！", { exact: true }).waitFor();
  const replayed = await dump(), newGame = replayed.find(d => d.path.endsWith("game/idol-produce"));
  assert.equal(newGame.fields.activityPoints.integerValue, oldGame.fields.activityPoints.integerValue);
  assert.equal(replayed.filter(d => /\/performances\//.test(d.path)).length, 1);
  results.push("existing Dome replay clears, increments performance once, no repeated first-point reward");
  assert.deepEqual(errors, []);
  assert.ok(external.every(host => host === "www.google.com"));
  console.log(JSON.stringify({ phases: phases.length, encoreWrites: phases.reduce((n,p) => n+p.allowedWrites,0), results, pageErrors: errors.length, externalAllowed: 0 }));
} finally {
  ws.close();
  await writeFile(join(out, "encore-results.json"), JSON.stringify({ phases, results, errors, expectedErrors, externalBlocked: external, monitorEvents: monitor.length }, null, 2));
  await writeFile(join(out, "encore-requests-monitor.json"), JSON.stringify(monitor, null, 2));
  await page.screenshot({ path: join(out, "encore-final.png"), fullPage: true }).catch(() => {});
  await browser.close();
}
