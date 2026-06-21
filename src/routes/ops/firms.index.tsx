import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Rows3,
  Columns2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssigneeStack } from "@/components/shared/assignee-stack";
import { FirmCode } from "@/components/shared/entity-code";
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from "@/components/shared/multi-select-combobox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  opsFirmsListQuery,
  firmsEmployeeOptionsQuery,
  firmsTeamRowsQuery,
  updateOpsFirm,
  deleteOpsFirm,
  updateFirmInternalTeam,
} from "@/lib/queries/ops.queries";
import {
  MultiEmployeeSelect,
  type EmployeeOption,
} from "@/components/shared/multi-employee-select";
import { FirmDetailDrawer } from "@/components/ops/firm-detail-drawer";
import { FirmsSplitPane } from "@/components/ops/firms/firms-split-pane";
import type { FirmListRow } from "@/components/ops/firms/firms-list-pane";
import type { FirmDetailRow } from "@/components/ops/firms/firms-detail-pane";
import {
  CaptchaAlertAction,
  CaptchaAlertDescription,
  CaptchaBlock,
  useCaptchaGate,
} from "@/components/auth/captcha-confirm";

type Firm = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  us_timezone: string | null;
  firm_identifier: string | null;
  created_at: string;
};

const US_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "ET — New York" },
  { value: "America/Chicago", label: "CT — Chicago" },
  { value: "America/Denver", label: "MT — Denver" },
  { value: "America/Phoenix", label: "MT — Phoenix (no DST)" },
  { value: "America/Los_Angeles", label: "PT — Los Angeles" },
  { value: "America/Anchorage", label: "AKT — Anchorage" },
  { value: "Pacific/Honolulu", label: "HT — Honolulu" },
];

const TZ_OPTIONS: MultiSelectOption[] = US_TIMEZONES.map((t) => ({
  value: t.value,
  label: t.label,
}));

function tzShort(tz: string | null | undefined) {
  if (!tz) return "—";
  return US_TIMEZONES.find((t) => t.value === tz)?.label ?? tz;
}

type ViewMode = "split" | "table";
const VIEW_MODES = new Set<ViewMode>(["split", "table"]);

