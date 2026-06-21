import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { createEmployee, updateEmployee } from "@/lib/hr/employees.functions";
import { PermissionMatrixEditor } from "@/components/hr/permission-matrix-editor";
import type { PermissionMap } from "@/lib/hr/employees.server";
import { useState } from "react";

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
] as const;

const POSITION_OPTIONS = [
  "partner",
  "manager",
  "senior",
  "staff",
  "reviewer",
  "preparer",
  "other",
] as const;

const formSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Valid email is required").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  employee_id: z
    .string()
    .trim()
    .min(1, "Employee ID is required")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Only letters, digits, . _ -"),
  department: z.enum(["ops", "finance", "hr", "exec"]).optional().or(z.literal("")),
  position: z.string().optional().or(z.literal("")),
  position_title: z.string().trim().max(120).optional().or(z.literal("")),
  employment_type: z
    .enum(["full_time", "part_time", "contractor", "intern"])
    .optional()
    .or(z.literal("")),
  join_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  assigned_firm_id: z.string().uuid().optional().or(z.literal("")),
  system_role: z.enum(["employee", "admin", "super_admin", "hr_manager"]),
  subrole_id: z.string().uuid().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export type EmployeeEditTarget = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  department: string | null;
  position: string | null;
  position_title: string | null;
  employment_type: string | null;
  join_date: string | null;
  firm_id: string | null;
};

