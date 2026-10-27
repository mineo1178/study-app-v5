export type ReviewManagerRole = { active: boolean; childUids: string[]; schemaVersion: 1 };
export function assignedReviewChildren(role: unknown, members: unknown, parentUid: string): string[] {
  if (!role || typeof role !== "object" || Array.isArray(role) || !Array.isArray(members) || !members.includes(parentUid)) return [];
  const r = role as Record<string, unknown>;
  if (Object.keys(r).sort().join() !== "active,childUids,schemaVersion" || r.active !== true || r.schemaVersion !== 1 || !Array.isArray(r.childUids) || r.childUids.length > 10 || new Set(r.childUids).size !== r.childUids.length ||
    r.childUids.some(uid => typeof uid !== "string" || !uid || uid.length > 128 || uid.includes("/") || uid === "." || uid === "..")) return [];
  return r.childUids.filter((uid): uid is string => members.includes(uid));
}
