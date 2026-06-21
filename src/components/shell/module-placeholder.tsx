import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  module: string;
}

export function ModulePlaceholder({
  title,
  description,
  icon: Icon = Construction,
  module,
}: Props) {
  return (
    <div className="mx-auto max-w-3xl pt-12">
      <Card className="border-dashed bg-card/60 backdrop-blur">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Icon className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{module} module</p>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Module in development</p>
            <p className="mt-1 text-xs">
              The navigation foundation is live. Feature build-out is scheduled in the BusAcTa
              Operations ERP roadmap.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
