import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pen, Type, Upload, RotateCcw, Check } from "lucide-react";
import { HANDWRITTEN_FONTS, ensureHandwrittenFontsLoaded } from "@/lib/esign/handwritten-fonts";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
  defaultName?: string;
  title?: string;
};

const INK_COLORS: Array<{ label: string; value: string }> = [
  { label: "Indigo", value: "#1f1b69" },
  { label: "Black", value: "#0a0a0a" },
  { label: "Royal blue", value: "#1d4ed8" },
];

/**
 * Accessible signature capture.
 *
 *  - Radix Dialog handles focus trap, ESC, and ARIA wiring.
 *  - Ink swatches are a radiogroup with arrow-key cycling.
 *  - Type tab's font list is a radiogroup; arrows move selection, Enter adopts.
 *  - Upload zone is keyboard-activatable.
 *  - On screens ≤640px the dialog becomes a full-height sheet with a sticky
 *    bottom "Adopt & sign" bar.
 */
export function SignaturePad({
  open,
  onClose,
  onConfirm,
  defaultName,
  title = "Adopt your signature",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fontListRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const strokesRef = useRef<ImageData[]>([]);
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [ink, setInk] = useState<string>(INK_COLORS[0].value);
  const [typed, setTyped] = useState(defaultName ?? "");
  const [selectedFont, setSelectedFont] = useState<string>(HANDWRITTEN_FONTS[0].family);
  const [uploadDataUrl, setUploadDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) ensureHandwrittenFontsLoaded();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Slight defer so the dialog has mounted and the canvas has its real size.
    const id = requestAnimationFrame(() => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink;
      strokesRef.current = [];
      setHasDrawn(false);
    });
    return () => cancelAnimationFrame(id);
  }, [open, ink, tab]);

  const point = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent) => {
    drawingRef.current = true;
    lastRef.current = point(e);
    const c = canvasRef.current!;
    const ctx = c.getContext("2d");
    if (ctx) {
      strokesRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current!.x, lastRef.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    setHasDrawn(true);
  };
  const onUp = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const undoDraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const snap = strokesRef.current.pop();
    if (snap) ctx.putImageData(snap, 0, 0);
    if (strokesRef.current.length === 0) setHasDrawn(false);
  };

  const clearDraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    strokesRef.current = [];
    setHasDrawn(false);
  };

  const confirmDraw = () => {
    if (!hasDrawn || !canvasRef.current) return;
    onConfirm(canvasRef.current.toDataURL("image/png"));
    onClose();
  };

  const confirmTyped = () => {
    const text = typed.trim();
    if (!text) return;
    const fontDef =
      HANDWRITTEN_FONTS.find((f) => f.family === selectedFont) ?? HANDWRITTEN_FONTS[0];
    const c = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    const W = 720;
    const H = 200;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = ink;
    ctx.font = `${fontDef.renderSize}px ${fontDef.family}, cursive`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 24, H / 2);
    onConfirm(c.toDataURL("image/png"));
    onClose();
  };

  const confirmUpload = () => {
    if (!uploadDataUrl) return;
    onConfirm(uploadDataUrl);
    onClose();
  };

  const onUploadFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setUploadDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Ink radiogroup keyboard handler
  function onInkKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = INK_COLORS.findIndex((c) => c.value === ink);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setInk(INK_COLORS[(idx + 1) % INK_COLORS.length].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setInk(INK_COLORS[(idx - 1 + INK_COLORS.length) % INK_COLORS.length].value);
    }
  }

  // Font radiogroup keyboard handler
  function onFontKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = HANDWRITTEN_FONTS.findIndex((f) => f.family === selectedFont);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = HANDWRITTEN_FONTS[(idx + 1) % HANDWRITTEN_FONTS.length];
      setSelectedFont(next.family);
      scrollFontIntoView(next.family);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        HANDWRITTEN_FONTS[(idx - 1 + HANDWRITTEN_FONTS.length) % HANDWRITTEN_FONTS.length];
      setSelectedFont(next.family);
      scrollFontIntoView(next.family);
    } else if (e.key === "Enter") {
      e.preventDefault();
      confirmTyped();
    }
  }

  function scrollFontIntoView(family: string) {
    const el = fontListRef.current?.querySelector<HTMLElement>(`[data-font-family="${family}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  const canAdopt =
    tab === "draw" ? hasDrawn : tab === "type" ? typed.trim().length > 0 : !!uploadDataUrl;

  function adopt() {
    if (tab === "draw") confirmDraw();
    else if (tab === "type") confirmTyped();
    else confirmUpload();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="esign-scope esign-pad-shell max-w-2xl p-0 gap-0 overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.metaKey) {
            e.preventDefault();
            if (canAdopt) adopt();
          }
        }}
      >
        <div className="esign-pad-panel flex flex-col bg-[var(--esign-surface)]">
          <div className="border-b border-[var(--esign-border)] px-5 py-3.5">
            <DialogTitle className="font-semibold text-[var(--esign-ink)] text-base">
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--esign-muted)] mt-0.5">
              Your e-signature is legally binding under ESIGN &amp; UETA.
            </DialogDescription>
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as typeof tab)}
            className="p-5"
            data-esign-pad-body
          >
            <TabsList className="mb-4 grid grid-cols-3 w-full bg-[var(--esign-surface-muted)]">
              <TabsTrigger value="draw">
                <Pen className="h-3.5 w-3.5 mr-1.5" /> Draw
              </TabsTrigger>
              <TabsTrigger value="type">
                <Type className="h-3.5 w-3.5 mr-1.5" /> Type
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
              </TabsTrigger>
            </TabsList>

            {/* ---------------- DRAW ---------------- */}
            <TabsContent value="draw" className="space-y-3">
              <InkPicker ink={ink} setInk={setInk} onKeyDown={onInkKeyDown} size="lg" />
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={undoDraw} disabled={!hasDrawn}>
                  Undo
                </Button>
                <Button variant="ghost" size="sm" onClick={clearDraw} disabled={!hasDrawn}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear
                </Button>
              </div>
              <div className="rounded-lg border-2 border-dashed border-[var(--esign-border-strong)] bg-white">
                <canvas
                  ref={canvasRef}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  role="img"
                  aria-label="Signature drawing area"
                  style={{
                    width: "100%",
                    height: 220,
                    touchAction: "none",
                    cursor: "crosshair",
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--esign-muted)]">
                <span>Sign using your mouse, finger, or stylus.</span>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-[var(--esign-primary)]"
                  onClick={() => setTab("type")}
                >
                  Can't draw? Type instead
                </button>
              </div>
            </TabsContent>

            {/* ---------------- TYPE ---------------- */}
            <TabsContent value="type" className="space-y-4">
              <label className="block">
                <span className="sr-only">Type your full name</span>
                <Input
                  autoFocus
                  placeholder="Type your full name"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="text-base"
                  maxLength={80}
                  aria-label="Your full name"
                />
              </label>
              <InkPicker ink={ink} setInk={setInk} onKeyDown={onInkKeyDown} size="sm" />
              <div className="text-right text-xs text-[var(--esign-muted)]">
                {HANDWRITTEN_FONTS.length} signature styles
              </div>

              <div
                ref={fontListRef}
                role="radiogroup"
                aria-label="Signature style"
                tabIndex={0}
                onKeyDown={onFontKeyDown}
                className="max-h-[280px] overflow-y-auto rounded-lg border border-[var(--esign-border)] divide-y divide-[var(--esign-border)] bg-white focus-visible:ring-2 focus-visible:ring-[var(--esign-primary)] outline-none"
              >
                {HANDWRITTEN_FONTS.map((f) => {
                  const isSelected = f.family === selectedFont;
                  return (
                    <button
                      key={f.label}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      data-font-family={f.family}
                      onClick={() => setSelectedFont(f.family)}
                      className={
                        "w-full flex items-center gap-4 px-4 py-3 text-left transition min-h-11 " +
                        (isSelected
                          ? "bg-[var(--esign-primary-soft)]"
                          : "hover:bg-[var(--esign-surface-muted)]")
                      }
                    >
                      <span
                        className="flex-1 truncate"
                        style={{
                          fontFamily: `${f.family}, cursive`,
                          fontSize: 32,
                          lineHeight: 1.1,
                          color: ink,
                        }}
                      >
                        {typed.trim() || "Your signature"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--esign-muted)] shrink-0">
                        {f.label}
                      </span>
                      {isSelected && (
                        <Check
                          className="h-4 w-4 text-[var(--esign-primary)] shrink-0"
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            {/* ---------------- UPLOAD ---------------- */}
            <TabsContent value="upload" className="space-y-4">
              <label
                className="block rounded-lg border-2 border-dashed border-[var(--esign-border-strong)] bg-[var(--esign-surface-muted)] hover:bg-[var(--esign-primary-soft)] transition cursor-pointer p-8 text-center focus-within:ring-2 focus-within:ring-[var(--esign-primary)]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) onUploadFile(file);
                }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  aria-label="Upload signature image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadFile(file);
                  }}
                />
                {uploadDataUrl ? (
                  <img
                    src={uploadDataUrl}
                    alt="Signature preview"
                    className="mx-auto max-h-32 object-contain"
                  />
                ) : (
                  <>
                    <Upload
                      className="h-8 w-8 mx-auto text-[var(--esign-muted)] mb-2"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-[var(--esign-ink)]">
                      Drop a signature image, or click to browse
                    </p>
                    <p className="text-xs text-[var(--esign-muted)] mt-1">
                      PNG or JPG, transparent background recommended
                    </p>
                  </>
                )}
              </label>
            </TabsContent>
          </Tabs>

          {/* Sticky action bar — full-width on mobile, right-aligned on desktop */}
          <div className="border-t border-[var(--esign-border)] px-5 py-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 bg-[var(--esign-surface)]">
            <Button variant="ghost" onClick={onClose} className="sm:w-auto w-full">
              Cancel
            </Button>
            <Button onClick={adopt} disabled={!canAdopt} size="lg" className="sm:w-auto w-full">
              <Check className="h-4 w-4 mr-1.5" /> Adopt &amp; sign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InkPicker({
  ink,
  setInk,
  onKeyDown,
  size,
}: {
  ink: string;
  setInk: (v: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  size: "sm" | "lg";
}) {
  const dim = size === "lg" ? 28 : 22;
  return (
    <div
      role="radiogroup"
      aria-label="Ink colour"
      onKeyDown={onKeyDown}
      className="flex items-center gap-2 outline-none"
      tabIndex={0}
    >
      <span className="text-xs text-[var(--esign-muted)] mr-1">Ink:</span>
      {INK_COLORS.map((c) => {
        const isSelected = ink === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => setInk(c.value)}
            className="rounded-full border-2 transition"
            style={{
              width: dim,
              height: dim,
              backgroundColor: c.value,
              borderColor: isSelected ? "var(--esign-primary)" : "transparent",
            }}
            aria-label={c.label}
            title={c.label}
          />
        );
      })}
    </div>
  );
}
