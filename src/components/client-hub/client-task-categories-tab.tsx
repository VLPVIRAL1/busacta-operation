/**
 * ClientTaskCategoriesTab — B2C Client "Tasks" tab top section.
 * Shows the global Task Category catalog + per-client rate overrides.
 * The actual task list and organizers render below this in the parent tab.
 */
import { ClientRateCard } from "./client-rate-card";
import { TaskTypesManager } from "./task-types-manager";
import { directAdapter } from "@/lib/client-hub/adapter";

export function ClientTaskCategoriesTab({ clientId }: { clientId: string }) {
  return (
    <div className="space-y-4">
      <TaskTypesManager />
      <ClientRateCard adapter={directAdapter} scopeId={clientId} />
    </div>
  );
}
