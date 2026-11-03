import { describe, expect, it } from "vitest";
import { fictionalPlan } from "../../tests/review-plan-fixture";
import { adaptStudyPlan, canonical, parseBindings, parseStudyPlan, questionHash, topicSkill, updateRevision, type QuestionBinding } from "./exchange-plan";
import { sampleQuestions, nextProgress, type Answer } from "./model";
import { targetCandidates } from "./target-plan";
const q = { ...sampleQuestions[0], published: true };
const parsed = () => parseStudyPlan(JSON.stringify(fictionalPlan()), [q]);
const binding = async (): Promise<QuestionBinding> => ({ topicId: "fictional-topic-0", topicTitle: "架空の技能0", topicSkill: topicSkill(fictionalPlan().topics[0]), subject: "math", questionId: q.id, questionVersion: q.version, questionSha256: await questionHash(q), coverage: "partial", reason: "架空の部分確認" });
describe("exchange contract and application adapter", () => {
  it("validates all 23 fictional topics and rejects private/unknown fields, wrong types and references", () => {
    expect(parsed().topics).toHaveLength(23);
    const p = fictionalPlan();
    for (const bad of [{ ...p, revision: "1" }, { ...p, revision: 0 }, { ...p, schemaVersion: 1 }, { ...p, privatePath: "not permitted" }, { ...p, topics: [...p.topics, p.topics[0]] }, { ...p, evidenceRefs: ["ev-ffffffffffffffffffffffff"] }, { ...p, targetExam: { ...p.targetExam, date: "2026-02-30" } }, { ...p, topics: [{ ...p.topics[0], questionIds: ["unknown-id"] }, ...p.topics.slice(1)] }, { ...p, reviewPolicy: { ...p.reviewPolicy, intervalDays: [1, 2] } }]) expect(() => parseStudyPlan(JSON.stringify(bad), [q])).toThrow();
  });
  it("requires content-reviewed bindings: full question hash, version, subject and topic semantics", async () => {
    const p = parsed(), b = await binding(), raw = (rows: unknown[]) => JSON.stringify({ schemaVersion: "review-question-bindings/1", planId: p.planId, bindings: rows });
    expect(await parseBindings(raw([b]), p, [q])).toEqual([b]);
    for (const change of [{ questionId: "missing" }, { questionVersion: "changed" }, { subject: "science" }, { topicTitle: "another skill" }, { questionSha256: "0".repeat(64) }, { extra: true }]) await expect(parseBindings(raw([{ ...b, ...change }]), p, [q])).rejects.toThrow();
    await expect(parseBindings(raw([b, b]), p, [q])).rejects.toThrow();
    await expect(parseBindings(raw([b]), p, [{ ...q, prompt: "same-version content changed" }])).rejects.toThrow();
    expect(adaptStudyPlan(p, [], [q], 1).items).toEqual([]);
    const plan = adaptStudyPlan(p, [b], [q], 1); expect(plan.gaps).toHaveLength(23); expect(plan.items[0]).toMatchObject({ priority: 1, topicId: b.topicId });
    expect(adaptStudyPlan(p, [b], [{ ...q, version: "new" }], 1).items).toEqual([]);
  });
  it("preserves immutable source data, blocks rollback and same-revision edits across plan clearing", async () => {
    const p = parsed(), before = canonical(p), ledger = updateRevision({}, p);
    adaptStudyPlan(p, [await binding()], [q], 1); expect(canonical(p)).toBe(before);
    const next = { ...p, revision: 2, topics: p.topics.map((t, i) => i === 0 ? { ...t, priority: 3 } : t) };
    const updated = updateRevision(ledger, next); expect(() => updateRevision(updated, p)).toThrow();
    expect(() => updateRevision(ledger, { ...p, generatedAt: "2026-01-02T00:00:00Z" })).toThrow();
    expect(updateRevision(updated, structuredClone(next))).toEqual(updated);
  });
  it("selects 0..5 without padding and prioritizes due, relevant weaknesses and pre-exam unsettled questions", async () => {
    const p = parsed(), b = await binding();
    for (let n = 0; n <= 5; n++) {
      const qs = Array.from({ length: n }, (_, i) => ({ ...q, id: "pool" + i }));
      const bindings = await Promise.all(qs.map(async (q, i) => ({ ...b, questionId: q.id, questionSha256: await questionHash(q), topicId: p.topics[i].topicId, topicTitle: p.topics[i].title, topicSkill: topicSkill(p.topics[i]) })));
      expect(targetCandidates(qs, [], adaptStudyPlan(p, bindings, qs, 1), Date.parse("2026-11-02T00:00:00Z"))).toHaveLength(n);
    }
    const a = { id: "a", uid: "a", sessionId: "a", questionId: q.id, questionVersion: q.version, correct: false, selectedIndex: 0, answeredAt: Date.parse("2026-11-02T00:00:00Z"), elapsedMs: 0, mode: "daily", prompt: q.prompt, selected: "x", expected: "x", explanation: "x" } as Answer;
    const progress = nextProgress(undefined, a), plan = adaptStudyPlan(p, [b], [q], 1);
    expect(targetCandidates([q], [progress], plan, progress.nextAt - 1)).toEqual([]);
    expect(targetCandidates([q], [progress], plan, progress.nextAt)).toHaveLength(1);
  });
  it("enforces per-topic caps and reserves another subject when eligible", async () => {
    const p = parsed(); p.topics[1].subject = "science";
    const qs = Array.from({ length: 7 }, (_, i) => ({ ...q, id: "cap" + i, subject: i === 6 ? "science" as const : "math" as const }));
    const base = await binding(), bindings = await Promise.all(qs.map(async (q, i) => ({ ...base, topicId: i === 6 ? p.topics[1].topicId : p.topics[0].topicId, topicTitle: i === 6 ? p.topics[1].title : p.topics[0].title, topicSkill: topicSkill(i === 6 ? p.topics[1] : p.topics[0]), subject: q.subject, questionId: q.id, questionSha256: await questionHash(q) })));
    const selected = targetCandidates(qs, [], adaptStudyPlan(p, bindings, qs, 1), Date.parse("2026-11-02T00:00:00Z"));
    expect(selected).toHaveLength(3); expect(new Set(selected.map(c => c.question.subject)).size).toBe(2);
  });
  it("puts unsettled eligible reviews ahead of mature reviews just before the exam, without changing deadlines", async () => {
    const p = parsed(); p.targetExam.date = "2026-11-04";
    const qs = [q, { ...q, id: "unsettled" }], b = await binding();
    const bindings = [b, { ...b, questionId: qs[1].id, questionSha256: await questionHash(qs[1]), topicId: p.topics[1].topicId, topicTitle: p.topics[1].title, topicSkill: topicSkill(p.topics[1]) }];
    const fields = { id: "a", uid: "a", sessionId: "a", questionVersion: q.version, correct: true, selectedIndex: 1, answeredAt: Date.parse("2026-10-01T00:00:00Z"), elapsedMs: 0, mode: "daily", prompt: q.prompt, selected: "x", expected: "x", explanation: "x" } as Answer;
    const mature = { ...nextProgress(undefined, { ...fields, questionId: q.id }), reviewStage: 3 };
    const unsettled = nextProgress(undefined, { ...fields, questionId: qs[1].id, correct: false, answeredAt: Date.parse("2026-11-01T00:00:00Z") });
    const before = structuredClone([mature, unsettled]);
    const selected = targetCandidates(qs, before, adaptStudyPlan(p, bindings, qs, 1), Date.parse("2026-11-03T00:00:00Z"));
    expect(selected.map(c => c.question.id)).toEqual(["unsettled", q.id]); expect(before).toEqual([mature, unsettled]);
  });
});
