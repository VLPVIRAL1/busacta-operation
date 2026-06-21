// FILES ARE STORED IN SHAREPOINT ONLY.
// This module writes to SharePoint via Graph API and saves
// metadata to the documents table. No bytes go to Supabase Storage.
// NEVER call supabase.storage.upload() or supabase.storage.from() in this file.
//
// SharePoint file upload helper.
// Automatically selects single-PUT (≤ 4 MB) or resumable upload session (4 MB–200 MB).
// The 200 MB hard cap is enforced here AND at the API route level (HTTP 413 before reaching this).
import { graphFetch } from "./graph-client.server";

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB hard limit
export const RESUMABLE_THRESHOLD = 4 * 1024 * 1024; // 4 MB — use resumable session above this
export const CHUNK_SIZE = 320 * 1024; // 320 KB per Graph API spec (must be multiple of 320 KiB)

export type UploadResult = {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  downloadUrl: string;
};

/**
 * Upload a file to a SharePoint Document Library folder.
 *
 * @param driveId - The drive ID of the project's Document Library
 * @param folderId - The SharePoint item ID of the task folder (or "root")
 * @param fileName - The file name (including extension)
 * @param fileBytes - The raw file content as ArrayBuffer
 * @param mimeType - MIME type for Content-Type header
 */
export async function uploadFile(
  driveId: string,
  folderId: string,
  fileName: string,
  fileBytes: ArrayBuffer,
  mimeType = "application/octet-stream",
): Promise<UploadResult> {
  if (fileBytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds the 200 MB upload limit (${(fileBytes.byteLength / 1024 / 1024).toFixed(1)} MB)`,
    );
  }

  const encodedName = encodeURIComponent(fileName);

  if (fileBytes.byteLength <= RESUMABLE_THRESHOLD) {
    return uploadSingle(driveId, folderId, encodedName, fileBytes, mimeType);
  }
  return uploadResumable(driveId, folderId, encodedName, fileBytes, mimeType);
}

// Single PUT — used for files ≤ 4 MB
async function uploadSingle(
  driveId: string,
  folderId: string,
  encodedName: string,
  fileBytes: ArrayBuffer,
  mimeType: string,
): Promise<UploadResult> {
  const result = await graphFetch<{
    id: string;
    name: string;
    size: number;
    webUrl: string;
    "@microsoft.graph.downloadUrl": string;
  }>({
    method: "PUT",
    path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}:/${encodedName}:/content`,
    body: fileBytes,
    headers: { "Content-Type": mimeType },
  });
  return {
    id: result.id,
    name: result.name,
    size: result.size,
    webUrl: result.webUrl,
    downloadUrl: result["@microsoft.graph.downloadUrl"],
  };
}

// Resumable upload session — used for files 4 MB–200 MB.
// Creates an upload session, then POSTs chunks with Content-Range headers.
// Sessions are valid for 24 hours; if interrupted, resume from the last confirmed byte.
async function uploadResumable(
  driveId: string,
  folderId: string,
  encodedName: string,
  fileBytes: ArrayBuffer,
  mimeType: string,
): Promise<UploadResult> {
  // Step 1: Create the upload session
  const session = await graphFetch<{ uploadUrl: string }>({
    method: "POST",
    path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}:/${encodedName}:/createUploadSession`,
    body: {
      item: {
        "@microsoft.graph.conflictBehavior": "rename",
        name: decodeURIComponent(encodedName),
      },
    },
  });
  if (!session.uploadUrl)
    throw new Error("Graph did not return an uploadUrl for resumable session");

  const totalSize = fileBytes.byteLength;
  let offset = 0;
  let finalResult: UploadResult | null = null;

  // Step 2: Upload in CHUNK_SIZE slices with Content-Range header.
  // On any failure, cancel the upload session to avoid orphaned 24-hour sessions.
  try {
    while (offset < totalSize) {
      const end = Math.min(offset + CHUNK_SIZE, totalSize);
      const chunk = fileBytes.slice(offset, end);
      const contentRange = `bytes ${offset}-${end - 1}/${totalSize}`;

      const res = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.byteLength),
          "Content-Range": contentRange,
          "Content-Type": mimeType,
        },
        body: chunk,
      });

      if (res.status === 202) {
        // Chunk accepted, more to go
        offset = end;
        continue;
      }

      if (res.status === 200 || res.status === 201) {
        // Upload complete — final response contains the DriveItem
        const item = (await res.json()) as {
          id: string;
          name: string;
          size: number;
          webUrl: string;
          "@microsoft.graph.downloadUrl": string;
        };
        finalResult = {
          id: item.id,
          name: item.name,
          size: item.size,
          webUrl: item.webUrl,
          downloadUrl: item["@microsoft.graph.downloadUrl"],
        };
        break;
      }

      // Unexpected status — surface the error (finally block will cancel the session)
      const body = await res.text().catch(() => "");
      throw new Error(`Resumable upload chunk failed [${res.status}]: ${body}`);
    }
  } catch (err) {
    // Cancel the upload session so SharePoint doesn't hold the slot for 24 hours
    await fetch(session.uploadUrl, { method: "DELETE" }).catch(() => {});
    throw err;
  }

  if (!finalResult)
    throw new Error("Resumable upload completed without a final DriveItem response");
  return finalResult;
}
