import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { ZoomIn, ZoomOut, RotateCcw, ImagePlus, Trash2, ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// ── Canvas crop helper ────────────────────────────────────────────────

async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  outputSize = 512,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Allow exporting a crop of a remote (Supabase storage) photo without
    // tainting the canvas. Storage public URLs serve permissive CORS headers.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d")!;

      // Rotate around center
      ctx.translate(outputSize / 2, outputSize / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-outputSize / 2, -outputSize / 2);

      // Circular clip
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.clip();

      // Scale factor: output / crop area
      const scaleX = outputSize / pixelCrop.width;
      const scaleY = outputSize / pixelCrop.height;

      ctx.drawImage(
        img,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width * scaleX,
        pixelCrop.height * scaleY,
      );

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas to blob failed"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

// ── Component ─────────────────────────────────────────────────────────

interface AvatarCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The photo to edit — a data: URL of a freshly picked file, a remote photo
   *  URL, or null when the subject has no photo yet. */
  imageSrc: string | null;
  /** Receives the cropped 512×512 JPEG blob when the user clicks Apply. */
  onSave: (blob: Blob) => void | Promise<void>;
  /** When provided, a "Delete photo" action is shown (only if there is a photo). */
  onDelete?: () => void | Promise<void>;
  /** External busy flag — disables actions while an upload/delete is in flight. */
  busy?: boolean;
  title?: string;
}

export function AvatarCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onSave,
  onDelete,
  busy = false,
  title = "Profile photo",
}: AvatarCropDialogProps) {
  // The image currently loaded in the editor. Seeded from `imageSrc` each time
  // the dialog opens, then swapped in place when the user picks a new file via
  // "Change photo" (no need to close and reopen).
  const [workingSrc, setWorkingSrc] = useState<string | null>(imageSrc);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset all editor state whenever the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setWorkingSrc(imageSrc);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onChangePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setWorkingSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!workingSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await cropImageToBlob(workingSrc, croppedAreaPixels, rotation);
      await onSave(blob);
      onOpenChange(false);
    } catch (e) {
      console.error("Crop failed", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const busyAny = saving || busy;
  const handleClose = () => {
    if (!busyAny) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Crop area */}
        <div className="relative bg-black" style={{ height: 360 }}>
          {workingSrc ? (
            <>
              <Cropper
                image={workingSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{
                  containerStyle: { borderRadius: 0 },
                  cropAreaStyle: {
                    border: "2px solid rgba(255,255,255,0.8)",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                  },
                }}
              />
              <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80">
                Drag to reposition photo
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/70 hover:text-white"
            >
              <ImageOff className="h-8 w-8" />
              <span className="text-sm">No photo yet — add one to get started</span>
            </button>
          )}
        </div>

        {/* Controls */}
        {workingSrc && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t bg-background px-5 py-4">
            {/* Zoom */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Zoom</span>
                <span className="tabular-nums">{zoom.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-2">
                <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Slider
                  min={1}
                  max={3}
                  step={0.01}
                  value={[zoom]}
                  onValueChange={([v]) => setZoom(v)}
                  className="flex-1"
                  aria-label="Zoom"
                />
                <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </div>

            {/* Straighten */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Straighten</span>
                <span className="tabular-nums">{rotation}</span>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  min={-45}
                  max={45}
                  step={1}
                  value={[rotation]}
                  onValueChange={([v]) => setRotation(v)}
                  className="flex-1"
                  aria-label="Straighten"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setRotation(0)}
                  aria-label="Reset straighten"
                  title="Reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onChangePhoto}
        />

        <DialogFooter className="flex-row items-center justify-between border-t px-5 py-4 sm:justify-between">
          <div>
            {onDelete && imageSrc && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={busyAny}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete photo
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busyAny}>
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Change photo
            </Button>
            <Button onClick={handleSave} disabled={busyAny || !workingSrc || !croppedAreaPixels}>
              {busyAny ? "Saving…" : "Apply"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
