import { useCallback, useEffect, useRef } from "react";
import { isDiagnosticTransitionAllowed, recordDiagnostic, type DiagnosticSource, type TimerDiagnosticState } from "./device-test";

export function useTimerDiagnostics(source: DiagnosticSource, state: TimerDiagnosticState) {
  const previous = useRef<TimerDiagnosticState | undefined>(undefined);
  const transition = useCallback((next: TimerDiagnosticState, log = recordDiagnostic) => {
    const from = previous.current;
    if (from === next) return;
    log({ type: from && !isDiagnosticTransitionAllowed(from, next) ? "INVALID_TRANSITION" : "STATE", source, from, state: next });
    previous.current = next;
  }, [source]);
  useEffect(() => { transition(state); }, [state, transition]);
  return transition;
}
