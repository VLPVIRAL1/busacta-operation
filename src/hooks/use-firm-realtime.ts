import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

/**
 * Subscribe to live changes for a firm and its dependent rows so that the
 * Firm Hub and the Operations Hub stay in lock-step without manual refresh.
 *
 * Pass `null` to disable (e.g. while firm id is loading).
 */
export function useFirmRealtime(firmId: string | null | undefined) {
  const qc = useQueryClient();

  useRealtimeChannel(firmId ? `firm-realtime-${firmId}` : null, (channel) => {
    const id = firmId as string;
    const invalidate = (keys: (string | null)[][]) => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key });
    };
    return channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "firms", filter: `id=eq.${id}` },
        () =>
          invalidate([
            ["firm-hub-firm", id],
            ["firm", id],
          ]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `firm_id=eq.${id}` },
        () => invalidate([["firm-projects", id], ["projects", id], ["projects"]]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "firm_internal_team", filter: `firm_id=eq.${id}` },
        () => invalidate([["firm-team", id]]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "firm_member_capabilities",
          filter: `firm_id=eq.${id}`,
        },
        () => invalidate([["firm-caps", id]]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "firm_contacts", filter: `firm_id=eq.${id}` },
        () => invalidate([["firm-contacts", id]]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "firm_lifecycle_events",
          filter: `firm_id=eq.${id}`,
        },
        () => invalidate([["firm-lifecycle", id]]),
      )
      .on(
        "postgres_changes",
        // Stage changes are project-scoped; we listen broadly and rely on QC keys.
        { event: "*", schema: "public", table: "project_pipeline_stages" },
        () => qc.invalidateQueries({ queryKey: ["project-pipeline-stages"] }),
      );
  });
}
