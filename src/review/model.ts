export const SUBJECTS = { math: "算数", japanese: "国語", science: "理科", social: "社会" } as const;
export const TEST_KINDS = ["未指定", "判定", "組分け", "カリテ", "その他"] as const;
export type Subject = keyof typeof SUBJECTS;
export type Question = { id: string; version: string; subject: Subject; unit: string; prompt: string; choices: string[]; correctIndex: number; explanation: string; testKind: string; source: string };
export type Weakness = { id: string; subject: Subject; unit: string; mistake: string; point: string; testKind: string; questionIds: string[] };
export type Answer = { id: string; uid: string; sessionId: string; questionId: string; questionVersion: string; selectedIndex: number; correct: boolean; answeredAt: number; elapsedMs: number; mode: "daily" | "retry"; prompt: string; selected: string; expected: string; explanation: string };
export type Progress = { questionId: string; questionVersion: string; count: number; firstCorrect: boolean; latestCorrect: boolean; previousCorrect: boolean; latestAt: number; nextAt: number; latestAttemptId: string; recordedAttemptId: string; latestMode: "daily" | "retry" };
export type Draft = { id: string; uid: string; mode: "daily" | "retry"; startedAt: number; questionStartedAt: number; questions: Question[]; answers: Answer[]; finishedAt: number | null };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
export const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const subject = (value: unknown): value is Subject => typeof value === "string" && Object.hasOwn(SUBJECTS, value);
export function validateQuestion(value: unknown): asserts value is Question {
  if (!record(value) || Object.keys(value).sort().join() !== ["id", "version", "subject", "unit", "prompt", "choices", "correctIndex", "explanation", "testKind", "source"].sort().join() ||
    !validId(value.id) || !validId(value.version) || !subject(value.subject) || !text(value.unit, 100) || !text(value.prompt, 1000) ||
    !Array.isArray(value.choices) || value.choices.length !== 4 || value.choices.some(c => !text(c, 300) || c !== c.trim()) || new Set(value.choices).size !== 4 ||
    !Number.isInteger(value.correctIndex) || Number(value.correctIndex) < 0 || Number(value.correctIndex) > 3 || !text(value.explanation, 1000) ||
    !TEST_KINDS.includes(value.testKind as typeof TEST_KINDS[number]) || typeof value.source !== "string" || value.source.length > 300) throw new Error("問題の形式を確認してください。四択・異なる選択肢・正解番号0〜3が必要です。");
}
export function validateWeakness(value: unknown): asserts value is Weakness {
  if (!record(value) || Object.keys(value).sort().join() !== ["id", "subject", "unit", "mistake", "point", "testKind", "questionIds"].sort().join() || !validId(value.id) || !subject(value.subject) ||
    !text(value.unit, 100) || !text(value.mistake, 1000) || !text(value.point, 1000) || !TEST_KINDS.includes(value.testKind as typeof TEST_KINDS[number]) ||
    !Array.isArray(value.questionIds) || value.questionIds.length > 5 || value.questionIds.some(id => !validId(id)) || new Set(value.questionIds).size !== value.questionIds.length) throw new Error("苦手分野の入力を確認してください。対応問題は5問までです。");
}
export function parseQuestions(input: string): Question[] {
  if (input.length > 200000) throw new Error("取り込みは200KB以下にしてください。");
  const items: unknown = JSON.parse(input);
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) throw new Error("1〜50問のJSON配列にしてください。");
  const questions = items.map(item => {
    if (!record(item) || Object.keys(item).some(key => !["subject", "unit", "prompt", "choices", "correctIndex", "explanation", "testKind", "source"].includes(key))) throw new Error("未対応の項目があります。");
    const question = { ...item, id: crypto.randomUUID(), version: crypto.randomUUID() };
    validateQuestion(question);
    return question;
  });
  if (new Set(questions.map(q => `${q.subject}:${q.unit}:${q.prompt}`)).size !== questions.length) throw new Error("同じ問題が重複しています。");
  return questions;
}
export const getJstDay = (at: number) => new Date(at + 32400000).toISOString().slice(0, 10);
export function selectQuestions(questions: Question[], progress: Progress[], now: number, random = Math.random, weaknessIds: string[] = []): Question[] {
  const byId = new Map(progress.map(p => [p.questionId, p]));
  return questions.map(q => {
    const p = byId.get(q.id);
    const current = p?.questionVersion === q.version ? p : undefined;
    // Select the review pool first, then shuffle within each priority.
    const duePriority = weaknessIds.includes(q.id) ? 1 : 2;
    const priority = !current ? duePriority : current.latestCorrect ? (current.nextAt <= now ? duePriority : 3) : 0;
    return { q, priority, roll: random() };
  }).sort((a, b) => a.priority - b.priority || a.roll - b.roll).slice(0, 5).map(item => item.q);
}
export function answerQuestion(draft: Draft, selectedIndex: number, now: number): Draft {
  const index = draft.answers.length, q = draft.questions[index];
  if (!q || draft.finishedAt !== null || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) throw new Error("回答を選んでください。");
  const at = Math.max(now, draft.questionStartedAt);
  const answer: Answer = { id: `${draft.id}_${index}`, uid: draft.uid, sessionId: draft.id, questionId: q.id, questionVersion: q.version, selectedIndex, correct: selectedIndex === q.correctIndex, answeredAt: at, elapsedMs: at - draft.questionStartedAt, mode: draft.mode, prompt: q.prompt, selected: q.choices[selectedIndex], expected: q.choices[q.correctIndex], explanation: q.explanation };
  return { ...draft, answers: [...draft.answers, answer], questionStartedAt: at, finishedAt: index + 1 === draft.questions.length ? at : null };
}
export function nextProgress(previous: Progress | undefined, answer: Answer): Progress {
  if (previous && previous.latestAt > answer.answeredAt) return { ...previous, count: previous.count + 1, recordedAttemptId: answer.id };
  const current = previous?.questionVersion === answer.questionVersion ? previous : undefined;
  return { questionId: answer.questionId, questionVersion: answer.questionVersion, count: (previous?.count ?? 0) + 1, firstCorrect: previous?.firstCorrect ?? answer.correct,
    previousCorrect: current?.latestCorrect ?? answer.correct, latestCorrect: answer.correct, latestAt: answer.answeredAt,
    nextAt: answer.answeredAt + (answer.correct ? (answer.mode === "retry" ? 86400000 : 3 * 86400000) : 0), latestAttemptId: answer.id, recordedAttemptId: answer.id, latestMode: answer.mode };
}
export const progressLabel = (p: Progress | undefined) => !p ? "未回答" : !p.latestCorrect ? "もう一度確認" : p.latestMode === "retry" ? "直後の再挑戦で正解・後日も確認しよう" : !p.previousCorrect ? "前回の誤答から正解！" : "正解できたよ";
export function restoreDraft(raw: string | null, uid: string): Draft | null {
  if (!raw || raw.length > 100000) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (!record(d) || !validId(d.id) || d.uid !== uid || !["daily", "retry"].includes(String(d.mode)) || !Array.isArray(d.questions) || !Array.isArray(d.answers) || d.questions.length < 1 || d.questions.length > 5 || d.answers.length > d.questions.length ||
      !Number.isSafeInteger(d.startedAt) || Number(d.startedAt) < 0 || !Number.isSafeInteger(d.questionStartedAt) || Number(d.questionStartedAt) < Number(d.startedAt)) return null;
    d.questions.forEach(validateQuestion);
    if (new Set(d.questions.map(q => q.id)).size !== d.questions.length) return null;
    // Rebuild trusted answer fields from the snapshotted questions.
    let rebuilt: Draft = { id: d.id, uid, mode: d.mode as Draft["mode"], questions: d.questions, startedAt: Number(d.startedAt), questionStartedAt: Number(d.startedAt), answers: [], finishedAt: null };
    for (const a of d.answers) {
      if (!record(a) || !Number.isSafeInteger(a.answeredAt) || Number(a.answeredAt) < rebuilt.questionStartedAt) return null;
      rebuilt = answerQuestion(rebuilt, Number(a.selectedIndex), Number(a.answeredAt));
    }
    return rebuilt;
  } catch { return null; }
}
// Fictional fixtures are exposed only when the existing sample mode is selected.
export const sampleQuestions: Question[] = [
  ["math", "計算", "6 × 7 は？", ["40", "42", "44", "48"], 1, "6を7回たすと42です。"],
  ["japanese", "ことば", "「大きい」の反対の意味は？", ["小さい", "広い", "長い", "高い"], 0, "大きい・小さいは反対の意味です。"],
  ["science", "水", "水がこおる温度の目安は？", ["100℃", "50℃", "0℃", "20℃"], 2, "ふつうの気圧では0℃が目安です。"],
  ["social", "方位", "地図の上が北のとき、右は？", ["北", "南", "西", "東"], 3, "北を上にすると右が東です。"],
  ["math", "分数", "1/2 と同じ大きさは？", ["1/3", "2/4", "3/4", "1/4"], 1, "分母と分子を同じ数でかけても大きさは同じです。"],
].map((row, index) => ({ id: `sample-${index}`, version: "sample-v1", subject: row[0] as Subject, unit: row[1] as string, prompt: row[2] as string, choices: row[3] as string[], correctIndex: row[4] as number, explanation: row[5] as string, testKind: "未指定", source: "架空サンプル（実際のテストとは無関係）" }));
