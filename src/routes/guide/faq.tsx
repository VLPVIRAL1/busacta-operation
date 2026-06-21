import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/guide/faq")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "FAQ" }]}>
        <FaqPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const FAQ: { q: string; a: string }[] = [
  {
    q: "How does a Task-Based project get billed?",
    a: "Each completed task multiplied by the flat price set in the Firm Hub. The Ops team only marks tasks complete — they never see the price.",
  },
  {
    q: "How does an Hourly project get billed?",
    a: "When an employee stops a timer they enter Effective Hours (not raw elapsed time). Invoice = Effective Hours × the hourly rate set in the Firm Hub.",
  },
  {
    q: "How do I import employee attendance?",
    a: "HR has no manual punches. Use HR → Attendance Import (CSV) to upload data exported from your biometric system. Tardiness Tracker reads from the same imported data.",
  },
  {
    q: "Where do learning & certifications live?",
    a: "In the standalone Learning & Training hub (/learning). It is independent of HR — courses, CPE credits, and certifications all live there.",
  },
  {
    q: "How do I create a new client firm or project?",
    a: "Only an admin/CEO can create them via the Firm Hub. Ops users see firms and projects in their own stripped-down workspaces with no pricing.",
  },
  {
    q: "How do I share a document with a client?",
    a: "In the task Document Manager, toggle Share with Client on the folder (or override per-file). Anything you share appears in the Client Portal automatically.",
  },
  {
    q: "How do I enable two-factor authentication?",
    a: "Go to My Profile → Two-factor (MFA), scan the QR code with an authenticator app, and download your backup codes.",
  },
];

function FaqPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Frequently Asked Questions"
        description="Quick answers to the questions teams ask most often about BusAcTa Operations."
      />
      <Card>
        <CardContent className="p-4">
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
