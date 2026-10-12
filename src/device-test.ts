export const DEVICE_TEST_HISTORY_LIMIT = 50;

export type DeviceTestEventType =
  | "START"
  | "STOP"
  | "PAUSE"
  | "RESUME"
  | "RESTORE"
  | "RETRY"
  | "ONLINE"
  | "OFFLINE"
  | "REVIEW_PENDING"
  | "REVIEW_CONFIRMED"
  | "BUTTON" | "POINTER" | "CLICK" | "HANDLER" | "GUARD"
  | "STATE" | "INVALID_TRANSITION" | "AUTH" | "READ_START" | "READ_SUCCESS" | "READ_FAILURE"
  | "SAVE_START" | "SAVE_SUCCESS" | "SAVE_FAILURE" | "QUEUE";

export type DeviceTestEvent = {
  id: string;
  type: DeviceTestEventType;
  at: number;
  taskId?: string;
  sessionId?: string;
  detail?: string;
  source?: DiagnosticSource;
  code?: DiagnosticCode;
  button?: "START" | "PAUSE" | "STOP" | "SAVE" | "RESUME";
  state?: TimerDiagnosticState;
  from?: TimerDiagnosticState;
  disabled?: boolean;
  reachable?: boolean;
  online?: boolean;
  retry?: boolean;
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

export const DEVICE_TEST_TTL = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "study-device-diagnostics-v2";
export type DiagnosticSource = "study" | "calculation" | "calculation_1" | "calculation_2" | "calculation_3" | "calculation_4" | "calculation_5" | "calculation_6" | "calculation_7" | "auth" | "family" | "network";
export type TimerDiagnosticState = "idle" | "running" | "paused" | "stopping" | "review_pending" | "saving" | "saved" | "failed" | "retryable";
export type DiagnosticCode = "NONE" | "SAVING" | "SAVE_PENDING" | "ZERO_TIME" | "OTHER_TIMER" | "UNSAVED_TIME" | "BUSY" | "WRONG_PHASE" | "AUTHENTICATED" | "SIGNED_OUT" | "SAMPLE" | "MEMBER_ALLOWED" | "MEMBER_DENIED" | "READ_ALLOWED" | "UNKNOWN" | "permission-denied" | "unauthenticated" | "unavailable" | "deadline-exceeded" | "cancelled" | "aborted" | "failed-precondition" | "resource-exhausted" | "not-found" | "already-exists" | "invalid-argument" | "internal" | "unknown" | "auth/network-request-failed" | "auth/user-token-expired";
const eventTypes: DeviceTestEventType[] = ["START", "STOP", "PAUSE", "RESUME", "RESTORE", "RETRY", "ONLINE", "OFFLINE", "REVIEW_PENDING", "REVIEW_CONFIRMED", "BUTTON", "POINTER", "CLICK", "HANDLER", "GUARD", "STATE", "INVALID_TRANSITION", "AUTH", "READ_START", "READ_SUCCESS", "READ_FAILURE", "SAVE_START", "SAVE_SUCCESS", "SAVE_FAILURE", "QUEUE"];
const sources: DiagnosticSource[] = ["study", "calculation", "calculation_1", "calculation_2", "calculation_3", "calculation_4", "calculation_5", "calculation_6", "calculation_7", "auth", "family", "network"];
const states: TimerDiagnosticState[] = ["idle", "running", "paused", "stopping", "review_pending", "saving", "saved", "failed", "retryable"];
const codes: DiagnosticCode[] = ["NONE", "SAVING", "SAVE_PENDING", "ZERO_TIME", "OTHER_TIMER", "UNSAVED_TIME", "BUSY", "WRONG_PHASE", "AUTHENTICATED", "SIGNED_OUT", "SAMPLE", "MEMBER_ALLOWED", "MEMBER_DENIED", "READ_ALLOWED", "UNKNOWN", "permission-denied", "unauthenticated", "unavailable", "deadline-exceeded", "cancelled", "aborted", "failed-precondition", "resource-exhausted", "not-found", "already-exists", "invalid-argument", "internal", "unknown", "auth/network-request-failed", "auth/user-token-expired"];
export const normalizeDiagnosticError = (error: unknown): DiagnosticCode => {
  try {
    const raw = (error as { code?: unknown })?.code;
    const code = typeof raw === "string" ? raw.replace(/^firestore\//, "") : "UNKNOWN";
    return codes.includes(code as DiagnosticCode) && (code.includes("-") || code === "internal" || code === "unknown") ? code as DiagnosticCode : "UNKNOWN";
  } catch { return "UNKNOWN"; }
};

// Reconstruct every field: legacy free text/IDs and untrusted stored properties never leave this boundary.
export const safeDiagnosticEvents = (input: unknown, now = Date.now()): DeviceTestEvent[] => {
  if (!Array.isArray(input)) return [];
  return input.filter((entry) => entry && eventTypes.includes(entry.type) && Number.isFinite(entry.at) && entry.at <= now && now - entry.at < DEVICE_TEST_TTL).slice(0, DEVICE_TEST_HISTORY_LIMIT).map((entry, index) => {
    const event: DeviceTestEvent = { id: `${entry.at}-${index}`, type: entry.type, at: entry.at };
    if (sources.includes(entry.source)) event.source = entry.source;
    if (codes.includes(entry.code)) event.code = entry.code;
    if (["START", "PAUSE", "STOP", "SAVE", "RESUME"].includes(entry.button)) event.button = entry.button;
    if (states.includes(entry.state)) event.state = entry.state;
    if (states.includes(entry.from)) event.from = entry.from;
    for (const key of ["disabled", "reachable", "online", "retry"] as const) if (typeof entry[key] === "boolean") event[key] = entry[key];
    return event;
  });
};

let history: DeviceTestEvent[] = [];
type DiagnosticStatus = { auth: "UNKNOWN" | "AUTHENTICATED" | "SIGNED_OUT" | "SAMPLE"; family: "UNKNOWN" | "READ_ALLOWED" | "MEMBER_ALLOWED" | "MEMBER_DENIED" | "permission-denied"; retryPending: boolean };
const cleanStatus = (input?: Partial<DiagnosticStatus>): DiagnosticStatus => ({
  auth: ["AUTHENTICATED", "SIGNED_OUT", "SAMPLE"].includes(input?.auth ?? "") ? input!.auth! : "UNKNOWN",
  family: ["READ_ALLOWED", "MEMBER_ALLOWED", "MEMBER_DENIED", "permission-denied"].includes(input?.family ?? "") ? input!.family! : "UNKNOWN",
  retryPending: input?.retryPending === true,
});
let status = cleanStatus();
let pendingSources = new Set<DiagnosticSource>();
let scope = "";
let generation = 0;
let scopeIdentity = "";
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* Diagnostics cannot block study. */ } } };
export const getDiagnosticHistory = () => safeDiagnosticEvents(history);
export const subscribeDiagnostics = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const persist = () => {
  try { if (scope) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ scope, events: getDiagnosticHistory(), status: cleanStatus(status), pendingSources: [...pendingSources], at: Date.now() })); } catch { /* Quota/private mode: in-memory only. */ }
};
export const recordDiagnostic = (event: Omit<DeviceTestEvent, "id" | "at">) => {
  try {
    history = safeDiagnosticEvents(appendDeviceTestEvent(history, { ...event, online: typeof navigator === "undefined" || navigator.onLine }));
    const safe = history[0];
    if (safe?.type === "AUTH") status.auth = cleanStatus({ auth: safe.code as DiagnosticStatus["auth"] }).auth;
    if (safe?.source === "family" || safe?.source === "study" && ["READ_SUCCESS", "READ_FAILURE"].includes(safe.type)) {
      if (["READ_ALLOWED", "MEMBER_ALLOWED", "MEMBER_DENIED", "permission-denied"].includes(safe.code ?? "")) status.family = safe.code as DiagnosticStatus["family"];
    }
    if (safe?.source) {
      if (safe.retry === true) pendingSources.add(safe.source);
      else if (safe.retry === false || safe.type === "SAVE_SUCCESS") pendingSources.delete(safe.source);
      status.retryPending = pendingSources.size > 0;
    }
    persist(); notify();
  } catch { /* Never change timer/save behavior on diagnostic failure. */ }
};