export function EmployeeCreateSheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  edit?: EmployeeEditTarget | null;
}) {
  const { open, onOpenChange, edit } = props;
  const isEdit = !!edit;
  const qc = useQueryClient();
  const createFn = useServerFn(createEmployee);
  const updateFn = useServerFn(updateEmployee);
  const [perms, setPerms] = useState<PermissionMap>({});

  const firmsQ = useQuery({
    queryKey: ["hr", "employees", "firms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firms").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const subrolesQ = useQuery({
    queryKey: ["role-subroles", "for-employee-sheet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_subroles" as never)
        .select("id, name, base_role")
        .order("base_role")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; base_role: string }>;
    },
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: edit?.first_name ?? "",
      last_name: edit?.last_name ?? "",
      email: edit?.email ?? "",
      phone: edit?.phone ?? "",
      employee_id: edit?.employee_id ?? "",
      department: (edit?.department as any) ?? "",
      position: edit?.position ?? "",
      position_title: edit?.position_title ?? "",
      employment_type: (edit?.employment_type as any) ?? "",
      join_date: edit?.join_date ?? "",
      assigned_firm_id: edit?.firm_id ?? "",
      system_role: "employee",
      subrole_id: "",
    },
    values: isEdit
      ? {
          first_name: edit?.first_name ?? "",
          last_name: edit?.last_name ?? "",
          email: edit?.email ?? "",
          phone: edit?.phone ?? "",
          employee_id: edit?.employee_id ?? "",
          department: (edit?.department as any) ?? "",
          position: edit?.position ?? "",
          position_title: edit?.position_title ?? "",
          employment_type: (edit?.employment_type as any) ?? "",
          join_date: edit?.join_date ?? "",
          assigned_firm_id: edit?.firm_id ?? "",
          system_role: "employee",
          subrole_id: "",
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const nullify = (s: string | undefined) => (s && s.length ? s : null);
      if (isEdit && edit) {
        return updateFn({
          data: {
            userId: edit.id,
            patch: {
              first_name: v.first_name,
              last_name: v.last_name,
              phone: nullify(v.phone) ?? undefined,
              employee_id: v.employee_id,
              department: (nullify(v.department) as any) ?? undefined,
              position: nullify(v.position) ?? undefined,
              position_title: nullify(v.position_title) ?? undefined,
              employment_type: (nullify(v.employment_type) as any) ?? undefined,
              join_date: nullify(v.join_date) ?? undefined,
              assigned_firm_id: nullify(v.assigned_firm_id) ?? undefined,
            },
            permissions: Object.keys(perms).length > 0 ? perms : undefined,
          },
        });
      }
      return createFn({
        data: {
          first_name: v.first_name,
          last_name: v.last_name,
          email: v.email,
          phone: nullify(v.phone),
          employee_id: v.employee_id,
          department: nullify(v.department) as any,
          position: nullify(v.position),
          position_title: nullify(v.position_title),
          employment_type: nullify(v.employment_type) as any,
          join_date: nullify(v.join_date),
          assigned_firm_id: nullify(v.assigned_firm_id),
          system_role: v.system_role,
          subrole_id: nullify(v.subrole_id),
          permissions: Object.keys(perms).length > 0 ? perms : undefined,
          // Provenance guard: this UI lives at /hr — server rejects any
          // createEmployee call without this discriminator.
          origin: "hr_hub",
        },
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Employee updated" : "Employee created — password-setup email sent");
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
      onOpenChange(false);
      form.reset();
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Operation failed");
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit employee" : "Add employee"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update employee information. Role and email changes happen in Admin → Team."
              : "Creates an internal user account, assigns a role, and emails a password-setup link."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6 py-4">
          <Section title="Basic Info">
            <Field label="First name" error={form.formState.errors.first_name?.message}>
              <Input {...form.register("first_name")} />
            </Field>
            <Field label="Last name" error={form.formState.errors.last_name?.message}>
              <Input {...form.register("last_name")} />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" disabled={isEdit} {...form.register("email")} />
            </Field>
            <Field label="Phone" error={form.formState.errors.phone?.message}>
              <Input {...form.register("phone")} />
            </Field>
          </Section>

          <Section title="Job Details">
            <Field label="Employee ID" error={form.formState.errors.employee_id?.message}>
              <Input placeholder="E.g. EMP-0123" {...form.register("employee_id")} />
            </Field>
            <Field label="Department">
              <SelectField
                value={form.watch("department") ?? ""}
                onChange={(v) => form.setValue("department", v as any)}
                placeholder="Select department"
                options={[
                  { value: "ops", label: "Operations" },
                  { value: "finance", label: "Finance" },
                  { value: "hr", label: "Human Resources" },
                  { value: "exec", label: "Executive" },
                ]}
              />
            </Field>
            <Field label="Position bucket">
              <SelectField
                value={form.watch("position") ?? ""}
                onChange={(v) => form.setValue("position", v)}
                placeholder="Select position"
                options={POSITION_OPTIONS.map((p) => ({
                  value: p,
                  label: p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                }))}
              />
            </Field>
            <Field label="Position title">
              <Input placeholder="E.g. Senior Tax Associate" {...form.register("position_title")} />
            </Field>
            <Field label="Employment type">
              <SelectField
                value={form.watch("employment_type") ?? ""}
                onChange={(v) => form.setValue("employment_type", v as any)}
                placeholder="Select type"
                options={[
                  { value: "full_time", label: "Full-Time" },
                  { value: "part_time", label: "Part-Time" },
                  { value: "contractor", label: "Contractor" },
                  { value: "intern", label: "Intern" },
                ]}
              />
            </Field>
            <Field label="Join date">
              <Input type="date" {...form.register("join_date")} />
            </Field>
            <Field label="Assigned firm">
              <SelectField
                value={form.watch("assigned_firm_id") ?? ""}
                onChange={(v) => form.setValue("assigned_firm_id", v)}
                placeholder="Unassigned"
                options={(firmsQ.data ?? []).map((f: any) => ({ value: f.id, label: f.name }))}
              />
            </Field>
          </Section>

          {!isEdit && (
            <Section title="System Access">
              <Field label="Role" error={form.formState.errors.system_role?.message}>
                <SelectField
                  value={form.watch("system_role")}
                  onChange={(v) => {
                    form.setValue("system_role", v as any);
                    form.setValue("subrole_id", "");
                  }}
                  placeholder="Select role"
                  options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
                />
              </Field>
              <Field label="Sub-role (optional)">
                <SelectField
                  value={form.watch("subrole_id") ?? ""}
                  onChange={(v) => form.setValue("subrole_id", v)}
                  placeholder={
                    (subrolesQ.data ?? []).some((s) => s.base_role === form.watch("system_role"))
                      ? "None"
                      : "No sub-roles for this role"
                  }
                  options={(subrolesQ.data ?? [])
                    .filter((s) => s.base_role === form.watch("system_role"))
                    .map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Client portal access is provisioned separately. Employees created here cannot be
                  assigned the <strong>client</strong> role.
                </AlertDescription>
              </Alert>
            </Section>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Hub permissions</h3>
            <p className="text-xs text-muted-foreground -mt-2">
              Optional per-hub overrides. Anything left as <em>Inherit</em> falls back to the global
              setting.
            </p>
            <PermissionMatrixEditor userId={edit?.id} value={perms} onChange={setPerms} />
          </div>

          <SheetFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create employee"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
