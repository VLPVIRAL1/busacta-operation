import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, CalendarCheck, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { upsertHoliday, deleteHoliday } from "@/lib/hr/payroll.functions";
import { payrollHolidaysQuery, type PayrollHoliday } from "@/lib/queries/payroll.queries";
import { cn } from "@/lib/shared/utils";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";

// ── Types ─────────────────────────────────────────────────────────────────────

type HolidayType = "mandatory" | "optional" | "festival";

type RegularForm = {
  kind: "regular";
  date: string;
  name: string;
  type: "mandatory" | "optional";
};

type FestivalForm = {
  kind: "festival";
  festival_month: number;
  festival_day: number;
  name: string;
};

type HolidayForm = RegularForm | FestivalForm;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const NEW_ID = "__new__";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function festivalLabel(h: PayrollHoliday) {
  if (!h.festival_month || !h.festival_day) return h.name;
  return `${h.festival_day} ${MONTH_NAMES[(h.festival_month ?? 1) - 1].slice(0, 3)}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function HolidayCalendarSection() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: holidays = [], isLoading } = useQuery(payrollHolidaysQuery(year));

  const mandatoryCount = (holidays as PayrollHoliday[]).filter(
    (h) => !h.is_optional && !h.is_festival,
  ).length;

  // Auto-select first holiday when list loads / year changes
  useEffect(() => {
    const list = holidays as PayrollHoliday[];
    if (list.length > 0 && selectedId !== NEW_ID) {
      if (!selectedId || !list.find((h) => h.id === selectedId)) {
        setSelectedId(list[0].id);
      }
    }
  }, [holidays, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedHoliday =
    selectedId && selectedId !== NEW_ID
      ? ((holidays as PayrollHoliday[]).find((h) => h.id === selectedId) ?? null)
      : null;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHoliday({ data: { holiday_id: id } }),
    onSuccess: (_, id) => {
      const h = (holidays as PayrollHoliday[]).find((x) => x.id === id);
      toast.success(h?.is_festival ? "Festival removed (all years)" : "Holiday removed");
      qc.invalidateQueries({ queryKey: ["payroll", "holidays", year] });
      if (selectedId === id) setSelectedId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leftPane = (
    <div className="h-full flex flex-col overflow-hidden border rounded-lg bg-background">
      {/* Year + count header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b">
        <Label className="text-xs">Year</Label>
        <Input
          type="number"
          className="h-7 w-20 text-xs"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <span className="text-[10px] text-muted-foreground ml-auto">{mandatoryCount}m</span>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {isLoading && (
          <p className="text-xs text-muted-foreground px-3 py-4 text-center">Loading…</p>
        )}

        {!isLoading && (holidays as PayrollHoliday[]).length === 0 && (
          <p className="text-[11px] text-muted-foreground px-3 py-4 text-center">
            No holidays for {year}.
          </p>
        )}

        {(holidays as PayrollHoliday[]).map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setSelectedId(h.id)}
            className={cn(
              "w-full text-left flex items-start gap-2 px-3 py-2 rounded-md transition-colors",
              selectedId === h.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {h.is_festival ? (
              <Repeat className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500" />
            ) : (
              <span className="mt-0.5 shrink-0 w-3.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{h.name}</p>
              <p className="text-[11px] opacity-70">
                {h.is_festival ? festivalLabel(h) + " · every year" : formatDate(h.holiday_date)}
              </p>
            </div>
            {!h.is_optional && !h.is_festival && (
              <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </button>
        ))}

        {/* Add new */}
        <button
          type="button"
          onClick={() => setSelectedId(NEW_ID)}
          className={cn(
            "w-full text-left flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
            selectedId === NEW_ID
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="text-sm">Add Holiday</span>
        </button>
      </div>
    </div>
  );

  const rightPane = (
    <div className="h-full flex flex-col overflow-hidden border rounded-lg bg-background overflow-y-auto">
      {selectedId === NEW_ID ? (
        <NewHolidayPanel
          year={year}
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ["payroll", "holidays", year] });
            setSelectedId(id ?? null);
          }}
        />
      ) : selectedHoliday ? (
        <HolidayEditPanel
          key={selectedHoliday.id}
          holiday={selectedHoliday}
          year={year}
          onDelete={() => deleteMutation.mutate(selectedHoliday.id)}
          deleting={deleteMutation.isPending}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <CalendarCheck className="h-8 w-8 opacity-30" />
          <p className="text-sm">Select a holiday or add a new one.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col p-2">
      <div className="flex-1 min-h-0">
        <ResizableTwoPane
          storageKey="hr-holiday-calendar"
          defaultLeft={26}
          minLeft={18}
          maxLeft={40}
          hideToolbar
          left={leftPane}
          right={rightPane}
        />
      </div>
    </div>
  );
}

// ── Holiday type toggle ───────────────────────────────────────────────────────

function HolidayTypeToggle({
  value,
  onChange,
}: {
  value: HolidayType;
  onChange: (v: HolidayType) => void;
}) {
  return (
    <div className="flex gap-2">
      {(["mandatory", "optional", "festival"] as HolidayType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            "flex-1 rounded-md border px-2 py-2 text-sm font-medium transition-colors capitalize",
            value === t
              ? t === "festival"
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground hover:bg-accent",
          )}
        >
          {t === "festival" ? (
            <span className="flex items-center justify-center gap-1">
              <Repeat className="h-3.5 w-3.5" /> Festival
            </span>
          ) : (
            t.charAt(0).toUpperCase() + t.slice(1)
          )}
        </button>
      ))}
    </div>
  );
}

// ── Edit panel (existing holiday) ─────────────────────────────────────────────

function HolidayEditPanel({
  holiday,
  year,
  onDelete,
  deleting,
}: {
  holiday: PayrollHoliday;
  year: number;
  onDelete: () => void;
  deleting: boolean;
}) {
  const qc = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const initType = (): HolidayType =>
    holiday.is_festival ? "festival" : holiday.is_optional ? "optional" : "mandatory";

  const [form, setForm] = useState<HolidayForm>(() =>
    holiday.is_festival
      ? {
          kind: "festival",
          festival_month: holiday.festival_month ?? 1,
          festival_day: holiday.festival_day ?? 1,
          name: holiday.name,
        }
      : {
          kind: "regular",
          date: holiday.holiday_date,
          name: holiday.name,
          type: holiday.is_optional ? "optional" : "mandatory",
        },
  );

  const [holidayType, setHolidayType] = useState<HolidayType>(initType);

  const handleTypeChange = (t: HolidayType) => {
    setHolidayType(t);
    if (t === "festival") {
      setForm({
        kind: "festival",
        festival_month: (form as any).festival_month ?? 1,
        festival_day: (form as any).festival_day ?? 1,
        name: form.name,
      });
    } else {
      setForm({
        kind: "regular",
        date: (form as any).date ?? holiday.holiday_date,
        name: form.name,
        type: t,
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: (f: HolidayForm) => {
      if (f.kind === "festival") {
        return upsertHoliday({
          data: {
            id: holiday.id,
            is_festival: true,
            festival_month: f.festival_month,
            festival_day: f.festival_day,
            name: f.name,
            is_optional: false,
          },
        });
      }
      return upsertHoliday({
        data: {
          id: holiday.id,
          is_festival: false,
          date: f.date,
          name: f.name,
          is_optional: f.type === "optional",
        },
      });
    },
    onMutate: () => setSaving(true),
    onSuccess: () => {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["payroll", "holidays", year] });
    },
    onError: (e: Error) => {
      setSaving(false);
      toast.error(e.message);
    },
  });

  const triggerSave = (f: HolidayForm) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const isValid =
        f.kind === "festival"
          ? f.name.trim() && f.festival_month && f.festival_day
          : f.name.trim() && f.date;
      if (isValid) saveMutation.mutate(f);
    }, 600);
  };

  const setField = (patch: Partial<HolidayForm>) => {
    const next = { ...form, ...patch } as HolidayForm;
    setForm(next);
    triggerSave(next);
  };

  return (
    <div className="p-5 space-y-5 max-w-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">{holiday.name}</h2>
          <p className="text-xs text-muted-foreground">
            {holiday.is_festival ? `${festivalLabel(holiday)} · every year` : holiday.holiday_date}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{saving ? "Saving…" : "Auto-saved"}</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
            onClick={onDelete}
            disabled={deleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Holiday Name</Label>
          <Input
            className="h-8"
            value={form.name}
            onChange={(e) => setField({ name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <HolidayTypeToggle value={holidayType} onChange={handleTypeChange} />
          {holidayType === "festival" && (
            <p className="text-[11px] text-muted-foreground">
              Festival: appears every year on the same date. Does not count as a working-day
              deduction unless you also mark it mandatory in a regular holiday entry.
            </p>
          )}
        </div>

        {form.kind === "festival" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Month</Label>
              <select
                className="w-full h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.festival_month}
                onChange={(e) => setField({ festival_month: Number(e.target.value) } as any)}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                className="h-8"
                value={form.festival_day}
                onChange={(e) => setField({ festival_day: Number(e.target.value) } as any)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              className="h-8"
              value={form.date}
              onChange={(e) => setField({ date: e.target.value } as any)}
            />
          </div>
        )}

        <div className="pt-1">
          <Badge
            variant="outline"
            className={cn(
              holidayType === "festival"
                ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400"
                : holidayType === "optional"
                  ? "text-muted-foreground"
                  : "bg-blue-50 text-blue-700 border-blue-200",
            )}
          >
            {holidayType === "festival"
              ? "Festival (recurring)"
              : holidayType === "optional"
                ? "Optional"
                : "Mandatory"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ── New holiday panel ─────────────────────────────────────────────────────────

function NewHolidayPanel({
  year,
  onSaved,
}: {
  year: number;
  onSaved: (id: string | null) => void;
}) {
  const [holidayType, setHolidayType] = useState<HolidayType>("mandatory");
  const [form, setForm] = useState<HolidayForm>({
    kind: "regular",
    date: `${year}-01-01`,
    name: "",
    type: "mandatory",
  });

  const handleTypeChange = (t: HolidayType) => {
    setHolidayType(t);
    if (t === "festival") {
      setForm({ kind: "festival", festival_month: 1, festival_day: 1, name: form.name });
    } else {
      setForm({
        kind: "regular",
        date: (form as any).date ?? `${year}-01-01`,
        name: form.name,
        type: t,
      });
    }
  };

  const addMutation = useMutation({
    mutationFn: () => {
      if (form.kind === "festival") {
        return upsertHoliday({
          data: {
            is_festival: true,
            festival_month: form.festival_month,
            festival_day: form.festival_day,
            name: form.name,
            is_optional: false,
          },
        });
      }
      return upsertHoliday({
        data: {
          is_festival: false,
          date: form.date,
          name: form.name,
          is_optional: form.type === "optional",
        },
      });
    },
    onSuccess: () => {
      toast.success(
        form.kind === "festival" ? "Festival added (appears every year)" : "Holiday added",
      );
      onSaved(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isValid =
    form.kind === "festival"
      ? form.name.trim() && form.festival_month >= 1 && form.festival_day >= 1
      : form.name.trim() && form.date;

  return (
    <div className="p-5 space-y-5 max-w-sm">
      <h2 className="text-base font-semibold">New Holiday</h2>
      <Separator />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Holiday Name *</Label>
          <Input
            className="h-8"
            placeholder="e.g. Diwali"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <HolidayTypeToggle value={holidayType} onChange={handleTypeChange} />
          {holidayType === "festival" && (
            <p className="text-[11px] text-muted-foreground">
              One record that appears every year on the same date.
            </p>
          )}
        </div>

        {form.kind === "festival" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Month *</Label>
              <select
                className="w-full h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.festival_month}
                onChange={(e) =>
                  setForm((f) => ({ ...f, festival_month: Number(e.target.value) }) as FestivalForm)
                }
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Day *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                className="h-8"
                value={form.festival_day}
                onChange={(e) =>
                  setForm((f) => ({ ...f, festival_day: Number(e.target.value) }) as FestivalForm)
                }
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Date *</Label>
            <Input
              type="date"
              className="h-8"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }) as RegularForm)}
            />
          </div>
        )}

        <Button
          className="w-full"
          disabled={!isValid || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          {addMutation.isPending
            ? "Adding…"
            : form.kind === "festival"
              ? "Add Festival"
              : "Add Holiday"}
        </Button>
      </div>
    </div>
  );
}
