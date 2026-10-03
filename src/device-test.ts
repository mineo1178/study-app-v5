export const DEVICE_TEST_HISTORY_LIMIT = 50;

export type DeviceTestEventType =
  | "START"
  | "STOP"
  | "PAUSE"
  | "RESUME"
  | "RESTORE"
  | "RETRY"
  | "ONLINE"
  | "OFFLINE";

export type DeviceTestEvent = {
  id: string;
  type: DeviceTestEventType;
  at: number;
  taskId?: string;
  sessionId?: string;
  detail?: string;
};

export const isDeviceTestEnabled = (search: string) =>
  new URLSearchParams(search).get("deviceTest") === "1";

export const shortenDeviceTestId = (value?: string | null) => {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
};

export const appendDeviceTestEvent = (
  current: DeviceTestEvent[],
  event: Omit<DeviceTestEvent, "id" | "at">,
  at = Date.now(),
) => [
  {
    ...event,
    at,
    id: `${at}-${event.type}-${current.length}`,
  },
  ...current,
].slice(0, DEVICE_TEST_HISTORY_LIMIT);
