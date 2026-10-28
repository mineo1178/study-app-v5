// Test-only administrator access: restricted to an explicit localhost demo project.
export const seedFamily = async (familyId: string, memberUids: string[], extraFields: Record<string, unknown> = {}) => {
  const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
  if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator endpoint required");
  const response = await fetch(`http://${endpoint}/v1/projects/demo-study-v182/databases/(default)/documents/families/${familyId}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { memberUids: { arrayValue: { values: memberUids.map((uid) => ({ stringValue: uid })) } }, ...extraFields } }),
  });
  if (!response.ok) throw new Error(`Family fixture failed: ${response.status} ${await response.text()}`);
};

export const seedReviewManager = async (familyId: string, parentUid: string, childUids: string[] | null, active = true) => {
  const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
  if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator endpoint required");
  const response = await fetch(`http://${endpoint}/v1/projects/demo-study-v182/databases/(default)/documents/families/${familyId}/reviewManagers/${parentUid}`, {
    method: childUids === null ? "DELETE" : "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    ...(childUids === null ? {} : { body: JSON.stringify({ fields: { active: { booleanValue: active }, schemaVersion: { integerValue: "1" }, childUids: { arrayValue: { values: childUids.map(uid => ({ stringValue: uid })) } } } }) }),
  });
  if (!response.ok) throw new Error(`Role fixture failed: ${response.status}`);
};
// Trusted fixture writes: loopback demo emulator only, never a client permission.
export const seedReviewData = async (familyId: string, uid: string, name: "questions" | "weaknesses", rows: { id: string }[]) => {
  const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
  if (!endpoint || !/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Local emulator endpoint required");
  const encode = (v: unknown): object => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, encode(x)])) } };
  for (const row of rows) {
    const response = await fetch(`http://${endpoint}/v1/projects/demo-study-v182/databases/(default)/documents/families/${familyId}/reviewUsers/${uid}/${name}/${row.id}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encode(v)])) }) });
    if (!response.ok) throw new Error("Review fixture failed");
  }
};
