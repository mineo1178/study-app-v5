import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendDeviceTestEvent,
  DEVICE_TEST_HISTORY_LIMIT,
  isDeviceTestEnabled,
  shortenDeviceTestId,
  configureDiagnostics, DEVICE_TEST_TTL, exportDiagnostics, getDiagnosticHistory,
  isDiagnosticTransitionAllowed, normalizeDiagnosticError, recordDiagnostic, safeDiagnosticEvents, scopedDiagnosticRecorder, subscribeDiagnostics,
} from "./device-test";
const testCrypto = globalThis.crypto;

describe("device test diagnostics", () => {
  it("is enabled only by deviceTest=1", () => {
    expect(isDeviceTestEnabled("?deviceTest=1")).toBe(true);
    expect(isDeviceTestEnabled("?foo=x&deviceTest=1")).toBe(true);
    expect(isDeviceTestEnabled("?deviceTest=0")).toBe(false);
    expect(isDeviceTestEnabled("")).toBe(false);
  });

  it("shortens identifiers without exposing the full value", () => {
    expect(shortenDeviceTestId("short-id")).toBe("short-id");
    expect(shortenDeviceTestId("1234567890abcdef")).toBe("12345678…cdef");
    expect(shortenDeviceTestId()).toBe("-");
  });

  it("keeps the newest 50 local events", () => {
    let events = [] as ReturnType<typeof appendDeviceTestEvent>;
    for (let index = 0; index < DEVICE_TEST_HISTORY_LIMIT + 5; index += 1) {
      events = appendDeviceTestEvent(events, { type: "RETRY", detail: String(index) }, index);
    }
    expect(events).toHaveLength(DEVICE_TEST_HISTORY_LIMIT);
    expect(events[0]).toMatchObject({ detail: "54", at: 54 });
    expect(events.at(-1)).toMatchObject({ detail: "5", at: 5 });
  });
});

describe("safe always-on diagnostics", () => {
  let values: Map<string, string>;
  beforeEach(async () => {
    values = new Map();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal("crypto", testCrypto);
    await configureDiagnostics("reset-test-scope");
    await configureDiagnostics("demo-env:member-a:session-1");
  });
  it("keeps only 50 events and removes expired/future/corrupt events", () => {
    recordDiagnostic({ type: "AUTH", source: "auth", code: "AUTHENTICATED" });
    for (let i = 0; i < 80; i++) recordDiagnostic({ type: "BUTTON", source: "study", code: "SAVING", disabled: true });
    expect(getDiagnosticHistory()).toHaveLength(50);
    expect(JSON.parse(exportDiagnostics("v1.86.3", "Windows")).status.auth).toBe("AUTHENTICATED");
    const now = Date.now();
    expect(safeDiagnosticEvents([{ type: "START", at: now - DEVICE_TEST_TTL }, { type: "START", at: now + 1 }, { type: "BAD", at: now }, { type: "STOP", at: now - 1 }], now)).toMatchObject([{ type: "STOP" }]);
  });
  it("strips IDs/free text/unknown fields/codes from memory, storage and export", () => {
    recordDiagnostic({ type: "SAVE_FAILURE", source: "study", code: "permission-denied", taskId: "secret-task", sessionId: "secret-session", detail: "secret-email token signerKey document" });
    const serialized = exportDiagnostics("v1.86.3", "Windows Chrome/120 secret-user-agent");
    expect(serialized).toContain("permission-denied");
    expect(serialized).not.toMatch(/secret|taskId|sessionId|signerKey|detail/);
    expect([...values.values()].join(" ")).not.toMatch(/member-a|session-1|secret/);
    expect(safeDiagnosticEvents([{ type: "BUTTON", at: Date.now(), source: "secret", code: "secret", email: "secret", disabled: true }])[0]).toEqual(expect.objectContaining({ disabled: true }));
    expect(normalizeDiagnosticError({ code: "firestore/permission-denied", message: "secret" })).toBe("permission-denied");
    expect(normalizeDiagnosticError({ code: "secret-error" })).toBe("UNKNOWN");
    expect(normalizeDiagnosticError({ get code() { throw new Error("secret"); } })).toBe("UNKNOWN");
  });
  it("preserves reload within a scope and clears on UID/session/environment change", async () => {
    recordDiagnostic({ type: "START", source: "study" });
    await configureDiagnostics("demo-env:member-a:session-1");
    expect(getDiagnosticHistory()).toHaveLength(1);
    for (const identity of ["demo-env:member-b:session-1", "demo-env:member-b:session-2", "other-env:member-b:session-2"]) {
      await configureDiagnostics(identity);
      expect(getDiagnosticHistory()).toHaveLength(0);
      recordDiagnostic({ type: "STOP", source: "study" });
    }
  });
  it("restores safe events after actual module reload and drops late results from an old UID", async () => {
    recordDiagnostic({ type: "BUTTON", source: "study", code: "SAVE_PENDING", disabled: true });
    vi.resetModules();
    const reloaded = await import("./device-test");
    await reloaded.configureDiagnostics("demo-env:member-a:session-1");
    expect(reloaded.getDiagnosticHistory()).toMatchObject([{ code: "SAVE_PENDING", disabled: true }]);
    const late = scopedDiagnosticRecorder();
    await configureDiagnostics("demo-env:member-b:session-2");
    late({ type: "SAVE_FAILURE", source: "study", code: "permission-denied" });
    expect(getDiagnosticHistory()).toHaveLength(0);
  });
  it("storage and listener failures never escape; memory remains usable", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("private mode"); }, setItem: () => { throw new Error("quota"); } });
    await expect(configureDiagnostics("private-session")).resolves.toBeUndefined();
    const unsubscribe = subscribeDiagnostics(() => { throw new Error("panel failed"); });
    expect(() => recordDiagnostic({ type: "START", source: "study" })).not.toThrow();
    unsubscribe();
    expect(getDiagnosticHistory()).toMatchObject([{ type: "START" }]);
  });
  it("records disabled state without any click and identifies invalid timer transitions", () => {
    recordDiagnostic({ type: "BUTTON", source: "calculation_7", button: "START", disabled: true, reachable: false, code: "OTHER_TIMER" });
    expect(getDiagnosticHistory()[0]).toMatchObject({ code: "OTHER_TIMER", disabled: true, reachable: false });
    expect(getDiagnosticHistory().some(event => event.type === "CLICK")).toBe(false);
    expect(isDiagnosticTransitionAllowed("idle", "saving")).toBe(false);
    expect(isDiagnosticTransitionAllowed("running", "stopping")).toBe(true);
    expect(isDiagnosticTransitionAllowed("failed", "retryable")).toBe(true);
  });
  it("retains other retry sources when a calculation retry succeeds", () => {
    recordDiagnostic({ type: "SAVE_FAILURE", source: "study", retry: true });
    recordDiagnostic({ type: "SAVE_FAILURE", source: "calculation_1", retry: true });
    recordDiagnostic({ type: "SAVE_SUCCESS", source: "calculation_1" });
    expect(JSON.parse(exportDiagnostics("v1.86.3", "Windows")).status.retryPending).toBe(true);
    recordDiagnostic({ type: "QUEUE", source: "study", retry: false });
    expect(JSON.parse(exportDiagnostics("v1.86.3", "Windows")).status.retryPending).toBe(false);
  });
});
