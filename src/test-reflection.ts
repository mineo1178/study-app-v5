import { runTransaction, type DocumentReference } from "firebase/firestore";

export const reflectionSubjects = ["math", "japanese", "science", "social"] as const;
export const reflectionFields = ["good", "bad", "nextTry"] as const;
export type TestReflection = Partial<Record<typeof reflectionSubjects[number], Partial<Record<typeof reflectionFields[number], string>>>>;

export function hasReflection(reflection?: TestReflection) {
  return reflectionSubjects.some(subject => reflectionFields.some(field => reflection?.[subject]?.[field]?.trim()));
}

export function mergeReflection(current: TestReflection, original: TestReflection, draft: TestReflection): TestReflection {
  if (!hasReflection(draft)) throw new Error("Empty reflection");
  const merged = { ...current };
  for (const subject of reflectionSubjects) {
    for (const field of reflectionFields) {
      const value = draft[subject]?.[field]?.trim() ?? "";
      if (value !== (original[subject]?.[field] ?? "")) {
        merged[subject] = { ...merged[subject], [field]: value };
      }
    }
  }
  if (!hasReflection(merged)) throw new Error("Empty reflection");
  return merged;
}

export function saveTestReflection(ref: DocumentReference, original: TestReflection, draft: TestReflection, active: () => boolean) {
  return runTransaction(ref.firestore, async transaction => {
    if (!active()) throw new Error("Inactive session");
    const snapshot = await transaction.get(ref);
    if (!active() || !snapshot.exists()) throw new Error("Test unavailable");
    const reflection = mergeReflection(snapshot.data().reflection ?? {}, original, draft);
    transaction.update(ref, { reflection });
    return reflection;
  });
}
