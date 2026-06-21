import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useMemo, type ComponentType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Send,
  Download,
  Upload,
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  Receipt,
  ClipboardCheck,
  UserPlus,
  BookOpen,
  LayoutList,
  Inbox,
  Activity,
  BarChart2,
  ChevronRight,
  Trophy,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/shared/utils";
import { createTemplate, deleteTemplate, listTemplates } from "@/lib/organizer/templates.functions";
import { exportTemplate, importTemplate } from "@/lib/organizer/portability.functions";
import {
  type OrganizerPurpose,
  purposeLabel,
  type OrganizerTemplate,
} from "@/lib/organizer/schemas";
import { DeployTemplateDialog } from "@/components/organizer/deploy-template-dialog";
import { PublicLinkManagerButton } from "@/components/organizer/public-link-manager";

// ── Purpose config ────────────────────────────────────────────────────────────
const PURPOSE_CONFIG: Record<
  OrganizerPurpose,
  {
    Icon: ComponentType<{ className?: string }>;
    bg: string;
    text: string;
    bar: string;
  }
> = {
  tax: {
    Icon: Receipt,
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "from-emerald-400 to-teal-500",
  },
  hr_exam: {
    Icon: ClipboardCheck,
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    bar: "from-blue-400 to-indigo-500",
  },
  onboarding: {
    Icon: UserPlus,
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    bar: "from-violet-400 to-purple-500",
  },
  learning_quiz: {
    Icon: BookOpen,
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    bar: "from-amber-400 to-orange-400",
  },
  generic: {
    Icon: LayoutList,
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-400",
    bar: "from-slate-400 to-gray-500",
  },
};

// ── Route ─────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/organizer/")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Organizer" }]}>
        <OrganizerHubPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ── Main page ─────────────────────────────────────────────────────────────────
function OrganizerHubPage() {
  const list = useServerFn(listTemplates);
  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "templates"],
    queryFn: () => list(),
  });
  const templates = data?.templates ?? [];

  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
    );
  }, [templates, search]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <HeroSection templates={templates} isLoading={isLoading} />

      {/* Quick nav */}
      <QuickNavSection />

      {/* Templates */}
      <div>
        {/* Section header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h2 className="text-xl font-semibold">Templates</h2>
            {!isLoading && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                {filteredTemplates.length}
              </span>
            )}
          </div>

          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border p-0.5 gap-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          <ImportTemplateButton />
          <CreateTemplateButton />
        </div>

        {/* Template content */}
        {isLoading ? (
          <TemplatesSkeleton view={view} />
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-2xl border bg-card p-16">
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title={templates.length === 0 ? "No templates yet" : "No matches"}
              description={
                templates.length === 0
                  ? "Create your first organizer template — a tax organizer, HR exam, onboarding checklist, or any custom form."
                  : "Try a different search term."
              }
            />
          </div>
        ) : view === "grid" ? (
          <TemplateGrid templates={filteredTemplates} />
        ) : (
          <TemplateListView templates={filteredTemplates} />
        )}
      </div>
    </div>
  );
}

// ── Hero section ──────────────────────────────────────────────────────────────
function HeroSection({
  templates,
  isLoading,
}: {
  templates: OrganizerTemplate[];
  isLoading: boolean;
}) {
  const stats = [
    { label: "Total", value: templates.length },
    { label: "Published", value: templates.filter((t) => t.status === "published").length },
    { label: "Drafts", value: templates.filter((t) => t.status === "draft").length },
    { label: "Exams", value: templates.filter((t) => t.is_exam).length },
  ];

  return (
    <div className="rounded-2xl bg-primary px-6 py-4 flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-primary-foreground leading-tight">Organizer Hub</h1>
        <p className="text-xs text-primary-foreground/70 mt-0.5">
          Tax organizers, HR exams, onboarding checklists &amp; learning quizzes.
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-center backdrop-blur-sm min-w-[60px]"
          >
            {isLoading ? (
              <div className="h-5 w-6 mx-auto rounded bg-white/20 animate-pulse mb-0.5" />
            ) : (
              <div className="text-xl font-bold text-primary-foreground leading-none">
                {s.value}
              </div>
            )}
            <div className="text-[11px] text-primary-foreground/70 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick nav section ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    to: "/organizer/inbox" as const,
    label: "My Inbox",
    description: "Forms & exams assigned to you",
    Icon: Inbox,
  },
  {
    to: "/organizer/tracking" as const,
    label: "Tracking",
    description: "Monitor all firm-wide deployments",
    Icon: Activity,
  },
  {
    to: "/organizer/analytics" as const,
    label: "Analytics",
    description: "Completion funnels & drop-off analysis",
    Icon: BarChart2,
  },
] as const;

