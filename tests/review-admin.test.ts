import { describe, expect, it } from "vitest";
import { normalizeManifest, buildPlan, verifyPlan, hash, validateTarget, validateConnectionTarget } from "../scripts/review-admin-core.mjs";
import { sampleQuestions } from "../src/review/model";
const target = { projectId: "demo-admin-test", familyId: "family", uid: "child" };
const state = { members: ["child"], questions: [], weaknesses: [] };
const manifest = () => ({ schemaVersion: 1, questions: [{ ...sampleQuestions[0], published: false }], weaknesses: [] });
describe("trusted PC review management", () => {
  it("prepares import JSON with stable saved IDs, private publication and existing validator", () => {
    const { id, version, ...row } = sampleQuestions[0]; void id; void version;
    const m = normalizeManifest([row]); expect(m.questions[0].published).toBe(false); expect(normalizeManifest(m)).toEqual(m);
  });
  it.each([{}, { ...target, uid: "../child" }, { ...target, familyId: "bad/path" }, { ...target, extra: true }])("rejects invalid target %j", t => expect(() => validateTarget(t)).toThrow());
  it.each([{ correctIndex: 4 }, { choices: ["a", "a", "b", "c"] }, { explanation: "" }, { extra: true }, { published: undefined }])("rejects bad problem %j", patch => expect(() => normalizeManifest({ ...manifest(), questions: [{ ...manifest().questions[0], ...patch }] })).toThrow());
  it("rejects unknown manifest fields, duplicate IDs, and >50 total records", () => {
    expect(() => normalizeManifest({ ...manifest(), uid: "other" })).toThrow();
    expect(() => normalizeManifest({ ...manifest(), questions: Array(2).fill(manifest().questions[0]) })).toThrow();
    expect(() => normalizeManifest({ ...manifest(), questions: Array(51).fill(manifest().questions[0]) })).toThrow();
  });
  it("plans without changing input, backs up old data, and accepts exact approved plan", () => {
    const original = JSON.stringify(state), plan = buildPlan(target, manifest(), state);
    expect(JSON.stringify(state)).toBe(original); expect(plan.before[0].data).toBeNull(); expect(plan.writes).toHaveLength(1);
    expect(verifyPlan(plan, target, state)).toEqual(plan);
    const saved = { ...state, questions: manifest().questions }; expect(buildPlan(target, manifest(), saved).writes).toEqual([]);
  });
  it("requires family membership and binds plan to project/family/UID/snapshot", () => {
    expect(() => buildPlan(target, manifest(), { ...state, members: [] })).toThrow();
    const p = buildPlan(target, manifest(), state);
    for (const changed of [{ ...target, uid: "other" }, { ...target, projectId: "demo-other" }, { ...target, familyId: "other" }]) expect(() => verifyPlan(p, changed, state)).toThrow();
    expect(() => verifyPlan(p, target, { ...state, members: ["child", "other"] })).toThrow();
    expect(() => verifyPlan(p, target, { ...state, questions: [sampleQuestions[1]] })).toThrow();
    expect(() => verifyPlan({ ...p, writes: [{ collection: "tasks", id: "x", data: {} }] }, target, state)).toThrow();
  });
  it("rejects cross-import duplicates, bad weakness references and stale versions", () => {
    const q = manifest().questions[0], saved = { ...state, questions: [q] };
    expect(() => buildPlan(target, { ...manifest(), questions: [{ ...q, id: "duplicate" }] }, saved)).toThrow();
    expect(() => buildPlan(target, { ...manifest(), questions: [{ ...q, explanation: "changed" }] }, saved)).toThrow();
    const edit = buildPlan(target, { ...manifest(), questions: [{ ...q, explanation: "changed", version: "new" }] }, saved);
    expect(edit.before[0].data).toEqual(q);
    expect(() => buildPlan(target, { schemaVersion: 1, questions: [], weaknesses: [{ id: "w", subject: "math", unit: "u", mistake: "m", point: "p", testKind: "未指定", questionIds: ["missing"] }] }, state)).toThrow();
  });
  it("bounds collection size and plan digest is insensitive to object key order", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ ...sampleQuestions[0], id: `q${i}`, prompt: `p${i}` }));
    expect(() => buildPlan(target, manifest(), { ...state, questions: rows })).toThrow();
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
  });
});
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
describe("administrator CLI fails closed before connecting", () => {
  it("prepare is local-only, nonpublic and refuses output overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-admin-unit-")), input = join(dir, "input.json"), output = join(dir, "output.json");
    const { id, version, ...row } = sampleQuestions[0]; void id; void version;
    writeFileSync(input, JSON.stringify([row]));
    const run = () => spawnSync(process.execPath, [resolve("scripts/review-admin.mjs"), "prepare", "--input", input, "--output", output], { encoding: "utf8", windowsHide: true });
    expect(run().status).toBe(0); const first = readFileSync(output, "utf8"); expect(JSON.parse(first).questions[0].published).toBe(false);
    expect(run().status).toBe(1); expect(readFileSync(output, "utf8")).toBe(first);
  });
  it("rejects missing confirmations and unsupported arguments without an SDK", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-admin-target-")), targetFile = join(dir, "target.json"); writeFileSync(targetFile, JSON.stringify(target));
    const result = spawnSync(process.execPath, [resolve("scripts/review-admin.mjs"), "apply", "--target", targetFile], { encoding: "utf8", windowsHide: true, env: { ...process.env, REVIEW_ADMIN_SDK_DIR: "" } });
    expect(result.status).toBe(1); expect(JSON.parse(result.stdout).code).toBe("TARGET_CONFIRMATION_REQUIRED");
    const bad = spawnSync(process.execPath, [resolve("scripts/review-admin.mjs"), "prepare", "input", targetFile], { encoding: "utf8", windowsHide: true }); expect(bad.status).toBe(1); expect(JSON.parse(bad.stdout).code).toBe("ARGUMENT_REJECTED");
  });
});

it('rejects production/retired/wrong-family targets before SDK or network initialization', () => {
  for (const t of [{...target,projectId:'study-app-v5'}, {...target,projectId:'study-app-v5-cloud-test'}, {...target,projectId:'study-app-v5-cloud-test-2',familyId:'wrong'}]) expect(() => validateConnectionTarget(t)).toThrow('CLOUD_TARGET_NOT_ALLOWED');
  expect(() => validateConnectionTarget({...target,projectId:'study-app-v5-cloud-test-2',familyId:'study-v5-cloud-test-2'})).not.toThrow();
  const dir=mkdtempSync(join(tmpdir(),'review-blocked-project-')), file=join(dir,'target.json');writeFileSync(file,JSON.stringify({...target,projectId:'study-app-v5'}));
  for(const command of ['export','plan','apply']) {const r=spawnSync(process.execPath,[resolve('scripts/review-admin.mjs'),command,'--target',file,'--confirm-project','study-app-v5','--confirm-family',target.familyId],{encoding:'utf8',windowsHide:true,env:{...process.env,REVIEW_ADMIN_SDK_DIR:''}});expect(r.status).toBe(1);expect(JSON.parse(r.stdout).code).toBe('CLOUD_TARGET_NOT_ALLOWED');}
});
