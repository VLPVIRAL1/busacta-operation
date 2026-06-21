import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GraduationCap,
  Plus,
  Trash2,
  ExternalLink,
  UserPlus,
  Library,
  Newspaper,
  HelpCircle,
  Route as RouteIcon,
  Trophy,
} from "lucide-react";
import { NewsFeed } from "@/components/learning/news-feed";
import { TrainingLibraryTab } from "@/components/learning/training-library-tab";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { safeHref } from "@/lib/routing/safe-href";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Switch } from "@/components/ui/switch";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/learning/courses")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[
          { label: "Learning & Training", to: "/learning" },
          { label: "Courses & Certifications" },
        ]}
      >
        <TrainingPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type Category = "compliance" | "technical" | "soft_skills" | "onboarding" | "other";
type Status = "assigned" | "in_progress" | "completed" | "overdue" | "waived";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "compliance", label: "Compliance" },
  { value: "technical", label: "Technical" },
  { value: "soft_skills", label: "Soft skills" },
  { value: "onboarding", label: "Onboarding" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: Status; label: string }[] = [
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
];

type Course = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  provider: string | null;
  duration_hours: number | null;
  cpe_credits: number | null;
  active: boolean;
};

type Assignment = {
  id: string;
  course_id: string;
  employee_id: string;
  due_date: string | null;
  status: Status;
  completed_at: string | null;
  score: number | null;
  certificate_url: string | null;
  notes: string | null;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function statusVariant(s: Status): "default" | "secondary" | "outline" | "destructive" {
  if (s === "completed") return "default";
  if (s === "overdue") return "destructive";
  if (s === "waived") return "outline";
  return "secondary";
}

function TrainingPage() {
  const { user, role } = useAuth();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning & Training"
        description="Catalog of courses, assignments, and CPE tracking."
      />
      <Tabs defaultValue="my" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="my">My learning</TabsTrigger>
          <TabsTrigger value="catalog">Course catalog</TabsTrigger>
          {isManager && <TabsTrigger value="all">All assignments</TabsTrigger>}
          <TabsTrigger value="library" className="gap-1.5">
            <Library className="h-3.5 w-3.5" /> Training Library
          </TabsTrigger>
          <TabsTrigger value="news" className="gap-1.5">
            <Newspaper className="h-3.5 w-3.5" /> News
          </TabsTrigger>
          <TabsTrigger value="qa" asChild>
            <Link to="/learning/qa" className="gap-1.5 inline-flex items-center">
              <HelpCircle className="h-3.5 w-3.5" /> Q&amp;A
            </Link>
          </TabsTrigger>
          <TabsTrigger value="paths" asChild>
            <Link to="/learning/paths" className="gap-1.5 inline-flex items-center">
              <RouteIcon className="h-3.5 w-3.5" /> Paths
            </Link>
          </TabsTrigger>
          <TabsTrigger value="leaderboard" asChild>
            <Link to="/learning/leaderboard" className="gap-1.5 inline-flex items-center">
              <Trophy className="h-3.5 w-3.5" /> Leaderboard
            </Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="my">
          <MyLearning userId={user?.id ?? ""} />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogSection isManager={isManager} />
        </TabsContent>
        {isManager && (
          <TabsContent value="all">
            <AllAssignmentsSection />
          </TabsContent>
        )}
        <TabsContent value="library">
          <TrainingLibraryTab />
        </TabsContent>
        <TabsContent value="news">
          <NewsFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useCourses() {
  return useQuery({
    queryKey: ["training", "courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_courses")
        .select("*")
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });
}

function useProfilesMap(ids: string[]) {
  return useQuery({
    queryKey: ["training", "profiles", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, ProfileLite>();
      (data ?? []).forEach((p) => m.set(p.id, p as ProfileLite));
      return m;
    },
  });
}

/* =========== MY LEARNING =========== */

function MyLearning({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const coursesQ = useCourses();
  const myQ = useQuery({
    queryKey: ["training", "mine", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_assignments")
        .select("*")
        .eq("employee_id", userId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  const courseMap = useMemo(() => {
    const m = new Map<string, Course>();
    (coursesQ.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [coursesQ.data]);

  const updateMut = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Assignment> }) => {
      const patch: Partial<Assignment> = { ...input.patch };
      if (input.patch.status === "completed" && !input.patch.completed_at) {
        patch.completed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("training_assignments")
        .update(patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const list = myQ.data ?? [];
    return {
      assigned: list.filter((a) => a.status === "assigned").length,
      inProgress: list.filter((a) => a.status === "in_progress").length,
      completed: list.filter((a) => a.status === "completed").length,
      overdue: list.filter((a) => a.status === "overdue").length,
      cpe: list
        .filter((a) => a.status === "completed")
        .reduce((sum, a) => sum + (courseMap.get(a.course_id)?.cpe_credits ?? 0), 0),
    };
  }, [myQ.data, courseMap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Assigned" value={counts.assigned} />
        <StatCard label="In progress" value={counts.inProgress} />
        <StatCard label="Completed" value={counts.completed} />
        <StatCard label="Overdue" value={counts.overdue} />
        <StatCard label="CPE earned" value={counts.cpe} />
      </div>

      {myQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : (myQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="No courses assigned"
          description="Your HR team will assign learning here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">CPE</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(myQ.data ?? []).map((a) => {
                  const c = courseMap.get(a.course_id);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{c?.title ?? "—"}</div>
                        {c?.provider && (
                          <div className="text-xs text-muted-foreground">{c.provider}</div>
                        )}
                      </TableCell>
                      <TableCell className="capitalize text-sm text-muted-foreground">
                        {(c?.category ?? "").replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.due_date ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={a.status}
                          onValueChange={(v) =>
                            updateMut.mutate({ id: a.id, patch: { status: v as Status } })
                          }
                        >
                          <SelectTrigger className="w-36 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.filter((s) => s.value !== "waived").map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {c?.cpe_credits ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={a.certificate_url ?? ""}
                          placeholder="https://…"
                          className="h-8 text-xs"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (a.certificate_url ?? "")) {
                              updateMut.mutate({ id: a.id, patch: { certificate_url: v || null } });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {safeHref(a.certificate_url) && (
                          <a
                            href={safeHref(a.certificate_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* =========== CATALOG =========== */

function CatalogSection({ isManager }: { isManager: boolean }) {
  const qc = useQueryClient();
  const coursesQ = useCourses();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (coursesQ.data ?? []).filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      if (!q) return true;
      return `${c.title} ${c.provider ?? ""} ${c.description ?? ""}`.toLowerCase().includes(q);
    });
  }, [coursesQ.data, search, cat]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses…"
            className="max-w-xs"
          />
          <Select value={cat} onValueChange={(v) => setCat(v as Category | "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isManager && (
            <div className="ml-auto">
              <CourseDialog />
            </div>
          )}
        </CardContent>
      </Card>

      {coursesQ.isLoading ? (
        <Skeleton className="h-48" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="No courses yet"
          description={isManager ? "Add a course to start the catalog." : "Check back later."}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{c.title}</div>
                    {c.provider && (
                      <div className="text-xs text-muted-foreground">{c.provider}</div>
                    )}
                  </div>
                  <Badge variant="secondary" className="capitalize text-xs">
                    {c.category.replace("_", " ")}
                  </Badge>
                </div>
                {c.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  {c.duration_hours != null && <span>{c.duration_hours}h</span>}
                  {c.cpe_credits != null && <span>{c.cpe_credits} CPE</span>}
                  {!c.active && (
                    <Badge variant="outline" className="text-xs">
                      Inactive
                    </Badge>
                  )}
                </div>
                {isManager && (
                  <div className="flex items-center gap-1 pt-2">
                    <AssignDialog courseId={c.id} courseTitle={c.title} />
                    <CourseDialog course={c} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this course and all assignments?"))
                          deleteMut.mutate(c.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseDialog({ course }: { course?: Course }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [category, setCategory] = useState<Category>(course?.category ?? "other");
  const [provider, setProvider] = useState(course?.provider ?? "");
  const [duration, setDuration] = useState(course?.duration_hours?.toString() ?? "");
  const [cpe, setCpe] = useState(course?.cpe_credits?.toString() ?? "");
  const [active, setActive] = useState(course?.active ?? true);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title required");
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        provider: provider.trim() || null,
        duration_hours: duration ? Number(duration) : null,
        cpe_credits: cpe ? Number(cpe) : null,
        active,
      };
      if (course) {
        const { error } = await supabase
          .from("training_courses")
          .update(payload)
          .eq("id", course.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("training_courses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success(course ? "Updated" : "Created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {course ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New course
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "Add course"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Provider</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Duration (hours)</Label>
              <Input
                type="number"
                step="0.25"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>CPE credits</Label>
              <Input
                type="number"
                step="0.25"
                value={cpe}
                onChange={(e) => setCpe(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="active" />
            <Label htmlFor="active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const peopleQ = useQuery({
    queryKey: ["training", "people"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Pick employee");
      const { error } = await supabase.from("training_assignments").upsert(
        {
          course_id: courseId,
          employee_id: employeeId,
          due_date: dueDate || null,
          status: "assigned",
        },
        { onConflict: "course_id,employee_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success("Assigned");
      setOpen(false);
      setEmployeeId("");
      setDueDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="h-4 w-4 mr-1" />
          Assign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign “{courseTitle}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick employee" />
              </SelectTrigger>
              <SelectContent>
                {(peopleQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Due date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => assignMut.mutate()} disabled={assignMut.isPending}>
            {assignMut.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========== ALL ASSIGNMENTS (manager view) =========== */

function AllAssignmentsSection() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  const allQ = useQuery({
    queryKey: ["training", "all-assignments", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("training_assignments")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  const coursesQ = useCourses();
  const courseMap = useMemo(() => {
    const m = new Map<string, Course>();
    (coursesQ.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [coursesQ.data]);

  const ids = useMemo(
    () => Array.from(new Set((allQ.data ?? []).map((a) => a.employee_id))),
    [allQ.data],
  );
  const profilesQ = useProfilesMap(ids);

  const updateMut = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Assignment> }) => {
      const { error } = await supabase
        .from("training_assignments")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {allQ.isLoading ? (
        <Skeleton className="h-48" />
      ) : (allQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="No assignments"
          description="Assign courses from the catalog tab."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allQ.data ?? []).map((a) => {
                  const c = courseMap.get(a.course_id);
                  const emp = profilesQ.data?.get(a.employee_id);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {emp && <UserAvatar profile={emp} size="sm" />}
                          <span className="text-sm">{emp?.full_name ?? emp?.email ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{c?.title ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.due_date ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={a.status}
                          onValueChange={(v) =>
                            updateMut.mutate({ id: a.id, patch: { status: v as Status } })
                          }
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.completed_at ? new Date(a.completed_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Remove this assignment?")) deleteMut.mutate(a.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

void statusVariant;
