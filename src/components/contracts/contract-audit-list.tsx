import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { contractDocumentsQuery } from "@/lib/queries/contracts.queries";
import {
  CONTRACT_TYPE_LABELS,
  type ContractDocFormat,
  type ContractType,
} from "@/lib/contracts/schemas";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContractAuditList() {
  const [typeF, setTypeF] = useState<ContractType | "all">("all");
  const [formatF, setFormatF] = useState<ContractDocFormat | "all">("all");

  const docsQ = useQuery(contractDocumentsQuery());

  const filtered = useMemo(() => {
    return (docsQ.data ?? []).filter((d) => {
      if (typeF !== "all" && d.contract_type !== typeF) return false;
      if (formatF !== "all" && d.output_format !== formatF) return false;
      return true;
    });
  }, [docsQ.data, typeF, formatF]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className="text-sm text-muted-foreground">
            Append-only record of every generated contract.
          </span>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <Select value={typeF} onValueChange={(v) => setTypeF(v as ContractType | "all")}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {CONTRACT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={formatF}
              onValueChange={(v) => setFormatF(v as ContractDocFormat | "all")}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All formats</SelectItem>
                <SelectItem value="docx">Word (.docx)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {docsQ.isLoading ? (
        <Skeleton className="h-72" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title={(docsQ.data ?? []).length === 0 ? "No documents generated yet" : "No matches"}
          description={
            (docsQ.data ?? []).length === 0
              ? "Generated NDA & SLA documents will be logged here."
              : "Try clearing the filters."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Generated</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(d.generated_at)}
                    </TableCell>
                    <TableCell className="font-medium">{d.profile_name}</TableCell>
                    <TableCell>{d.template_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal uppercase">
                        {CONTRACT_TYPE_LABELS[d.contract_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal uppercase">
                        {d.output_format}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {d.file_name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
