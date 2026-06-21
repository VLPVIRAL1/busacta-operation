// Bottom status bar — mirrors Windows Explorer's "X items" footer.
import type { GalleryNodeContent } from "@/lib/queries/gallery.queries";

type Props = {
  content: GalleryNodeContent | null;
  isLoading: boolean;
  filteredFileCount: number; // after search/type/date filters
};

export function GalleryStatusBar({ content, isLoading, filteredFileCount }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center border-t bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center border-t bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
        No folder selected
      </div>
    );
  }

  const folderCount = content.folders.length;
  const totalFiles = content.files.length;
  const filtered = filteredFileCount < totalFiles;

  const parts: string[] = [];
  if (folderCount > 0) parts.push(`${folderCount} ${folderCount === 1 ? "folder" : "folders"}`);
  if (filtered) {
    parts.push(`${filteredFileCount} of ${totalFiles} ${totalFiles === 1 ? "file" : "files"}`);
  } else if (totalFiles > 0) {
    parts.push(`${totalFiles} ${totalFiles === 1 ? "file" : "files"}`);
  }

  const label = parts.length ? parts.join(" · ") : "Empty folder";

  return (
    <div className="flex items-center border-t bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
      {label}
    </div>
  );
}
