/**
 * Generic virtualized list using @tanstack/react-virtual.
 *
 * Renders only the ~30 rows currently in the viewport regardless of how many
 * total rows are loaded. Pair with `useInfiniteQuery` for keyset-paginated
 * data and pass an `onEndReached` callback to load more pages.
 *
 * Designed to wrap existing row renderers (no row markup assumptions).
 */
import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export function VirtualRows<T>({
  rows,
  estimateRowHeight = 36,
  overscan = 12,
  renderRow,
  rowKey,
  onEndReached,
  endReachedThreshold = 8,
  className = "h-full overflow-auto",
  topSlot,
  bottomSlot,
}: {
  rows: T[];
  estimateRowHeight?: number;
  overscan?: number;
  renderRow: (row: T, index: number) => React.ReactNode;
  rowKey: (row: T, index: number) => string;
  /** Fires when the user scrolls within `endReachedThreshold` rows of the bottom. */
  onEndReached?: () => void;
  endReachedThreshold?: number;
  className?: string;
  topSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    getItemKey: (i) => rowKey(rows[i], i),
  });

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (!onEndReached) return;
    if (rows.length === 0) return;
    if (lastIndex >= rows.length - 1 - endReachedThreshold) onEndReached();
  }, [lastIndex, rows.length, endReachedThreshold, onEndReached]);

  return (
    <div ref={parentRef} className={className}>
      {topSlot}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {items.map((vi) => {
          const row = rows[vi.index];
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {renderRow(row, vi.index)}
            </div>
          );
        })}
      </div>
      {bottomSlot}
    </div>
  );
}
