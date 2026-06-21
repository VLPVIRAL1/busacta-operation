import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getSignedDownloadUrl, listBackups, triggerBackup } from "@/lib/admin/backups";
import { formatBytes } from "@/lib/format/format-bytes";
import { fmtDMY } from "@/lib/format/format-date";

export function DatabaseBackupsCard() {
  const [isTriggering, setIsTriggering] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "db-backups"],
    queryFn: listBackups,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.access_token) {
        toast.error("Not signed in — please refresh and try again.");
        return;
      }
      await triggerBackup(session.access_token, session.user.id);
      toast.success(
        "Backup triggered. The external server is generating the SQL file. It will appear in the list below in a few minutes.",
      );
      void refetch();
    } catch (err) {
      console.error("[backups] trigger failed", err);
      toast.error("Failed to trigger backup. Check the external worker URL or try again.");
    } finally {
      setTimeout(() => setIsTriggering(false), 1200);
    }
  };

  const handleDownload = async (name: string) => {
    try {
      const url = await getSignedDownloadUrl(name);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[backups] signed url failed", err);
      toast.error("Could not generate download link.");
    }
  };

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Database Backups
          </CardTitle>
          <CardDescription>
            Trigger a full SQL backup (schema + data + policies + functions) on the external worker.
            Files are stored privately and refresh every 15 seconds.
          </CardDescription>
        </div>
        <Button onClick={handleTrigger} disabled={isTriggering}>
          {isTriggering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Triggering remote backup…
            </>
          ) : (
            <>
              <Database className="h-4 w-4" /> Generate Full SQL Backup
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isFetching
              ? "Checking for new backups…"
              : `${rows.length} backup${rows.length === 1 ? "" : "s"} available`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh backup list"
            title="Refresh backup list"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className="w-32">Size</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-32 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  Loading backups…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No backups yet — click{" "}
                  <span className="font-medium">Generate Full SQL Backup</span> to create the first
                  one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((f) => (
                <TableRow key={f.name}>
                  <TableCell className="font-mono text-xs">{f.name}</TableCell>
                  <TableCell className="text-sm">{formatBytes(f.size) || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {f.createdAt ? fmtDMY(f.createdAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => handleDownload(f.name)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
