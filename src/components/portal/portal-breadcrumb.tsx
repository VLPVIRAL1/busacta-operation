import { Link } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface PortalBreadcrumbProps {
  firmName: string;
  projectId: string;
  projectName: string;
  entityName?: string | null;
  taskName?: string | null;
}

/**
 * CLIENT PORTAL drill-down breadcrumb:
 *   B2B Firm → Project → Client Entity → Task
 *
 * Entity is omitted when the project has skip_entity_hierarchy and no
 * entityName is supplied. Task is omitted on project pages.
 *
 * All data is derived from loader output already authorized by
 * `user_can_access_firm` — no client-side queries.
 */
export function PortalBreadcrumb({
  firmName,
  projectId,
  projectName,
  entityName,
  taskName,
}: PortalBreadcrumbProps) {
  return (
    <Breadcrumb aria-label="breadcrumb" data-testid="portal-breadcrumb">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/portal/projects">Projects</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <span className="text-muted-foreground">{firmName}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {taskName ? (
            <BreadcrumbLink asChild>
              <Link to="/portal/projects/$projectId" params={{ projectId }}>
                {projectName}
              </Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{projectName}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {entityName ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span className="text-muted-foreground">{entityName}</span>
            </BreadcrumbItem>
          </>
        ) : null}
        {taskName ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{taskName}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
