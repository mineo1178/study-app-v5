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
