import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getServerFnAuthDebugEntries,
  clearServerFnAuthDebugEntries,
  subscribeServerFnAuthDebug,
  type ServerFnAuthDebugEntry,
} from "@/lib/auth/server-fn-auth-debug";

export const Route = createFileRoute("/debug/server-fn-auth")({
  component: ServerFnAuthDebugPage,
});

function ServerFnAuthDebugPage() {
  const [entries, setEntries] = useState<ServerFnAuthDebugEntry[]>(() =>
    getServerFnAuthDebugEntries(),
  );

  useEffect(() => {
    const unsubscribe = subscribeServerFnAuthDebug(() => setEntries(getServerFnAuthDebugEntries()));
    setEntries(getServerFnAuthDebugEntries());
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="container mx-auto max-w-5xl p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Server function auth debug</CardTitle>
            <CardDescription>
              Captures the most recent failed <code>/_serverFn/*</code> requests so we can verify
              whether the Bearer token was attached by the client fetch wrapper. Entries are kept in
              memory only.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => clearServerFnAuthDebugEntries()}>
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No failed server-function requests recorded in this session.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => (
                <li key={e.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={e.bearerAttached ? "default" : "destructive"}>
                      {e.bearerAttached ? "Bearer attached" : "No Bearer"}
                    </Badge>
                    <Badge variant="outline">{e.method}</Badge>
                    <Badge variant={e.ok ? "secondary" : "destructive"}>{String(e.status)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-2 break-all font-mono text-xs">{e.url}</div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <div>
                      token available:{" "}
                      <span className="text-foreground">{String(e.tokenAvailable)}</span>
                    </div>
                    <div>
                      existing auth header:{" "}
                      <span className="text-foreground">{String(e.hadExistingAuthorization)}</span>
                    </div>
                    <div>
                      token prefix: <span className="text-foreground">{e.tokenPrefix ?? "—"}</span>
                    </div>
                    <div>
                      error: <span className="text-foreground">{e.errorMessage ?? "—"}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
