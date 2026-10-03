import { describe, expect, it } from "vitest";
import {
  appendDeviceTestEvent,
  DEVICE_TEST_HISTORY_LIMIT,
  isDeviceTestEnabled,
  shortenDeviceTestId,
} from "./device-test";

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
