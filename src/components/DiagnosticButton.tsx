import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import { recordDiagnostic, type DiagnosticCode, type DiagnosticSource, type DeviceTestEvent } from "../device-test";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { source: DiagnosticSource; action: NonNullable<DeviceTestEvent["button"]>; reason: DiagnosticCode; inheritedDisabled?: boolean };
export function DiagnosticButton({ source, action, reason, inheritedDisabled = false, onClick, onPointerDown, ...props }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let last = "";
    const probe = () => {
      try {
        const button = ref.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        const disabled = button.matches(":disabled");
        const reachable = !disabled && style.pointerEvents !== "none" && style.visibility === "visible" && rect.width > 0 && rect.height > 0 && !!hit && (hit === button || button.contains(hit));
        const signature = `${disabled}-${reachable}`;
        if (signature === last) return;
        last = signature;
        recordDiagnostic({ type: "BUTTON", source, button: action, code: reason, disabled, reachable });
      } catch { /* Best-effort hit testing. */ }
    };
    let frame = 0;
    const schedule = () => { try { if (!frame) frame = requestAnimationFrame(() => { frame = 0; probe(); }); } catch { /* Optional probe only. */ } };
    // Ignore clock text updates. Coalesce DOM/overlay changes to one hit test per frame.
    let observer: MutationObserver | undefined;
    try {
      probe();
      observer = new MutationObserver(mutations => {
        if (mutations.some(mutation => mutation.type === "attributes" || [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1))) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "class", "style"] });
      window.addEventListener("resize", schedule);
      document.addEventListener("scroll", schedule, true);
      document.addEventListener("animationend", schedule, true);
      document.addEventListener("transitionend", schedule, true);
    } catch { /* Observer support must not affect the button. */ }
    return () => { observer?.disconnect(); if (frame) cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true); document.removeEventListener("animationend", schedule, true); document.removeEventListener("transitionend", schedule, true); };
  }, [source, action, reason, props.disabled, inheritedDisabled]);
  return <button {...props} ref={ref} onPointerDown={event => { recordDiagnostic({ type: "POINTER", source, button: action }); onPointerDown?.(event); }} onClick={event => { recordDiagnostic({ type: "CLICK", source, button: action }); onClick?.(event); }} />;
}
