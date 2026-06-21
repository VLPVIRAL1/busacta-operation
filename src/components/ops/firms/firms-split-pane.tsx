import { useEffect } from "react";
import { usePersistentSelection } from "@/lib/ops/use-persistent-selection";
import { FirmsListPane, type FirmListRow } from "./firms-list-pane";
import { FirmsDetailPane, type FirmDetailRow } from "./firms-detail-pane";

const SELECTED_LS_KEY = "firms.split.selectedFirmId";

/**
 * 35/65 split-pane view for the Ops Firms hub.
 * Mirrors `ProjectsSplitPane` so layout/UX stays consistent.
 */
export function FirmsSplitPane({
  rows,
  detailsById,
  onEdit,
}: {
  rows: FirmListRow[];
  detailsById: Map<string, FirmDetailRow>;
  onEdit?: (firmId: string) => void;
}) {
  const [selectedId, setSelectedId] = usePersistentSelection(SELECTED_LS_KEY);

  useEffect(() => {
    if (rows.length === 0) return;
    if (selectedId && rows.some((r) => r.id === selectedId)) return;
    setSelectedId(rows[0].id);
  }, [rows, selectedId, setSelectedId]);

  const selected = selectedId ? (detailsById.get(selectedId) ?? null) : null;

  return (
    <div className="h-[calc(100svh-240px)] min-h-[480px] grid md:grid-cols-[35%_65%] grid-cols-1 border rounded-lg overflow-hidden bg-background">
      <div className="min-h-0 border-r">
        <FirmsListPane rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="min-h-0">
        <FirmsDetailPane firm={selected} onEdit={onEdit} />
      </div>
    </div>
  );
}