const parseList = (raw: unknown): string[] =>
  typeof raw === "string" && raw.length > 0
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50)
    : Array.isArray(raw)
      ? (raw as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

interface FirmsSearch {
  q: string;
  view: ViewMode;
  tz: string[];
  staff: string[];
}

export const Route = createFileRoute("/ops/firms/")({
  component: FirmsPage,
  errorComponent: RouteErrorComponent,
  validateSearch: (raw: Record<string, unknown>): FirmsSearch => ({
    q: typeof raw.q === "string" ? raw.q : "",
    view:
      typeof raw.view === "string" && VIEW_MODES.has(raw.view as ViewMode)
        ? (raw.view as ViewMode)
        : "split",
    tz: parseList(raw.tz),
    staff: parseList(raw.staff),
  }),
});

function FirmsPage() {
  const search = Route.useSearch();
  const { q, view, tz, staff } = search;
  const navigateSearch = Route.useNavigate();
  const navigate = useNavigate();

  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (qInput !== q) {
        navigateSearch({
          search: (prev: FirmsSearch) => ({ ...prev, q: qInput }),
          replace: true,
        });
      }
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const setView = (v: ViewMode) =>
    navigateSearch({ search: (prev: FirmsSearch) => ({ ...prev, view: v }) });
  const setTzFilter = (v: string[]) =>
    navigateSearch({ search: (prev: FirmsSearch) => ({ ...prev, tz: v }) });
  const setStaff = (v: string[]) =>
    navigateSearch({ search: (prev: FirmsSearch) => ({ ...prev, staff: v }) });
  const clearAll = () =>
    navigateSearch({
      search: (prev: FirmsSearch) => ({ ...prev, q: "", tz: [], staff: [] }),
    });

  const [editFirm, setEditFirm] = useState<Firm | null>(null);
  const [viewFirm, setViewFirm] = useState<Firm | null>(null);
  const [drawerFirm, setDrawerFirm] = useState<Firm | null>(null);
  const [deleteFirm, setDeleteFirm] = useState<Firm | null>(null);
  const deleteCaptcha = useCaptchaGate(deleteFirm?.id);
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";

  const { data: firms, isLoading } = useQuery(opsFirmsListQuery());
  const { data: employees } = useQuery({
    ...firmsEmployeeOptionsQuery(),
    select: (rows) => rows as unknown as EmployeeOption[],
  });
  const { data: teamRows } = useQuery(firmsTeamRowsQuery());

  const teamByFirm = useMemo(() => {
    const m = new Map<string, string[]>();
    (teamRows ?? []).forEach((r) => {
      const list = m.get(r.firm_id) ?? [];
      list.push(r.user_id);
      m.set(r.firm_id, list);
    });
    return m;
  }, [teamRows]);

  const employeesById = useMemo(() => {
    const m = new Map<string, EmployeeOption>();
    (employees ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const firmsById = useMemo(() => {
    const m = new Map<string, Firm>();
    (firms ?? []).forEach((f) => m.set(f.id, f as Firm));
    return m;
  }, [firms]);

  const updateTeam = useMutation({
    mutationFn: (input: { firmId: string; nextIds: string[]; prevIds: string[] }) =>
      updateFirmInternalTeam(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firms-team-rows"] }),
    onError: (e: Error) => toast.error(`Team update failed: ${e.message}`),
  });

  const updateFirm = useMutation({
    mutationFn: (input: {
      id: string;
      name: string;
      contact_email: string | null;
      contact_phone: string | null;
      notes: string | null;
    }) => updateOpsFirm(input),
    onSuccess: () => {
      toast.success("Firm updated");
      setEditFirm(null);
      qc.invalidateQueries({ queryKey: ["firms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFirm = useMutation({
    mutationFn: (id: string) => deleteOpsFirm(id),
    onSuccess: () => {
      toast.success("Firm deleted");
      setDeleteFirm(null);
      qc.invalidateQueries({ queryKey: ["firms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const tzSet = new Set(tz);
    const stSet = new Set(staff);
    return (firms ?? []).filter((f) => {
      if (tzSet.size && !tzSet.has(f.us_timezone ?? "America/New_York")) return false;
      const teamIds = teamByFirm.get(f.id) ?? [];
      if (stSet.size && !teamIds.some((id) => stSet.has(id))) return false;
      if (needle) {
        const hay = `${f.name} ${f.firm_identifier ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [firms, q, tz, staff, teamByFirm]);

  // Adapt to split-pane row shape (reuse data, no extra fetches).
  const splitRows: FirmListRow[] = useMemo(
    () =>
      filtered.map((f) => {
        const teamIds = teamByFirm.get(f.id) ?? [];
        const team = teamIds
          .map((id) => employeesById.get(id))
          .filter((e): e is EmployeeOption => !!e)
          .map((m) => ({
            id: m.id,
            name: m.full_name || m.email || "",
            avatar_url: m.avatar_url ?? null,
          }));
        return {
          id: f.id,
          name: f.name,
          firm_identifier: f.firm_identifier,
          us_timezone: f.us_timezone,
          tzShort: tzShort(f.us_timezone),
          team,
        };
      }),
    [filtered, teamByFirm, employeesById],
  );

  const detailsById = useMemo(() => {
    const m = new Map<string, FirmDetailRow>();
    splitRows.forEach((row) => {
      const f = firmsById.get(row.id);
      if (!f) return;
      m.set(row.id, {
        ...row,
        contact_email: f.contact_email,
        contact_phone: f.contact_phone,
        notes: f.notes,
      });
    });
    return m;
  }, [splitRows, firmsById]);

  const staffOptions: MultiSelectOption[] = useMemo(() => {
    return (employees ?? [])
      .map((e) => ({ value: e.id, label: e.full_name || e.email || "Unknown" }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const hasFilters = q.length > 0 || tz.length > 0 || staff.length > 0;

  return (
    <AuthGuard allow={["admin", "employee"]}>
      <AppShell crumbs={[{ label: "Firms" }]}>
        <PageHeader title="B2B Firms" actions={null} />

        {/* Compact filter row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0 sm:min-w-[220px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search firms…"
              className="h-9 pl-8"
            />
          </div>
          <MultiSelectCombobox
            options={TZ_OPTIONS}
            value={tz}
            onChange={setTzFilter}
            placeholder="All timezones"
            width="w-[180px]"
          />
          <MultiSelectCombobox
            options={staffOptions}
            value={staff}
            onChange={setStaff}
            placeholder="All team"
            width="w-[160px]"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 text-xs">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <div className="ml-auto">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as ViewMode)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="table" aria-label="Table view" title="Table view">
                <Rows3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="split" aria-label="Split view" title="Split view">
                <Columns2 className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {isLoading ? (
          view === "table" ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-[35%_65%] grid-cols-1 gap-2 h-[calc(100svh-240px)]">
              <Skeleton className="h-full" />
              <Skeleton className="h-full" />
            </div>
          )
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-10 w-10" />}
            title={firms?.length === 0 ? "No firms yet" : "No matches"}
            description={
              firms?.length === 0
                ? "Firms appear here once added in the Firm Hub."
                : "Try a different search or change the filters."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : view === "split" ? (
          <FirmsSplitPane
            rows={splitRows}
            detailsById={detailsById}
            onEdit={(firmId) => {
              const f = firmsById.get(firmId);
              if (f) setEditFirm(f);
            }}
          />
        ) : (
          <div className="rounded-md border bg-background overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40 sticky top-0">
                <TableRow>
                  <TableHead className="h-9 text-[11px] uppercase tracking-wide min-w-[220px]">
                    Firm
                  </TableHead>
                  <TableHead className="h-9 text-[11px] uppercase tracking-wide min-w-[200px]">
                    Primary Contact
                  </TableHead>
                  <TableHead className="h-9 text-[11px] uppercase tracking-wide min-w-[180px]">
                    US Timezone
                  </TableHead>
                  <TableHead className="h-9 text-[11px] uppercase tracking-wide min-w-[260px]">
                    Assigned Offshore Team
                  </TableHead>
                  <TableHead className="h-9 w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => {
                  const teamIds = teamByFirm.get(f.id) ?? [];
                  const teamMembers = teamIds
                    .map((id) => employeesById.get(id))
                    .filter((e): e is EmployeeOption => !!e);
                  return (
                    <TableRow key={f.id} className="h-10 hover:bg-muted/40">
                      <TableCell className="py-1.5 font-medium">
                        <Link
                          to="/ops/firms/$firmId"
                          params={{ firmId: f.id }}
                          className="inline-flex items-center gap-1.5 hover:text-primary hover:underline min-w-0"
                          title="Open firm dashboard"
                        >
                          <FirmCode code={f.firm_identifier} name={f.name} />
                          <span className="truncate">{f.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="text-sm truncate">{f.contact_email || "—"}</div>
                        {f.contact_phone && (
                          <div className="text-[11px] text-muted-foreground">{f.contact_phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span className="text-sm">{tzShort(f.us_timezone)}</span>
                      </TableCell>
                      <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {teamMembers.length > 0 && (
                            <AssigneeStack
                              size="sm"
                              max={4}
                              showTooltips={false}
                              people={teamMembers.map((m) => ({
                                id: m.id,
                                name: m.full_name || m.email || "",
                                avatar_url: m.avatar_url,
                              }))}
                            />
                          )}
                          <MultiEmployeeSelect
                            options={employees ?? []}
                            value={teamIds}
                            disabled={updateTeam.isPending}
                            onChange={(nextIds) =>
                              updateTeam.mutate({
                                firmId: f.id,
                                nextIds,
                                prevIds: teamIds,
                              })
                            }
                            placeholder="Assign team"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDrawerFirm(f as Firm)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Quick view
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({ to: "/ops/firms/$firmId", params: { firmId: f.id } })
                              }
                            >
                              <Building2 className="h-4 w-4 mr-2" />
                              Open page
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuItem onClick={() => setEditFirm(f as Firm)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setDeleteFirm(f as Firm);
                                    deleteCaptcha.reset();
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <FirmDetailDrawer
          firm={drawerFirm}
          open={!!drawerFirm}
          onOpenChange={(o) => !o && setDrawerFirm(null)}
        />

        {/* View dialog */}
        <Dialog open={!!viewFirm} onOpenChange={(o) => !o && setViewFirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{viewFirm?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                {viewFirm?.contact_email || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                {viewFirm?.contact_phone || "—"}
              </div>
              {viewFirm?.notes && (
                <div>
                  <span className="text-muted-foreground">Notes:</span>
                  <div className="mt-1 whitespace-pre-wrap">{viewFirm.notes}</div>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              {isAdmin && viewFirm && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditFirm(viewFirm);
                    setViewFirm(null);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              {viewFirm && (
                <Button
                  onClick={() =>
                    navigate({ to: "/ops/firms/$firmId", params: { firmId: viewFirm.id } })
                  }
                >
                  Open page
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit sheet */}
        <Sheet open={!!editFirm} onOpenChange={(o) => !o && setEditFirm(null)}>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit firm</SheetTitle>
              <SheetDescription>Update firm details and software stack.</SheetDescription>
            </SheetHeader>
            {editFirm && (
              <div className="py-4">
                <FirmEditForm
                  firm={editFirm}
                  pending={updateFirm.isPending}
                  onSubmit={(v) => updateFirm.mutate({ id: editFirm.id, ...v })}
                />
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Delete confirm */}
        <AlertDialog
          open={!!deleteFirm}
          onOpenChange={(o) => {
            if (!o) {
              setDeleteFirm(null);
              deleteCaptcha.reset();
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete firm "{deleteFirm?.name}"?</AlertDialogTitle>
              <CaptchaAlertDescription
                captchaKey={deleteCaptcha.nonce}
                onValidChange={deleteCaptcha.setValid}
              >
                All projects, entities, tasks, and messages under this firm will also be removed.
                This cannot be undone.
              </CaptchaAlertDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <CaptchaAlertAction
                valid={deleteCaptcha.valid}
                pending={removeFirm.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onConfirm={() => deleteFirm && removeFirm.mutate(deleteFirm.id)}
              >
                {removeFirm.isPending ? "Deleting…" : "Delete"}
              </CaptchaAlertAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppShell>
    </AuthGuard>
  );
}

function FirmEditForm({
  firm,
  onSubmit,
  pending,
}: {
  firm: Firm;
  onSubmit: (v: {
    name: string;
    contact_email: string | null;
    contact_phone: string | null;
    notes: string | null;
  }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(firm.name);
  const [email, setEmail] = useState(firm.contact_email ?? "");
  const [phone, setPhone] = useState(firm.contact_phone ?? "");
  const [notes, setNotes] = useState(firm.notes ?? "");
  const editCaptcha = useCaptchaGate(firm.id);
  useEffect(() => {
    setName(firm.name);
    setEmail(firm.contact_email ?? "");
    setPhone(firm.contact_phone ?? "");
    setNotes(firm.notes ?? "");
    editCaptcha.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firm]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (!editCaptcha.valid) return;
        onSubmit({
          name: name.trim(),
          contact_email: email.trim() || null,
          contact_phone: phone.trim() || null,
          notes: notes.trim() || null,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Firm name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Contact email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Contact phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <CaptchaBlock
        captchaKey={editCaptcha.nonce}
        onValidChange={editCaptcha.setValid}
        label="Solve this captcha before saving firm edits."
      />
      <DialogFooter>
        <Button type="submit" disabled={pending || !name.trim() || !editCaptcha.valid}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
