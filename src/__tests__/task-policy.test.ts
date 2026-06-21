import { describe, expect, it } from "vitest";
import {
  buildTaskAttachmentPath,
  isAttachmentPathInTask,
  canAuthorEditMessage,
  isMessageVisibleToClient,
  TASK_MESSAGE_EDIT_WINDOW_MINUTES,
} from "@/lib/shared/task-policy";

describe("storage path scoping (task-attachments bucket)", () => {
  const taskA = "11111111-1111-1111-1111-111111111111";
  const taskB = "22222222-2222-2222-2222-222222222222";

  it("scopes attachment paths under the task id prefix", () => {
    const path = buildTaskAttachmentPath(taskA, "abc", "Q1 report.pdf");
    expect(path.startsWith(`${taskA}/`)).toBe(true);
    expect(isAttachmentPathInTask(path, taskA)).toBe(true);
  });

  it("rejects paths that belong to a different task", () => {
    const path = buildTaskAttachmentPath(taskA, "abc", "x.pdf");
    expect(isAttachmentPathInTask(path, taskB)).toBe(false);
  });

  it("rejects path-traversal style first segments", () => {
    expect(isAttachmentPathInTask(`../${taskA}/x.pdf`, taskA)).toBe(false);
    expect(isAttachmentPathInTask(`${taskA}xxx/x.pdf`, taskA)).toBe(false);
  });

  it("sanitizes filenames so traversal cannot escape the task prefix", () => {
    const path = buildTaskAttachmentPath(taskA, "uuid", "../../etc/passwd");
    // Slashes in the supplied filename must be stripped; the resulting path
    // has exactly two segments: <taskId>/<uuid>-<safeName>.
    expect(path.split("/").length).toBe(2);
    expect(isAttachmentPathInTask(path, taskA)).toBe(true);
  });
});

describe("message 30-minute edit window", () => {
  it("allows edits within the window", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const created = new Date(now.getTime() - 5 * 60_000);
    expect(canAuthorEditMessage(created, now)).toBe(true);
  });

  it("allows edits exactly at the boundary", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const created = new Date(now.getTime() - TASK_MESSAGE_EDIT_WINDOW_MINUTES * 60_000);
    expect(canAuthorEditMessage(created, now)).toBe(true);
  });

  it("blocks edits after the window expires", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const created = new Date(now.getTime() - 31 * 60_000);
    expect(canAuthorEditMessage(created, now)).toBe(false);
  });

  it("rejects invalid timestamps defensively", () => {
    expect(canAuthorEditMessage("not-a-date")).toBe(false);
  });
});

describe("share-with-client visibility", () => {
  it("hides messages that are not flagged client-visible", () => {
    expect(isMessageVisibleToClient({ is_client_visible: false, deleted_at: null })).toBe(false);
    expect(isMessageVisibleToClient({ is_client_visible: null, deleted_at: null })).toBe(false);
  });

  it("shows messages explicitly shared with the client", () => {
    expect(isMessageVisibleToClient({ is_client_visible: true, deleted_at: null })).toBe(true);
  });

  it("hides soft-deleted messages even if shared", () => {
    expect(
      isMessageVisibleToClient({ is_client_visible: true, deleted_at: "2026-01-01T00:00:00Z" }),
    ).toBe(false);
  });
});
