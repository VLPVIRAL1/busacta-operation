// Column definitions for the four per-project SharePoint backup lists.
// Consumed by getOrCreateSharePointList() in graph-client.server.ts.

type ListColumnDef =
  | { name: string; kind: "text" }
  | { name: string; kind: "number" }
  | { name: string; kind: "dateTime" }
  | { name: string; kind: "boolean" };

export const TASK_COLUMNS: ListColumnDef[] = [
  { name: "TaskId", kind: "text" }, // indexed (name ends in "Id")
  { name: "Slug", kind: "text" },
  { name: "Status", kind: "text" },
  { name: "Priority", kind: "text" },
  { name: "Complexity", kind: "text" },
  { name: "DueDate", kind: "text" },
  { name: "ProjectId", kind: "text" }, // indexed
  { name: "FirmId", kind: "text" }, // indexed
  { name: "CreatedBy", kind: "text" },
  { name: "Stream", kind: "text" },
];

export const MESSAGE_COLUMNS: ListColumnDef[] = [
  { name: "MessageId", kind: "text" }, // indexed
  { name: "MessageType", kind: "text" }, // "task" | "firm"
  { name: "TaskId", kind: "text" }, // indexed
  { name: "FirmId", kind: "text" }, // indexed
  { name: "AuthorId", kind: "text" }, // indexed
  { name: "Body", kind: "text" }, // multiline (handled in graph-client)
  { name: "IsClientVisible", kind: "boolean" },
];

export const AUDIT_COLUMNS: ListColumnDef[] = [
  { name: "AuditId", kind: "text" }, // indexed
  { name: "TaskId", kind: "text" }, // indexed
  { name: "ActorId", kind: "text" }, // indexed
  { name: "EventType", kind: "text" },
  { name: "Payload", kind: "text" }, // multiline JSON
];

export const DOCUMENT_COLUMNS: ListColumnDef[] = [
  { name: "DocumentId", kind: "text" }, // indexed
  { name: "TaskId", kind: "text" }, // indexed
  { name: "FileSizeBytes", kind: "number" },
  { name: "MimeType", kind: "text" },
  { name: "SharePointItemId", kind: "text" },
  { name: "SharePointWebUrl", kind: "text" },
  { name: "UploadedBy", kind: "text" },
];
