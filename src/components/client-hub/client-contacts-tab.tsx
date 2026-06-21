/**
 * Shared Contacts tab for both B2B Firms and B2C Clients.
 * Adapter-driven — reads contactsTable / contactCapsTable / fkColumn from
 * the ClientAdapter so this single component renders against either stream.
 *
 * Replaces the per-stream ContactsTab + ContactAccessDialog + ContactAccessBadges
 * trio that previously lived inside src/routes/clients/firm/$firmId.index.tsx.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createPortalUser } from "@/lib/auth/portal-users.functions";
import { FEATURE_MATRIX } from "@/lib/shared/firm-features";
import type { ClientAdapter } from "@/lib/client-hub/adapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ContactDraft = {
  id: string | null;
  full_name: string;
  role_title: string;
  email: string;
  phone: string;
  notes: string;
  portal_enabled: boolean;
  password: string;
};

const emptyContactDraft = (): ContactDraft => ({
  id: null,
  full_name: "",
  role_title: "",
  email: "",
  phone: "",
  notes: "",
  portal_enabled: false,
  password: "",
});

const ACCESS_COLORS: Record<string, string> = {
  tasks: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300",
  documents:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300",
  messages:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200 border-violet-300",
  invoices: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300",
  esign: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300",
  organizers: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200 border-cyan-300",
  audit_trail: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200 border-stone-300",
  pipeline: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-300",
};

interface Props {
  adapter: ClientAdapter;
  entityId: string;
}

export function ClientContactsTab({ adapter, entityId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(emptyContactDraft());
  const createPortalUserFn = useServerFn(createPortalUser);
  const isEdit = draft.id !== null;

  const contactsKey = [adapter.queryKeyPrefix, "contacts", entityId];

  const upd = <K extends keyof ContactDraft>(k: K, v: ContactDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const openAdd = () => {
    setDraft(emptyContactDraft());
    setOpen(true);
  };
  const openEdit = (c: any) => {
    setDraft({
      id: c.id,
      full_name: c.full_name ?? "",
      role_title: c.role_title ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
      portal_enabled: !!c.portal_enabled,
      password: "",
    });
    setOpen(true);
  };

  const { data: contacts = [] } = useQuery({
    queryKey: contactsKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from(adapter.contactsTable) as any)
        .select("*")
        .eq(adapter.fkColumn, entityId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.full_name.trim()) throw new Error("Name is required");
      if (draft.portal_enabled) {
        if (!draft.email) throw new Error("Email required to enable portal");
        if (draft.password && draft.password.length < 8)
          throw new Error("Password must be at least 8 characters");
      }
      const payload = {
        full_name: draft.full_name,
        email: draft.email || null,
        phone: draft.phone || null,
        role_title: draft.role_title || null,
        notes: draft.notes || null,
        portal_enabled: draft.portal_enabled,
      };
      let contactId = draft.id;
      if (isEdit && draft.id) {
        const { error } = await (supabase.from(adapter.contactsTable) as any)
          .update(payload)
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase.from(adapter.contactsTable) as any)
          .insert({ [adapter.fkColumn]: entityId, ...payload })
          .select("id")
          .single();
        if (error) throw error;
        contactId = (inserted as { id: string }).id;
      }
      if (draft.portal_enabled && draft.password && contactId) {
        await createPortalUserFn({
          data: {
            contactId,
            email: draft.email,
            password: draft.password,
            fullName: draft.full_name,
            stream: adapter.stream,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Contact updated" : "Contact added");
      setOpen(false);
      setDraft(emptyContactDraft());
      qc.invalidateQueries({ queryKey: contactsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(adapter.contactsTable) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKey }),
  });

  const togglePortal = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await (supabase.from(adapter.contactsTable) as any)
        .update({ portal_enabled: enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contactsKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const noun = adapter.entityNoun;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{noun} contacts</CardTitle>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setDraft(emptyContactDraft());
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAdd}>
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEdit ? "Edit contact" : "Add contact"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Full name *</Label>
                  <Input
                    value={draft.full_name}
                    onChange={(e) => upd("full_name", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Role / title</Label>
                  <Input
                    value={draft.role_title}
                    onChange={(e) => upd("role_title", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => upd("email", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={draft.phone} onChange={(e) => upd("phone", e.target.value)} />
                </div>
                <div>
                  <Label>Access notes</Label>
                  <Textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(e) => upd("notes", e.target.value)}
                    placeholder="e.g. Read-only access until April 15, MFA enforced, escalation contact only…"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Visible only to internal team. Use for notes about portal access, restrictions,
                    or onboarding context.
                  </p>
                </div>
                <div className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="text-sm font-medium">Enable client portal</div>
                    <div className="text-xs text-muted-foreground">
                      Allow this contact to sign in to the portal
                    </div>
                  </div>
                  <Switch
                    checked={draft.portal_enabled}
                    onCheckedChange={(v) => upd("portal_enabled", v)}
                  />
                </div>
                {draft.portal_enabled && (
                  <div className="space-y-1.5 border rounded-md p-3 bg-muted/30">
                    <Label>
                      Portal password{" "}
                      {isEdit && (
                        <span className="text-xs text-muted-foreground font-normal">
                          (leave blank to keep current)
                        </span>
                      )}
                    </Label>
                    <Input
                      type="password"
                      value={draft.password}
                      onChange={(e) => upd("password", e.target.value)}
                      placeholder="Min 8 characters"
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      A new portal account will be created (or updated) with this password. Email is
                      required.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate()} disabled={!draft.full_name || save.isPending}>
                  {isEdit ? "Save" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No contacts yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Access notes</TableHead>
                  <TableHead>Access given</TableHead>
                  <TableHead className="text-center">Portal</TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.full_name}</div>
                    </TableCell>
                    <TableCell>{c.role_title ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px]">
                      {c.notes ? (
                        <span className="text-xs whitespace-pre-wrap">{c.notes}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ContactAccessBadges
                        adapter={adapter}
                        contactId={c.id}
                        portalEnabled={!!c.portal_enabled}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={!!c.portal_enabled}
                        onCheckedChange={(v) => togglePortal.mutate({ id: c.id, enabled: v })}
                      />
                    </TableCell>
                    <TableCell>
                      {c.portal_enabled && <ContactAccessDialog adapter={adapter} contact={c} />}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => del.mutate(c.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About portal access</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Portal capabilities are configured per-contact. Enable a contact's portal access above,
          then click <span className="font-medium">Access</span> to choose which features they can
          use.
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- per-contact access dialog ---------- */
function ContactAccessDialog({ adapter, contact }: { adapter: ClientAdapter; contact: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const capsKey = [adapter.queryKeyPrefix, "contact-caps", contact.id];

  const { data: caps = [] } = useQuery({
    queryKey: capsKey,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase.from(adapter.contactCapsTable) as any)
        .select("capability, allowed")
        .eq("contact_id", contact.id);
      if (error) throw error;
      return (data ?? []) as { capability: string; allowed: boolean }[];
    },
  });

  const capMap = new Map<string, boolean>(caps.map((r: any) => [r.capability, r.allowed]));

  const setCap = useMutation({
    mutationFn: async ({ capability, allowed }: { capability: string; allowed: boolean }) => {
      const { error } = await (supabase.from(adapter.contactCapsTable) as any).upsert(
        { contact_id: contact.id, capability, allowed },
        { onConflict: "contact_id,capability" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: capsKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2 className="mr-1 h-3.5 w-3.5" />
          Access
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Portal access · {contact.full_name}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Choose which portal capabilities this contact can use. Defaults to enabled when not
            explicitly set.
          </p>
        </DialogHeader>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                <TableHead className="text-center w-24">Allowed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURE_MATRIX.map((f) => {
                const allowed = capMap.has(f.key) ? capMap.get(f.key)! : true;
                return (
                  <TableRow key={f.key}>
                    <TableCell>
                      <div className="font-medium text-sm">{f.label}</div>
                      {f.description && (
                        <div className="text-xs text-muted-foreground">{f.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={allowed}
                        onCheckedChange={(v) => setCap.mutate({ capability: f.key, allowed: v })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- inline access badges ---------- */
function ContactAccessBadges({
  adapter,
  contactId,
  portalEnabled,
}: {
  adapter: ClientAdapter;
  contactId: string;
  portalEnabled: boolean;
}) {
  const { data: caps = [] } = useQuery({
    queryKey: [adapter.queryKeyPrefix, "contact-caps", contactId],
    queryFn: async () => {
      const { data, error } = await (supabase.from(adapter.contactCapsTable) as any)
        .select("capability, allowed")
        .eq("contact_id", contactId);
      if (error) throw error;
      return (data ?? []) as { capability: string; allowed: boolean }[];
    },
  });
  if (!portalEnabled) return <span className="text-xs text-muted-foreground">Portal off</span>;
  const overrides = new Map<string, boolean>(caps.map((r: any) => [r.capability, r.allowed]));
  const allowed = FEATURE_MATRIX.filter((f) =>
    overrides.has(f.key) ? overrides.get(f.key)! : true,
  );
  if (allowed.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[280px]">
      {allowed.map((f) => (
        <span
          key={f.key}
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${ACCESS_COLORS[f.key] ?? "bg-muted text-foreground border-border"}`}
          title={f.description}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}