export const scopedDiagnosticRecorder = () => {
  const captured = generation;
  return (event: Omit<DeviceTestEvent, "id" | "at">) => { if (captured === generation) recordDiagnostic(event); };
};

// UID/session/environment are used only in memory for a salted opaque scope, never logged/exported.
// Per-tab sessionStorage survives reload but cannot mix another tab's environment/auth session.
export const configureDiagnostics = async (identity: string) => {
  if (identity === scopeIdentity) return;
  scopeIdentity = identity;
  const current = ++generation;
  history = []; status = cleanStatus(); pendingSources = new Set(); scope = ""; notify();
  try {
    let salt = sessionStorage.getItem(`${STORAGE_KEY}-salt`);
    if (!salt) { salt = crypto.randomUUID(); sessionStorage.setItem(`${STORAGE_KEY}-salt`, salt); }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}\n${identity}`));
    if (current !== generation) return;
    scope = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const saved = raw && raw.length < 32768 ? JSON.parse(raw) : null;
    if (saved?.scope === scope && Number.isFinite(saved.at) && saved.at <= Date.now() && Date.now() - saved.at < DEVICE_TEST_TTL) {
      history = safeDiagnosticEvents([...history, ...safeDiagnosticEvents(saved.events)]);
      status = cleanStatus(saved.status);
      pendingSources = new Set(Array.isArray(saved.pendingSources) ? saved.pendingSources.filter((source: DiagnosticSource) => sources.includes(source)) : []);
      status.retryPending = pendingSources.size > 0;
    }
    persist(); notify();
  } catch { /* Storage/crypto unavailable: clean in-memory session. */ }
};

export const diagnosticReasonText = (code: DiagnosticCode) => ({
  OTHER_TIMER: "ほかの学習を計測中です", UNSAVED_TIME: "前の学習時間の保存が必要です",
  SAVING: "保存中です", SAVE_PENDING: "前の学習記録の保存を待っています", ZERO_TIME: "学習を始めると保存できるよ",
}[code as string] ?? "");

export const calculationDiagnosticSource = (title: string): DiagnosticSource => {
  const index = ["①", "②", "③", "④", "⑤", "⑥", "⑦"].findIndex(value => title.endsWith(value));
  return index < 0 ? "calculation" : `calculation_${index + 1}` as DiagnosticSource;
};

const transitions: Record<TimerDiagnosticState, TimerDiagnosticState[]> = {
  idle: ["running", "paused", "review_pending", "saved"], running: ["paused", "stopping", "review_pending", "idle"],
  paused: ["running", "stopping", "saving", "review_pending", "idle"], stopping: ["saving", "review_pending", "failed", "paused"],
  review_pending: ["saving", "running", "idle", "saved"], saving: ["saved", "failed", "review_pending", "idle"],
  saved: ["idle", "running", "paused", "review_pending"], failed: ["retryable"], retryable: ["saving", "stopping", "saved", "review_pending", "idle", "paused", "running"],
};
export const isDiagnosticTransitionAllowed = (from: TimerDiagnosticState, to: TimerDiagnosticState) => from === to || transitions[from].includes(to);

export const diagnosticDeviceSummary = (ua: string) => ({
  device: /iPad|Tablet/.test(ua) ? "tablet" : /Mobile|Android|iPhone/.test(ua) ? "mobile" : "desktop",
  os: /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "other",
  browser: /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "other",
});
export const exportDiagnostics = (version: string, ua: string) => JSON.stringify({
  schema: 2, version: /^v\d+\.\d+\.\d+$/.test(version) ? version : "unknown",
  status: { ...cleanStatus(status), online: typeof navigator === "undefined" || navigator.onLine },
  device: diagnosticDeviceSummary(ua), events: getDiagnosticHistory().map(entry => {
    const { id, ...event } = entry;
    void id;
    return event;
  }),
}, null, 2);
