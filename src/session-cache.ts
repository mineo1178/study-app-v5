// Legacy family caches remain intact; unowned pending work is never replayed automatically.
export const createSessionCache = (project: string, family: string, uid: string) => {
  const prefix = `study-app-v5-${family}-`;
  const key = (legacy: string) => `${legacy}:${project}:${uid}`;
  const get = (legacy: string) => {
    try { return JSON.parse(localStorage.getItem(key(legacy)) ?? "null"); } catch { return null; }
  };
  const set = (legacy: string, value: unknown) => {
    localStorage.setItem(key(legacy), JSON.stringify(value));
  };
  const legacyPending = () => {
    try {
      if (localStorage.getItem(prefix + "legacy-owner")) return false;
      return ["session-operations", "pending-task-updates"].some(suffix => {
        const value = JSON.parse(localStorage.getItem(prefix + suffix) ?? "null");
        return value && Object.keys(value).length > 0;
      });
    } catch { return false; }
  };
  const adoptLegacy = () => {
    if (!legacyPending()) return;
    // Called only after membership verification and explicit ownership confirmation.
    for (const suffix of ["tasks", "tests", "idol-game", "session-operations", "pending-task-updates"]) {
      const legacy = prefix + suffix;
      const raw = localStorage.getItem(legacy);
      if (raw === null) continue;
      const existing = get(legacy);
      const incoming = JSON.parse(raw);
      if (suffix === "session-operations") {
        const current = existing ?? [];
        set(legacy, [...current, ...incoming.filter((operation: { operationId: string }) => !current.some((saved: { operationId: string }) => saved.operationId === operation.operationId))]);
      } else if (suffix === "pending-task-updates") {
        set(legacy, { ...incoming, ...existing });
      } else if (existing === null) localStorage.setItem(key(legacy), raw);
    }
    localStorage.setItem(prefix + "legacy-owner", uid);
  };
  return { get, set, legacyPending, adoptLegacy };
};
