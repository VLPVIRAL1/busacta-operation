/**
 * Returns true when the given event target is a text-input surface
 * (input/textarea/contentEditable/Radix combobox) and global keyboard
 * shortcuts must NOT fire.
 *
 * Also returns true when a modal dialog or sheet currently owns focus,
 * so list/global shortcuts don't leak into open dialogs.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute("role");
  if (role === "combobox" || role === "textbox" || role === "searchbox") return true;
  // Inside CodeMirror / monaco / custom editors
  if (target.closest('[data-keyboard-editor="true"]')) return true;
  return false;
}

/** True when a Radix Dialog / Sheet / AlertDialog is open. */
export function isModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
}

/** Combined gate for global shortcuts. */
export function shouldIgnoreGlobalKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  if (isTypingTarget(e.target)) return true;
  return false;
}
