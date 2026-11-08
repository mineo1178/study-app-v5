import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = "http://127.0.0.1:5178";
const root = "http://127.0.0.1:8086/v1/projects/demo-study-hotfix/databases/(default)/documents/families/hotfix-study-family";
const email = "reflections@example.invalid";
const password = "emulator-only-password";
const account = await fetch("http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
assert.equal(account.status, 200);
const { localId: uid } = await account.json();
const encode = value => typeof value === "string" ? { stringValue: value }
  : typeof value === "number" ? { integerValue: String(value) }
  : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) } };
const admin = (path, method, data) => fetch(root + path, {
  method,
  headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: data && JSON.stringify({ fields: encode(data).mapValue.fields }),
});
assert.equal((await admin("", "PATCH", { memberUids: [uid] })).status, 200);
const subjects = Object.fromEntries(["math", "japanese", "science", "social"].map(key => [key, { score: 80, avg: 70, dev: 55 }]));
const test = { name: "同じ名前のテスト", type: "curriculum", subjects, total4: { score: 320, avg: 280, dev: 55, rank: "10" } };
const testA = { ...test, date: "2025/09/01" };
const testB = { ...test, date: "2025/10/01", total4: { ...test.total4, dev: 57 } };
assert.equal((await admin("/tests/A", "PATCH", testA)).status, 200);
assert.equal((await admin("/tests/B", "PATCH", testB)).status, 200);

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "テストの振り返り", exact: true }) });
  const selector = panel.getByLabel("振り返るテスト");
  const history = panel.locator("details");
  const good = panel.getByRole("textbox", { name: "よかった点" });
  const bad = panel.getByRole("textbox", { name: "悪かった点" });
  const save = panel.getByRole("button", { name: "振り返りを保存", exact: true });
  const saved = panel.getByRole("status").filter({ hasText: "振り返りを保存しました。" });
  const openTests = async () => {
    await page.getByRole("navigation").getByRole("button", { name: "成績", exact: true }).click();
    await selector.locator('option[value="A"]').waitFor({ state: "attached" });
  };
  const login = async () => {
    await page.getByPlaceholder("family@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await openTests();
  };

  await page.goto(base);
  await login();
  await selector.selectOption("A");
  assert.equal(await panel.getByRole("textbox").count(), 3);
  await good.fill("   ");
  assert.equal(await save.isDisabled(), true);
  await good.fill("最後まで進めた");
  await panel.getByRole("button", { name: "国語", exact: true }).click();
  assert.equal(await good.inputValue(), "");
  await selector.selectOption("B");
  await selector.selectOption("A");
  assert.equal(await good.inputValue(), "最後まで進めた");
  await save.click();
  await saved.waitFor();
  assert.equal(await history.count(), 1);

  await selector.selectOption("B");
  await good.fill("見直しができた");
  assert.equal((await admin("/tests/B", "DELETE")).status, 200);
  await save.click();
  await panel.getByRole("alert").waitFor();
  assert.equal(await good.inputValue(), "見直しができた");
  assert.equal((await admin("/tests/B", "PATCH", testB)).status, 200);
  await panel.getByRole("button", { name: "もう一度保存する", exact: true }).click();
  await saved.waitFor();
  assert.equal(await history.count(), 2);
  assert.match(await history.first().locator("summary").innerText(), /2025\/10\/01.*同じ名前のテスト/s);

  const older = history.last();
  await older.locator("summary").click();
  assert.match(await older.locator("summary").innerText(), /算数/);
  await older.getByRole("button", { name: "この振り返りを編集" }).click();
  await good.fill("");
  assert.equal(await save.isDisabled(), true);
  await good.fill("最後まで進めた");
  await bad.fill("読み落とした");
  await save.click();
  await saved.waitFor();
  assert.equal(await history.count(), 2);

  await page.reload();
  await openTests();
  assert.equal(await history.count(), 2);
  await selector.selectOption("A");
  assert.equal(await bad.inputValue(), "読み落とした");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByRole("button", { name: "実行する", exact: true }).click();
  await login();
  await selector.selectOption("B");
  assert.equal(await good.inputValue(), "見直しができた");

  const openRegistration = () => page.getByRole("button", { name: "テスト記録を追加" }).click();
  const enterTest = async (date, name) => {
    await page.getByLabel("実施日", { exact: true }).fill(date);
    await page.getByLabel("テスト名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "追加する", exact: true }).click();
  };
  const recent = panel.getByRole("region", { name: "最近のテスト" });
  const boost = page.getByText("現在のブースト：", { exact: false });
  const beforeBoost = await boost.innerText();

  await openRegistration();
  await enterTest("2025-11-02", "未確定テスト");
  const pending = recent.getByRole("button", { name: /2025\/11\/02 未確定テスト/ });
  await pending.waitFor();
  assert.match(await pending.innerText(), /成績未登録.*振り返り未登録/);
  assert.equal(await boost.innerText(), beforeBoost);
  assert.equal(await page.locator(".design22-chart-heading").getByText("2件の記録 · 偏差値").count(), 1);
  await pending.click();
  const pendingId = await selector.inputValue();
  assert.ok(pendingId && pendingId !== "A" && pendingId !== "B");
  const pendingData = await (await admin("/tests/" + pendingId, "GET")).json();
  assert.equal(pendingData.fields.total4, undefined);
  assert.equal(pendingData.fields.subjects, undefined);
  await good.fill("成績が出る前に書いた");
  await save.click();
  await saved.waitFor();

  await openRegistration();
  await enterTest("2025-11-02", "未確定テスト");
  await page.getByText("同じ名前・開催日のテストが登録済みです。").waitFor();
  await page.getByRole("button", { name: "登録済みのテストを選ぶ" }).click();
  assert.equal(await selector.inputValue(), pendingId);

  await openRegistration();
  await enterTest("2025-11-01", "未確定テスト");
  await recent.getByRole("button", { name: /2025\/11\/01 未確定テスト/ }).waitFor();
  assert.deepEqual((await recent.getByRole("button").allTextContents()).map(text => text.slice(0, 10)),
    ["2025/11/02", "2025/11/01", "2025/10/01"]);

  await pending.click();
  await panel.getByRole("button", { name: "このテストの成績を入力" }).click();
  await page.getByLabel("4科の偏差値").fill("61");
  await page.getByText("得点・平均点・順位（任意）").click();
  await page.getByLabel("4科の得点", { exact: true }).fill("0");
  await page.getByRole("button", { name: "更新する", exact: true }).click();
  await page.getByRole("button", { name: "テスト成績を編集" }).waitFor();
  assert.match(await pending.innerText(), /成績あり.*振り返り済み/);
  assert.equal(await selector.inputValue(), pendingId);
  assert.equal(await good.inputValue(), "成績が出る前に書いた");
  const graded = await (await admin("/tests/" + pendingId, "GET")).json();
  assert.deepEqual(graded.fields.total4.mapValue.fields.score, { integerValue: "0" });
  assert.equal(graded.fields.total4.mapValue.fields.avg, undefined);
  assert.equal(graded.fields.subjects, undefined);
  assert.ok(graded.fields.reflection);

  await page.reload();
  await openTests();
  await pending.click();
  assert.equal(await selector.inputValue(), pendingId);
  assert.equal(await good.inputValue(), "成績が出る前に書いた");
  assert.equal(await selector.locator('option').count(), 5);
  assert.equal(await history.count(), 3);

  const bounds = await panel.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 375);
  for (const [id, original] of [["A", testA], ["B", testB]]) {
    const { fields } = await (await admin("/tests/" + id, "GET")).json();
    delete fields.reflection;
    assert.deepEqual(fields, encode(original).mapValue.fields);
  }
  assert.deepEqual(errors, []);
  console.log("375px: save, drafts, retry, history, reload, relogin, unchanged test scores");
} finally {
  await browser.close();
}
