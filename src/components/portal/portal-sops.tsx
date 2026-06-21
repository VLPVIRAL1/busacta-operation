import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EmptyState } from "@/components/shared/empty-state";
import { portalSopsQuery } from "@/lib/queries/portal.queries";

type Props = { firmId: string };

/** Read-only list of the SOPs/guides the firm has shared with the client. */
export function PortalSops({ firmId }: Props) {
  const { data, isLoading } = useQuery(portalSopsQuery(firmId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading guides…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-10 w-10" />}
        title="No guides shared yet"
        description="Standard operating procedures your firm shares with you will appear here."
      />
    );
  }

  return (
    <Card className="glass border-border-subtle">
      <CardContent className="p-2 sm:p-4">
        <Accordion type="single" collapsible className="w-full">
          {data.map((sop) => (
            <AccordionItem key={sop.id} value={sop.id}>
              <AccordionTrigger className="text-left text-sm font-medium">
                {sop.title}
              </AccordionTrigger>
              <AccordionContent>
                <div className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {sop.body || "No content."}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