function QuickNavSection() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 transition-all duration-200"
        >
          <div className="rounded-xl bg-primary/10 p-2 flex-shrink-0">
            <item.Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{item.label}</div>
            <div className="text-xs text-muted-foreground truncate">{item.description}</div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ))}
    </div>
  );
}

// ── Template grid ─────────────────────────────────────────────────────────────
function TemplateGrid({ templates }: { templates: OrganizerTemplate[] }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteTemplate);
  const [pendingDelete, setPendingDelete] = useState<OrganizerTemplate | null>(null);
  const [pendingDeploy, setPendingDeploy] = useState<OrganizerTemplate | null>(null);
  const [exportTarget, setExportTarget] = useState<OrganizerTemplate | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizer", "templates"] });
      toast.success("Template deleted");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onDelete={() => setPendingDelete(t)}
            onDeploy={() => setPendingDeploy(t)}
            onExport={() => setExportTarget(t)}
          />
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{pendingDelete?.name}" and all its questions. Deployments
              referencing this template will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && delMut.mutate(pendingDelete.id)}
              disabled={delMut.isPending}
            >
              {delMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingDeploy && (
        <DeployTemplateDialog
          templateId={pendingDeploy.id}
          templateName={pendingDeploy.name}
          open={!!pendingDeploy}
          onOpenChange={(o) => !o && setPendingDeploy(null)}
        />
      )}

      {exportTarget && (
        <ExportConfirmDialog template={exportTarget} onClose={() => setExportTarget(null)} />
      )}
    </>
  );
}

