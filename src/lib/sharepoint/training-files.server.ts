// Microsoft Graph helpers for listing training content from SharePoint.
// Extends graph-client.server.ts — no new auth logic needed.
import { graphFetch } from "./graph-client.server";

export type TrainingFileItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webUrl: string;
  downloadUrl: string;
  lastModified: string;
  driveId: string;
};

type GraphDriveItem = {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  lastModifiedDateTime: string;
  "@microsoft.graph.downloadUrl"?: string;
  file?: { mimeType: string };
  parentReference?: { driveId: string };
};

type GraphDriveResponse = { value: GraphDriveItem[] };
type GraphSiteResponse = { id: string };

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/webm",
  "video/mpeg",
]);

function isTrainingFile(item: GraphDriveItem): boolean {
  const mime = item.file?.mimeType ?? "";
  return mime === "application/pdf" || VIDEO_TYPES.has(mime);
}

/** Resolve the default drive ID for a site. */
export async function getSiteDriveId(siteId: string): Promise<string> {
  const res = await graphFetch<{ id: string }>({
    path: `/sites/${siteId}/drive`,
  });
  return res.id;
}

/** Resolve a site ID from hostname + path (e.g. "contoso.sharepoint.com:/sites/Training"). */
export async function resolveSiteId(hostAndPath: string): Promise<string> {
  const res = await graphFetch<GraphSiteResponse>({
    path: `/sites/${hostAndPath}`,
  });
  return res.id;
}

/**
 * List training files (videos + PDFs) from a SharePoint folder.
 * @param driveId   Drive ID from getSiteDriveId().
 * @param folderPath  Folder path relative to drive root, e.g. "Training".
 */
export async function listTrainingFiles(
  driveId: string,
  folderPath = "Training",
): Promise<TrainingFileItem[]> {
  const encodedPath = encodeURIComponent(folderPath);
  const res = await graphFetch<GraphDriveResponse>({
    path: `/drives/${driveId}/root:/${encodedPath}:/children?$select=id,name,file,size,webUrl,lastModifiedDateTime,parentReference,@microsoft.graph.downloadUrl&$top=200`,
  });

  return (res.value ?? []).filter(isTrainingFile).map((item) => ({
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType ?? "",
    size: item.size ?? 0,
    webUrl: item.webUrl ?? "",
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? item.webUrl ?? "",
    lastModified: item.lastModifiedDateTime ?? "",
    driveId: item.parentReference?.driveId ?? driveId,
  }));
}

/** Fetch a fresh pre-authenticated download URL for a specific item. */
export async function getTrainingFileDownloadUrl(driveId: string, itemId: string): Promise<string> {
  const item = await graphFetch<GraphDriveItem>({
    path: `/drives/${driveId}/items/${itemId}?$select=id,@microsoft.graph.downloadUrl,webUrl`,
  });
  return item["@microsoft.graph.downloadUrl"] ?? item.webUrl ?? "";
}
