/**
 * ClientProfileTab — adapter-driven Profile body shared between B2B Firm Hub
 * (B2B) and B2C Client Hub (B2C). Replaces the parallel firm-specific
 * ProfileTab/FirmAddressesCard/LifecycleTab. All table names, FK columns,
 * field aliases, query-key namespaces and storage paths are read from the
 * adapter so a single source of truth drives both streams.
 *
 * DRY: do NOT duplicate this body. To add a field, edit here; both hubs
 * gain it automatically.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Power,
  Pencil,
  Star,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  saveSharePointFirmSite,
  getFirmSharePointStatus,
} from "@/lib/sharepoint/sharepoint.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { CurrencyPicker } from "@/components/shared/currency-picker";
import type { ClientAdapter } from "@/lib/client-hub/adapter";

// Loose typing — adapter chooses the table at runtime; the supabase typed
// client cannot resolve a union of table names through `.from(string)`.
const db = supabase as unknown as {
  from: (t: string) => any;
  storage: typeof supabase.storage;
};

interface Entity {
  id: string;
  status?: string | null;
  [k: string]: any;
}

const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function ClientProfileTab({ adapter, entity }: { adapter: ClientAdapter; entity: Entity }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Entity>({ ...entity });
  // Tracks whether the user has actually edited a field. Used to (a) gate the
  // debounced auto-save so it never fires on mount/refetch and (b) prevent a
  // background refetch from clobbering in-progress edits.
  const dirtyRef = useRef(false);

  // Reset the local form ONLY when we switch to a different entity (by id).
  // Resetting on every `entity` object change would wipe what the user is
  // typing whenever React Query hands down a new object reference (e.g. from
  // this tab's own save invalidation, window-focus refetch, or staleness).
  useEffect(() => {
    setF({ ...entity });
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  const upd = (k: string, v: any) => {
    dirtyRef.current = true;
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const detailKey = [`${adapter.queryKeyPrefix}-entity`, entity.id];

  const save = useMutation({
    mutationFn: async (snapshot: Entity) => {
      const idUp = String(snapshot[adapter.codeField] ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{2,10}$/.test(idUp)) {
        throw new Error(`${adapter.codeLabel} must be 2–10 uppercase letters/digits`);
      }
      const payload: Record<string, any> = {
        [adapter.nameField]: snapshot[adapter.nameField],
        [adapter.codeField]: idUp,
        [adapter.contactEmailField]: snapshot[adapter.contactEmailField],
        [adapter.contactPhoneField]: snapshot[adapter.contactPhoneField],
        us_timezone: snapshot.us_timezone,
        billing_email: snapshot.billing_email,
        notes: snapshot.notes,
        image_url: snapshot.image_url,
        currency: (snapshot.currency ?? "USD").toUpperCase(),
      };
      const { error } = await db.from(adapter.table).update(payload).eq("id", entity.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({ queryKey: [`${adapter.queryKeyPrefix}-firm`, entity.id] });
      qc.invalidateQueries({ queryKey: ["direct-client-detail", entity.id] });
      qc.invalidateQueries({ queryKey: ["unified-clients", "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Debounced auto-save — only after a real user edit, never on mount/refetch.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => {
      save.mutate(f);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const displayName = String(f[adapter.nameField] ?? "");
  const initials =
    displayName
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || adapter.entityNoun[0];

  const onPickImage = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Max 5MB");
      return;
    }
    const ext = file.name.split(".").pop() || "png";
    const path = `${adapter.brandingPathPrefix}/${entity.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    const url = pub.publicUrl;
    upd("image_url", url);
    const { error } = await db.from(adapter.table).update({ image_url: url }).eq("id", entity.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Image updated");
    qc.invalidateQueries({ queryKey: detailKey });
  };

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
        <div className="flex flex-wrap items-center gap-5">
          <label className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground text-2xl font-semibold shadow-lg ring-4 ring-background">
            {f.image_url ? (
              <img src={f.image_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
            <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-[10px] font-medium uppercase tracking-wider group-hover:flex">
              Change
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && onPickImage(e.target.files[0])}
            />
          </label>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">
              {displayName || `Untitled ${adapter.entityNoun.toLowerCase()}`}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {(f[adapter.contactEmailField] as string) ?? "No primary contact"} ·{" "}
              {f.us_timezone ?? "America/New_York"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant={entity.status === "deactivated" ? "destructive" : "default"}>
                {entity.status ?? "active"}
              </Badge>
              {f.country && (
                <Badge variant="outline">
                  {[f.city, f.state, f.country].filter(Boolean).join(", ")}
                </Badge>
              )}
            </div>
          </div>
          {save.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
      </div>

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{adapter.entityNoun} Name</Label>
            <Input
              value={(f[adapter.nameField] as string) ?? ""}
              onChange={(e) => upd(adapter.nameField, e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{adapter.codeLabel} *</Label>
            <Input
              value={(f[adapter.codeField] as string) ?? ""}
              onChange={(e) =>
                upd(
                  adapter.codeField,
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 10),
                )
              }
              placeholder="VPC"
              maxLength={10}
              className="font-mono uppercase"
            />
            <p className="text-[10px] text-muted-foreground">
              2–10 letters/digits. Shown in tables and badges instead of the full name.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>US Timezone</Label>
            <Select
              value={(f.us_timezone as string) ?? "America/New_York"}
              onValueChange={(v) => upd("us_timezone", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {US_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Contact Email</Label>
            <Input
              value={(f[adapter.contactEmailField] as string) ?? ""}
              onChange={(e) => upd(adapter.contactEmailField, e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Phone</Label>
            <Input
              value={(f[adapter.contactPhoneField] as string) ?? ""}
              onChange={(e) => upd(adapter.contactPhoneField, e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default currency</Label>
            <CurrencyPicker
              value={(f.currency as string) ?? "USD"}
              onChange={(v) => upd("currency", v ?? "USD")}
            />
            <p className="text-[10px] text-muted-foreground">
              Used as default for every project/task and pricing period in this{" "}
              {adapter.entityNoun.toLowerCase()}.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Addresses */}
      <ClientAddressesCard adapter={adapter} entityId={entity.id} />

      {/* Billing & internal notes */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Billing email</Label>
              <Input
                value={(f.billing_email as string) ?? ""}
                onChange={(e) => upd("billing_email", e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Billing address mirrors the primary address above.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={7}
              value={(f.notes as string) ?? ""}
              onChange={(e) => upd("notes", e.target.value)}
              placeholder={`Anything the team should know about this ${adapter.entityNoun.toLowerCase()}…`}
            />
          </CardContent>
        </Card>
      </div>

      {/* SharePoint — firms only */}
      {adapter.table === "firms" && <FirmSharePointCard firmId={entity.id} />}

      {/* Lifecycle */}
      <ClientLifecycleSection adapter={adapter} entity={f} detailKey={detailKey} />
    </div>
  );
}

/* -------------------- ADDRESSES (multiple) -------------------- */
type AddressRow = {
  id: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_primary: boolean;
  notes: string | null;
};

function ClientAddressesCard({ adapter, entityId }: { adapter: ClientAdapter; entityId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<AddressRow>>({});
  const isEdit = !!draft.id;
  const key = [`${adapter.queryKeyPrefix}-addresses`, entityId];

  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db
        .from(adapter.addressesTable)
        .select("*")
        .eq(adapter.fkColumn, entityId)
        .order("is_primary", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as AddressRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        label: draft.label || null,
        address_line1: draft.address_line1 || null,
        address_line2: draft.address_line2 || null,
        city: draft.city || null,
        state: draft.state || null,
        postal_code: draft.postal_code || null,
        country: draft.country || "USA",
        is_primary: !!draft.is_primary,
        notes: draft.notes || null,
      };
      if (isEdit && draft.id) {
        const { error } = await db.from(adapter.addressesTable).update(payload).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from(adapter.addressesTable)
          .insert({ [adapter.fkColumn]: entityId, ...payload });
        if (error) throw error;
      }
      if (payload.is_primary) {
        await db
          .from(adapter.addressesTable)
          .update({ is_primary: false })
          .eq(adapter.fkColumn, entityId)
          .neq("id", draft.id ?? "00000000-0000-0000-0000-000000000000");
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Address updated" : "Address added");
      setOpen(false);
      setDraft({});
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(adapter.addressesTable).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const upd = <K extends keyof AddressRow>(k: K, v: AddressRow[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const openAdd = () => {
    setDraft({ country: "USA", is_primary: rows.length === 0 });
    setOpen(true);
  };
  const openEdit = (r: AddressRow) => {
    setDraft(r);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Addresses</CardTitle>
          <p className="text-xs text-muted-foreground">
            Add one or more addresses. Mark one as primary (used for billing).
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setDraft({});
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1 h-4 w-4" />
              Add address
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEdit ? "Edit address" : "Add address"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 space-y-1.5">
                <Label>Label</Label>
                <Input
                  placeholder="e.g. HQ, Branch, Billing"
                  value={draft.label ?? ""}
                  onChange={(e) => upd("label", e.target.value)}
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Address line 1</Label>
                <Input
                  value={draft.address_line1 ?? ""}
                  onChange={(e) => upd("address_line1", e.target.value)}
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Address line 2</Label>
                <Input
                  value={draft.address_line2 ?? ""}
                  onChange={(e) => upd("address_line2", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={draft.city ?? ""} onChange={(e) => upd("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={draft.state ?? ""} onChange={(e) => upd("state", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Postal code</Label>
                <Input
                  value={draft.postal_code ?? ""}
                  onChange={(e) => upd("postal_code", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input
                  value={draft.country ?? "USA"}
                  onChange={(e) => upd("country", e.target.value)}
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={draft.notes ?? ""}
                  onChange={(e) => upd("notes", e.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-between border rounded-md p-3">
                <div className="text-sm font-medium">Primary (billing) address</div>
                <Switch
                  checked={!!draft.is_primary}
                  onCheckedChange={(v) => upd("is_primary", v)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {isEdit ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No addresses yet.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="border rounded-md p-3 flex items-start justify-between gap-3"
              >
                <div className="text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {r.is_primary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />}
                    {r.label || "Address"}
                    {r.is_primary && (
                      <Badge variant="secondary" className="text-[10px]">
                        Primary
                      </Badge>
                    )}
                  </div>
                  {r.address_line1 && <div>{r.address_line1}</div>}
                  {r.address_line2 && <div>{r.address_line2}</div>}
                  <div className="text-muted-foreground">
                    {[r.city, r.state, r.postal_code].filter(Boolean).join(", ")}
                    {r.country ? ` · ${r.country}` : ""}
                  </div>
                  {r.notes && (
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {r.notes}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => del.mutate(r.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- LIFECYCLE -------------------- */
const MANUAL_LIFECYCLE_EVENTS = [
  "note",
  "call",
  "meeting",
  "email",
  "contract_signed",
  "engagement_started",
  "engagement_ended",
  "renewal",
  "escalation",
  "milestone",
  "other",
];

function ClientLifecycleSection({
  adapter,
  entity,
  detailKey,
}: {
  adapter: ClientAdapter;
  entity: Entity;
  detailKey: unknown[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const lifecycleKey = [`${adapter.queryKeyPrefix}-lifecycle`, entity.id];

  const { data: events = [] } = useQuery({
    queryKey: lifecycleKey,
    queryFn: async () => {
      const { data, error } = await db
        .from(adapter.lifecycleTable)
        .select("*")
        .eq(adapter.fkColumn, entity.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const isActive = entity.status !== "deactivated";

  const toggle = useMutation({
    mutationFn: async () => {
      const next = isActive ? "deactivated" : "active";
      const update: Record<string, any> = { status: next };
      if (isActive) {
        update.deactivated_at = new Date().toISOString();
        update.deactivated_by = user?.id ?? null;
        update.deactivation_reason = reason || null;
      } else {
        update.deactivated_at = null;
        update.deactivated_by = null;
        update.deactivation_reason = null;
      }
      const { error } = await db.from(adapter.table).update(update).eq("id", entity.id);
      if (error) throw error;
      await db.from(adapter.lifecycleTable).insert({
        [adapter.fkColumn]: entity.id,
        event_type: isActive ? "deactivated" : "reactivated",
        actor_id: user?.id ?? null,
        payload: { reason },
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({ queryKey: lifecycleKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">
                {isActive
                  ? `Deactivate ${adapter.entityNoun.toLowerCase()}`
                  : `Reactivate ${adapter.entityNoun.toLowerCase()}`}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isActive
                  ? "Freezes the portal, hides from active dashboards. Data is preserved."
                  : `Restores the ${adapter.entityNoun.toLowerCase()} to active status.`}
              </p>
              {entity.deactivation_reason && (
                <p className="text-xs mt-2">Last reason: {entity.deactivation_reason}</p>
              )}
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant={isActive ? "destructive" : "default"}>
                  <Power className="mr-2 h-4 w-4" />
                  {isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {isActive ? "Deactivate" : "Reactivate"} {entity[adapter.nameField] as string}
                  </DialogTitle>
                </DialogHeader>
                {isActive && (
                  <div>
                    <Label>Reason</Label>
                    <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => toggle.mutate()} disabled={toggle.isPending}>
                    Confirm
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lifecycle history</CardTitle>
          <ManualLifecycleEntry
            adapter={adapter}
            entityId={entity.id}
            lifecycleKey={lifecycleKey}
          />
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No events.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events as any[]).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge variant="outline">{e.event_type}</Badge>
                    </TableCell>
                    <TableCell>{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs whitespace-pre-wrap">
                      {e.payload?.reason ?? e.payload?.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ManualLifecycleEntry({
  adapter,
  entityId,
  lifecycleKey,
}: {
  adapter: ClientAdapter;
  entityId: string;
  lifecycleKey: unknown[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState<string>("note");
  const [occurredAt, setOccurredAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState("");

  const reset = () => {
    setEventType("note");
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setOccurredAt(d.toISOString().slice(0, 16));
    setNote("");
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!eventType.trim()) throw new Error("Event type is required");
      const createdAt = occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();
      const { error } = await db.from(adapter.lifecycleTable).insert({
        [adapter.fkColumn]: entityId,
        event_type: eventType.trim(),
        actor_id: user?.id ?? null,
        payload: { reason: note || null, manual: true },
        created_at: createdAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry added");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: lifecycleKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" />
          Add entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add lifecycle entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Event type *</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_LIFECYCLE_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>When</Label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- FIRM SHAREPOINT CARD -------------------- */
function FirmSharePointCard({ firmId }: { firmId: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSharePointFirmSite);
  const getStatusFn = useServerFn(getFirmSharePointStatus);

  // Provisioning is now inline — no polling needed. Just fetch once on mount.
  const { data: status, isLoading } = useQuery({
    queryKey: ["firm-sharepoint-status", firmId],
    queryFn: () => getStatusFn({ data: { firm_id: firmId } }),
  });

  const [siteUrl, setSiteUrl] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (status !== undefined) {
      setSiteUrl(status?.site_url ?? "");
      setDirty(false);
    }
  }, [status]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { firm_id: firmId, site_url: siteUrl.trim() } }),
    onSuccess: () => {
      toast.success(siteUrl.trim() ? "SharePoint site connected" : "SharePoint site URL cleared");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["firm-sharepoint-status", firmId] });
    },
    onError: (e: Error) => toast.error(`SharePoint error: ${e.message}`),
  });

  const provStatus = status?.provisioning_status;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">SharePoint</CardTitle>
        <div className="ml-auto">
          {save.isPending && (
            <Badge variant="secondary" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Connecting…
            </Badge>
          )}
          {!save.isPending && !isLoading && (
            <>
              {provStatus === "active" && (
                <Badge variant="outline" className="gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </Badge>
              )}
              {provStatus === "failed" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Failed
                </Badge>
              )}
              {(!provStatus || provStatus === "not_configured" || provStatus === "pending") && (
                <Badge variant="secondary">Not configured</Badge>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Paste the URL of this firm's dedicated SharePoint site (created in SharePoint Admin).
          BusAcTa will resolve the site ID and auto-create task folders inside each project's
          Document Library.
        </p>
        <div className="space-y-1.5">
          <Label className="text-sm">SharePoint site URL</Label>
          <Input
            value={siteUrl}
            onChange={(e) => {
              setSiteUrl(e.target.value);
              setDirty(true);
            }}
            placeholder="https://contoso.sharepoint.com/sites/SmithCPA"
          />
        </div>
        {provStatus === "active" && status?.sp_site_url && (
          <a
            href={status.sp_site_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
          >
            <ExternalLink className="h-3 w-3" /> Open in SharePoint
          </a>
        )}
        {save.isError && (
          <p className="text-xs text-destructive rounded border border-destructive/30 bg-destructive/5 p-2">
            {save.error?.message}
          </p>
        )}
        {provStatus === "failed" && status?.provisioning_error && !save.isError && (
          <p className="text-xs text-destructive rounded border border-destructive/30 bg-destructive/5 p-2">
            {status.provisioning_error}
          </p>
        )}
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${save.isPending ? "animate-spin" : ""}`} />
          {save.isPending ? "Connecting…" : "Save & Configure"}
        </Button>
      </CardContent>
    </Card>
  );
}
