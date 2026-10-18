import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCache } from "./session-cache";
afterEach(() => vi.unstubAllGlobals());
const setup = () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
  return data;
};
describe("session cache ownership", () => {
  it("keeps A pending work unavailable to B and other projects", () => {
    setup(); const a = createSessionCache("p", "f", "A"), b = createSessionCache("p", "f", "B");
    a.set("study-app-v5-f-session-operations", [{ operationId: "save-A" }]);
    expect(b.get("study-app-v5-f-session-operations")).toBeNull();
    expect(createSessionCache("other", "f", "A").get("study-app-v5-f-session-operations")).toBeNull();
    expect(createSessionCache("p", "f", "A").get("study-app-v5-f-session-operations")).toEqual([{ operationId: "save-A" }]);
  });
  it("preserves legacy pending work without automatic replay, and never replaces current work", () => {
    const data = setup(); const key = "study-app-v5-f-session-operations";
    data.set(key, JSON.stringify([{ operationId: "legacy" }]));
    const a = createSessionCache("p", "f", "A"), b = createSessionCache("p", "f", "B");
    expect(a.legacyPending()).toBe(true); expect(a.get(key)).toBeNull();
    a.set(key, [{operationId: "current"}]);
    a.adoptLegacy(); expect(a.get(key)).toEqual([{operationId: "current"}, { operationId: "legacy" }]);
    expect(data.get(key)).toBe(JSON.stringify([{ operationId: "legacy" }]));
    b.adoptLegacy(); expect(b.get(key)).toBeNull();
  });
});
