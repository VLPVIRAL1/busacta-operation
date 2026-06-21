import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileText, History, Sparkles } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ContractProfileList } from "@/components/contracts/contract-profile-list";
import { ContractTemplateList } from "@/components/contracts/contract-template-list";
import { ContractAuditList } from "@/components/contracts/contract-audit-list";
import { GenerateContractDialog } from "@/components/contracts/generate-contract-dialog";

export const Route = createFileRoute("/growth/contracts")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Growth", to: "/growth" }, { label: "Contracts" }]}>
        <ContractsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function ContractsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        description="Prepare NDA & SLA documents — manage counterparty profiles, author mail-merge templates, and generate Word / PDF files."
      />

      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="profiles">
            <Building2 className="mr-1.5 h-4 w-4" />
            Profiles
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="mr-1.5 h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="generate">
            <Sparkles className="mr-1.5 h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History className="mr-1.5 h-4 w-4" />
            Audit trail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4">
          <ContractProfileList />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <ContractTemplateList />
        </TabsContent>

        <TabsContent value="generate" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <div>
                <h3 className="text-sm font-semibold">Generate a contract</h3>
                <p className="text-sm text-muted-foreground">
                  Merge a counterparty profile into a template and download the document as Word
                  and/or PDF. Every generation is logged to the audit trail.
                </p>
              </div>
              <GenerateContractDialog />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <ContractAuditList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