function TemplateCard({
  template: t,
  onDelete,
  onDeploy,
  onExport,
}: {
  template: OrganizerTemplate;
  onDelete: () => void;
  onDeploy: () => void;
  onExport: () => void;
}) {
  const navigate = useNavigate();
  const cfg = PURPOSE_CONFIG[t.purpose];

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      {/* Purpose color strip */}
      <div className={cn("h-1.5 w-full bg-gradient-to-r", cfg.bar)} />

      {/* Card body */}
      <div className="flex-1 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn("rounded-xl p-2 flex-shrink-0", cfg.bg)}>
            <cfg.Icon className={cn("h-5 w-5", cfg.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <Link
              to="/organizer/builder/$templateId"
              params={{ templateId: t.id }}
              className="font-semibold hover:underline leading-snug block truncate"
            >
              {t.name}
            </Link>
            {t.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={t.status} />
          <Badge variant="outline" className="text-xs">
            {purposeLabel[t.purpose]}
          </Badge>
          {t.is_exam && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <Trophy className="h-3 w-3" />
              Exam
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">v{t.version}</span>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Updated {new Date(t.updated_at).toLocaleDateString()}
        </div>
      </div>

      {/* Action footer */}
      <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-3">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs px-3"
          onClick={() =>
            navigate({
              to: "/organizer/builder/$templateId",
              params: { templateId: t.id },
            })
          }
        >
          <Pencil className="h-3 w-3 mr-1.5" />
          Edit
        </Button>

        {t.status === "published" && (
          <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={onDeploy}>
            <Send className="h-3 w-3 mr-1.5" />
            Deploy
          </Button>
        )}

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onExport}>
                <Download className="h-3.5 w-3.5 mr-2" />
                Export JSON
              </DropdownMenuItem>
              {t.status === "published" && (
                <DropdownMenuItem asChild>
                  <PublicLinkMenuTrigger templateId={t.id} templateName={t.name} />
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// Wrapper that renders the PublicLinkManagerButton inline inside dropdown
function PublicLinkMenuTrigger({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  return (
    <div className="flex items-center w-full">
      <PublicLinkManagerButton templateId={templateId} templateName={templateName} />
    </div>
  );
}

// ── Template list view ────────────────────────────────────────────────────────
function TemplateListView({ templates }: { templates: OrganizerTemplate[] }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteTemplate);
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<OrganizerTemplate | null>(null);
  const [pendingDeploy, setPendingDeploy] = useState<OrganizerTemplate | null>(null);
  const [exportTarget, setExportTarget] = useState<OrganizerTemplate | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizer", "templates"] });
      toast.success("Template deleted");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="rounded-2xl border shadow-sm overflow-hidden bg-card">
        <ul className="divide-y">
          {templates.map((t) => {
            const cfg = PURPOSE_CONFIG[t.purpose];
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className={cn("rounded-lg p-1.5 flex-shrink-0", cfg.bg)}>
                  <cfg.Icon className={cn("h-4 w-4", cfg.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/organizer/builder/$templateId"
                      params={{ templateId: t.id }}
                      className="font-medium hover:underline truncate"
                    >
                      {t.name}
                    </Link>
                    <Badge variant="outline" className="text-xs">
                      {purposeLabel[t.purpose]}
                    </Badge>
                    <StatusBadge status={t.status} />
                    {t.is_exam && (
                      <Badge variant="secondary" className="text-xs">
                        Exam
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">v{t.version}</span>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>
                  )}
                </div>

                {t.status === "published" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Deploy"
                    onClick={() => setPendingDeploy(t)}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  title="Edit"
                  onClick={() =>
                    navigate({
                      to: "/organizer/builder/$templateId",
                      params: { templateId: t.id },
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setExportTarget(t)}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Export JSON
                    </DropdownMenuItem>
                    {t.status === "published" && (
                      <DropdownMenuItem asChild>
                        <div className="flex items-center w-full">
                          <PublicLinkManagerButton templateId={t.id} templateName={t.name} />
                        </div>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setPendingDelete(t)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{pendingDelete?.name}" and all its questions. Deployments
              referencing this template will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && delMut.mutate(pendingDelete.id)}
              disabled={delMut.isPending}
            >
              {delMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingDeploy && (
        <DeployTemplateDialog
          templateId={pendingDeploy.id}
          templateName={pendingDeploy.name}
          open={!!pendingDeploy}
          onOpenChange={(o) => !o && setPendingDeploy(null)}
        />
      )}

      {exportTarget && (
        <ExportConfirmDialog template={exportTarget} onClose={() => setExportTarget(null)} />
      )}
    </>
  );
}

// ── Shared Status badge ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OrganizerTemplate["status"] }) {
  const map: Record<OrganizerTemplate["status"], string> = {
    draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    archived: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", map[status])}>
      {status}
    </span>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function TemplatesSkeleton({ view }: { view: "grid" | "list" }) {
  if (view === "grid") {
    return (
      <div className="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border bg-card overflow-hidden">
            <Skeleton className="h-1.5 w-full rounded-none" />
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
            <div className="border-t px-4 py-3 flex gap-2">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="divide-y">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export confirm dialog ─────────────────────────────────────────────────────
function ExportConfirmDialog({
  template,
  onClose,
}: {
  template: OrganizerTemplate;
  onClose: () => void;
}) {
  const exportFn = useServerFn(exportTemplate);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      const res = await exportFn({ data: { id: template.id } });
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = template.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
      a.download = `organizer-${safe || "template"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Template exported");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Export "{template.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Downloads a versioned JSON snapshot of this template, including all blocks and
            conditional rules. Personal response data is not included.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handle} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Download
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Create template button ────────────────────────────────────────────────────
function CreateTemplateButton() {
  const qc = useQueryClient();
  const create = useServerFn(createTemplate);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<OrganizerPurpose>("generic");
  const [isExam, setIsExam] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: name.trim(),
          description: description.trim() || null,
          purpose,
          is_exam: isExam,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["organizer", "templates"] });
      toast.success("Template created");
      setOpen(false);
      setName("");
      setDescription("");
      setPurpose("generic");
      setIsExam(false);
      window.location.href = `/organizer/builder/${res.template.id}`;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organizer template</DialogTitle>
          <DialogDescription>
            Pick a purpose and we'll open the builder so you can add sections and questions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026 Master Tax Organizer"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
          <div>
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as OrganizerPurpose)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(purposeLabel) as OrganizerPurpose[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {purposeLabel[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isExam} onCheckedChange={(c) => setIsExam(c === true)} />
            <span className="text-sm">This is an exam (enables scoring)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create &amp; open builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Import template button ────────────────────────────────────────────────────
interface ImportPreviewState {
  payload: unknown;
  name: string;
  purpose: string;
  blockCount: number;
  nameOverride: string;
  descriptionOverride: string;
}

function ImportTemplateButton() {
  const qc = useQueryClient();
  const importFn = useServerFn(importTemplate);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewState | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setSchemaError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setSchemaError("File is not valid JSON.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const obj = parsed as Record<string, unknown> | null;
      const tpl =
        obj && typeof obj === "object"
          ? (obj.template as Record<string, unknown> | undefined)
          : undefined;
      const blocks =
        obj && typeof obj === "object" ? (obj.blocks as unknown[] | undefined) : undefined;
      if (!tpl || typeof tpl.name !== "string" || !Array.isArray(blocks)) {
        setSchemaError(
          "Imported file is missing required fields. Expected { template: { name, purpose, ... }, blocks: [...] }.",
        );
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setPreview({
        payload: parsed,
        name: String(tpl.name || "Untitled"),
        purpose: String(tpl.purpose || "—"),
        blockCount: blocks.length,
        nameOverride: "",
        descriptionOverride: "",
      });
    } catch (e) {
      toast.error((e as Error).message || "Failed to read file");
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await importFn({
        data: {
          payload: preview.payload,
          nameOverride: preview.nameOverride.trim() || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["organizer", "templates"] });
      toast.success(`Imported "${res.template.name}"`);
      setPreview(null);
      window.location.href = `/organizer/builder/${res.template.id}`;
    } catch (e) {
      toast.error((e as Error).message || "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-2" />
        )}
        Import JSON
      </Button>

      <AlertDialog open={!!schemaError} onOpenChange={(o) => !o && setSchemaError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid template file</AlertDialogTitle>
            <AlertDialogDescription>{schemaError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSchemaError(null)}>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Review import</AlertDialogTitle>
            <AlertDialogDescription>
              The file checked out. Confirm details and (optionally) rename before creating a draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                <span className="text-muted-foreground">Original name</span>
                <span className="font-medium">{preview.name}</span>
                <span className="text-muted-foreground">Purpose</span>
                <span className="font-medium">{preview.purpose}</span>
                <span className="text-muted-foreground">Blocks</span>
                <span className="font-medium">{preview.blockCount}</span>
              </div>
              <div className="space-y-1.5 border-t pt-3">
                <Label htmlFor="import-name-override" className="text-xs">
                  New name (optional)
                </Label>
                <Input
                  id="import-name-override"
                  placeholder={preview.name}
                  value={preview.nameOverride}
                  onChange={(e) =>
                    setPreview((p) => (p ? { ...p, nameOverride: e.target.value } : p))
                  }
                />
                <Label htmlFor="import-desc-override" className="text-xs mt-2">
                  Notes for yourself (optional)
                </Label>
                <Textarea
                  id="import-desc-override"
                  placeholder="e.g. cleaned up for FY26"
                  rows={2}
                  value={preview.descriptionOverride}
                  onChange={(e) =>
                    setPreview((p) => (p ? { ...p, descriptionOverride: e.target.value } : p))
                  }
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Import as draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
