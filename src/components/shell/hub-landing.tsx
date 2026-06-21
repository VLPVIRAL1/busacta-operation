import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/app-shell";
import { useNav, MODULE_LABEL, type ModuleKey } from "@/lib/routing/use-nav";

/**
 * Generic landing page for hubs that don't have a bespoke dashboard yet.
 * Renders the hub title and a card grid linking into each Tier-2 section.
 */
export function HubLanding({
  moduleKey,
  description,
}: {
  moduleKey: ModuleKey;
  description?: string;
}) {
  const { tier2For } = useNav();
  const groups = tier2For(moduleKey);
  const title = MODULE_LABEL[moduleKey];

  // Skip the synthetic "Overview" group (which only contains the Dashboard
  // link back to this page) to avoid self-referencing cards.
  const sections = groups.filter((g) => g.label !== "Overview");

  return (
    <>
      <PageHeader
        title={`${title} hub`}
        description={description ?? `Jump into any ${title.toLowerCase()} workflow below.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.flatMap((group) =>
          group.links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.url}
                to={link.url as never}
                className="block rounded-xl border border-border-subtle glass p-4 shadow-[var(--shadow-glass)] transition hover:border-primary/40 hover:shadow-md"
              >
                <Card className="border-0 bg-transparent shadow-none">
                  <CardHeader className="flex flex-row items-center gap-3 p-0 pb-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold leading-tight">
                        {link.title}
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground">{group.label}</p>
                    </div>
                  </CardHeader>
                  {link.description && (
                    <CardContent className="p-0 pt-1 text-xs text-muted-foreground">
                      {link.description}
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          }),
        )}
      </div>
    </>
  );
}
