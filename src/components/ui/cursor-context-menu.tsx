import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/shared/utils";

export interface CursorMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
}

interface Props {
  children: (handlers: { onContextMenu: (e: MouseEvent) => void }) => ReactNode;
  items: CursorMenuItem[] | (() => CursorMenuItem[]);
}

/**
 * Cursor-anchored context menu — opens exactly at the mouse position
 * of the triggering right-click (clientX/clientY). Closes on outside
 * click, Escape, scroll, or after a selection.
 */
export function CursorContextMenu({ children, items }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [resolved, setResolved] = useState<CursorMenuItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const list = typeof items === "function" ? items() : items;
    setResolved(list);
    setPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onClick = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("mousedown", onClick);
    };
  }, [pos]);

  // Clamp menu inside viewport.
  useEffect(() => {
    if (!pos || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const pad = 6;
    let { x, y } = pos;
    if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
    if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
    if (x !== pos.x || y !== pos.y) setPos({ x, y });
  }, [pos]);

  return (
    <>
      {children({ onContextMenu: open })}
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999 }}
            className="min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg outline-none animate-in fade-in zoom-in-95"
          >
            {resolved.map((it, i) => (
              <div key={i}>
                {it.separatorBefore && i > 0 && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    if (it.disabled) return;
                    setPos(null);
                    it.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors",
                    "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none",
                    it.destructive &&
                      "text-destructive hover:bg-destructive/10 hover:text-destructive",
                    it.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                  )}
                >
                  {it.icon && (
                    <span className="h-3.5 w-3.5 shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
                      {it.icon}
                    </span>
                  )}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.shortcut && (
                    <span className="text-[10px] text-muted-foreground tracking-wider">
                      {it.shortcut}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
