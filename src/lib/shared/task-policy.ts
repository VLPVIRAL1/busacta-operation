/**
 * Pure helpers that mirror server-enforced task policies.
 * Source of truth lives in DB triggers + storage RLS; these helpers exist so
 * UI code (and regression tests) share a single definition of the rules.
 */

export const TASK_MESSAGE_EDIT_WINDOW_MINUTES = 30;

/** Build the canonical storage path for a task attachment. */
export function buildTaskAttachmentPath(taskId: string, uuid: string, filename: string): string {
  if (!taskId || !uuid) throw new Error("taskId and uuid are required");
  const safeName = (filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return `${taskId}/${uuid}-${safeName}`;
}

/** A storage path belongs to a task iff its first segment equals the task id. */
export function isAttachmentPathInTask(path: string, taskId: string): boolean {
  if (!path || !taskId) return false;
  const [head] = path.split("/", 1);
  return head === taskId;
}

/** True when an author may still edit their message body. Admins bypass elsewhere. */
export function canAuthorEditMessage(createdAt: Date | string, now: Date = new Date()): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const ageMs = now.getTime() - created.getTime();
  return ageMs <= TASK_MESSAGE_EDIT_WINDOW_MINUTES * 60_000;
}

/** Whether a client portal user should see a given message. */
export function isMessageVisibleToClient(message: {
  is_client_visible: boolean | null;
  deleted_at: string | Date | null;
}): boolean {
  if (message.deleted_at) return false;
  return message.is_client_visible === true;
}
