import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

export type DocumentPreviewState = {
  open: boolean;
  url: string | null;
  filename: string;
  mimeType: string | null;
};

function isImage(name: string, mime: string | null) {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}
function isPdf(name: string, mime: string | null) {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(name);
}

export function DocumentPreviewDialog({
  state,
  onOpenChange,
  onDownload,
}: {
  state: DocumentPreviewState;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
}) {
  const { url, filename, mimeType } = state;
  const image = url && isImage(filename, mimeType);
  const pdf = url && isPdf(filename, mimeType);

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate">{filename}</DialogTitle>
        </DialogHeader>
        <div className="h-[70vh] w-full overflow-auto rounded-md border bg-slate-50 dark:bg-slate-900/60">
          {!url ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : image ? (
            <div className="flex h-full items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={filename} className="max-h-full max-w-full object-contain" />
            </div>
          ) : pdf ? (
            <iframe src={url} title={filename} className="h-full w-full" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                In-browser preview isn't available for this file type.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Open in new tab
                  </a>
                </Button>
                <Button size="sm" onClick={onDownload}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </div>
        {url && (image || pdf) && (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Open in new tab
              </a>
            </Button>
            <Button size="sm" onClick={onDownload}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
