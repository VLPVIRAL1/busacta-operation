import { useRef, useState, useEffect } from "react";
import { AnnotationLayer, type AnnotationLayerProps } from "./annotation-layer";

type PassThrough = Omit<AnnotationLayerProps, "pageNumber" | "width" | "height">;

export function ImageAnnotatedViewer({
  url,
  alt,
  ...layerProps
}: { url: string; alt: string } & PassThrough) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto p-3">
      <div className="relative inline-block">
        <img
          ref={imgRef}
          src={url}
          alt={alt}
          className="max-h-[70vh] max-w-full select-none object-contain"
          onLoad={(e) => {
            const t = e.currentTarget;
            setSize({ w: t.clientWidth, h: t.clientHeight });
          }}
          draggable={false}
        />
        {size && <AnnotationLayer {...layerProps} pageNumber={1} width={size.w} height={size.h} />}
      </div>
    </div>
  );
}
