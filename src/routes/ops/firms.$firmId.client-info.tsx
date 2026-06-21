import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building,
  Globe,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Wrench,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveUsClock } from "@/components/shell/live-us-clock";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useAuth } from "@/lib/auth/auth-context";
import {
  US_TIMEZONE_OPTIONS,
  ACCOUNTING_SOFTWARE_OPTIONS,
  TAX_SOFTWARE_OPTIONS,
  PM_SOFTWARE_OPTIONS,
} from "@/lib/shared/domain";
import {
  firmInfoQuery,
  updateFirmInfo,
  firmContactsQuery,
  createFirmContact,
  deleteFirmContact,
  firmInternalTeamQuery,
  firmInternalTeamProfilesQuery,
  internalEligibleProfilesQuery,
  addFirmInternalTeamMember,
  removeFirmInternalTeamMember,
  type FirmContactRow as FirmContact,
} from "@/lib/queries/ops.queries";

export const Route = createFileRoute("/ops/firms/$firmId/client-info")({
  component: FirmClientInfoPage,
  errorComponent: RouteErrorComponent,
});

function FirmClientInfoPage() {
  const { firmId } = Route.useParams();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isInternal = role === "admin" || role === "employee";
  const isAdmin = role === "admin";
  const [editing, setEditing] = useState(false);

  const { data: firm, isLoading } = useQuery(firmInfoQuery(firmId));

  const [addr, setAddr] = useState("");
  const [tz, setTz] = useState("America/New_York");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [accSw, setAccSw] = useState<string[]>([]);
  const [taxSw, setTaxSw] = useState<string[]>([]);
  const [pmSw, setPmSw] = useState<string[]>([]);

  useEffect(() => {
    if (firm) {
      setAddr(firm.address ?? "");
      setTz(firm.us_timezone ?? "America/New_York");
      setEmail(firm.contact_email ?? "");
      setPhone(firm.contact_phone ?? "");
      setNotes(firm.notes ?? "");
      setAccSw((firm.accounting_software as string[] | null) ?? []);
      setTaxSw((firm.tax_software as string[] | null) ?? []);
      setPmSw((firm.pm_software as string[] | null) ?? []);
    }
  }, [firm]);

  const save = useMutation({
    mutationFn: () =>
      updateFirmInfo({
        firmId,
        address: addr.trim() || null,
        us_timezone: tz,
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        notes: notes.trim() || null,
        accounting_software: accSw,
        tax_software: taxSw,
        pm_software: pmSw,
      }),
    onSuccess: () => {
      toast.success("Client info updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["firm-info", firmId] });
      qc.invalidateQueries({ queryKey: ["firm", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );

  return (
    <div className="h-full min-h-0 overflow-y-auto scroll-modern space-y-4 pr-1">
      {/* Profile card */}
      <Card className="glass border-border-subtle">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Building className="h-4 w-4 text-primary" />
              Firm profile
            </h3>
            {isInternal && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Contact email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>US Time zone</Label>
                <Select value={tz} onValueChange={setTz}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {US_TIMEZONE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Permanent notes</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <SoftwareEditor
                  label="Accounting Software"
                  options={ACCOUNTING_SOFTWARE_OPTIONS}
                  value={accSw}
                  onChange={setAccSw}
                />
                <SoftwareEditor
                  label="Tax Software"
                  options={TAX_SOFTWARE_OPTIONS}
                  value={taxSw}
                  onChange={setTaxSw}
                />
                <SoftwareEditor
                  label="Project Management"
                  options={PM_SOFTWARE_OPTIONS}
                  value={pmSw}
                  onChange={setPmSw}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
                  <Building className="h-3 w-3" />
                  Address
                </div>
                <div className="mt-1 whitespace-pre-wrap">
                  {firm?.address || <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  Live US Time
                </div>
                <div className="mt-1">
                  <LiveUsClock timezone={firm?.us_timezone ?? null} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Zone: {firm?.us_timezone ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Contact email
                </div>
                <div className="mt-1">
                  {firm?.contact_email || <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Contact phone
                </div>
                <div className="mt-1">
                  {firm?.contact_phone || <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Software stacks (read view) */}
      {!editing && (
        <Card className="glass border-border-subtle">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Software stack
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <SoftwareView
                label="Accounting Software"
                items={(firm?.accounting_software as string[] | null) ?? []}
              />
              <SoftwareView
                label="Tax Software"
                items={(firm?.tax_software as string[] | null) ?? []}
              />
              <SoftwareView
                label="Project Management"
                items={(firm?.pm_software as string[] | null) ?? []}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permanent notes preview */}
      {!editing && firm?.notes && (
        <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-500/10 dark:border-amber-500/40">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
              Permanent firm notes
            </div>
            <div className="text-sm whitespace-pre-wrap">{firm.notes}</div>
          </CardContent>
        </Card>
      )}

      {/* Contacts + internal team */}
      <div className="grid gap-4 md:grid-cols-2">
        <ContactsList firmId={firmId} isInternal={isInternal} />
        <InternalTeamList firmId={firmId} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

function SoftwareView({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      {items.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((s) => (
            <Badge key={s} variant="secondary" className="text-[11px]">
              {s}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function SoftwareEditor({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 rounded-md border p-2 max-h-40 overflow-y-auto">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`text-[11px] rounded-full px-2 py-1 transition-colors ${
              value.includes(opt)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContactsList({ firmId, isInternal }: { firmId: string; isInternal: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const { data } = useQuery(firmContactsQuery(firmId));
  const add = useMutation({
    mutationFn: () =>
      createFirmContact({
        firmId,
        full_name: name.trim(),
        role_title: title.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Contact added");
      setOpen(false);
      setName("");
      setTitle("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["firm-contacts", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFirmContact(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firm-contacts", firmId] }),
  });
  return (
    <Card className="glass border-border-subtle">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 text-primary" />
            Client-side contacts
          </h4>
          {isInternal && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </div>
        {(data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No contacts on file.</p>
        ) : (
          <ul className="space-y-1.5">
            {(data ?? []).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {c.full_name}{" "}
                    {c.role_title && (
                      <span className="text-xs text-muted-foreground">— {c.role_title}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {isInternal && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive shrink-0"
                    onClick={() => {
                      if (confirm("Remove contact?")) remove.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add contact</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Role / title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? "Adding…" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function InternalTeamList({ firmId, isAdmin }: { firmId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const { data: rows } = useQuery(firmInternalTeamQuery(firmId));
  const userIds = (rows ?? []).map((r) => r.user_id);
  const { data: profiles } = useQuery(firmInternalTeamProfilesQuery(userIds));
  const { data: allStaff } = useQuery({
    ...internalEligibleProfilesQuery(),
    enabled: open && isAdmin,
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      await addFirmInternalTeamMember({
        firmId,
        userId,
        roleLabel: roleLabel.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Added");
      setOpen(false);
      setUserId("");
      setRoleLabel("");
      qc.invalidateQueries({ queryKey: ["firm-internal-team", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeFirmInternalTeamMember(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firm-internal-team", firmId] }),
  });
  return (
    <Card className="glass border-border-subtle">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 text-primary" />
            Internal team
          </h4>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Assign
            </Button>
          )}
        </div>
        {(rows ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No internal team assigned.</p>
        ) : (
          <ul className="space-y-1.5">
            {(rows ?? []).map((r) => {
              const p = (profiles ?? []).find((x) => x.id === r.user_id);
              return (
                <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {p?.full_name || p?.email || r.user_id.slice(0, 8)}
                    </div>
                    {r.role_label && (
                      <div className="text-xs text-muted-foreground">{r.role_label}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => {
                        if (confirm("Remove?")) remove.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign team member</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {(allStaff ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder="Role label (optional)"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!userId || add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? "Adding…" : "Assign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
